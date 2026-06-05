import { createServerSupabaseClient } from '@/lib/supabase/server'
import { computePlanningAllocation } from '@stock-brain/domain'
import { fetchPlanningInputs } from '@/lib/planning-fetcher'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { ShoppingCart } from 'lucide-react'
import Link from 'next/link'
import { OrdersClient } from './OrdersClient'
import type { OrderClientRow, ReservableLine, OrderPlanningRow, OrderPlanningSum } from './OrdersClient'

// ── raw DB types ───────────────────────────────────────────────

type OrderLineRaw = {
  id: string
  ordered_qty: string | number
  closed_qty: string | number
  shape_design_id: string | null
  bindi_colour_id: string | null
  size_id: string | null
  dabbi_colour_id: string | null
}

type OrderRaw = {
  id: string
  customer_id: string
  order_date: string
  reference: string | null
  status: string
  notes: string | null
  created_at: string
  customer: { name: string } | { name: string }[] | null
  order_lines: OrderLineRaw[]
}

// ── helpers ────────────────────────────────────────────────────

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function customerName(raw: OrderRaw['customer']): string {
  if (!raw) return '—'
  if (Array.isArray(raw)) return raw[0]?.name ?? '—'
  return raw.name
}

// ── page ──────────────────────────────────────────────────────

export default async function OrdersPage() {
  const supabase = createServerSupabaseClient()

  // ── Phase 1: parallel fetches ──────────────────────────────
  const [
    ordersResult,
    shapesResult,
    bindiResult,
    sizesResult,
    dabbiResult,
    confirmedEventsResult,
    planningInputs,
  ] = await Promise.all([
    supabase
      .from('orders')
      .select(`
        id, customer_id, order_date, reference, status, notes, created_at,
        customer:customers ( name ),
        order_lines ( id, ordered_qty, closed_qty, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id )
      `)
      .order('created_at', { ascending: false })
      .limit(500),

    supabase.from('shape_designs').select('id, name, code'),
    supabase.from('bindi_colours').select('id, code'),
    supabase.from('sizes').select('id, code'),
    supabase.from('dabbi_colours').select('id, code'),

    supabase.from('dispatch_events').select('id').eq('status', 'confirmed'),

    fetchPlanningInputs(supabase),
  ])

  const orders = (ordersResult.data ?? []) as unknown as OrderRaw[]
  const allLineIds = orders.flatMap((o) => (o.order_lines ?? []).map((l) => l.id))

  // ── Phase 2: dispatch lines for total_dispatched ───────────
  const confirmedIds = (confirmedEventsResult.data ?? []).map((e) => e.id as string)
  const dispatchedByLineId = new Map<string, number>()

  if (allLineIds.length > 0 && confirmedIds.length > 0) {
    const { data: dLines } = await supabase
      .from('dispatch_lines')
      .select('order_line_id, quantity_dispatched')
      .in('order_line_id', allLineIds)
      .in('dispatch_event_id', confirmedIds)

    for (const dl of dLines ?? []) {
      const lineId = dl.order_line_id as string
      dispatchedByLineId.set(lineId, (dispatchedByLineId.get(lineId) ?? 0) + Number(dl.quantity_dispatched))
    }
  }

  // ── Phase 2b: extras per order (via dispatch_events.order_id) ─
  const orderIds = orders.map((o) => o.id)
  const extrasByOrderId = new Map<string, number>()

  if (orderIds.length > 0) {
    const { data: orderEventsData } = await supabase
      .from('dispatch_events')
      .select('id, order_id')
      .in('order_id', orderIds)
      .eq('status', 'confirmed')

    const orderEventIds = (orderEventsData ?? []).map((e) => e.id as string)
    const eventToOrder = new Map<string, string>()
    for (const e of orderEventsData ?? []) eventToOrder.set(e.id as string, e.order_id as string)

    if (orderEventIds.length > 0) {
      const { data: extraLines } = await supabase
        .from('dispatch_lines')
        .select('dispatch_event_id, quantity_dispatched')
        .in('dispatch_event_id', orderEventIds)
        .eq('line_type', 'extra')

      for (const el of extraLines ?? []) {
        const oid = eventToOrder.get(el.dispatch_event_id as string)
        if (oid) extrasByOrderId.set(oid, (extrasByOrderId.get(oid) ?? 0) + Number(el.quantity_dispatched))
      }
    }
  }

  // ── Run planning engine ────────────────────────────────────
  const engineRows = computePlanningAllocation(planningInputs)

  // ── Group engine rows by order_id ──────────────────────────
  const engineByOrderId = new Map<string, OrderPlanningRow[]>()
  for (const row of engineRows) {
    const list = engineByOrderId.get(row.order_id) ?? []
    list.push({
      order_line_id: row.order_line_id,
      shape_design_id: row.shape_design_id,
      bindi_colour_id: row.bindi_colour_id,
      size_id: row.size_id,
      dabbi_colour_id: row.dabbi_colour_id,
      open_qty: row.open_qty,
      ready_allocated_qty: row.ready_allocated_qty,
      wip_allocated_qty: row.wip_allocated_qty,
      cuttings_allocated_qty: row.cuttings_allocated_qty,
      cuttings_available_qty: row.cuttings_available_qty,
      shortage_qty: row.shortage_qty,
      planning_status: row.planning_status,
    })
    engineByOrderId.set(row.order_id, list)
  }

  // ── Build lookup maps ──────────────────────────────────────
  const shapeRecord: Record<string, string> = {}
  for (const s of shapesResult.data ?? []) {
    shapeRecord[s.id as string] = ((s as { name?: string | null }).name ?? s.code) as string
  }
  const bindiRecord: Record<string, string> = {}
  for (const s of bindiResult.data ?? []) bindiRecord[s.id as string] = s.code as string
  const sizeRecord: Record<string, string> = {}
  for (const s of sizesResult.data ?? []) sizeRecord[s.id as string] = s.code as string
  const dabbiRecord: Record<string, string> = {}
  for (const s of dabbiResult.data ?? []) dabbiRecord[s.id as string] = s.code as string

  // Ready stock for reservable lines (from engine inputs, available_qty > 0)
  const readyByBase4 = new Map<string, { id: string; available_qty: number }>()
  for (const rs of planningInputs.readyStock) {
    const key = `${rs.shape_design_id}|${rs.bindi_colour_id}|${rs.size_id}|${rs.dabbi_colour_id}`
    const existing = readyByBase4.get(key)
    if (!existing || rs.available_qty > existing.available_qty) {
      readyByBase4.set(key, { id: rs.id, available_qty: rs.available_qty })
    }
  }

  // ── Build client rows ──────────────────────────────────────

  const clientOrders: OrderClientRow[] = orders.map((order) => {
    const lines = order.order_lines ?? []
    const totalOrdered = lines.reduce((s, l) => s + Number(l.ordered_qty), 0)
    const totalClosed = lines.reduce((s, l) => s + Number(l.closed_qty), 0)
    const totalDispatched = lines.reduce((s, l) => s + (dispatchedByLineId.get(l.id) ?? 0), 0)
    const openQty = Math.max(0, totalOrdered - totalClosed - totalDispatched)
    const dispatchPct = totalOrdered > 0 ? Math.min(1, totalDispatched / totalOrdered) : 0
    const isStale = openQty > 0 && daysSince(order.order_date) > 14

    // Engine rows for this order
    const orderEngineRows = engineByOrderId.get(order.id) ?? []

    // Planning summary from engine output — no custom calculation
    const planning_sum: OrderPlanningSum = {
      type1_gross: orderEngineRows.reduce((s, r) => s + r.cuttings_allocated_qty, 0),
      type2_gross: orderEngineRows
        .filter((r) => r.planning_status === 'cut_on_machine' || r.planning_status === 'cut_on_machine_override')
        .reduce((s, r) => s + r.shortage_qty, 0),
      type3_gross: orderEngineRows
        .filter((r) => r.planning_status === 'procure_velvet')
        .reduce((s, r) => s + r.shortage_qty, 0),
      ready_gross: orderEngineRows.reduce((s, r) => s + r.ready_allocated_qty, 0),
    }

    // Reservable lines: lines with ready stock available
    const reservableLines: ReservableLine[] = []
    for (const line of lines) {
      const lineDispatched = dispatchedByLineId.get(line.id) ?? 0
      const lineOpen = Math.max(0, Number(line.ordered_qty) - Number(line.closed_qty) - lineDispatched)
      if (lineOpen <= 0) continue

      const base4 = `${line.shape_design_id}|${line.bindi_colour_id}|${line.size_id}|${line.dabbi_colour_id}`
      const ready = readyByBase4.get(base4)
      if (ready && ready.available_qty > 0) {
        reservableLines.push({
          line_id: line.id,
          balance_id: ready.id,
          qty: Math.min(lineOpen, ready.available_qty),
        })
      }
    }

    return {
      id: order.id,
      order_date: order.order_date,
      reference: order.reference,
      status: order.status,
      customer_name: customerName(order.customer),
      customer_id: order.customer_id,
      line_count: lines.length,
      total_ordered: totalOrdered,
      total_dispatched: totalDispatched,
      total_extras: extrasByOrderId.get(order.id) ?? 0,
      open_qty: openQty,
      is_stale: isStale,
      dispatch_pct: dispatchPct,
      planning_rows: orderEngineRows,
      planning_sum,
      reservable_lines: reservableLines,
    }
  })

  return (
    <main style={{ padding: '1.5rem 2rem' }}>
      <PageHeader
        title="Orders"
        actions={
          <Link
            href="/orders/new"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 1rem',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              background: 'var(--accent)',
              color: 'white',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
            }}
          >
            + New Order
          </Link>
        }
      />

      {ordersResult.error && (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>Error: {ordersResult.error.message}</p>
      )}

      {!ordersResult.error && orders.length === 0 && (
        <EmptyState
          icon={ShoppingCart}
          title="No orders yet"
          description="Create your first order to start tracking demand and dispatches."
          action={
            <Link
              href="/orders/new"
              style={{ padding: '0.45rem 1.1rem', background: 'var(--accent)', color: 'white', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', fontWeight: 600 }}
            >
              + New Order
            </Link>
          }
        />
      )}

      {orders.length > 0 && (
        <OrdersClient
          orders={clientOrders}
          shapeMap={shapeRecord}
          bindiMap={bindiRecord}
          sizeMap={sizeRecord}
          dabbiMap={dabbiRecord}
        />
      )}
    </main>
  )
}
