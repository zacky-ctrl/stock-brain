export type OrderLineStatus = 'open' | 'partially_dispatched' | 'fully_dispatched' | 'closed'
export type OrderStatus = 'open' | 'partially_dispatched' | 'fully_dispatched' | 'closed'

/**
 * Computes order line status from quantity math.
 *
 * open_qty = ordered_qty - closed_qty - dispatched_qty
 * closed_qty >= ordered_qty → 'closed'  (explicit closure, no dispatch needed)
 * dispatched_qty = 0        → 'open'
 * dispatched_qty >= remaining → 'fully_dispatched'
 * else                      → 'partially_dispatched'
 */
export function computeOrderLineStatus(params: {
  ordered_qty: number
  closed_qty: number
  dispatched_qty: number
}): OrderLineStatus {
  const { ordered_qty, closed_qty, dispatched_qty } = params
  if (closed_qty >= ordered_qty) return 'closed'
  const remaining = ordered_qty - closed_qty
  if (dispatched_qty <= 0) return 'open'
  if (dispatched_qty >= remaining) return 'fully_dispatched'
  return 'partially_dispatched'
}

/**
 * Derives order-level status from all its line statuses.
 * Order 'closed' status is set by explicit user action — not computed here.
 */
export function computeOrderStatusFromLines(
  lineStatuses: OrderLineStatus[],
): Exclude<OrderStatus, 'closed'> {
  if (lineStatuses.length === 0) return 'open'
  const allDone = lineStatuses.every(
    (s) => s === 'fully_dispatched' || s === 'closed',
  )
  if (allDone) return 'fully_dispatched'
  const anyDispatched = lineStatuses.some(
    (s) => s === 'partially_dispatched' || s === 'fully_dispatched',
  )
  return anyDispatched ? 'partially_dispatched' : 'open'
}
