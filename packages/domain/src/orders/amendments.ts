import {
  computeOrderLineStatus,
  computeOrderStatusFromLines,
  type OrderLineStatus,
} from './status'
import type {
  AmendOrderLineInput,
  AmendOrderLineResult,
} from '@stock-brain/types'

// ── Store interface ───────────────────────────────────────────
//
// AmendmentStore is the domain's DB dependency boundary.
// The domain defines this interface; the web app implements it
// using Supabase. All business rules live here; the store is IO only.

export type StoredOrderLine = {
  id: string
  order_id: string
  ordered_qty: number
  closed_qty: number
  status: string
}

export type InsertAmendmentRow = {
  order_line_id: string
  amended_by: string
  field_amended: string
  old_value: string
  new_value: string
  reason: string
}

export interface AmendmentStore {
  /** Read current values for the order line being amended. */
  getOrderLine(id: string): Promise<StoredOrderLine | null>

  /**
   * Sum of quantity_dispatched across all confirmed dispatch_lines
   * for this order line.
   */
  getDispatchedQty(orderLineId: string): Promise<number>

  /**
   * Append an amendment record. Append-only — never updates existing rows.
   * Returns an error string on failure, undefined on success.
   */
  insertAmendment(row: InsertAmendmentRow): Promise<string | undefined>

  /**
   * Apply the amended values to order_lines and set the recomputed status.
   * Returns an error string on failure, undefined on success.
   */
  updateOrderLine(
    id: string,
    patch: { ordered_qty?: number; closed_qty?: number; status: string },
  ): Promise<string | undefined>

  /**
   * Read all order lines for an order (for order-level status recomputation).
   * Returns current ordered_qty and closed_qty for each line.
   */
  getAllOrderLinesForOrder(orderId: string): Promise<StoredOrderLine[]>

  /**
   * Batch-fetch dispatched qty for multiple order lines.
   * Returns a Map keyed by order_line_id.
   */
  getDispatchedQtyBatch(lineIds: string[]): Promise<Map<string, number>>

  /** Write the recomputed order-level status to orders. */
  updateOrderStatus(orderId: string, status: string): Promise<void>
}

// ── amendOrderLine ────────────────────────────────────────────

/**
 * Amends ordered_qty and/or closed_qty on an order line, producing
 * an append-only audit record in order_line_amendments.
 *
 * Business rules enforced:
 *   - At least one of new_ordered_qty or new_closed_qty must be provided
 *   - At least one value must actually differ from its current value
 *   - reason must not be empty
 *   - new_ordered_qty must be > 0
 *   - new_ordered_qty must be >= dispatched_qty
 *     (cannot reduce below what is already dispatched)
 *   - new_closed_qty must be >= 0
 *   - new_closed_qty must be <= effective_ordered_qty
 *     where effective_ordered_qty = new_ordered_qty ?? current_ordered_qty
 *   - new_closed_qty + dispatched_qty must be <= effective_ordered_qty
 *     (cannot close what was already dispatched — prevents negative open_qty)
 *
 * Write sequence:
 *   1. Read current line + dispatched qty — validate all constraints
 *   2. Insert amendment record(s) — one per changed field (audit trail first)
 *   3. Update order_lines with new values + recomputed line status
 *   4. Recompute + update order-level status from all lines
 */
export async function amendOrderLine(
  input: AmendOrderLineInput,
  store: AmendmentStore,
): Promise<AmendOrderLineResult> {
  const { order_line_id, new_ordered_qty, new_closed_qty, reason, amended_by } = input

  // ── Basic input validation ─────────────────────────────────
  if (reason.trim().length < 3) {
    return { ok: false, error: 'Reason must be at least 3 characters' }
  }
  if (new_ordered_qty === undefined && new_closed_qty === undefined) {
    return { ok: false, error: 'At least one of ordered qty or closed qty must be provided' }
  }
  if (new_ordered_qty !== undefined && (new_ordered_qty <= 0 || !Number.isFinite(new_ordered_qty))) {
    return { ok: false, error: 'New ordered qty must be greater than zero' }
  }
  if (new_closed_qty !== undefined && (new_closed_qty < 0 || !Number.isFinite(new_closed_qty))) {
    return { ok: false, error: 'New closed qty must be zero or greater' }
  }

  // ── Read current state ─────────────────────────────────────
  const line = await store.getOrderLine(order_line_id)
  if (!line) {
    return { ok: false, error: 'Order line not found' }
  }

  const dispatched = await store.getDispatchedQty(order_line_id)

  const effectiveOrdered = new_ordered_qty ?? line.ordered_qty
  const effectiveClosed = new_closed_qty ?? line.closed_qty

  // ── Business rule validation ───────────────────────────────

  // Cannot reduce ordered below already dispatched.
  // Edge case: ordered=10, dispatched=6, new_ordered=4 → rejected (4 < 6)
  // Edge case: ordered=10, dispatched=6, new_ordered=6 → accepted (6 = 6)
  //   open_qty becomes 6 - 0 - 6 = 0, status becomes fully_dispatched
  if (new_ordered_qty !== undefined && new_ordered_qty < dispatched) {
    return {
      ok: false,
      error: `Cannot reduce ordered qty to ${new_ordered_qty}: ${dispatched} gross already dispatched`,
    }
  }

  // Closed cannot exceed ordered (after amendment)
  if (effectiveClosed > effectiveOrdered) {
    return {
      ok: false,
      error: `Closed qty (${effectiveClosed}) cannot exceed ordered qty (${effectiveOrdered})`,
    }
  }

  // Cannot close what has already been dispatched (would produce negative open_qty)
  if (effectiveClosed + dispatched > effectiveOrdered) {
    const maxClose = effectiveOrdered - dispatched
    return {
      ok: false,
      error: `Closed qty (${effectiveClosed}) plus dispatched (${dispatched}) would exceed ordered (${effectiveOrdered}). Maximum closeable: ${maxClose}`,
    }
  }

  // At least one value must actually change
  const orderedChanging =
    new_ordered_qty !== undefined && new_ordered_qty !== line.ordered_qty
  const closedChanging =
    new_closed_qty !== undefined && new_closed_qty !== line.closed_qty

  if (!orderedChanging && !closedChanging) {
    return {
      ok: false,
      error: 'No change: new values are the same as current values',
    }
  }

  // ── Write amendment records (append-only, audit trail first) ──
  const amendments: Array<{ field: string; old_value: string; new_value: string }> = []

  if (orderedChanging && new_ordered_qty !== undefined) {
    const err = await store.insertAmendment({
      order_line_id,
      amended_by,
      field_amended: 'ordered_qty',
      old_value: String(line.ordered_qty),
      new_value: String(new_ordered_qty),
      reason,
    })
    if (err) {
      return { ok: false, error: `Failed to record ordered_qty amendment: ${err}` }
    }
    amendments.push({
      field: 'ordered_qty',
      old_value: String(line.ordered_qty),
      new_value: String(new_ordered_qty),
    })
  }

  if (closedChanging && new_closed_qty !== undefined) {
    const err = await store.insertAmendment({
      order_line_id,
      amended_by,
      field_amended: 'closed_qty',
      old_value: String(line.closed_qty),
      new_value: String(new_closed_qty),
      reason,
    })
    if (err) {
      return { ok: false, error: `Failed to record closed_qty amendment: ${err}` }
    }
    amendments.push({
      field: 'closed_qty',
      old_value: String(line.closed_qty),
      new_value: String(new_closed_qty),
    })
  }

  // ── Compute new line status ────────────────────────────────
  const newLineStatus = computeOrderLineStatus({
    ordered_qty: effectiveOrdered,
    closed_qty: effectiveClosed,
    dispatched_qty: dispatched,
  })

  // ── Update order_lines ─────────────────────────────────────
  const patch: { ordered_qty?: number; closed_qty?: number; status: string } = {
    status: newLineStatus,
  }
  if (orderedChanging && new_ordered_qty !== undefined) patch.ordered_qty = new_ordered_qty
  if (closedChanging && new_closed_qty !== undefined) patch.closed_qty = new_closed_qty

  const updateErr = await store.updateOrderLine(order_line_id, patch)
  if (updateErr) {
    return { ok: false, error: `Failed to apply amendment: ${updateErr}` }
  }

  // ── Recompute order-level status from all lines ────────────
  const allLines = await store.getAllOrderLinesForOrder(line.order_id)
  const allLineIds = allLines.map((l) => l.id)
  const dispatchedBatch = await store.getDispatchedQtyBatch(allLineIds)

  const lineStatuses: OrderLineStatus[] = allLines.map((l) => {
    // Use updated values for the amended line; original values for others
    const isAmendedLine = l.id === order_line_id
    return computeOrderLineStatus({
      ordered_qty: isAmendedLine ? effectiveOrdered : l.ordered_qty,
      closed_qty: isAmendedLine ? effectiveClosed : l.closed_qty,
      dispatched_qty: dispatchedBatch.get(l.id) ?? 0,
    })
  })

  const newOrderStatus = computeOrderStatusFromLines(lineStatuses)
  await store.updateOrderStatus(line.order_id, newOrderStatus)

  return {
    ok: true,
    amendments,
    new_line_status: newLineStatus,
    new_order_status: newOrderStatus,
  }
}
