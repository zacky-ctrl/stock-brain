import type {
  RawReadyStockRow,
  RawOpenOrderLineRow,
  RawConfirmedDispatchRow,
  ReadyStockPlanningRow,
} from '@stock-brain/types'

/**
 * Caller-supplied fetchers. The domain function is DB-agnostic;
 * callers implement these using whichever client they have (Supabase,
 * raw SQL, a mock). This keeps the domain free of DB dependencies
 * and makes the function trivially testable.
 *
 * Constraint: callers must coerce Supabase's NUMERIC string values
 * to number before returning rows from the fetchers.
 */
export type ReadyStockSnapshotFetchers = {
  /** All rows in ready_stock_balance. */
  fetchReadyStock: () => Promise<RawReadyStockRow[]>

  /** Order lines with status 'open' or 'partially_dispatched'. */
  fetchOpenOrderLines: () => Promise<RawOpenOrderLineRow[]>

  /**
   * Dispatch lines from confirmed dispatch events, filtered to the
   * given order line IDs. Only lines from confirmed events count
   * toward dispatched quantity; drafts and voided events are excluded.
   *
   * May return an empty array if there are no confirmed dispatches.
   * Callers should short-circuit if orderLineIds is empty.
   */
  fetchConfirmedDispatch: (orderLineIds: string[]) => Promise<RawConfirmedDispatchRow[]>
}

/**
 * Returns planning truth for all finished-goods SKUs that have a
 * ready_stock_balance row.
 *
 * open_order_qty is summed at the 4-part base SKU level
 * (shape + bindi_colour + size + dabbi_colour) because order_lines do
 * not carry brand — brand is selected at dispatch time per customer rule.
 * Attributing demand to a specific brand variant is the recommendation
 * layer's job (Phase 4+), not this snapshot's.
 */
export async function getPlanningSnapshotForReadyStock(
  fetchers: ReadyStockSnapshotFetchers,
): Promise<ReadyStockPlanningRow[]> {
  const [readyStock, openOrderLines] = await Promise.all([
    fetchers.fetchReadyStock(),
    fetchers.fetchOpenOrderLines(),
  ])

  const openQtyByBaseSku = new Map<string, number>()

  if (openOrderLines.length > 0) {
    const orderLineIds = openOrderLines.map((l) => l.id)
    const confirmedDispatches = await fetchers.fetchConfirmedDispatch(orderLineIds)

    const dispatchedByLineId = new Map<string, number>()
    for (const d of confirmedDispatches) {
      dispatchedByLineId.set(
        d.order_line_id,
        (dispatchedByLineId.get(d.order_line_id) ?? 0) + d.quantity_dispatched,
      )
    }

    for (const line of openOrderLines) {
      const dispatched = dispatchedByLineId.get(line.id) ?? 0
      // Clamp at 0: should never go negative under invariants, but defensive.
      const remaining = Math.max(0, line.ordered_qty - line.closed_qty - dispatched)
      const key = base4Key(line)
      openQtyByBaseSku.set(key, (openQtyByBaseSku.get(key) ?? 0) + remaining)
    }
  }

  return readyStock.map((row) => ({
    shape_design_id: row.shape_design_id,
    bindi_colour_id: row.bindi_colour_id,
    size_id: row.size_id,
    dabbi_colour_id: row.dabbi_colour_id,
    brand_id: row.brand_id,
    ready_stock_balance_id: row.id,
    ready_qty: row.gross_qty,
    committed_ready_qty: row.committed_qty,
    available_ready_qty: row.available_qty,
    open_order_qty: openQtyByBaseSku.get(base4Key(row)) ?? 0,
  }))
}

function base4Key(row: {
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
}): string {
  return `${row.shape_design_id}|${row.bindi_colour_id}|${row.size_id}|${row.dabbi_colour_id}`
}
