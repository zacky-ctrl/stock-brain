'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createCuttingSession } from '@stock-brain/domain'
import type { CuttingSessionStore } from '@stock-brain/domain'
import type { ActionState } from '@/lib/masters'
import type {
  NewCuttingSessionRow,
  NewCuttingSessionLineRow,
  StoredCuttingSession,
  StoredCuttingSessionLine,
  StoredCuttingsBalance,
} from '@stock-brain/types'

type LineInput = {
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  quantity_gross: number
}

function makeStore(supabase: ReturnType<typeof createServerSupabaseClient>): CuttingSessionStore {
  return {
    async insertSession(row: NewCuttingSessionRow) {
      const { data, error } = await supabase
        .from('cutting_sessions')
        .insert(row)
        .select('id')
        .single()
      return error ? null : (data as { id: string })
    },
    async insertLines(rows: NewCuttingSessionLineRow[]) {
      const { error } = await supabase.from('cutting_session_lines').insert(rows)
      return error?.message
    },
    async deleteSession(id: string) {
      await supabase.from('cutting_sessions').delete().eq('id', id)
    },
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
          .update({
            gross_qty: Number(existing.gross_qty) + addQty,
            last_updated_at: new Date().toISOString(),
          })
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
        .update({
          gross_qty: Math.max(0, Number(existing.gross_qty) - subtractQty),
          last_updated_at: new Date().toISOString(),
        })
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

export async function createCuttingSessionAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const machineId = (formData.get('machine_id') as string ?? '').trim()
  const sessionDate = (formData.get('session_date') as string ?? '').trim()
  const skipVelvet = formData.get('skip_velvet_deduction') === 'true'
  const velvetBundles = skipVelvet
    ? 0
    : parseFloat((formData.get('velvet_bundles_consumed') as string ?? '').trim())
  const notes = (formData.get('notes') as string ?? '').trim() || null
  const linesRaw = (formData.get('lines') as string ?? '').trim()

  if (!machineId) return { error: 'Machine is required' }
  if (!sessionDate) return { error: 'Session date is required' }
  if (!skipVelvet && (!Number.isFinite(velvetBundles) || velvetBundles <= 0)) {
    return { error: 'Velvet bundles consumed must be greater than zero' }
  }
  if (!linesRaw) return { error: 'At least one line is required' }

  let lines: LineInput[]
  try {
    lines = JSON.parse(linesRaw) as LineInput[]
  } catch {
    return { error: 'Lines data is malformed — please try again' }
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    return { error: 'At least one line is required' }
  }

  const sessionColourId = lines[0]?.bindi_colour_id ?? null
  if (!skipVelvet && !sessionColourId) {
    return { error: 'Could not determine velvet colour from lines' }
  }

  const supabase = createServerSupabaseClient()
  const actor = process.env.DEV_ACTOR_ID ?? '00000000-0000-0000-0000-000000000001'
  const store = makeStore(supabase)

  const result = await createCuttingSession(
    {
      session_date: sessionDate,
      machine_id: machineId,
      velvet_bundles_consumed: velvetBundles,
      skip_velvet_deduction: skipVelvet,
      notes,
      actor,
      lines,
    },
    store,
  )

  if (!result.ok) {
    return { error: result.error }
  }

  revalidatePath('/operations/cutting-sessions')
  return { success: result.session_id }
}
