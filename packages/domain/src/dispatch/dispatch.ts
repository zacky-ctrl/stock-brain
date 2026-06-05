import type { CreateDispatchInput, CreateDispatchResult, FulfilmentRecordInput } from '@stock-brain/types'
import { computeOrderStatusFromLines } from '../orders/status'
import type { OrderLineStatus } from '../orders/status'

// ── Store interface ───────────────────────────────────────────────────────────
//
// DispatchStore is the domain's DB dependency boundary.
// The domain defines this interface; the web app implements it via Supabase.
//
// ATOMICITY LIMITATION: Supabase JS client does not support transactions.
// Writes happen in a safe order: dispatch_event first (so lines can reference it),
// then bulk line insert, then parallel stock decrements and reservation releases.
// A mid-flight failure leaves a confirmed event with partial lines — this is a
// Phase 3 concern where a Postgres RPC will make dispatch truly atomic.

export type DispatchLineData = {
  dispatch_event_id: string
  order_line_id: string | null
  ready_stock_balance_id: string
  quantity_dispatched: number
  line_type: 'ordered' | 'substitute' | 'extra' | 'short'
  colour_match: boolean
  qty_variance: number
  ordered_sku_context: Record<string, unknown> | null
  override_reason: string | null
}

export interface DispatchStore {
  // Single reads — used once per dispatch
  getOrder(order_id: string): Promise<{ customer_id: string } | null>
  getAllLinesForOrder(order_id: string): Promise<Array<{ id: string; ordered_qty: number; closed_qty: number }>>

  // Batch reads — fetched once for all lines, used as Maps for O(1) lookup
  getOrderLines(ids: string[]): Promise<Map<string, { ordered_qty: number; closed_qty: number; order_id: string }>>
  getOrderLineSkus(ids: string[]): Promise<Map<string, { shape_design_id: string; bindi_colour_id: string; size_id: string; dabbi_colour_id: string }>>
  getStockBalances(ids: string[]): Promise<Map<string, { gross_qty: number; available_qty: number }>>
  getStockBalanceSkus(ids: string[]): Promise<Map<string, { shape_design_id: string; bindi_colour_id: string; size_id: string; dabbi_colour_id: string; brand_id: string }>>
  // Key: "${order_line_id}|${ready_stock_balance_id}"
  getActiveAllocations(order_line_ids: string[]): Promise<Map<string, { id: string; allocated_qty: number }>>
  getDispatchedQtyForLines(order_line_ids: string[]): Promise<Map<string, number>>

  // Write operations
  insertDispatchEvent(data: {
    customer_id: string
    dispatch_date: string
    reference: string | null
    notes: string | null
    actor: string
    confirmed_at: string
  }): Promise<string>
  insertDispatchLines(lines: DispatchLineData[]): Promise<void>
  insertFulfilmentRecords(records: FulfilmentRecordInput[]): Promise<void>
  decrementStockBalances(deductions: Array<{ id: string; qty: number }>, now: string): Promise<void>
  releaseAllocationById(allocation_id: string, actor: string): Promise<void>
  updateOrderLineStatuses(updates: Array<{ id: string; status: string }>): Promise<void>
  updateOrderStatus(id: string, status: string): Promise<void>
}

// ── Domain function ───────────────────────────────────────────────────────────

export async function createDispatch(
  input: CreateDispatchInput,
  store: DispatchStore,
): Promise<CreateDispatchResult> {
  // ── input guards ──────────────────────────────────────────────
  if (!input.order_id && !input.customer_id) {
    return { success: false, error: 'Either order_id or customer_id is required' }
  }
  if (!input.dispatch_date) return { success: false, error: 'dispatch_date is required' }
  if (!input.actor) return { success: false, error: 'actor is required' }

  const today = new Date().toISOString().split('T')[0]
  if (input.dispatch_date > today) {
    return { success: false, error: 'Dispatch date cannot be in the future' }
  }

  const activeLines = input.lines.filter((l) => l.dispatched_qty > 0)
  if (activeLines.length === 0) {
    return { success: false, error: 'Enter a dispatch quantity for at least one line' }
  }

  for (let i = 0; i < activeLines.length; i++) {
    const l = activeLines[i]
    const n = i + 1
    const lineType = l.line_type ?? 'ordered'
    if ((lineType === 'ordered' || lineType === 'short') && !l.order_line_id) {
      return { success: false, error: `Line ${n}: order_line_id is required for ordered lines` }
    }
    if (!l.ready_stock_balance_id) return { success: false, error: `Line ${n}: ready_stock_balance_id is required` }
    if (!Number.isFinite(l.dispatched_qty) || l.dispatched_qty <= 0) {
      return { success: false, error: `Line ${n}: dispatched_qty must be greater than zero` }
    }
  }

  // ── resolve customer_id ──────────────────────────────────────
  let customerId = input.customer_id ?? ''
  if (!customerId && input.order_id) {
    const order = await store.getOrder(input.order_id)
    if (!order) return { success: false, error: 'Order not found' }
    customerId = order.customer_id
  }

  // ── collect all IDs needed for batch fetches ─────────────────
  const orderedLineIds = [...new Set(
    activeLines
      .filter((l) => {
        const lt = l.line_type ?? 'ordered'
        return (lt === 'ordered' || lt === 'short' || lt === 'substitute') && l.order_line_id
      })
      .map((l) => l.order_line_id!),
  )]

  const originalLineIds = [...new Set(
    activeLines
      .filter((l) => l.original_order_line_id && l.line_type === 'substitute')
      .map((l) => l.original_order_line_id!),
  )]

  const allFetchedLineIds = [...new Set([...orderedLineIds, ...originalLineIds])]
  const balanceIds = [...new Set(activeLines.map((l) => l.ready_stock_balance_id))]

  // ── batch fetch all validation data in parallel ───────────────
  const [orderLinesMap, dispatchedQtyMap, balancesMap, allocationsMap] = await Promise.all([
    store.getOrderLines(allFetchedLineIds),
    store.getDispatchedQtyForLines(orderedLineIds),
    store.getStockBalances(balanceIds),
    store.getActiveAllocations(orderedLineIds),
  ])

  // ── validate all lines using in-memory maps ───────────────────
  const openQtyByLineId = new Map<string, number>()

  for (let i = 0; i < activeLines.length; i++) {
    const l = activeLines[i]
    const n = i + 1
    const lineType = l.line_type ?? 'ordered'

    if ((lineType === 'ordered' || lineType === 'short' || lineType === 'substitute') && l.order_line_id && input.order_id) {
      const orderLine = orderLinesMap.get(l.order_line_id)
      if (!orderLine) return { success: false, error: `Line ${n}: order line not found` }
      if (orderLine.order_id !== input.order_id) {
        return { success: false, error: `Line ${n}: order line does not belong to this order` }
      }

      const alreadyDispatched = dispatchedQtyMap.get(l.order_line_id) ?? 0
      const openQty = orderLine.ordered_qty - orderLine.closed_qty - alreadyDispatched
      openQtyByLineId.set(l.order_line_id, openQty)
    }

    const balance = balancesMap.get(l.ready_stock_balance_id)
    if (!balance) return { success: false, error: `Line ${n}: ready stock balance not found` }

    if (lineType === 'extra') {
      if (balance.gross_qty < l.dispatched_qty) {
        return {
          success: false,
          error: `Line ${n}: quantity (${l.dispatched_qty}) exceeds gross stock (${balance.gross_qty.toFixed(3)}).`,
        }
      }
    } else {
      let availableForDispatch = balance.available_qty
      if ((lineType === 'ordered' || lineType === 'short' || lineType === 'substitute') && l.order_line_id) {
        const allocKey = `${l.order_line_id}|${l.ready_stock_balance_id}`
        const ownAlloc = allocationsMap.get(allocKey)
        if (ownAlloc) availableForDispatch += ownAlloc.allocated_qty
      }
      if (availableForDispatch < l.dispatched_qty && !l.override_reason) {
        return {
          success: false,
          error: `Line ${n}: insufficient ready stock (${availableForDispatch.toFixed(3)} available, ${l.dispatched_qty} requested). Provide an override reason to proceed.`,
        }
      }
    }
  }

  // ── all validations passed — begin write phase ────────────────
  const now = new Date().toISOString()

  // Create dispatch event and batch-fetch SKUs in parallel (independent operations)
  const [dispatch_id, balanceSkusMap, orderLineSkusMap] = await Promise.all([
    store.insertDispatchEvent({
      customer_id: customerId,
      dispatch_date: input.dispatch_date,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      actor: input.actor,
      confirmed_at: now,
    }),
    store.getStockBalanceSkus(balanceIds),
    store.getOrderLineSkus(allFetchedLineIds),
  ])

  // ── prepare all line records in memory ────────────────────────
  const dispatchLineRecords: DispatchLineData[] = []
  const fulfilmentRecords: FulfilmentRecordInput[] = []
  const dispatchedOrderLineIds = new Set<string>()
  const allocationIdsToRelease: string[] = []

  for (const l of activeLines) {
    const requestedLineType = l.line_type ?? 'ordered'
    let effectiveLineType: 'ordered' | 'substitute' | 'extra' | 'short' = requestedLineType
    let colourMatch = true
    let qtyVariance = 0
    let orderedSkuContext: Record<string, unknown> | null = null

    if (requestedLineType === 'ordered' || requestedLineType === 'short') {
      const openQty = l.order_line_id ? (openQtyByLineId.get(l.order_line_id) ?? 0) : 0
      qtyVariance = l.dispatched_qty - openQty
      effectiveLineType = l.dispatched_qty < openQty ? 'short' : 'ordered'
      colourMatch = true
    } else if (requestedLineType === 'substitute') {
      colourMatch = false
      effectiveLineType = 'substitute'
      const skuSourceId = l.original_order_line_id ?? l.order_line_id
      if (skuSourceId) {
        const sku = orderLineSkusMap.get(skuSourceId)
        if (sku) orderedSkuContext = sku
      }
    }

    dispatchLineRecords.push({
      dispatch_event_id: dispatch_id,
      order_line_id: l.order_line_id ?? null,
      ready_stock_balance_id: l.ready_stock_balance_id,
      quantity_dispatched: l.dispatched_qty,
      line_type: effectiveLineType,
      colour_match: colourMatch,
      qty_variance: qtyVariance,
      ordered_sku_context: orderedSkuContext,
      override_reason: l.override_reason ?? null,
    })

    // Track which order lines are fulfilled (Option A closure)
    if (l.order_line_id && (effectiveLineType === 'ordered' || effectiveLineType === 'short' || effectiveLineType === 'substitute')) {
      dispatchedOrderLineIds.add(l.order_line_id)
    }
    if (l.original_order_line_id && effectiveLineType === 'substitute') {
      dispatchedOrderLineIds.add(l.original_order_line_id)
    }

    // Collect reservation IDs to release
    if ((effectiveLineType === 'ordered' || effectiveLineType === 'short' || effectiveLineType === 'substitute') && l.order_line_id) {
      const allocKey = `${l.order_line_id}|${l.ready_stock_balance_id}`
      const alloc = allocationsMap.get(allocKey)
      if (alloc) allocationIdsToRelease.push(alloc.id)
    }

    // Prepare fulfilment records
    if (input.order_id) {
      const actualSku = balanceSkusMap.get(l.ready_stock_balance_id)
      if (actualSku) {
        if (effectiveLineType !== 'extra') {
          const orderLineId = l.order_line_id ?? null
          const orderedQty = orderLineId ? (openQtyByLineId.get(orderLineId) ?? 0) : 0
          const orderedSkuForRecord = orderedSkuContext
            ? { ...(orderedSkuContext as Record<string, string>), brand_id: null as string | null }
            : orderLineId
              ? { ...(orderLineSkusMap.get(orderLineId) ?? {}), brand_id: null as string | null }
              : { shape_design_id: '', bindi_colour_id: '', size_id: '', dabbi_colour_id: '', brand_id: null }
          fulfilmentRecords.push({
            dispatch_event_id: dispatch_id,
            order_id: input.order_id,
            order_line_id: orderLineId,
            ordered_qty: orderedQty,
            actual_qty: l.dispatched_qty,
            line_type: effectiveLineType,
            colour_match: colourMatch,
            qty_match: l.dispatched_qty === orderedQty,
            ordered_sku: orderedSkuForRecord as FulfilmentRecordInput['ordered_sku'],
            actual_sku: actualSku,
          })
        } else {
          fulfilmentRecords.push({
            dispatch_event_id: dispatch_id,
            order_id: input.order_id,
            order_line_id: null,
            ordered_qty: 0,
            actual_qty: l.dispatched_qty,
            line_type: 'extra',
            colour_match: true,
            qty_match: false,
            ordered_sku: { shape_design_id: '', bindi_colour_id: '', size_id: '', dabbi_colour_id: '', brand_id: null },
            actual_sku: actualSku,
          })
        }
      }
    }
  }

  // ── bulk insert dispatch lines ────────────────────────────────
  await store.insertDispatchLines(dispatchLineRecords)

  // ── batch balance decrements (grouped by balance_id) ─────────
  const balanceDeductionMap = new Map<string, number>()
  for (const l of activeLines) {
    balanceDeductionMap.set(
      l.ready_stock_balance_id,
      (balanceDeductionMap.get(l.ready_stock_balance_id) ?? 0) + l.dispatched_qty,
    )
  }
  const balanceDeductions = [...balanceDeductionMap.entries()].map(([id, qty]) => ({ id, qty }))

  // ── parallel post-insert operations ──────────────────────────
  // getAllLinesForOrder runs in parallel — it doesn't depend on the new dispatch being committed
  // (we call getDispatchedQtyForLines separately after this to get fresh data)
  const [allOrderLines] = await Promise.all([
    input.order_id ? store.getAllLinesForOrder(input.order_id) : Promise.resolve([] as Array<{ id: string; ordered_qty: number; closed_qty: number }>),
    store.decrementStockBalances(balanceDeductions, now),
    fulfilmentRecords.length > 0 ? store.insertFulfilmentRecords(fulfilmentRecords) : Promise.resolve(),
    ...allocationIdsToRelease.map((id) => store.releaseAllocationById(id, input.actor)),
  ])

  // ── Option A: update order line and order statuses ────────────
  if (!input.order_id) {
    return { success: true, dispatch_id, order_status: 'n/a' }
  }

  const allLineIds = allOrderLines.map((l) => l.id)
  // Fetch dispatched qtys now — after insertDispatchLines committed
  const dispatchedByLineId = await store.getDispatchedQtyForLines(allLineIds)

  const lineStatusUpdates: Array<{ id: string; status: OrderLineStatus }> = []
  const lineStatuses: OrderLineStatus[] = []

  for (const ol of allOrderLines) {
    let newStatus: OrderLineStatus
    if (dispatchedOrderLineIds.has(ol.id)) {
      newStatus = 'fully_dispatched'
    } else {
      const dispatched = dispatchedByLineId.get(ol.id) ?? 0
      if (ol.closed_qty >= ol.ordered_qty) {
        newStatus = 'closed'
      } else if (dispatched <= 0) {
        newStatus = 'open'
      } else if (dispatched >= ol.ordered_qty - ol.closed_qty) {
        newStatus = 'fully_dispatched'
      } else {
        newStatus = 'partially_dispatched'
      }
    }
    lineStatuses.push(newStatus)
    lineStatusUpdates.push({ id: ol.id, status: newStatus })
  }

  await store.updateOrderLineStatuses(lineStatusUpdates)

  const newOrderStatus = computeOrderStatusFromLines(lineStatuses)
  await store.updateOrderStatus(input.order_id, newOrderStatus)

  return { success: true, dispatch_id, order_status: newOrderStatus }
}
