'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { amendOrderLine, amendOrderHeader } from '@stock-brain/domain'
import { createSupabaseAmendmentStore } from '@/lib/amendment-store'
import type { ActionState } from '@/lib/masters'
import type { OrderHeaderAmendmentStore } from '@stock-brain/domain'

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>

// ── Shared order status recalculation ────────────────────────

async function recalculateOrderStatus(supabase: SupabaseClient, orderId: string): Promise<void> {
  const { data: allLines } = await supabase
    .from('order_lines')
    .select('id, ordered_qty, closed_qty')
    .eq('order_id', orderId)

  const lineIds: string[] = []
  let totalOrdered = 0
  let totalClosed = 0
  for (const l of allLines ?? []) {
    lineIds.push(l.id as string)
    totalOrdered += Number(l.ordered_qty)
    totalClosed += Number(l.closed_qty)
  }

  if (totalOrdered === 0) {
    await supabase.from('orders').update({ status: 'open' }).eq('id', orderId)
    return
  }

  const { data: confirmedEvents } = await supabase
    .from('dispatch_events').select('id').eq('status', 'confirmed')
  const confirmedEventIds = (confirmedEvents ?? []).map((e) => e.id as string)

  let totalDispatched = 0
  if (lineIds.length > 0 && confirmedEventIds.length > 0) {
    const { data: dLines } = await supabase
      .from('dispatch_lines')
      .select('quantity_dispatched')
      .in('order_line_id', lineIds)
      .in('dispatch_event_id', confirmedEventIds)
    for (const dl of dLines ?? []) totalDispatched += Number(dl.quantity_dispatched)
  }

  let newStatus: string
  if (totalDispatched + totalClosed >= totalOrdered) {
    newStatus = totalDispatched >= totalOrdered ? 'fully_dispatched' : 'closed'
  } else if (totalDispatched > 0) {
    newStatus = 'partially_dispatched'
  } else {
    newStatus = 'open'
  }

  await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
}

// ── Close Order ───────────────────────────────────────────────

export async function closeOrderAction(params: {
  orderId: string
  reason: string
}): Promise<{ error?: string; success?: string }> {
  const { orderId, reason } = params
  if (!orderId || !reason.trim()) return { error: 'Order ID and reason are required' }

  const supabase = createServerSupabaseClient()
  const actor = process.env.DEV_ACTOR_ID ?? '00000000-0000-0000-0000-000000000001'
  const now = new Date().toISOString()

  // 1. Fetch open / partially-dispatched lines
  const { data: openLines, error: linesErr } = await supabase
    .from('order_lines')
    .select('id, ordered_qty, closed_qty')
    .eq('order_id', orderId)
    .in('status', ['open', 'partially_dispatched'])

  if (linesErr) return { error: `Failed to fetch lines: ${linesErr.message}` }
  if (!openLines || openLines.length === 0) return { error: 'No open lines to close' }

  const lineIds = openLines.map((l) => l.id as string)

  // 2. Dispatched qty per line (confirmed events only)
  const { data: confirmedEvents } = await supabase
    .from('dispatch_events')
    .select('id')
    .eq('status', 'confirmed')

  const confirmedEventIds = (confirmedEvents ?? []).map((e) => e.id as string)
  const dispatchedByLineId = new Map<string, number>()

  if (lineIds.length > 0 && confirmedEventIds.length > 0) {
    const { data: dispatchLines } = await supabase
      .from('dispatch_lines')
      .select('order_line_id, quantity_dispatched')
      .in('order_line_id', lineIds)
      .in('dispatch_event_id', confirmedEventIds)

    for (const dl of dispatchLines ?? []) {
      const id = dl.order_line_id as string
      dispatchedByLineId.set(id, (dispatchedByLineId.get(id) ?? 0) + Number(dl.quantity_dispatched))
    }
  }

  // 3. Close each open line
  let totalQtyClosed = 0
  for (const line of openLines) {
    const lineId = line.id as string
    const orderedQty = Number(line.ordered_qty)
    const dispatchedQty = dispatchedByLineId.get(lineId) ?? 0
    // close_qty absorbs everything not yet dispatched
    const newClosedQty = orderedQty - dispatchedQty
    totalQtyClosed += Math.max(0, newClosedQty - Number(line.closed_qty))

    const { error: updateErr } = await supabase
      .from('order_lines')
      .update({ status: 'closed', closed_qty: newClosedQty })
      .eq('id', lineId)

    if (updateErr) return { error: `Failed to close line: ${updateErr.message}` }
  }

  // 4. Release active allocations (soft-delete per lifecycle CHECK constraint)
  if (lineIds.length > 0) {
    const { error: allocErr } = await supabase
      .from('stock_allocations')
      .update({
        status: 'released',
        is_active: false,
        deactivated_by: actor,
        deactivated_at: now,
        deactivation_reason: reason.trim(),
        released_by: actor,
        released_at: now,
      })
      .in('order_line_id', lineIds)
      .eq('status', 'active')

    if (allocErr) return { error: `Failed to release allocations: ${allocErr.message}` }
  }

  // 5. Recalculate order status from current line statuses and update
  const { data: allOrderLines, error: statusFetchErr } = await supabase
    .from('order_lines')
    .select('status')
    .eq('order_id', orderId)

  if (statusFetchErr) return { error: `Failed to fetch line statuses: ${statusFetchErr.message}` }

  const statuses = (allOrderLines ?? []).map((l) => l.status as string)
  const allDone       = statuses.every((s) => s === 'fully_dispatched' || s === 'closed')
  const anyOpen       = statuses.some((s) => s === 'open' || s === 'partially_dispatched')
  const anyDispatched = statuses.some((s) => s === 'fully_dispatched' || s === 'partially_dispatched')

  const newOrderStatus = allDone ? 'closed'
    : anyOpen && anyDispatched ? 'partially_dispatched'
    : anyOpen ? 'open'
    : 'closed'

  const { error: orderErr } = await supabase
    .from('orders')
    .update({ status: newOrderStatus })
    .eq('id', orderId)

  if (orderErr) return { error: `Failed to update order status: ${orderErr.message}` }

  // 6. Audit record in order_amendments
  await supabase.from('order_amendments').insert({
    order_id: orderId,
    amended_by: actor,
    field_amended: 'status',
    old_value: 'open',
    new_value: 'closed',
    reason: `Order closed — ${reason.trim()} (${openLines.length} lines closed, ${totalQtyClosed.toFixed(3)} gross released)`,
  })

  // 7. Revalidate
  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/orders')
  revalidatePath('/planning/allocation')
  revalidatePath('/planning/ready')
  revalidatePath('/admin/reservations')

  return { success: `Order closed. ${openLines.length} lines closed, ${totalQtyClosed.toFixed(3)} gross released.` }
}

/**
 * Amend ordered_qty and/or closed_qty on a single order line.
 *
 * Reads from FormData:
 *   order_line_id  — the line being amended
 *   order_id       — parent order (for revalidation)
 *   new_ordered_qty — optional; omit or leave empty to leave unchanged
 *   new_closed_qty  — optional; omit or leave empty to leave unchanged
 *   reason          — mandatory
 */
export async function amendOrderLineAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderLineId = (formData.get('order_line_id') as string ?? '').trim()
  const orderId = (formData.get('order_id') as string ?? '').trim()
  const reason = (formData.get('reason') as string ?? '').trim()
  const newOrderedRaw = (formData.get('new_ordered_qty') as string ?? '').trim()
  const newClosedRaw = (formData.get('new_closed_qty') as string ?? '').trim()

  if (!orderLineId) return { error: 'Order line ID is missing' }
  if (!orderId) return { error: 'Order ID is missing' }
  if (!reason) return { error: 'Reason is required for amendments' }

  const new_ordered_qty = newOrderedRaw !== '' ? parseFloat(newOrderedRaw) : undefined
  const new_closed_qty = newClosedRaw !== '' ? parseFloat(newClosedRaw) : undefined

  if (new_ordered_qty !== undefined && (!Number.isFinite(new_ordered_qty) || new_ordered_qty <= 0)) {
    return { error: 'Ordered qty must be a positive number' }
  }
  if (new_closed_qty !== undefined && (!Number.isFinite(new_closed_qty) || new_closed_qty < 0)) {
    return { error: 'Closed qty must be zero or greater' }
  }

  const supabase = createServerSupabaseClient()
  const actor = process.env.DEV_ACTOR_ID ?? '00000000-0000-0000-0000-000000000001'
  const store = createSupabaseAmendmentStore(supabase)

  const result = await amendOrderLine(
    { order_line_id: orderLineId, new_ordered_qty, new_closed_qty, reason, amended_by: actor },
    store,
  )

  if (!result.ok) {
    return { error: result.error }
  }

  await recalculateOrderStatus(supabase, orderId)

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/orders')
  revalidatePath('/planning/allocation')
  revalidatePath('/planning/ready')

  const summary = result.amendments
    .map((a) => `${a.field}: ${a.old_value} → ${a.new_value}`)
    .join(', ')
  return { success: `Amended: ${summary}` }
}

// ── Order header amendment ────────────────────────────────────

export async function amendOrderHeaderAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderId = (formData.get('order_id') as string ?? '').trim()
  const reason = (formData.get('reason') as string ?? '').trim()
  const newCustomerId = (formData.get('new_customer_id') as string ?? '').trim() || undefined
  const newOrderDate = (formData.get('new_order_date') as string ?? '').trim() || undefined
  const newReference = formData.has('new_reference') ? ((formData.get('new_reference') as string) ?? '') || null : undefined
  const newNotes = formData.has('new_notes') ? ((formData.get('new_notes') as string) ?? '') || null : undefined

  if (!orderId) return { error: 'Order ID is missing' }
  if (!reason) return { error: 'Reason is required for amendments' }

  const supabase = createServerSupabaseClient()
  const actor = process.env.DEV_ACTOR_ID ?? '00000000-0000-0000-0000-000000000001'

  const store: OrderHeaderAmendmentStore = {
    async getOrder(id) {
      const { data } = await supabase
        .from('orders')
        .select('id, customer_id, order_date, reference, notes')
        .eq('id', id)
        .single()
      return data as { id: string; customer_id: string; order_date: string; reference: string | null; notes: string | null } | null
    },
    async insertAmendments(rows) {
      const { error } = await supabase.from('order_amendments').insert(
        rows.map((r) => ({
          order_id: r.order_id,
          amended_by: r.amended_by,
          field_amended: r.field_amended,
          old_value: r.old_value,
          new_value: r.new_value,
          reason: r.reason,
        })),
      )
      return error?.message
    },
    async updateOrder(id, fields) {
      const { error } = await supabase.from('orders').update(fields).eq('id', id)
      return error?.message
    },
  }

  const result = await amendOrderHeader(
    {
      order_id: orderId,
      new_customer_id: newCustomerId,
      new_order_date: newOrderDate,
      new_reference: newReference,
      new_notes: newNotes,
      reason,
      amended_by: actor,
    },
    store,
  )

  if (!result.ok) return { error: result.error }

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/orders')
  revalidatePath('/planning/allocation')

  const summary = result.amendments
    .map((a) => `${a.field}: "${a.old_value}" → "${a.new_value}"`)
    .join(', ')
  return { success: `Header updated: ${summary}` }
}

// ── Add line to existing order ────────────────────────────────

export async function addOrderLineAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderId = (formData.get('order_id') as string ?? '').trim()
  const shapeDesignId = (formData.get('shape_design_id') as string ?? '').trim()
  const bindiColourId = (formData.get('bindi_colour_id') as string ?? '').trim()
  const sizeId = (formData.get('size_id') as string ?? '').trim()
  const dabbiColourId = (formData.get('dabbi_colour_id') as string ?? '').trim()
  const orderedQtyRaw = (formData.get('ordered_qty') as string ?? '').trim()
  const promisedDate = (formData.get('promised_date') as string ?? '').trim() || null
  const notes = (formData.get('notes') as string ?? '').trim() || null

  if (!orderId) return { error: 'Order ID is missing' }
  if (!shapeDesignId) return { error: 'Shape/design is required' }
  if (!bindiColourId) return { error: 'Bindi colour is required' }
  if (!sizeId) return { error: 'Size is required' }
  if (!dabbiColourId) return { error: 'Dabbi colour is required' }
  if (!orderedQtyRaw) return { error: 'Ordered quantity is required' }

  const orderedQty = parseFloat(orderedQtyRaw)
  if (!Number.isFinite(orderedQty) || orderedQty <= 0) {
    return { error: 'Ordered quantity must be a positive number' }
  }

  const supabase = createServerSupabaseClient()
  const actor = process.env.DEV_ACTOR_ID ?? '00000000-0000-0000-0000-000000000001'

  // Get order to validate it exists and get customer for brand snapshot
  const { data: order } = await supabase
    .from('orders')
    .select('id, customer_id, customers(brand_rule)')
    .eq('id', orderId)
    .single()

  if (!order) return { error: 'Order not found' }

  const { data: existing } = await supabase
    .from('order_lines')
    .select('id, ordered_qty')
    .eq('order_id', orderId)
    .eq('shape_design_id', shapeDesignId)
    .eq('bindi_colour_id', bindiColourId)
    .eq('size_id', sizeId)
    .eq('dabbi_colour_id', dabbiColourId)
    .maybeSingle()

  if (existing) {
    return {
      error: `This SKU already exists in this order (${existing.ordered_qty} gross). Edit the existing line instead.`,
    }
  }

  const brandRule = Array.isArray(order.customers)
    ? (order.customers[0] as { brand_rule: string } | null)?.brand_rule
    : (order.customers as { brand_rule: string } | null)?.brand_rule

  const { error: insertErr } = await supabase.from('order_lines').insert({
    order_id: orderId,
    shape_design_id: shapeDesignId,
    bindi_colour_id: bindiColourId,
    size_id: sizeId,
    dabbi_colour_id: dabbiColourId,
    ordered_qty: orderedQty,
    closed_qty: 0,
    status: 'open',
    customer_brand_rule_snapshot: brandRule ?? 'brand_a_only',
    promised_date: promisedDate,
    notes: notes ? `[Added post-creation] ${notes}` : '[Added post-creation]',
    created_by: actor,
  })

  if (insertErr) return { error: `Failed to add line: ${insertErr.message}` }

  await recalculateOrderStatus(supabase, orderId)

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/orders')
  revalidatePath('/planning/allocation')

  return { success: 'Line added to order.' }
}
