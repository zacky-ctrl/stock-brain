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

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

type CustomerSummary = {
  customer_id: string
  customer_name: string
  total_orders: number
  total_ordered: number
  total_dispatched: number
  total_open: number
  avg_fulfilment_pct: number
}

type OrderSummary = {
  order_id: string
  order_date: string
  reference: string | null
  status: string
  total_ordered: number
  total_dispatched: number
  total_open: number
  fulfilment_pct: number
}

export default async function CustomerSummaryReportPage({ searchParams }: PageProps) {
  const params = await searchParams
  const customerIds = typeof params.customer === 'string' ? params.customer.split(',').filter(Boolean) : []
  const statusIds   = typeof params.status   === 'string' ? params.status.split(',').filter(Boolean)   : []
  const dateFrom    = typeof params.dateFrom === 'string' ? params.dateFrom : ''
  const dateTo      = typeof params.dateTo   === 'string' ? params.dateTo   : ''

  const supabase = createServerSupabaseClient()
  const todayStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  const [customersResult, ordersResult, confirmedEventsResult] = await Promise.allSettled([
    supabase.from('customers').select('id, name').order('name'),
    supabase
      .from('orders')
      .select(`
        id, order_date, reference, status, customer_id,
        customers(name),
        order_lines(id, ordered_qty, closed_qty, status)
      `)
      .in('status', statusIds.length > 0 ? statusIds : ['open', 'partially_dispatched', 'fully_dispatched']),
    supabase.from('dispatch_events').select('id').eq('status', 'confirmed'),
  ])

  const customers = customersResult.status === 'fulfilled' ? (customersResult.value.data ?? []) : []

  type RawOrderLine = { id: string; ordered_qty: number | string; closed_qty: number | string; status: string }
  type RawOrder = {
    id: string
    order_date: string
    reference: string | null
    status: string
    customer_id: string
    customers: { name: string } | { name: string }[] | null
    order_lines: RawOrderLine[] | null
  }

  let ordersRaw = (ordersResult.status === 'fulfilled' ? (ordersResult.value.data ?? []) : []) as unknown as RawOrder[]
  const confirmedIds = confirmedEventsResult.status === 'fulfilled'
    ? (confirmedEventsResult.value.data ?? []).map((e) => e.id as string)
    : []

  if (customerIds.length > 0) ordersRaw = ordersRaw.filter((o) => customerIds.includes(o.customer_id))
  if (dateFrom)               ordersRaw = ordersRaw.filter((o) => o.order_date >= dateFrom)
  if (dateTo)                 ordersRaw = ordersRaw.filter((o) => o.order_date <= dateTo)

  // Gather all line IDs for dispatch lookup
  const allLineIds = ordersRaw.flatMap((o) => (o.order_lines ?? []).map((l) => l.id))
  const dispatchedByLine = new Map<string, number>()
  if (allLineIds.length > 0 && confirmedIds.length > 0) {
    const { data: dispatchLines } = await supabase
      .from('dispatch_lines')
      .select('order_line_id, quantity_dispatched')
      .in('order_line_id', allLineIds)
      .in('dispatch_event_id', confirmedIds)
    for (const dl of dispatchLines ?? []) {
      const id = dl.order_line_id as string
      dispatchedByLine.set(id, (dispatchedByLine.get(id) ?? 0) + Number(dl.quantity_dispatched))
    }
  }

  // Build per-order summaries
  const orderSummaries: (OrderSummary & { customer_id: string; customer_name: string })[] = []
  for (const order of ordersRaw) {
    const customerRaw = Array.isArray(order.customers) ? order.customers[0] : order.customers
    if (!customerRaw) continue
    const lines = order.order_lines ?? []
    let totalOrdered = 0, totalDispatched = 0, totalClosed = 0
    for (const line of lines) {
      const ordered    = Number(line.ordered_qty)
      const closed     = Number(line.closed_qty)
      const dispatched = dispatchedByLine.get(line.id) ?? 0
      totalOrdered    += ordered
      totalDispatched += dispatched
      totalClosed     += closed
    }
    const totalOpen = Math.max(0, totalOrdered - totalDispatched - totalClosed)
    orderSummaries.push({
      order_id:         order.id,
      order_date:       order.order_date,
      reference:        order.reference,
      status:           order.status,
      customer_id:      order.customer_id,
      customer_name:    customerRaw.name,
      total_ordered:    totalOrdered,
      total_dispatched: totalDispatched,
      total_open:       totalOpen,
      fulfilment_pct:   pct(totalDispatched, totalOrdered),
    })
  }

  orderSummaries.sort((a, b) => b.order_date.localeCompare(a.order_date))

  // Build per-customer summaries (only when showing all customers)
  const customerSummaryMap = new Map<string, CustomerSummary>()
  for (const o of orderSummaries) {
    const prev = customerSummaryMap.get(o.customer_id) ?? {
      customer_id:       o.customer_id,
      customer_name:     o.customer_name,
      total_orders:      0,
      total_ordered:     0,
      total_dispatched:  0,
      total_open:        0,
      avg_fulfilment_pct: 0,
    }
    prev.total_orders     += 1
    prev.total_ordered    += o.total_ordered
    prev.total_dispatched += o.total_dispatched
    prev.total_open       += o.total_open
    customerSummaryMap.set(o.customer_id, prev)
  }
  // Compute avg fulfilment
  for (const [, summary] of customerSummaryMap) {
    summary.avg_fulfilment_pct = pct(summary.total_dispatched, summary.total_ordered)
  }

  const customerSummaries = Array.from(customerSummaryMap.values())
    .sort((a, b) => b.total_open - a.total_open)

  const customerMap = new Map(customers.map((c) => [c.id as string, c.name as string]))
  const isSingleCustomer = customerIds.length === 1

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
      key: 'status',
      label: 'Status',
      options: [
        { id: 'open',                 label: 'Open' },
        { id: 'partially_dispatched', label: 'Partially Dispatched' },
        { id: 'fully_dispatched',     label: 'Fully Dispatched' },
      ],
      multiSelect: true,
    },
  ]

  const activeFilters: ActiveFilters = {
    dateFrom:  dateFrom      ? [dateFrom]   : [],
    dateTo:    dateTo        ? [dateTo]     : [],
    customer:  customerIds,
    status:    statusIds,
  }

  const customerLabel = customerIds.length > 0
    ? customerIds.map((id) => customerMap.get(id) ?? id).join(', ')
    : 'All Customers'

  const reportFilters = [
    { label: 'Customer', value: customerLabel },
    { label: 'Status',   value: statusIds.length > 0 ? statusIds.join(', ') : 'All' },
    { label: 'From',     value: dateFrom || '—' },
    { label: 'To',       value: dateTo   || '—' },
    { label: 'Date',     value: todayStr },
  ]

  const tdNum: CSSProperties = { ...tableTd, textAlign: 'right', paddingRight: '1rem', fontVariantNumeric: 'tabular-nums' }
  const thNum: CSSProperties = { ...tableTh, textAlign: 'right', paddingRight: '1rem' }

  const grandTotal = {
    ordered:    orderSummaries.reduce((s, o) => s + o.total_ordered, 0),
    dispatched: orderSummaries.reduce((s, o) => s + o.total_dispatched, 0),
    open:       orderSummaries.reduce((s, o) => s + o.total_open, 0),
  }

  return (
    <main className="print-portrait" style={{ padding: '1.5rem 2rem', maxWidth: '1400px' }}>
      <ReportHeader reportName="CUSTOMER ORDER SUMMARY" filters={reportFilters} />
      <ReportFilterBar filters={filters} activeFilters={activeFilters} printLabel="Print" />

      {isSingleCustomer ? (
        /* Single customer — order history */
        <>
          <div style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderLeft: '4px solid var(--accent)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Customer</div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)' }}>{customerLabel}</div>
            <div style={{ display: 'flex', gap: '2rem', marginTop: '0.5rem', fontSize: 'var(--text-sm)' }}>
              <span>Orders: <strong>{orderSummaries.length}</strong></span>
              <span>Total Ordered: <strong>{fmt(grandTotal.ordered)}</strong></span>
              <span>Total Dispatched: <strong>{fmt(grandTotal.dispatched)}</strong></span>
              <span>Open: <strong style={{ color: grandTotal.open > 0 ? 'var(--warning)' : 'var(--success)' }}>{fmt(grandTotal.open)}</strong></span>
              <span>Fulfilment: <strong>{fmt(pct(grandTotal.dispatched, grandTotal.ordered), 1)}%</strong></span>
            </div>
          </div>

          {orderSummaries.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>No orders found for this customer.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '800px' }}>
                <thead>
                  <tr>
                    <th style={tableTh}>Order Date</th>
                    <th style={tableTh}>Reference</th>
                    <th style={thNum}>Ordered</th>
                    <th style={thNum}>Dispatched</th>
                    <th style={thNum}>Open</th>
                    <th style={thNum}>Fulfil %</th>
                    <th style={tableTh}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orderSummaries.map((order) => (
                    <tr key={order.order_id}>
                      <td style={tableTd}>{new Date(order.order_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td style={{ ...tableTd, color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>{order.reference ?? '—'}</td>
                      <td style={tdNum}>{fmt(order.total_ordered)}</td>
                      <td style={tdNum}>{fmt(order.total_dispatched)}</td>
                      <td style={{ ...tdNum, fontWeight: order.total_open > 0 ? 700 : 400 }}>{fmt(order.total_open)}</td>
                      <td style={{ ...tdNum, color: order.fulfilment_pct >= 100 ? 'var(--success)' : order.fulfilment_pct >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                        {fmt(order.fulfilment_pct, 1)}%
                      </td>
                      <td style={tableTd}>
                        <span style={{ fontSize: 'var(--text-xs)', padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-sm)', background: order.status === 'fully_dispatched' ? 'var(--success-subtle)' : order.status === 'partially_dispatched' ? 'var(--warning-subtle)' : 'var(--bg-hover)', color: order.status === 'fully_dispatched' ? 'var(--success)' : order.status === 'partially_dispatched' ? 'var(--warning)' : 'var(--text-secondary)' }}>
                          {order.status === 'fully_dispatched' ? 'Fulfilled' : order.status === 'partially_dispatched' ? 'Partial' : 'Open'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                    <td colSpan={2} style={{ ...tableTd, fontWeight: 700 }}>GRAND TOTAL</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(grandTotal.ordered)}</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(grandTotal.dispatched)}</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(grandTotal.open)}</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(pct(grandTotal.dispatched, grandTotal.ordered), 1)}%</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      ) : (
        /* All customers — summary table */
        <>
          {customerSummaries.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>No customer orders match the current filters.</p>
          ) : (
            <>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                {customerSummaries.length} customers — sorted by open quantity descending
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '800px' }}>
                  <thead>
                    <tr>
                      <th style={tableTh}>Customer</th>
                      <th style={thNum}>Orders</th>
                      <th style={thNum}>Total Ordered</th>
                      <th style={thNum}>Total Dispatched</th>
                      <th style={thNum}>Open</th>
                      <th style={thNum}>Avg Fulfil %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerSummaries.map((cs) => (
                      <tr key={cs.customer_id}>
                        <td style={tableTd}>{cs.customer_name}</td>
                        <td style={tdNum}>{cs.total_orders}</td>
                        <td style={tdNum}>{fmt(cs.total_ordered)}</td>
                        <td style={tdNum}>{fmt(cs.total_dispatched)}</td>
                        <td style={{ ...tdNum, fontWeight: cs.total_open > 0 ? 700 : 400, color: cs.total_open > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>{fmt(cs.total_open)}</td>
                        <td style={{ ...tdNum, color: cs.avg_fulfilment_pct >= 100 ? 'var(--success)' : cs.avg_fulfilment_pct >= 50 ? 'var(--warning)' : 'var(--danger)' }}>
                          {fmt(cs.avg_fulfilment_pct, 1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                      <td style={{ ...tableTd, fontWeight: 700 }}>TOTALS</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{customerSummaries.reduce((s, c) => s + c.total_orders, 0)}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(customerSummaries.reduce((s, c) => s + c.total_ordered, 0))}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(customerSummaries.reduce((s, c) => s + c.total_dispatched, 0))}</td>
                      <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(customerSummaries.reduce((s, c) => s + c.total_open, 0))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 1cm; }
        }
      `}</style>
    </main>
  )
}
