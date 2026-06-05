'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getActorId } from '@/lib/get-actor'
import { confirmCuttingSession, voidCuttingSession } from '@stock-brain/domain'
import type { CuttingSessionStore } from '@stock-brain/domain'
import type {
  StoredCuttingSession,
  StoredCuttingSessionLine,
  StoredCuttingsBalance,
  NewCuttingSessionRow,
  NewCuttingSessionLineRow,
} from '@stock-brain/types'

function makeStore(supabase: ReturnType<typeof createServerSupabaseClient>): CuttingSessionStore {
  return {
    async insertSession(_row: NewCuttingSessionRow) {
      return null
    },
    async insertLines(_rows: NewCuttingSessionLineRow[]) {
      return undefined
    },
    async deleteSession(_id: string) {},
    async getSession(id: string) {
      const { data } = await supabase
        .from('cutting_sessions')
        .select('id, session_date, machine_id, velvet_bundles_consumed, status, notes, created_by, confirmed_by, confirmed_at, created_at, updated_at')
        .eq('id', id)
        .single()
      return data as StoredCuttingSession | null
    },
    async getSessionLines(sessionId: string) {
      const { data } = await supabase
        .from('cutting_session_lines')
        .select('id, cutting_session_id, shape_design_id, bindi_colour_id, size_id, quantity_gross, notes, created_at')
        .eq('cutting_session_id', sessionId)
      return (data ?? []) as StoredCuttingSessionLine[]
    },
    async getBalance(designId: string, colourId: string, sizeId: string) {
      const { data } = await supabase
        .from('cuttings_stock_balance')
        .select('id, shape_design_id, bindi_colour_id, size_id, gross_qty, committed_qty, available_qty, last_updated_at')
        .eq('shape_design_id', designId)
        .eq('bindi_colour_id', colourId)
        .eq('size_id', sizeId)
        .single()
      return data as StoredCuttingsBalance | null
    },
    async incrementBalance(designId: string, colourId: string, sizeId: string, addQty: number) {
      const existing = await this.getBalance(designId, colourId, sizeId)
      if (existing) {
        const { error } = await supabase
          .from('cuttings_stock_balance')
          .update({ gross_qty: Number(existing.gross_qty) + addQty, last_updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        return error?.message
      } else {
        const { error } = await supabase.from('cuttings_stock_balance').insert({
          shape_design_id: designId,
          bindi_colour_id: colourId,
          size_id: sizeId,
          gross_qty: addQty,
          committed_qty: 0,
        })
        return error?.message
      }
    },
    async deductBalance(designId: string, colourId: string, sizeId: string, subtractQty: number) {
      const existing = await this.getBalance(designId, colourId, sizeId)
      if (!existing) return 'Balance row not found'
      const { error } = await supabase
        .from('cuttings_stock_balance')
        .update({ gross_qty: Math.max(0, Number(existing.gross_qty) - subtractQty), last_updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      return error?.message
    },
    async confirmSession(id: string, confirmedBy: string, confirmedAt: string) {
      const { error } = await supabase
        .from('cutting_sessions')
        .update({ status: 'confirmed', confirmed_by: confirmedBy, confirmed_at: confirmedAt })
        .eq('id', id)
      return error?.message
    },
    async voidSession(id: string, notesWithReason: string | null) {
      const { error } = await supabase
        .from('cutting_sessions')
        .update({ status: 'voided', notes: notesWithReason })
        .eq('id', id)
      return error?.message
    },
    async getVelvetBalance(colourId: string) {
      const { data } = await supabase
        .from('velvet_stock_balance')
        .select('metres_on_hand, last_updated_at')
        .eq('bindi_colour_id', colourId)
        .single()
      if (!data) return null
      return { bundles_on_hand: Number(data.metres_on_hand) }
    },
    async decrementVelvetBalance(qty: number, now: string, colourId: string) {
      const { data: current } = await supabase
        .from('velvet_stock_balance')
        .select('metres_on_hand')
        .eq('bindi_colour_id', colourId)
        .single()
      if (!current) return 'Velvet balance row not found'
      const { error } = await supabase
        .from('velvet_stock_balance')
        .update({
          metres_on_hand: Math.max(0, Number(current.metres_on_hand) - qty),
          last_updated_at: now,
        })
        .eq('bindi_colour_id', colourId)
      return error?.message
    },
  }
}

export async function confirmSessionAction(sessionId: string): Promise<{ error?: string } | void> {
  const supabase = createServerSupabaseClient()
  const actor = await getActorId()
  const store = makeStore(supabase)

  const result = await confirmCuttingSession(sessionId, actor, store)
  if (!result.ok) return { error: result.error }

  revalidatePath(`/operations/cutting-sessions/${sessionId}`)
  revalidatePath('/operations/cutting-sessions')
  revalidatePath('/operations/cutting-sessions/stock')
  redirect(`/operations/cutting-sessions/${sessionId}`)
}

export async function voidSessionAction(
  sessionId: string,
  formData: FormData,
): Promise<{ error?: string } | void> {
  const reason = (formData.get('void_reason') as string ?? '').trim()
  const supabase = createServerSupabaseClient()
  const actor = await getActorId()
  const store = makeStore(supabase)

  const result = await voidCuttingSession(sessionId, reason, actor, store)
  if (!result.ok) return { error: result.error }

  revalidatePath(`/operations/cutting-sessions/${sessionId}`)
  revalidatePath('/operations/cutting-sessions')
  redirect(`/operations/cutting-sessions/${sessionId}`)
}

// ── Edit draft session ────────────────────────────────────────

export async function editDraftSessionAction(
  sessionId: string,
  _prevState: { error?: string; success?: string } | null,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const sessionDate = (formData.get('session_date') as string ?? '').trim()
  const machineId = (formData.get('machine_id') as string ?? '').trim() || null
  const velvetRaw = (formData.get('velvet_bundles_consumed') as string ?? '').trim()
  const notes = (formData.get('notes') as string ?? '').trim() || null

  if (!sessionDate) return { error: 'Session date is required' }

  const velvet = parseFloat(velvetRaw)
  if (!velvetRaw || !Number.isFinite(velvet) || velvet <= 0) {
    return { error: 'Velvet bundles consumed must be a positive number' }
  }

  const supabase = createServerSupabaseClient()

  const { data: session } = await supabase
    .from('cutting_sessions')
    .select('id, status')
    .eq('id', sessionId)
    .single()

  if (!session) return { error: 'Session not found' }
  if (session.status !== 'draft') return { error: 'Only draft sessions can be edited' }

  const { error: updateErr } = await supabase
    .from('cutting_sessions')
    .update({ session_date: sessionDate, machine_id: machineId, velvet_bundles_consumed: velvet, notes, updated_at: new Date().toISOString() })
    .eq('id', sessionId)

  if (updateErr) return { error: `Update failed: ${updateErr.message}` }

  revalidatePath(`/operations/cutting-sessions/${sessionId}`)
  revalidatePath('/operations/cutting-sessions')
  return { success: 'Session updated.' }
}

// ── Admin void of confirmed session ──────────────────────────
// Reverses all cuttings balance credits and velvet balance decrement.
// Writes stock_correction records for each reversal.

export async function adminVoidConfirmedAction(
  sessionId: string,
  _prevState: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string } | void> {
  const reason = (formData.get('void_reason') as string ?? '').trim()
  if (!reason) return { error: 'Reason is required to void a confirmed session' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()

  const { data: session } = await supabase
    .from('cutting_sessions')
    .select('id, status, velvet_bundles_consumed')
    .eq('id', sessionId)
    .single()

  if (!session) return { error: 'Session not found' }
  if (session.status !== 'confirmed') return { error: 'Only confirmed sessions can be admin-voided' }

  const { data: lines } = await supabase
    .from('cutting_session_lines')
    .select('id, shape_design_id, bindi_colour_id, size_id, quantity_gross')
    .eq('cutting_session_id', sessionId)

  const sessionColourId = (lines ?? [])[0]?.bindi_colour_id ?? null

  const now = new Date().toISOString()

  // Reverse cuttings balance credits per line
  await Promise.all((lines ?? []).map(async (line) => {
    const qty = Number(line.quantity_gross)

    // Read current balance
    const { data: balance } = await supabase
      .from('cuttings_stock_balance')
      .select('id, gross_qty')
      .eq('shape_design_id', line.shape_design_id)
      .eq('bindi_colour_id', line.bindi_colour_id)
      .eq('size_id', line.size_id)
      .single()

    if (!balance) return // balance may have been corrected already

    const newQty = Math.max(0, Number(balance.gross_qty) - qty)

    // Write audit record
    await supabase.from('stock_corrections').insert({
      corrected_by: actor,
      stock_stage: 'cuttings',
      entity_table: 'cuttings_stock_balance',
      entity_id: balance.id,
      field_corrected: 'gross_qty',
      old_value: Number(balance.gross_qty),
      new_value: newQty,
      reason: `Admin void of cutting session ${sessionId}: ${reason}`,
      notes: null,
    })

    // Reduce balance
    await supabase
      .from('cuttings_stock_balance')
      .update({ gross_qty: newQty, last_updated_at: now })
      .eq('id', balance.id)
  }))

  // Restore velvet balance
  const velvetConsumed = Number(session.velvet_bundles_consumed)
  if (velvetConsumed > 0) {
    if (!sessionColourId) {
      return { error: 'Could not determine velvet colour from session lines — velvet balance not restored' }
    }

    const { data: velvetBal } = await supabase
      .from('velvet_stock_balance')
      .select('id, metres_on_hand')
      .eq('bindi_colour_id', sessionColourId)
      .single()

    if (velvetBal) {
      const restoredMetres = Number(velvetBal.metres_on_hand) + velvetConsumed

      await supabase.from('stock_corrections').insert({
        corrected_by: actor,
        stock_stage: 'velvet',
        entity_table: 'velvet_stock_balance',
        entity_id: velvetBal.id,
        field_corrected: 'metres_on_hand',
        old_value: Number(velvetBal.metres_on_hand),
        new_value: restoredMetres,
        reason: `Admin void of cutting session ${sessionId}: ${reason} (velvet restored)`,
        notes: null,
      })

      await supabase
        .from('velvet_stock_balance')
        .update({ metres_on_hand: restoredMetres, last_updated_at: now })
        .eq('bindi_colour_id', sessionColourId)
    }
  }

  // Set session status to voided
  const { error: voidErr } = await supabase
    .from('cutting_sessions')
    .update({ status: 'voided', notes: `[ADMIN VOIDED] ${reason}`, updated_at: now })
    .eq('id', sessionId)

  if (voidErr) return { error: `Failed to update session status: ${voidErr.message}` }

  revalidatePath(`/operations/cutting-sessions/${sessionId}`)
  revalidatePath('/operations/cutting-sessions')
  revalidatePath('/operations/cutting-sessions/stock')
  revalidatePath('/planning/allocation')
  redirect(`/operations/cutting-sessions/${sessionId}`)
}
