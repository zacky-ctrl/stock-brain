'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getActorId } from '@/lib/get-actor'
import type { ActionState } from '@/lib/masters'

export async function voidDispatchAction(
  eventId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const reason = (formData.get('void_reason') as string ?? '').trim()
  if (!reason) return { error: 'Reason is required to void a dispatch' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()
  const now = new Date().toISOString()

  const { data: event } = await supabase
    .from('dispatch_events')
    .select('id, status, customer_id')
    .eq('id', eventId)
    .single()

  if (!event) return { error: 'Dispatch event not found' }
  if (event.status === 'voided') return { error: 'Dispatch is already voided' }

  // Fetch all dispatch lines for this event
  const { data: lines } = await supabase
    .from('dispatch_lines')
    .select('id, order_line_id, ready_stock_balance_id, quantity_dispatched, line_type')
    .eq('dispatch_event_id', eventId)

  // 1. Restore ready stock for each line
  await Promise.all((lines ?? []).map(async (l) => {
    const qty = Number(l.quantity_dispatched)

    const { data: balance } = await supabase
      .from('ready_stock_balance')
      .select('id, gross_qty')
      .eq('id', l.ready_stock_balance_id)
      .single()

    if (balance) {
      await supabase.from('ready_stock_balance').update({
        gross_qty: Number(balance.gross_qty) + qty,
        last_updated_at: now,
      }).eq('id', l.ready_stock_balance_id)
    }
  }))

  // 2. Recompute order line + order statuses for all dispatch-bearing lines
  const affectedOrderLineIds = (lines ?? [])
    .filter(
      (l) =>
        l.order_line_id &&
        (l.line_type === 'ordered' ||
          l.line_type === 'substitute' ||
          l.line_type === 'short' ||
          !l.line_type),
    )
    .map((l) => l.order_line_id as string)

  const affectedOrderIds = new Set<string>()

  if (affectedOrderLineIds.length > 0) {
    // Fetch confirmed dispatch lines (excluding this voided event) to compute new dispatched qty
    const { data: otherConfirmedEvents } = await supabase
      .from('dispatch_events')
      .select('id')
      .eq('status', 'confirmed')
      .neq('id', eventId)

    const confirmedIds = (otherConfirmedEvents ?? []).map((e) => e.id as string)

    await Promise.all(affectedOrderLineIds.map(async (orderLineId) => {
      // Compute dispatched from other confirmed events only
      let dispatchedQty = 0
      if (confirmedIds.length > 0) {
        const { data: otherLines } = await supabase
          .from('dispatch_lines')
          .select('quantity_dispatched')
          .eq('order_line_id', orderLineId)
          .in('dispatch_event_id', confirmedIds)

        dispatchedQty = (otherLines ?? []).reduce((s, l) => s + Number(l.quantity_dispatched), 0)
      }

      const { data: orderLine } = await supabase
        .from('order_lines')
        .select('id, order_id, ordered_qty, closed_qty')
        .eq('id', orderLineId)
        .single()

      if (!orderLine) return

      const openQty = Number(orderLine.ordered_qty) - Number(orderLine.closed_qty) - dispatchedQty
      let newStatus: string
      if (dispatchedQty <= 0) {
        newStatus = 'open'
      } else if (openQty <= 0) {
        newStatus = 'fully_dispatched'
      } else {
        newStatus = 'partially_dispatched'
      }

      await supabase.from('order_lines').update({ status: newStatus }).eq('id', orderLineId)
      affectedOrderIds.add(orderLine.order_id as string)
    }))

    // Recompute order statuses from current line statuses
    await Promise.all([...affectedOrderIds].map(async (orderId) => {
      const { data: orderLines } = await supabase
        .from('order_lines')
        .select('status')
        .eq('order_id', orderId)

      const statuses = (orderLines ?? []).map((l) => l.status as string)
      const allDone      = statuses.every((s) => s === 'fully_dispatched' || s === 'closed')
      const anyOpen      = statuses.some((s) => s === 'open' || s === 'partially_dispatched')
      const anyDispatched = statuses.some((s) => s === 'fully_dispatched' || s === 'partially_dispatched')

      const orderStatus = allDone
        ? (anyDispatched ? 'fully_dispatched' : 'closed')
        : anyOpen && anyDispatched
        ? 'partially_dispatched'
        : anyOpen
        ? 'open'
        : 'closed'

      await supabase.from('orders').update({ status: orderStatus }).eq('id', orderId)
    }))
  }

  // 3. Mark event as voided + record why
  const { error: voidErr } = await supabase
    .from('dispatch_events')
    .update({ status: 'voided', notes: `[VOIDED by ${actor}] ${reason}` })
    .eq('id', eventId)

  if (voidErr) return { error: `Failed to void event: ${voidErr.message}` }

  revalidatePath('/dispatch')
  revalidatePath('/orders')
  for (const orderId of affectedOrderIds) {
    revalidatePath(`/orders/${orderId}`)
  }
  revalidatePath('/planning/ready')
  revalidatePath('/planning/allocation')

  redirect('/dispatch')
}
