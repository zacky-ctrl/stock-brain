'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getActorId } from '@/lib/get-actor'
import type { ActionState } from '@/lib/masters'

// ── Cuttings reconciliation ───────────────────────────────────

export async function applyCuttingsReconciliation(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const reason = (fd.get('reason') as string ?? '').trim()
  if (!reason) return { error: 'Reason is required for reconciliation' }

  const variances: Array<{ balance_id: string; system_qty: number; physical_qty: number }> = []

  for (const [key, value] of fd.entries()) {
    if (!key.startsWith('physical_')) continue
    const balanceId = key.replace('physical_', '')
    const physicalQty = parseFloat(value as string)
    const systemQty = parseFloat((fd.get(`system_${balanceId}`) as string) ?? '0')
    if (!Number.isFinite(physicalQty) || physicalQty < 0) continue
    if (Math.abs(physicalQty - systemQty) < 0.001) continue // no variance
    variances.push({ balance_id: balanceId, system_qty: systemQty, physical_qty: physicalQty })
  }

  if (variances.length === 0) return { error: 'No variances found — all physical counts match the system.' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()
  const now = new Date().toISOString()

  for (const v of variances) {
    await supabase.from('stock_corrections').insert({
      corrected_by: actor,
      stock_stage: 'cuttings',
      entity_table: 'cuttings_stock_balance',
      entity_id: v.balance_id,
      field_corrected: 'gross_qty',
      old_value: v.system_qty,
      new_value: v.physical_qty,
      reason: `Physical count reconciliation: ${reason}`,
      notes: `Variance: ${(v.physical_qty - v.system_qty).toFixed(3)} gross`,
    })

    await supabase
      .from('cuttings_stock_balance')
      .update({ gross_qty: v.physical_qty, last_updated_at: now })
      .eq('id', v.balance_id)
  }

  revalidatePath('/admin/physical-count')
  revalidatePath('/planning/allocation')
  revalidatePath('/operations/cutting-sessions/stock')

  return { success: `Reconciliation applied: ${variances.length} balance row${variances.length !== 1 ? 's' : ''} updated.` }
}

// ── Ready stock reconciliation ────────────────────────────────

export async function applyReadyReconciliation(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const reason = (fd.get('reason') as string ?? '').trim()
  if (!reason) return { error: 'Reason is required for reconciliation' }

  const variances: Array<{ balance_id: string; system_qty: number; physical_qty: number; committed_qty: number }> = []

  for (const [key, value] of fd.entries()) {
    if (!key.startsWith('physical_')) continue
    const balanceId = key.replace('physical_', '')
    const physicalQty = parseFloat(value as string)
    const systemQty = parseFloat((fd.get(`system_${balanceId}`) as string) ?? '0')
    const committedQty = parseFloat((fd.get(`committed_${balanceId}`) as string) ?? '0')
    if (!Number.isFinite(physicalQty) || physicalQty < 0) continue
    if (Math.abs(physicalQty - systemQty) < 0.001) continue
    if (physicalQty < committedQty) continue // can't go below committed — silently skip
    variances.push({ balance_id: balanceId, system_qty: systemQty, physical_qty: physicalQty, committed_qty: committedQty })
  }

  if (variances.length === 0) return { error: 'No applicable variances — all match or physical qty is below committed qty.' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()
  const now = new Date().toISOString()

  for (const v of variances) {
    await supabase.from('stock_corrections').insert({
      corrected_by: actor,
      stock_stage: 'ready',
      entity_table: 'ready_stock_balance',
      entity_id: v.balance_id,
      field_corrected: 'gross_qty',
      old_value: v.system_qty,
      new_value: v.physical_qty,
      reason: `Physical count reconciliation: ${reason}`,
      notes: `Variance: ${(v.physical_qty - v.system_qty).toFixed(3)} gross`,
    })

    await supabase
      .from('ready_stock_balance')
      .update({ gross_qty: v.physical_qty, last_updated_at: now })
      .eq('id', v.balance_id)
  }

  revalidatePath('/admin/physical-count')
  revalidatePath('/planning/ready')
  revalidatePath('/planning/allocation')

  return { success: `Reconciliation applied: ${variances.length} balance row${variances.length !== 1 ? 's' : ''} updated.` }
}

// ── Velvet reconciliation ─────────────────────────────────────

export async function applyVelvetReconciliation(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const physicalRaw = (fd.get('physical_bundles') as string ?? '').trim()
  const systemQtyRaw = (fd.get('system_bundles') as string ?? '').trim()
  const reason = (fd.get('reason') as string ?? '').trim()

  if (!physicalRaw) return { error: 'Physical count is required' }
  if (!reason) return { error: 'Reason is required' }

  const physicalQty = parseFloat(physicalRaw)
  const systemQty = parseFloat(systemQtyRaw)

  if (!Number.isFinite(physicalQty) || physicalQty < 0) return { error: 'Physical count must be a non-negative number' }
  if (Math.abs(physicalQty - systemQty) < 0.001) return { error: 'Physical count matches the system — no correction needed.' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()
  const now = new Date().toISOString()

  const { data: balance } = await supabase
    .from('velvet_stock_balance')
    .select('id')
    .eq('velvet_type', 'standard')
    .single()

  if (!balance) return { error: 'Velvet balance row not found' }

  await supabase.from('stock_corrections').insert({
    corrected_by: actor,
    stock_stage: 'velvet',
    entity_table: 'velvet_stock_balance',
    entity_id: balance.id,
    field_corrected: 'bundles_on_hand',
    old_value: systemQty,
    new_value: physicalQty,
    reason: `Physical count reconciliation: ${reason}`,
    notes: `Variance: ${(physicalQty - systemQty).toFixed(3)} bundles`,
  })

  await supabase
    .from('velvet_stock_balance')
    .update({ bundles_on_hand: physicalQty, last_updated_at: now })
    .eq('velvet_type', 'standard')

  revalidatePath('/admin/physical-count')
  revalidatePath('/planning/allocation')
  revalidatePath('/operations/velvet-receipts/stock')

  return { success: `Velvet reconciliation applied: ${systemQty.toFixed(3)} → ${physicalQty.toFixed(3)} bundles (${(physicalQty - systemQty >= 0 ? '+' : '')}${(physicalQty - systemQty).toFixed(3)})` }
}
