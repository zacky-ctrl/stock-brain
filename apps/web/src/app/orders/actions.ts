'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { reserveStock } from '@stock-brain/domain'
import { createSupabaseReservationStore } from '@/lib/reservation-store'
import type { ActionState } from '@/lib/masters'

/**
 * Sets a priority override for every open line in an order simultaneously.
 * Deactivates any existing overrides first (append-only audit trail).
 */
export async function setOrderPriorityAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderId = (formData.get('order_id') as string ?? '').trim()
  const priorityValueRaw = (formData.get('priority_value') as string ?? '').trim()
  const reason = (formData.get('reason') as string ?? '').trim()
  const confirm = formData.get('confirm') === 'true'

  if (!orderId) return { error: 'Order ID is required' }
  if (!priorityValueRaw) return { error: 'Priority value is required' }
  if (!reason) return { error: 'Reason is required' }

  const priorityValue = parseInt(priorityValueRaw, 10)
  if (!Number.isInteger(priorityValue) || priorityValue < 1) {
    return { error: 'Priority value must be a positive integer (1 = highest)' }
  }

  const supabase = createServerSupabaseClient()
  const actor = process.env.DEV_ACTOR_ID ?? '00000000-0000-0000-0000-000000000001'

  if (!confirm) {
    const { data: conflicting } = await supabase
      .from('priority_overrides')
      .select('order_line_id, order_lines(order_id, orders(customers(name)))')
      .eq('priority_value', priorityValue)
      .eq('is_active', true)
      .limit(1)

    if (conflicting && conflicting.length > 0) {
      const ol = conflicting[0].order_lines as { order_id: string; orders: { customers: { name: string } | null } | null } | null
      const conflictingOrderId = ol?.order_id ?? null
      if (conflictingOrderId && conflictingOrderId !== orderId) {
        const customerName = ol?.orders?.customers?.name ?? 'another order'
        return {
          error: `P${priorityValue} is already assigned to ${customerName}. To force this priority, submit again with confirm=true.`,
        }
      }
    }
  }

  const { data: lines, error: linesErr } = await supabase
    .from('order_lines')
    .select('id')
    .eq('order_id', orderId)
    .in('status', ['open', 'partially_dispatched'])

  if (linesErr) return { error: `Failed to fetch lines: ${linesErr.message}` }
  if (!lines || lines.length === 0) return { error: 'No open lines found for this order' }

  const lineIds = lines.map((l) => l.id as string)

  await supabase
    .from('priority_overrides')
    .update({ is_active: false })
    .in('order_line_id', lineIds)
    .eq('is_active', true)

  const { error: insertErr } = await supabase.from('priority_overrides').insert(
    lineIds.map((lineId) => ({
      order_line_id: lineId,
      priority_value: priorityValue,
      previous_priority_value: null,
      reason,
      expires_at: null,
      is_active: true,
      overridden_by: actor,
    })),
  )

  if (insertErr) return { error: `Failed to set priority: ${insertErr.message}` }

  await supabase
    .from('order_lines')
    .update({ has_priority_override: true })
    .in('id', lineIds)

  revalidatePath('/orders')
  revalidatePath('/planning/allocation')

  return { success: `Priority P${priorityValue} applied to ${lineIds.length} line(s)` }
}

/**
 * Reserves ready stock for multiple order lines in one action.
 * lines_json: JSON array of {line_id, balance_id, qty}
 */
export async function reserveOrderLinesAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const linesJson = (formData.get('lines_json') as string ?? '').trim()
  if (!linesJson) return { error: 'No lines data provided' }

  let lines: Array<{ line_id: string; balance_id: string; qty: number }>
  try {
    lines = JSON.parse(linesJson)
  } catch {
    return { error: 'Invalid lines data' }
  }

  if (!lines.length) return { error: 'No reservable lines' }

  const supabase = createServerSupabaseClient()
  const actor = process.env.DEV_ACTOR_ID ?? '00000000-0000-0000-0000-000000000001'
  const store = createSupabaseReservationStore(supabase)

  const lineIds = lines.map((l) => l.line_id)
  const { data: existing } = await supabase
    .from('stock_allocations')
    .select('order_line_id')
    .in('order_line_id', lineIds)
    .eq('status', 'active')
    .eq('is_active', true)
    .eq('stock_stage', 'ready')

  const alreadyReserved = new Set(
    (existing ?? []).map((r) => r.order_line_id as string),
  )

  const toReserve = lines.filter((l) => !alreadyReserved.has(l.line_id))
  if (toReserve.length === 0) return { success: 'All lines already reserved' }

  const results = await Promise.all(
    toReserve.map((line) =>
      reserveStock(
        { order_line_id: line.line_id, ready_stock_balance_id: line.balance_id, qty: line.qty, allocated_by: actor },
        store,
      ),
    ),
  )

  const successCount = results.filter((r) => r.ok).length
  const errors = results.filter((r) => !r.ok).map((r) => r.error)

  revalidatePath('/orders')
  revalidatePath('/planning/allocation')
  revalidatePath('/admin/reservations')

  if (successCount === 0) return { error: errors.join('; ') || 'All reservations failed' }
  if (errors.length > 0) return { success: `Reserved ${successCount} line(s). ${errors.length} failed.` }
  return { success: `Reserved ${successCount} line(s) successfully` }
}
