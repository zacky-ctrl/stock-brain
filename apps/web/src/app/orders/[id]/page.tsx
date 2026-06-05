import { createServerSupabaseClient } from '@/lib/supabase/server'
import { computeOrderLineStatus, computeOrderStatusFromLines, computePlanningAllocation } from '@stock-brain/domain'
import type { OrderStatus } from '@stock-brain/domain'
import { fetchPlanningInputs } from '@/lib/planning-fetcher'
import { notFound } from 'next/navigation'
import { OrderDetailClient } from './OrderDetailClient'
import type { OrderDetailClientProps, OrderLineForDisplay, LineAmendmentRecord, HeaderAmendmentRecord, ExtraSkuOption, EngineRow, DispatchEventFull, ChallanCellEntry } from './types'

// ── Raw Supabase row types ────────────────────────────────────

type OrderRow = {
  id: string
  customer_id: string
  order_date: string
  reference: string | null
  status: string
  notes: string | null
  created_at: string
  customers: { name: string; brand_rule: string; priority_weight: number } | { name: string; brand_rule: string; priority_weight: number }[] | null
}

type OrderLineRow = {
  id: string
  order_id?: string
  shape_design_id?: string
  bindi_colour_id?: string
  size_id?: string
  dabbi_colour_id?: string
  ordered_qty: string | number
  closed_qty: string | number
  promised_date: string | null
  status: string
  notes: string | null
  has_priority_override?: boolean
  shape_designs: { code: string; name: string | null } | null
  bindi_colours: { code: string } | null
  sizes: { code: string } | null
  dabbi_colours: { code: string } | null
}

type DispatchLineRow = {
  order_line_id: string
  quantity_dispatched: string | number
  dispatch_event_id: string
  line_type: string | null
  dispatch_events: {
    id: string
    dispatch_date: string
    reference: string | null
    status: string
    notes: string | null
  } | null
}

type ExtraRsbRow = {
  shape_design: { name: string | null } | null
  bindi_colour: { code: string } | null
  size: { code: string } | null
  dabbi_colour: { code: string } | null
}

type ExtraDispatchLineRow = {
  quantity_dispatched: string | number
  dispatch_event_id: string
  ready_stock_balance: ExtraRsbRow | ExtraRsbRow[] | null
  dispatch_events: {
    id: string
    dispatch_date: string
    reference: string | null
    status: string
    notes: string | null
  } | null
}

type AmendmentRow = {
  id: string
  amended_at: string
  amended_by: string
  order_line_id: string
  field_amended: string
  old_value: string
  new_value: string
  reason: string
}

type SkuInfo = {
  shape: string
  bindi_colour: string
  size: string
  dabbi: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
}

// ── Helpers ───────────────────────────────────────────────────

function resolveCustomer(raw: OrderRow['customers']): { name: string; brand_rule: string; priority_weight: number } | null {
  if (!raw) return null
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw
}

function resolveRef<T>(raw: T | T[] | null): T | null {
  if (!raw) return null
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

// ── Page ──────────────────────────────────────────────────────

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServerSupabaseClient()

  const { data: orderRaw, error: orderErr } = await supabase
    .from('orders')
    .select('id, customer_id, order_date, reference, status, notes, created_at, customers(name, brand_rule, priority_weight)')
    .eq('id', id)
    .single()

  if (orderErr || !orderRaw) notFound()

  const order = orderRaw as unknown as OrderRow
  const customer = resolveCustomer(order.customers)

  const [
    sizesResult,
    designsResult,
    coloursResult,
    dabbiResult,
    brandResult,
    customersResult,
    headerAmendmentsResult,
    planningInputs,
  ] = await Promise.all([
    supabase.from('sizes').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('shape_designs').select('id, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('bindi_colours').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('dabbi_colours').select('id, code').eq('is_active', true).order('code'),
    supabase.from('brands').select('id, code, name').eq('is_active', true).order('name'),
    supabase.from('customers').select('id, name').eq('is_active', true).order('name'),
    supabase.from('order_amendments').select('id, amended_at, field_amended, old_value, new_value, reason').eq('order_id', id).order('amended_at', { ascending: false }),
    fetchPlanningInputs(supabase, { orderIds: [id] }),
  ])

  const sizeMaster = (sizesResult.data ?? []).map((s) => ({
    id: s.id as string, code: s.code as string, name: s.name as string, sort_order: Number(s.sort_order),
  }))
  const designMaster = (designsResult.data ?? []).map((d) => ({
    id: d.id as string, name: d.name as string, sort_order: Number(d.sort_order),
  }))
  const colourMaster = (coloursResult.data ?? []).map((c) => ({
    id: c.id as string, code: c.code as string, name: c.name as string, sort_order: Number(c.sort_order),
  }))
  const dabbiMaster = (dabbiResult.data ?? []).map((d, i) => ({
    id: d.id as string, code: d.code as string, sort_order: i,
  }))
  const brandMaster = (brandResult.data ?? []).map((b) => ({
    id: b.id as string, name: (b.name ?? b.code) as string,
  }))
  const customerOptions = (customersResult.data ?? []).map((c) => ({
    id: c.id as string, name: c.name as string,
  }))
  const headerAmendments: HeaderAmendmentRecord[] = (headerAmendmentsResult.data ?? []).map((a) => ({
    id: a.id as string,
    amended_at: a.amended_at as string,
    field_amended: a.field_amended as string,
    old_value: a.old_value as string,
    new_value: a.new_value as string,
    reason: a.reason as string,
  }))

  const dabbiMap = new Map<string, string>((dabbiResult.data ?? []).map((d) => [d.id as string, d.code as string]))

  // Extra stock options
  const { data: extraStockRaw } = await supabase
    .from('ready_stock_balance')
    .select(`id, gross_qty, available_qty, committed_qty, shape_designs(code, name), bindi_colours(code), sizes(code), dabbi_colours(code), brands(code, name)`)
    .gt('gross_qty', 0)

  type ExtraStockRow = {
    id: string; gross_qty: number | string; available_qty: number | string; committed_qty: number | string
    shape_designs: { code: string; name: string | null } | null; bindi_colours: { code: string } | null
    sizes: { code: string } | null; dabbi_colours: { code: string } | null; brands: { code: string; name: string | null } | null
  }

  const getCode = (raw: unknown): string => {
    if (!raw) return '?'
    const r = Array.isArray(raw) ? raw[0] : raw
    return (r as { name?: string | null; code?: string } | null)?.name ?? (r as { code?: string } | null)?.code ?? '?'
  }

  const extraStockOptions: ExtraSkuOption[] = (extraStockRaw ?? []).map((rs) => {
    const r = rs as unknown as ExtraStockRow
    const grossQty = Number(r.gross_qty)
    const committedQty = Number(r.committed_qty)
    const commitment = committedQty > 0 ? `${fmt(committedQty)} committed` : 'fully available'
    return {
      id: r.id,
      label: `${getCode(r.shape_designs)} / ${getCode(r.bindi_colours)} / ${getCode(r.sizes)} / ${getCode(r.dabbi_colours)} / ${getCode(r.brands)} — ${fmt(grossQty)} gross (${commitment})`,
      gross_qty: grossQty,
      committed_qty: committedQty,
      available_qty: Number(r.available_qty),
    }
  })

  const { data: linesRaw } = await supabase
    .from('order_lines')
    .select(`id, order_id, ordered_qty, closed_qty, promised_date, status, notes, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id, has_priority_override, shape_designs(code, name), bindi_colours(code), sizes(code), dabbi_colours(code)`)
    .eq('order_id', id)
    .order('created_at')

  const lines = (linesRaw ?? []) as unknown as OrderLineRow[]
  const lineIds = lines.map((l) => l.id)

  const { data: eventsRaw } = await supabase.from('dispatch_events').select('id').eq('status', 'confirmed')
  const confirmedEventIds = (eventsRaw ?? []).map((e) => e.id as string)

  let dispatchLines: DispatchLineRow[] = []
  let amendmentRows: AmendmentRow[] = []
  let activeAllocations: Array<{ order_line_id: string; allocated_qty: number; allocated_at: string }> = []
  let priorityOverrides: Array<{ order_line_id: string; priority_value: number }> = []

  const fetches: PromiseLike<void>[] = []

  if (lineIds.length > 0 && confirmedEventIds.length > 0) {
    fetches.push(
      supabase.from('dispatch_lines')
        .select(`order_line_id, quantity_dispatched, dispatch_event_id, line_type, dispatch_events(id, dispatch_date, reference, status, notes)`)
        .in('order_line_id', lineIds)
        .in('dispatch_event_id', confirmedEventIds)
        .order('created_at')
        .then(({ data }) => { dispatchLines = (data ?? []) as unknown as DispatchLineRow[] }),
    )
  }

  if (lineIds.length > 0) {
    fetches.push(
      supabase.from('order_line_amendments')
        .select('id, amended_at, amended_by, order_line_id, field_amended, old_value, new_value, reason')
        .in('order_line_id', lineIds)
        .order('amended_at', { ascending: false })
        .then(({ data }) => { amendmentRows = (data ?? []) as unknown as AmendmentRow[] }),
    )
    fetches.push(
      supabase.from('stock_allocations')
        .select('order_line_id, allocated_qty, allocated_at')
        .in('order_line_id', lineIds)
        .eq('status', 'active')
        .then(({ data }) => {
          activeAllocations = (data ?? []).map((a) => ({
            order_line_id: a.order_line_id as string,
            allocated_qty: Number(a.allocated_qty),
            allocated_at: a.allocated_at as string,
          }))
        }),
    )
  }

  const overriddenLineIds = lines.filter((l) => l.has_priority_override).map((l) => l.id)
  if (overriddenLineIds.length > 0) {
    const today = new Date().toISOString().split('T')[0]
    fetches.push(
      supabase.from('priority_overrides')
        .select('order_line_id, priority_value')
        .in('order_line_id', overriddenLineIds)
        .eq('is_active', true)
        .or(`expires_at.is.null,expires_at.gte.${today}`)
        .order('overridden_at', { ascending: false })
        .then(({ data }) => {
          const seen = new Set<string>()
          for (const ov of data ?? []) {
            const lineId = ov.order_line_id as string
            if (!seen.has(lineId)) {
              seen.add(lineId)
              priorityOverrides.push({ order_line_id: lineId, priority_value: ov.priority_value as number })
            }
          }
        }),
    )
  }

  await Promise.all(fetches)

  // Extra dispatch lines
  const orderedEventIdSet = new Set(dispatchLines.map((dl) => dl.dispatch_event_id))
  const { data: orderSpecificEventsData } = await supabase.from('dispatch_events').select('id').eq('order_id', id).eq('status', 'confirmed')
  for (const e of orderSpecificEventsData ?? []) orderedEventIdSet.add(e.id as string)

  let extraDispatchLines: ExtraDispatchLineRow[] = []
  const allOrderEventIds = [...orderedEventIdSet]
  if (allOrderEventIds.length > 0) {
    const { data: extrasData } = await supabase.from('dispatch_lines')
      .select(`quantity_dispatched, dispatch_event_id, ready_stock_balance:ready_stock_balance_id (shape_design:shape_design_id (name), bindi_colour:bindi_colour_id (code), size:size_id (code), dabbi_colour:dabbi_colour_id (code)), dispatch_events(id, dispatch_date, reference, status, notes)`)
      .in('dispatch_event_id', allOrderEventIds)
      .eq('line_type', 'extra')
    extraDispatchLines = (extrasData ?? []) as unknown as ExtraDispatchLineRow[]
  }

  // Planning engine
  const engineRowsRaw = computePlanningAllocation(planningInputs)
  const engineRows: EngineRow[] = engineRowsRaw.map((r) => ({
    order_line_id: r.order_line_id,
    ready_allocated_qty: r.ready_allocated_qty,
    cuttings_allocated_qty: r.cuttings_allocated_qty,
    shortage_qty: r.shortage_qty,
    planning_status: r.planning_status,
    recommended_cut_qty: r.recommended_cut_qty,
    wip_allocated_qty: r.wip_allocated_qty,
    cuttings_available_qty: r.cuttings_available_qty,
    dabbi_colour_id: r.dabbi_colour_id,
  }))
  const engineByLineId = new Map(engineRowsRaw.map((r) => [r.order_line_id, r]))

  // Priority badge
  const hasAnyOverride = lines.some((l) => l.has_priority_override)
  const lowestOverrideValue = priorityOverrides.length > 0 ? Math.min(...priorityOverrides.map((o) => o.priority_value)) : null
  const priorityWeight = customer?.priority_weight ?? 5
  const priorityBadgeText = hasAnyOverride && lowestOverrideValue !== null ? `P${lowestOverrideValue} ★` : `W${11 - priorityWeight}`

  // SKU lookup
  const skuByLineId = new Map<string, SkuInfo>()
  for (const l of lines) {
    const shape = resolveRef(l.shape_designs)
    const bindi = resolveRef(l.bindi_colours)
    const size = resolveRef(l.sizes)
    const dabbi = resolveRef(l.dabbi_colours)
    skuByLineId.set(l.id, {
      shape: (shape as { code: string; name: string | null } | null)?.name ?? (shape as { code: string } | null)?.code ?? '—',
      bindi_colour: (bindi as { code: string } | null)?.code ?? '—',
      size: (size as { code: string } | null)?.code ?? '—',
      dabbi: (dabbi as { code: string } | null)?.code ?? '—',
      shape_design_id: l.shape_design_id ?? '',
      bindi_colour_id: l.bindi_colour_id ?? '',
      size_id: l.size_id ?? '',
    })
  }

  const dispatchedByLineId = new Map<string, number>()
  for (const dl of dispatchLines) {
    dispatchedByLineId.set(dl.order_line_id, (dispatchedByLineId.get(dl.order_line_id) ?? 0) + Number(dl.quantity_dispatched))
  }

  const amendmentsByLineId = new Map<string, LineAmendmentRecord[]>()
  for (const a of amendmentRows) {
    const list = amendmentsByLineId.get(a.order_line_id) ?? []
    list.push({ id: a.id, amended_at: a.amended_at, amended_by: a.amended_by, field_amended: a.field_amended, old_value: a.old_value, new_value: a.new_value, reason: a.reason })
    amendmentsByLineId.set(a.order_line_id, list)
  }

  const computedLineStatuses = lines.map((l) => {
    const orderedQty = Number(l.ordered_qty)
    const closedQty = Number(l.closed_qty)
    const dispatchedQty = dispatchedByLineId.get(l.id) ?? 0
    // DB status is authoritative for terminal states — dispatch_lines history may be
    // incomplete, causing computed qty to fall short of ordered_qty.
    if (l.status === 'fully_dispatched') {
      return computeOrderLineStatus({ ordered_qty: orderedQty, closed_qty: closedQty, dispatched_qty: orderedQty })
    }
    if (l.status === 'closed') {
      return computeOrderLineStatus({ ordered_qty: orderedQty, closed_qty: orderedQty, dispatched_qty: dispatchedQty })
    }
    return computeOrderLineStatus({ ordered_qty: orderedQty, closed_qty: closedQty, dispatched_qty: dispatchedQty })
  })
  const computedOrderStatus = computeOrderStatusFromLines(computedLineStatuses)
  const displayStatus = (order.status === 'closed' ? 'closed' : computedOrderStatus) as OrderStatus

  const linesForDisplay: OrderLineForDisplay[] = lines.map((line, i) => {
    const orderedQty = Number(line.ordered_qty)
    const closedQty = Number(line.closed_qty)
    const dispatchedQty = dispatchedByLineId.get(line.id) ?? 0
    const openQty = Math.max(0, orderedQty - closedQty - dispatchedQty)
    const effectiveOpenQty = (line.status === 'fully_dispatched' || line.status === 'closed') ? 0 : openQty
    const shape = resolveRef(line.shape_designs)
    const bindi = resolveRef(line.bindi_colours)
    const size = resolveRef(line.sizes)
    const dabbi = resolveRef(line.dabbi_colours)
    return {
      id: line.id,
      order_id: id,
      shape_design_id: line.shape_design_id ?? '',
      bindi_colour_id: line.bindi_colour_id ?? '',
      size_id: line.size_id ?? '',
      shape: (shape as { code: string; name: string | null } | null)?.name ?? (shape as { code: string } | null)?.code ?? '—',
      bindi_colour: (bindi as { code: string } | null)?.code ?? '—',
      size: (size as { code: string } | null)?.code ?? '—',
      dabbi: (dabbi as { code: string } | null)?.code ?? '—',
      ordered_qty: orderedQty,
      dispatched_qty: dispatchedQty,
      closed_qty: closedQty,
      open_qty: effectiveOpenQty,
      line_status: computedLineStatuses[i],
      promised_date: line.promised_date,
      amendments: amendmentsByLineId.get(line.id) ?? [],
    }
  })

  // Planning card totals
  const totalReadyCovers = engineRowsRaw.reduce((s, r) => s + r.ready_allocated_qty, 0)
  const totalType1 = engineRowsRaw.reduce((s, r) => s + r.cuttings_allocated_qty, 0)
  const totalType2 = engineRowsRaw.filter((r) => r.planning_status === 'cut_on_machine' || r.planning_status === 'cut_on_machine_override').reduce((s, r) => s + r.shortage_qty, 0)
  const totalType3 = engineRowsRaw.filter((r) => r.planning_status === 'procure_velvet').reduce((s, r) => s + r.shortage_qty, 0)
  const totalRecommendedCut = engineRowsRaw.reduce((s, r) => s + r.recommended_cut_qty, 0)

  const labourDabbiBreakdownMap = new Map<string, number>()
  for (const row of engineRowsRaw) {
    if (row.cuttings_allocated_qty > 0) {
      const code = dabbiMap.get(row.dabbi_colour_id) ?? row.dabbi_colour_id
      labourDabbiBreakdownMap.set(code, (labourDabbiBreakdownMap.get(code) ?? 0) + row.cuttings_allocated_qty)
    }
  }
  const labourDabbiBreakdown = [...labourDabbiBreakdownMap.entries()].map(([code, qty]) => ({ code, qty }))

  // Derived totals
  const totalOrdered = linesForDisplay.reduce((s, l) => s + l.ordered_qty, 0)
  const totalOrderedDispatched = dispatchLines.reduce((s, l) => s + Number(l.quantity_dispatched), 0)
  const totalExtrasSent = extraDispatchLines.reduce((s, l) => s + Number(l.quantity_dispatched), 0)
  const totalOpen = linesForDisplay.reduce((s, l) => s + l.open_qty, 0)
  const totalClosed = linesForDisplay.reduce((s, l) => s + l.closed_qty, 0)
  const fulfilmentPct = totalOrdered > 0 ? Math.round((totalOrderedDispatched / totalOrdered) * 100) : 0

  // Dispatch history
  const getExtraSkuInfo = (rsb: ExtraRsbRow | ExtraRsbRow[] | null): SkuInfo => {
    const r = Array.isArray(rsb) ? rsb[0] ?? null : rsb
    return {
      shape: (r?.shape_design as { name: string | null } | null)?.name ?? '—',
      bindi_colour: (r?.bindi_colour as { code: string } | null)?.code ?? '—',
      size: (r?.size as { code: string } | null)?.code ?? '—',
      dabbi: (r?.dabbi_colour as { code: string } | null)?.code ?? '—',
      shape_design_id: '', bindi_colour_id: '', size_id: '',
    }
  }

  const eventMap = new Map<string, DispatchEventFull>()
  for (const dl of dispatchLines) {
    const ev = resolveRef(dl.dispatch_events)
    if (!ev) continue
    const sku = skuByLineId.get(dl.order_line_id) ?? { shape: '—', bindi_colour: '—', size: '—', dabbi: '—', shape_design_id: '', bindi_colour_id: '', size_id: '' }
    const qty = Number(dl.quantity_dispatched)
    const lineType = dl.line_type ?? 'ordered'
    const existing = eventMap.get(ev.id)
    if (existing) {
      existing.orderedQty += qty
      existing.totalQty += qty
      existing.lines.push({ key: `${dl.order_line_id}-${existing.lines.length}`, order_line_id: dl.order_line_id, quantity_dispatched: qty, line_type: lineType, ...sku })
    } else {
      eventMap.set(ev.id, {
        id: ev.id, dispatch_date: ev.dispatch_date, reference: ev.reference, notes: ev.notes,
        orderedQty: qty, extrasQty: 0, totalQty: qty,
        lines: [{ key: `${dl.order_line_id}-0`, order_line_id: dl.order_line_id, quantity_dispatched: qty, line_type: lineType, ...sku }],
      })
    }
  }

  for (const dl of extraDispatchLines) {
    const ev = resolveRef(dl.dispatch_events)
    if (!ev) continue
    const sku = getExtraSkuInfo(dl.ready_stock_balance)
    const qty = Number(dl.quantity_dispatched)
    const existing = eventMap.get(ev.id)
    if (existing) {
      existing.extrasQty += qty
      existing.totalQty += qty
      existing.lines.push({ key: `extra-${ev.id}-${existing.lines.length}`, order_line_id: null, quantity_dispatched: qty, line_type: 'extra', ...sku })
    } else {
      eventMap.set(ev.id, {
        id: ev.id, dispatch_date: ev.dispatch_date, reference: ev.reference, notes: ev.notes,
        orderedQty: 0, extrasQty: qty, totalQty: qty,
        lines: [{ key: `extra-${ev.id}-0`, order_line_id: null, quantity_dispatched: qty, line_type: 'extra', ...sku }],
      })
    }
  }

  const dispatchHistory = [...eventMap.values()].sort((a, b) => a.dispatch_date < b.dispatch_date ? -1 : 1)

  // Challan data
  const challanCellMap = new Map<string, ChallanCellEntry>()
  for (const ev of dispatchHistory) {
    for (const l of ev.lines) {
      const key = `${l.shape_design_id}|${l.bindi_colour_id}|${l.size_id}`
      const existing = challanCellMap.get(key)
      if (existing) {
        existing.qty += l.quantity_dispatched
      } else {
        challanCellMap.set(key, { key, shape: l.shape, bindi_colour: l.bindi_colour, size: l.size, qty: l.quantity_dispatched })
      }
    }
  }

  const challanCellTotalsArr = [...challanCellMap.values()]
  const challanSizesArr = sizeMaster.filter((s) => [...challanCellMap.keys()].some((k) => k.includes(s.id)))
  const challanRowKeys = [...new Set([...challanCellMap.keys()].map((k) => k.split('|').slice(0, 2).join('|')))]

  // Close order state
  const isOrderClosed = order.status === 'closed'
  const canCloseOrder = order.status === 'open' || order.status === 'partially_dispatched'
  const openLineCount = linesForDisplay.filter((l) => l.open_qty > 0).length
  const totalReservedQty = activeAllocations.reduce((s, a) => s + a.allocated_qty, 0)

  const dayCount = daysSince(order.order_date)
  const printedAt = new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const clientProps: OrderDetailClientProps = {
    orderId: id,
    orderStatus: order.status,
    orderCustomerId: order.customer_id,
    orderDate: order.order_date,
    orderReference: order.reference,
    orderNotes: order.notes,
    customerName: customer?.name ?? '—',
    customerBrandRule: customer?.brand_rule ?? '',
    displayStatus,
    linesForDisplay,
    engineRows,
    activeAllocations: activeAllocations.map((a) => ({ order_line_id: a.order_line_id, allocated_qty: a.allocated_qty })),
    totalOrdered,
    totalOrderedDispatched,
    totalExtrasSent,
    totalOpen,
    totalClosed,
    fulfilmentPct,
    totalReadyCovers,
    totalType1,
    totalType2,
    totalType3,
    totalRecommendedCut,
    labourDabbiBreakdown,
    dispatchHistory,
    headerAmendments,
    sizeMaster,
    designMaster,
    colourMaster,
    dabbiMaster,
    brandMaster,
    customerOptions,
    extraStockOptions,
    priorityBadgeText,
    hasAnyOverride,
    dayCount,
    isOrderClosed,
    canCloseOrder,
    openLineCount,
    totalReservedQty,
    challanSizesArr,
    challanRowKeys,
    challanCellTotalsArr,
    printedAt,
  }

  return <OrderDetailClient {...clientProps} />
}
