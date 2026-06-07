'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getActorId } from '@/lib/get-actor'
import type { ActionState } from '@/lib/masters'

/**
 * Applies a manual stock correction to a ready_stock_balance row.
 *
 * Invariant: stock_corrections record is written BEFORE the balance
 * update, both in the same Supabase call sequence. If the balance
 * update fails after the correction record is written, the correction
 * record stands as a signal that something went wrong — it is NOT
 * deleted. This is intentional: corrections are append-only.
 *
 * Admin must supply:
 *   - which ready_stock_balance row (by ID)
 *   - new gross_qty value (not a delta — explicit new value is safer)
 *   - reason (mandatory, non-empty)
 *
 * The domain rule that dispatch can only happen from available stock
 * is enforced by available_qty = gross_qty - committed_qty (GENERATED).
 * Increasing gross_qty through a correction makes more stock dispatchable.
 * Decreasing it may make committed_qty > gross_qty — the CHECK constraint
 * on the table will reject that, protecting data integrity.
 */
export async function applyStockCorrection(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const balanceId = (formData.get('balance_id') as string ?? '').trim()
  const newQtyRaw = (formData.get('new_gross_qty') as string ?? '').trim()
  const reason = (formData.get('reason') as string ?? '').trim()
  const notes = (formData.get('notes') as string ?? '').trim() || null

  if (!balanceId) return { error: 'Stock balance row is required' }
  if (!newQtyRaw) return { error: 'New quantity is required' }
  if (!reason) return { error: 'Reason is required — stock corrections must be attributed' }

  const newQty = parseFloat(newQtyRaw)
  if (!Number.isFinite(newQty) || newQty < 0) {
    return { error: 'New quantity must be a non-negative number' }
  }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()

  // Read current balance — old_value is required for the audit record
  const { data: balance, error: readErr } = await supabase
    .from('ready_stock_balance')
    .select('id, gross_qty, committed_qty')
    .eq('id', balanceId)
    .single()

  if (readErr || !balance) {
    return { error: 'Stock balance row not found' }
  }

  const oldQty = Number(balance.gross_qty)
  const committedQty = Number(balance.committed_qty)

  if (newQty < committedQty) {
    return {
      error: `Cannot set gross_qty to ${newQty}: ${committedQty} is already committed. Release commitments first, or set a value ≥ ${committedQty}.`,
    }
  }

  if (oldQty === newQty) {
    return { error: 'New quantity is the same as current — no correction needed' }
  }

  // Write the correction audit record first (append-only)
  const { error: correctionErr } = await supabase.from('stock_corrections').insert({
    corrected_by: actor,
    stock_stage: 'ready',
    entity_table: 'ready_stock_balance',
    entity_id: balanceId,
    field_corrected: 'gross_qty',
    old_value: oldQty,
    new_value: newQty,
    reason,
    notes,
  })

  if (correctionErr) {
    return { error: `Failed to write correction record: ${correctionErr.message}` }
  }

  // Apply the balance update
  const { error: updateErr } = await supabase
    .from('ready_stock_balance')
    .update({
      gross_qty: newQty,
      last_updated_at: new Date().toISOString(),
    })
    .eq('id', balanceId)

  if (updateErr) {
    return {
      error: `Balance update failed: ${updateErr.message}. Correction record was written — investigate before retrying.`,
    }
  }

  revalidatePath('/planning/allocation')
  revalidatePath('/planning/ready')
  revalidatePath('/admin/stock-correction')

  const delta = newQty - oldQty
  const sign = delta > 0 ? '+' : ''
  return { success: `Correction applied: gross_qty ${oldQty} → ${newQty} (${sign}${delta.toFixed(3)})` }
}

// ── Cuttings stock correction ─────────────────────────────────

export async function applyCuttingsCorrection(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const balanceId = (formData.get('balance_id') as string ?? '').trim()
  const newQtyRaw = (formData.get('new_gross_qty') as string ?? '').trim()
  const reason = (formData.get('reason') as string ?? '').trim()
  const notes = (formData.get('notes') as string ?? '').trim() || null

  if (!balanceId) return { error: 'Cuttings balance row is required' }
  if (!newQtyRaw) return { error: 'New quantity is required' }
  if (!reason) return { error: 'Reason is required' }

  const newQty = parseFloat(newQtyRaw)
  if (!Number.isFinite(newQty) || newQty < 0) return { error: 'New quantity must be a non-negative number' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()

  const { data: balance, error: readErr } = await supabase
    .from('cuttings_stock_balance')
    .select('id, gross_qty, committed_qty')
    .eq('id', balanceId)
    .single()

  if (readErr || !balance) return { error: 'Cuttings balance row not found' }

  const oldQty = Number(balance.gross_qty)
  const committedQty = Number(balance.committed_qty)

  if (newQty < committedQty) {
    return { error: `Cannot set gross_qty below committed_qty (${committedQty})` }
  }
  if (oldQty === newQty) return { error: 'New quantity is the same — no correction needed' }

  const { error: corrErr } = await supabase.from('stock_corrections').insert({
    corrected_by: actor,
    stock_stage: 'cuttings',
    entity_table: 'cuttings_stock_balance',
    entity_id: balanceId,
    field_corrected: 'gross_qty',
    old_value: oldQty,
    new_value: newQty,
    reason,
    notes,
  })

  if (corrErr) return { error: `Failed to write correction record: ${corrErr.message}` }

  const { error: updateErr } = await supabase
    .from('cuttings_stock_balance')
    .update({ gross_qty: newQty, last_updated_at: new Date().toISOString() })
    .eq('id', balanceId)

  if (updateErr) {
    return { error: `Balance update failed: ${updateErr.message}. Correction record written — investigate.` }
  }

  revalidatePath('/planning/allocation')
  revalidatePath('/operations/cutting-sessions/stock')
  revalidatePath('/admin/stock-correction')

  const delta = newQty - oldQty
  const sign = delta > 0 ? '+' : ''
  return { success: `Cuttings correction applied: ${oldQty} → ${newQty} (${sign}${delta.toFixed(3)})` }
}

// ── Velvet stock correction ───────────────────────────────────

export async function applyVelvetCorrection(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const balanceId = (formData.get('balance_id') as string ?? '').trim()
  const newMetresRaw = (formData.get('new_metres') as string ?? '').trim()
  const reason = (formData.get('reason') as string ?? '').trim()
  const notes = (formData.get('notes') as string ?? '').trim() || null

  if (!balanceId) return { error: 'Velvet colour balance is required' }
  if (!newMetresRaw) return { error: 'New metres value is required' }
  if (!reason) return { error: 'Reason is required' }

  const newMetres = parseFloat(newMetresRaw)
  if (!Number.isFinite(newMetres) || newMetres < 0) return { error: 'New metres must be a non-negative number' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()

  const { data: balance, error: readErr } = await supabase
    .from('velvet_stock_balance')
    .select('id, bindi_colour_id, metres_on_hand, bindi_colours(code, name)')
    .eq('velvet_type', 'standard')
    .eq('id', balanceId)
    .single()

  if (readErr || !balance) return { error: 'Velvet balance row not found' }

  const oldMetres = Number(balance.metres_on_hand)
  if (oldMetres === newMetres) return { error: 'New value is the same — no correction needed' }

  const { error: corrErr } = await supabase.from('stock_corrections').insert({
    corrected_by: actor,
    stock_stage: 'velvet',
    entity_table: 'velvet_stock_balance',
    entity_id: balance.id as string,
    field_corrected: 'metres_on_hand',
    old_value: oldMetres,
    new_value: newMetres,
    reason,
    notes,
  })

  if (corrErr) return { error: `Failed to write correction record: ${corrErr.message}` }

  const { error: updateErr } = await supabase
    .from('velvet_stock_balance')
    .update({ metres_on_hand: newMetres, last_updated_at: new Date().toISOString() })
    .eq('id', balanceId)

  if (updateErr) {
    return { error: `Balance update failed: ${updateErr.message}. Correction record written — investigate.` }
  }

  revalidatePath('/planning/allocation')
  revalidatePath('/operations/velvet-receipts/stock')
  revalidatePath('/admin/stock-correction')

  const delta = newMetres - oldMetres
  const sign = delta > 0 ? '+' : ''
  return { success: `Velvet correction applied: ${oldMetres.toFixed(3)} → ${newMetres.toFixed(3)} metres (${sign}${delta.toFixed(3)} m)` }
}

// ── WIP write-off ─────────────────────────────────────────────

export async function applyWipWriteOff(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const jobLineId = (formData.get('job_line_id') as string ?? '').trim()
  const writeoffQtyRaw = (formData.get('writeoff_qty') as string ?? '').trim()
  const reason = (formData.get('reason') as string ?? '').trim()
  const notes = (formData.get('notes') as string ?? '').trim() || null

  if (!jobLineId) return { error: 'Job line is required' }
  if (!writeoffQtyRaw) return { error: 'Write-off quantity is required' }
  if (!reason) return { error: 'Reason is required' }

  const writeoffQty = parseFloat(writeoffQtyRaw)
  if (!Number.isFinite(writeoffQty) || writeoffQty <= 0) return { error: 'Write-off quantity must be positive' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()

  const { data: jobLine, error: readErr } = await supabase
    .from('labour_job_lines')
    .select('id, labour_job_id, quantity_sent_gross, quantity_returned_gross')
    .eq('id', jobLineId)
    .single()

  if (readErr || !jobLine) return { error: 'Job line not found' }

  const sent = Number(jobLine.quantity_sent_gross)
  const returned = Number(jobLine.quantity_returned_gross)
  const wip = sent - returned

  if (writeoffQty > wip) {
    return { error: `Write-off qty (${writeoffQty}) exceeds WIP remaining (${wip.toFixed(3)})` }
  }

  // Write correction record first
  const { error: corrErr } = await supabase.from('stock_corrections').insert({
    corrected_by: actor,
    stock_stage: 'wip',
    entity_table: 'labour_job_lines',
    entity_id: jobLineId,
    field_corrected: 'quantity_sent_gross',
    old_value: sent,
    new_value: sent - writeoffQty,
    reason,
    notes,
  })

  if (corrErr) return { error: `Failed to write correction record: ${corrErr.message}` }

  // Reduce sent qty (equivalent to reducing WIP)
  const { error: updateErr } = await supabase
    .from('labour_job_lines')
    .update({ quantity_sent_gross: sent - writeoffQty })
    .eq('id', jobLineId)

  if (updateErr) {
    return { error: `Update failed: ${updateErr.message}. Correction record written — investigate.` }
  }

  revalidatePath('/operations/labour-jobs')
  revalidatePath('/planning/wip')
  revalidatePath('/admin/stock-correction')

  return { success: `WIP write-off applied: ${writeoffQty.toFixed(3)} gross written off. New WIP: ${(wip - writeoffQty).toFixed(3)}` }
}

// ── Bulk corrections ──────────────────────────────────────────

export type BulkCorrectionInput = {
  balance_id: string
  new_gross_qty: number
  reason: string
}

export type BulkCorrectionResult = {
  applied: number
  errors: string[]
}

export async function applyBulkReadyCorrections(
  corrections: BulkCorrectionInput[],
): Promise<BulkCorrectionResult | { error: string }> {
  if (!corrections.length) return { error: 'No corrections provided' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()

  const errors: string[] = []
  let applied = 0

  await Promise.all(corrections.map(async ({ balance_id, new_gross_qty, reason }) => {
    const { data: balance, error: readErr } = await supabase
      .from('ready_stock_balance')
      .select('id, gross_qty, committed_qty')
      .eq('id', balance_id)
      .single()

    if (readErr || !balance) {
      errors.push(`Row not found: ${balance_id}`)
      return
    }

    const oldQty = Number(balance.gross_qty)
    const committedQty = Number(balance.committed_qty)

    if (new_gross_qty < committedQty) {
      errors.push(`Cannot set qty to ${new_gross_qty} — ${committedQty} already committed`)
      return
    }
    if (oldQty === new_gross_qty) {
      errors.push(`No change: ${balance_id} already at ${oldQty}`)
      return
    }

    const { error: corrErr } = await supabase.from('stock_corrections').insert({
      corrected_by: actor,
      stock_stage: 'ready',
      entity_table: 'ready_stock_balance',
      entity_id: balance_id,
      field_corrected: 'gross_qty',
      old_value: oldQty,
      new_value: new_gross_qty,
      reason,
      notes: null,
    })

    if (corrErr) {
      errors.push(`Correction record failed for ${balance_id}: ${corrErr.message}`)
      return
    }

    const { error: updateErr } = await supabase
      .from('ready_stock_balance')
      .update({ gross_qty: new_gross_qty, last_updated_at: new Date().toISOString() })
      .eq('id', balance_id)

    if (updateErr) {
      errors.push(`Balance update failed: ${updateErr.message}. Correction record written — investigate.`)
    } else {
      applied++
    }
  }))

  revalidatePath('/planning/allocation')
  revalidatePath('/planning/ready')
  revalidatePath('/admin/stock-correction')

  return { applied, errors }
}

export async function applyBulkCuttingsCorrections(
  corrections: BulkCorrectionInput[],
): Promise<BulkCorrectionResult | { error: string }> {
  if (!corrections.length) return { error: 'No corrections provided' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()

  const errors: string[] = []
  let applied = 0

  await Promise.all(corrections.map(async ({ balance_id, new_gross_qty, reason }) => {
    const { data: balance, error: readErr } = await supabase
      .from('cuttings_stock_balance')
      .select('id, gross_qty, committed_qty')
      .eq('id', balance_id)
      .single()

    if (readErr || !balance) {
      errors.push(`Row not found: ${balance_id}`)
      return
    }

    const oldQty = Number(balance.gross_qty)
    const committedQty = Number(balance.committed_qty)

    if (new_gross_qty < committedQty) {
      errors.push(`Cannot set qty to ${new_gross_qty} — ${committedQty} already committed`)
      return
    }
    if (oldQty === new_gross_qty) {
      errors.push(`No change: ${balance_id} already at ${oldQty}`)
      return
    }

    const { error: corrErr } = await supabase.from('stock_corrections').insert({
      corrected_by: actor,
      stock_stage: 'cuttings',
      entity_table: 'cuttings_stock_balance',
      entity_id: balance_id,
      field_corrected: 'gross_qty',
      old_value: oldQty,
      new_value: new_gross_qty,
      reason,
      notes: null,
    })

    if (corrErr) {
      errors.push(`Correction record failed for ${balance_id}: ${corrErr.message}`)
      return
    }

    const { error: updateErr } = await supabase
      .from('cuttings_stock_balance')
      .update({ gross_qty: new_gross_qty, last_updated_at: new Date().toISOString() })
      .eq('id', balance_id)

    if (updateErr) {
      errors.push(`Balance update failed: ${updateErr.message}. Correction record written — investigate.`)
    } else {
      applied++
    }
  }))

  revalidatePath('/planning/allocation')
  revalidatePath('/operations/cutting-sessions/stock')
  revalidatePath('/admin/stock-correction')

  return { applied, errors }
}
