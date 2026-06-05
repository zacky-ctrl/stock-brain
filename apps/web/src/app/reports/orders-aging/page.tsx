import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ReportHeader } from '@/components/reports/ReportHeader'
import { ReportFilterBar } from '@/components/reports/ReportFilterBar'
import type { FilterField, ActiveFilters } from '@stock-brain/types'
import { tableTh, tableTd } from '@/lib/ui'
import type { CSSProperties } from 'react'

function fmt(n: number, decimals = 0): string {
  return n.toFixed(decimals)
}

function pct(dispatched: number, ordered: number): number {
  if (ordered <= 0) return 100
  return Math.min((dispatched / ordered) * 100, 100)
}

type AgeBucket = 'fresh' | 'aging' | 'overdue'

function ageBucket(days: number): AgeBucket {
  if (days < 7) return 'fresh'
  if (days <= 14) return 'aging'
  return 'overdue'
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

type OrderRow = {
  order_line_id: string
  order_id: string
  customer_id: string
  customer_name: string
  order_date: string
  reference: string | null
  ordered_qty: number
  closed_qty: number
  dispatched_qty: number
  open_qty: number
  age_days: number
  bucket: AgeBucket
  fulfilment_pct: number
  line_status: string
}

export default async function OrdersAgingReportPage({ searchParams }: PageProps) {
  const params = await searchParams
  const customerIds  = typeof params.customer === 'string' ? params.customer.split(',').filter(Boolean) : []
  const ageIds       = typeof params.age      === 'string' ? params.age.split(',').filter(Boolean)      : []
  const statusFilter = typeof params.status   === 'string' ? params.status   : ''
  const dateFrom     = typeof params.dateFrom === 'string' ? params.dateFrom : ''
  const dateTo       = typeof params.dateTo   === 'string' ? params.dateTo   : ''

  const supabase = createServerSupabaseClient()
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]!

  const [customersResult, orderLinesResult, confirmedEventsResult] = await Promise.allSettled([
    supabase.from('customers').select('id, name').order('name'),
    supabase
      .from('order_lines')
      .select(`
        id, order_id, ordered_qty, closed_qty,
        orders(order_date, reference, status, customer_id, customers(name))
      `)
      .in('status', ['open', 'partially_dispatched']),
    supabase.from('dispatch_events').select('id').eq('status', 'confirmed'),
  ])

  const customers = customersResult.status === 'fulfilled' ? (customersResult.value.data ?? []) : []
  const orderLinesRaw = orderLinesResult.status === 'fulfilled' ? (orderLinesResult.value.data ?? []) : []
  const confirmedIds = confirmedEventsResult.status === 'fulfilled'
    ? (confirmedEventsResult.value.data ?? []).map((e) => e.id as string)
    : []

  type OrderLineRaw = {
    id: string
    order_id: string
    ordered_qty: number | string
    closed_qty: number | string
    orders: {
      order_date: string
      reference: string | null
      status: string
      customer_id: string
      customers: { name: string } | { name: string }[] | null
    } | { order_date: string; reference: string | null; status: string; customer_id: string; customers: { name: string } | { name: string }[] | null }[] | null
  }

  const lineIds = orderLinesRaw.map((l) => (l as unknown as { id: string }).id)
  const dispatchedByLine = new Map<string, number>()
  if (lineIds.length > 0 && confirmedIds.length > 0) {
    const { data: dispatchLines } = await supabase
      .from('dispatch_lines')
      .select('order_line_id, quantity_dispatched')
      .in('order_line_id', lineIds)
      .in('dispatch_event_id', confirmedIds)
    for (const dl of dispatchLines ?? []) {
      const lineId = dl.order_line_id as string
      dispatchedByLine.set(lineId, (dispatchedByLine.get(lineId) ?? 0) + Number(dl.quantity_dispatched))
    }
  }

  const rows: OrderRow[] = []
  for (const rawLine of orderLinesRaw) {
    const line = rawLine as unknown as OrderLineRaw
    const orderRaw = Array.isArray(line.orders) ? line.orders[0] : line.orders
    if (!orderRaw) continue
    const customerRaw = Array.isArray(orderRaw.customers) ? orderRaw.customers[0] : orderRaw.customers
    if (!customerRaw) continue

    const orderedQty   = Number(line.ordered_qty)
    const closedQty    = Number(line.closed_qty)
    const dispatchedQty = dispatchedByLine.get(line.id) ?? 0
    const openQty      = Math.max(0, orderedQty - closedQty - dispatchedQty)
    if (openQty <= 0) continue

    const orderDate = new Date(orderRaw.order_date)
    const diffMs    = today.getTime() - orderDate.getTime()
    const ageDays   = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    rows.push({
      order_line_id:  line.id,
      order_id:       line.order_id,
      customer_id:    orderRaw.customer_id,
      customer_name:  customerRaw.name,
      order_date:     orderRaw.order_date,
      reference:      orderRaw.reference,
      ordered_qty:    orderedQty,
      closed_qty:     closedQty,
      dispatched_qty: dispatchedQty,
      open_qty:       openQty,
      age_days:       ageDays,
      bucket:         ageBucket(ageDays),
      fulfilment_pct: pct(dispatchedQty, orderedQty),
      line_status:    orderRaw.status,
    })
  }

  // Apply filters
  let filtered = rows
  if (customerIds.length > 0) filtered = filtered.filter((r) => customerIds.includes(r.customer_id))
  if (ageIds.length > 0)      filtered = filtered.filter((r) => ageIds.includes(r.bucket))
  if (statusFilter)           filtered = filtered.filter((r) => r.line_status === statusFilter)
  if (dateFrom)               filtered = filtered.filter((r) => r.order_date >= dateFrom)
  if (dateTo)                 filtered = filtered.filter((r) => r.order_date <= dateTo)

  // Sort oldest first
  filtered.sort((a, b) => a.order_date.localeCompare(b.order_date))

  const totalOpenOrders = filtered.length
  const totalOpenGross  = filtered.reduce((s, r) => s + r.open_qty, 0)
  const avgAge          = filtered.length > 0 ? filtered.reduce((s, r) => s + r.age_days, 0) / filtered.length : 0
  const overdueCount    = filtered.filter((r) => r.bucket === 'overdue').length

  const customerMap = new Map(customers.map((c) => [c.id as string, c.name as string]))
  const today2 = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  const filters: FilterField[] = [
    { key: 'dateFrom',  label: 'From', options: [], inputType: 'date' },
    { key: 'dateTo',    label: 'To',   options: [], inputType: 'date' },
    {
      key: 'customer',
      label: 'Customer',
      options: customers.map((c) => ({ id: c.id as string, label: c.name as string })),
      multiSelect: true,
    },
    {
      key: 'age',
      label: 'Age Bucket',
      options: [
        { id: 'fresh',   label: 'Fresh (<7d)' },
        { id: 'aging',   label: 'Aging (7-14d)' },
        { id: 'overdue', label: 'Overdue (>14d)' },
      ],
      multiSelect: true,
    },
    {
      key: 'status',
      label: 'Status',
      options: [
        { id: 'open',                 label: 'Open' },
        { id: 'partially_dispatched', label: 'Partially Dispatched' },
      ],
    },
  ]

  const activeFilters: ActiveFilters = {
    dateFrom:  dateFrom      ? [dateFrom]  : [],
    dateTo:    dateTo        ? [dateTo]    : [],
    customer:  customerIds,
    age:       ageIds,
    status:    statusFilter  ? [statusFilter] : [],
  }

  const customerLabel = customerIds.length > 0
    ? customerIds.map((id) => customerMap.get(id) ?? id).join(', ')
    : 'All Customers'

  const reportFilters = [
    { label: 'Customer', value: customerLabel },
    { label: 'Age',      value: ageIds.length > 0 ? ageIds.join(', ') : 'All' },
    { label: 'From',     value: dateFrom || '—' },
    { label: 'To',       value: dateTo   || '—' },
    { label: 'Date',     value: today2 },
  ]

  const ageStyle = (bucket: AgeBucket): CSSProperties => ({
    color: bucket === 'fresh' ? 'var(--success)' : bucket === 'aging' ? 'var(--warning)' : 'var(--danger)',
    fontWeight: bucket === 'overdue' ? 700 : 400,
  })

  const tdNum: CSSProperties = { ...tableTd, textAlign: 'right', paddingRight: '1rem', fontVariantNumeric: 'tabular-nums' }
  const thNum: CSSProperties = { ...tableTh, textAlign: 'right', paddingRight: '1rem' }

  return (
    <main className="print-portrait" style={{ padding: '1.5rem 2rem', maxWidth: '1400px' }}>
      <ReportHeader reportName="OPEN ORDERS AGING REPORT" filters={reportFilters} />
      <ReportFilterBar filters={filters} activeFilters={activeFilters} printLabel="Print" />

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        {[
          { label: 'Open Lines',     value: String(totalOpenOrders),   variant: 'default' as const },
          { label: 'Open Gross Qty', value: fmt(totalOpenGross),        variant: 'default' as const },
          { label: 'Avg Age (days)', value: fmt(avgAge, 1),             variant: avgAge >= 14 ? 'danger' as const : avgAge >= 7 ? 'warning' as const : 'success' as const },
          { label: 'Overdue Lines',  value: String(overdueCount),       variant: overdueCount > 0 ? 'danger' as const : 'success' as const },
        ].map((card) => {
          const accent = card.variant === 'danger' ? 'var(--danger)' : card.variant === 'warning' ? 'var(--warning)' : card.variant === 'success' ? 'var(--success)' : 'var(--border-strong)'
          return (
            <div key={card.label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderLeft: `3px solid ${accent}`, borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', minWidth: '160px' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>{card.label}</div>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{card.value}</div>
            </div>
          )
        })}
      </div>

      {/* Age legend */}
      <div className="no-print" style={{ display: 'flex', gap: '1.25rem', marginBottom: '1rem', fontSize: 'var(--text-xs)' }}>
        <span style={{ color: 'var(--success)' }}>● Fresh &lt;7d</span>
        <span style={{ color: 'var(--warning)' }}>● Aging 7–14d</span>
        <span style={{ color: 'var(--danger)', fontWeight: 700 }}>● Overdue &gt;14d</span>
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>No open order lines match the current filters.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1000px' }}>
            <thead>
              <tr>
                <th style={tableTh}>Customer</th>
                <th style={tableTh}>Order Date</th>
                <th style={thNum}>Age (days)</th>
                <th style={tableTh}>Reference</th>
                <th style={thNum}>Ordered</th>
                <th style={thNum}>Dispatched</th>
                <th style={thNum}>Open</th>
                <th style={thNum}>Fulfil %</th>
                <th style={tableTh}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.order_line_id}
                  style={{ background: row.bucket === 'overdue' ? 'rgba(255,71,87,0.05)' : undefined }}
                >
                  <td style={tableTd}>{row.customer_name}</td>
                  <td style={tableTd}>{new Date(row.order_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td style={{ ...tdNum, ...ageStyle(row.bucket) }}>{row.age_days}d</td>
                  <td style={{ ...tableTd, color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>{row.reference ?? '—'}</td>
                  <td style={tdNum}>{fmt(row.ordered_qty)}</td>
                  <td style={tdNum}>{fmt(row.dispatched_qty)}</td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(row.open_qty)}</td>
                  <td style={{ ...tdNum, color: row.fulfilment_pct >= 100 ? 'var(--success)' : row.fulfilment_pct >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                    {fmt(row.fulfilment_pct, 1)}%
                  </td>
                  <td style={tableTd}>
                    <span style={{ fontSize: 'var(--text-xs)', padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-sm)', background: row.line_status === 'partially_dispatched' ? 'var(--warning-subtle)' : 'var(--bg-hover)', color: row.line_status === 'partially_dispatched' ? 'var(--warning)' : 'var(--text-secondary)' }}>
                      {row.line_status === 'partially_dispatched' ? 'Partial' : 'Open'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                <td colSpan={4} style={{ ...tableTd, fontWeight: 700 }}>TOTALS</td>
                <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(filtered.reduce((s, r) => s + r.ordered_qty, 0))}</td>
                <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(filtered.reduce((s, r) => s + r.dispatched_qty, 0))}</td>
                <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(totalOpenGross)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Print age legend */}
      <div className="print-legend" style={{ display: 'none', marginTop: '24px', fontSize: '11px', borderTop: '1px solid black', paddingTop: '8px' }}>
        Age legend: Fresh = &lt;7 days (light) | Aging = 7–14 days (medium shade) | Overdue = &gt;14 days (dark shade + bold)
      </div>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 1cm; }
          .print-legend { display: block !important; }
        }
      `}</style>
    </main>
  )
}
