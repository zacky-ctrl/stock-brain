'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getActorId } from '@/lib/get-actor'
import { reserveStock, releaseReservation } from '@stock-brain/domain'
import { createSupabaseReservationStore } from '@/lib/reservation-store'
import type { ActionState } from '@/lib/masters'

/**
 * Reserve stock for a specific order line.
 *
 * Reads order_line_id, qty, balance_id from FormData hidden inputs.
 * Returns ActionState so the client component can show inline error feedback.
 *
 * On success: revalidates the planning page (Server Component re-renders,
 * the row switches from Reserve button to RESERVED badge).
 * On failure: returns { error } — the ReserveButton component shows it inline.
 */
export async function reserveLineAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderLineId = (formData.get('order_line_id') as string ?? '').trim()
  const qty = parseFloat((formData.get('qty') as string) ?? '0')
  const balanceId = (formData.get('balance_id') as string ?? '').trim()

  if (!orderLineId) return { error: 'Order line ID is missing' }
  if (!balanceId) return { error: 'Balance row ID is missing' }
  if (!Number.isFinite(qty) || qty <= 0) return { error: 'Quantity must be greater than zero' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()
  const store = createSupabaseReservationStore(supabase)

  const result = await reserveStock(
    { order_line_id: orderLineId, ready_stock_balance_id: balanceId, qty, allocated_by: actor },
    store,
  )

  if (!result.ok) {
    return { error: result.error }
  }

  revalidatePath('/planning/allocation')
  revalidatePath('/planning/ready')
  revalidatePath('/admin/reservations')

  return { success: `Reserved ${qty} gross` }
}

export async function releaseReservationAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const allocationId = (formData.get('allocation_id') as string ?? '').trim()
  const reason = (formData.get('reason') as string ?? 'Released from planning page').trim()

  if (!allocationId) return { error: 'Allocation ID is missing' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()
  const store = createSupabaseReservationStore(supabase)

  const result = await releaseReservation({ allocation_id: allocationId, reason, released_by: actor }, store)

  if (!result.ok) return { error: result.error }

  revalidatePath('/planning/allocation')
  revalidatePath('/planning/ready')
  revalidatePath('/admin/reservations')

  return { success: 'Reservation released' }
}

export async function releaseAllOrderReservationsAction(params: {
  allocationIds: string[]
  reason: string
}): Promise<{ error?: string; success?: string; released?: number }> {
  const { allocationIds, reason } = params

  if (!Array.isArray(allocationIds) || allocationIds.length === 0) {
    return { error: 'No allocation IDs provided' }
  }
  if (!reason.trim()) {
    return { error: 'Reason is required' }
  }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()

  // Fetch only allocations that are still active
  const { data: allocations, error: fetchErr } = await supabase
    .from('stock_allocations')
    .select('id, ready_stock_balance_id, allocated_qty')
    .in('id', allocationIds)
    .eq('status', 'active')
    .eq('is_active', true)

  if (fetchErr) return { error: fetchErr.message }
  if (!allocations || allocations.length === 0) {
    return { success: 'Nothing to release', released: 0 }
  }

  const now = new Date().toISOString()
  const activeIds = allocations.map((a) => a.id as string)

  // Batch-release all allocations in one UPDATE
  const { error: releaseErr } = await supabase
    .from('stock_allocations')
    .update({
      is_active: false,
      status: 'released',
      deactivated_by: actor,
      deactivated_at: now,
      deactivation_reason: reason,
      released_by: actor,
      released_at: now,
    })
    .in('id', activeIds)

  if (releaseErr) return { error: releaseErr.message }

  // Group by ready_stock_balance_id and compute total deduction per balance
  const deductionByBalance = new Map<string, number>()
  for (const a of allocations) {
    const balanceId = a.ready_stock_balance_id as string | null
    if (!balanceId) continue
    deductionByBalance.set(balanceId, (deductionByBalance.get(balanceId) ?? 0) + Number(a.allocated_qty))
  }

  const balanceIds = [...deductionByBalance.keys()]
  if (balanceIds.length > 0) {
    const { data: balances, error: balFetchErr } = await supabase
      .from('ready_stock_balance')
      .select('id, committed_qty')
      .in('id', balanceIds)

    if (balFetchErr) return { error: balFetchErr.message }

    const balanceUpdates = (balances ?? []).map((b) => {
      const balanceId = b.id as string
      const deduction = deductionByBalance.get(balanceId) ?? 0
      const newCommitted = Math.max(0, Number(b.committed_qty) - deduction)
      return supabase
        .from('ready_stock_balance')
        .update({ committed_qty: newCommitted, last_updated_at: now })
        .eq('id', balanceId)
    })

    const balanceResults = await Promise.all(balanceUpdates)
    for (const { error } of balanceResults) {
      if (error) return { error: error.message }
    }
  }

  revalidatePath('/planning/allocation')
  revalidatePath('/planning/ready')
  revalidatePath('/admin/reservations')

  return { success: 'Released', released: allocations.length }
}
