import { createServerSupabaseClient } from '@/lib/supabase/server'
import { tableTh, tableTd } from '@/lib/ui'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'
import type { CSSProperties } from 'react'

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

type EventRow = {
  id: string
  dispatch_date: string
  reference: string | null
  status: string
  notes: string | null
  created_at: string
  customers: { name: string } | null
  dispatch_lines: { quantity_dispatched: string | number }[]
}

type OpenOrderRow = {
  id: string
  order_date: string
  reference: string | null
  customer: { name: string } | { name: string }[] | null
  order_lines: { id: string; ordered_qty: string | number; closed_qty: string | number }[]
}

type OpenOrderWithQty = OpenOrderRow & {
  open_qty: number
}

function getCustomerName(customer: OpenOrderRow['customer']): string {
  const resolved = Array.isArray(customer) ? customer[0] : customer
  return resolved?.name ?? '—'
}

export default async function DispatchPage() {
  const supabase = createServerSupabaseClient()

  const [{ data, error }, { data: openOrdersRaw }] = await Promise.all([
    supabase
      .from('dispatch_events')
      .select(`
        id, dispatch_date, reference, status, notes, created_at,
        customers(name),
        dispatch_lines(quantity_dispatched)
      `)
      .order('dispatch_date', { ascending: false })
      .limit(300),
    supabase
      .from('orders')
      .select('id, order_date, reference, customer:customers(name), order_lines(id, ordered_qty, closed_qty)')
      .in('status', ['open', 'partially_dispatched'])
      .order('order_date'),
  ])

  const events = (data ?? []) as unknown as EventRow[]
  const openOrderRows = (openOrdersRaw ?? []) as unknown as OpenOrderRow[]

  // Compute dispatched qty for open order lines using already-fetched confirmed event IDs
  const confirmedIds = events.filter((e) => e.status === 'confirmed').map((e) => e.id)
  const allOpenLineIds = openOrderRows.flatMap((o) => o.order_lines.map((l) => l.id))
  const dispatchedByLineId = new Map<string, number>()

  if (allOpenLineIds.length > 0 && confirmedIds.length > 0) {
    const { data: dLines } = await supabase
      .from('dispatch_lines')
      .select('order_line_id, quantity_dispatched')
      .in('order_line_id', allOpenLineIds)
      .in('dispatch_event_id', confirmedIds)

    for (const dl of dLines ?? []) {
      const lid = dl.order_line_id as string
      dispatchedByLineId.set(lid, (dispatchedByLineId.get(lid) ?? 0) + Number(dl.quantity_dispatched))
    }
  }

  // Filter to orders that have actual open qty remaining
  const openOrdersWithQty = openOrderRows
    .map((o) => {
      const totalOrdered = o.order_lines.reduce((s, l) => s + Number(l.ordered_qty), 0)
      const totalClosed = o.order_lines.reduce((s, l) => s + Number(l.closed_qty), 0)
      const totalDispatched = o.order_lines.reduce((s, l) => s + (dispatchedByLineId.get(l.id) ?? 0), 0)
      return { ...o, open_qty: Math.max(0, totalOrdered - totalClosed - totalDispatched) }
    })
    .filter((o) => o.open_qty > 0)

  const tdNum: CSSProperties = {
    ...tableTd,
    textAlign: 'right',
    paddingRight: '1.5rem',
    fontVariantNumeric: 'tabular-nums',
  }

  return (
    <main style={{ padding: '1.5rem 2rem' }}>
      <PageHeader
        title="Dispatch"
        actions={
          <Link href="/dispatch/new">
            <Button variant="primary">+ New Dispatch</Button>
          </Link>
        }
      />

      {/* ── Ready to Dispatch ──────────────────────────────── */}
      {openOrdersWithQty.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
            Ready to Dispatch
          </div>
          <div className="table-card desktop-table-card" style={{ overflowX: 'auto' }}>
            <table className="stock-table">
              <thead>
                <tr>
                  <th style={tableTh}>Customer</th>
                  <th style={tableTh}>Date</th>
                  <th style={tableTh}>Reference</th>
                  <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1rem' }}>Open Qty</th>
                  <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1rem' }}>Age</th>
                  <th style={tableTh}></th>
                </tr>
              </thead>
              <tbody>
                {openOrdersWithQty.map((o) => {
                  const customer = Array.isArray(o.customer) ? o.customer[0] : o.customer
                  const daysOld = daysSince(o.order_date)
                  return (
                    <tr key={o.id}>
                      <td style={{ ...tableTd, fontWeight: 600 }}>
                        {(customer as { name: string } | null)?.name ?? '—'}
                      </td>
                      <td style={{ ...tableTd, color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
                        {o.order_date}
                      </td>
                      <td style={{ ...tableTd, color: o.reference ? 'var(--text-secondary)' : 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                        {o.reference ?? '—'}
                      </td>
                      <td style={{ ...tableTd, textAlign: 'right', paddingRight: '1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                        {fmt(o.open_qty)}
                      </td>
                      <td style={{ ...tableTd, textAlign: 'right', paddingRight: '1rem', color: daysOld > 14 ? 'var(--danger)' : 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
                        {daysOld}d
                      </td>
                      <td style={{ ...tableTd, paddingRight: '0.75rem' }}>
                        <Link
                          href={`/dispatch/new?order_id=${o.id}`}
                          style={{
                            padding: '0.25rem 0.7rem',
                            fontSize: 'var(--text-xs)',
                            fontWeight: 600,
                            background: 'var(--accent)',
                            color: 'white',
                            borderRadius: 'var(--radius-sm)',
                          }}
                        >
                          Dispatch →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mobile-card-list">
            {openOrdersWithQty.map((o: OpenOrderWithQty) => {
              const daysOld = daysSince(o.order_date)

              return (
                <article key={o.id} className="mobile-data-card">
                  <div className="mobile-card-top">
                    <div style={{ minWidth: 0 }}>
                      <div className="mobile-card-title">{getCustomerName(o.customer)}</div>
                      <div className="mobile-card-meta">
                        {o.order_date} {o.reference ? ` / ${o.reference}` : ''}
                      </div>
                    </div>
                    <div style={{ color: daysOld > 14 ? 'var(--danger)' : 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                      {daysOld}d
                    </div>
                  </div>
                  <div className="mobile-card-row" style={{ marginTop: '0.65rem' }}>
                    <span className="mobile-card-label">Open Qty</span>
                    <strong className="mobile-card-value">{fmt(o.open_qty)}</strong>
                  </div>
                  <div className="mobile-card-actions">
                    <Link
                      href={`/dispatch/new?order_id=${o.id}`}
                      style={{
                        padding: '0.35rem 0.7rem',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 700,
                        background: 'var(--accent)',
                        color: 'white',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      Dispatch
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      )}

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: '0.88rem' }}>Error: {error.message}</p>
      )}

      {/* ── Dispatch history ────────────────────────────────── */}
      {!error && events.length === 0 && openOrdersWithQty.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          No dispatches yet.{' '}
          <Link href="/dispatch/new" style={{ color: 'var(--info)' }}>Record the first dispatch.</Link>
        </p>
      )}

      {events.length > 0 && (
        <>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
            Dispatch History
          </div>
          <div className="table-card desktop-table-card">
            <table className="stock-table">
              <thead>
                <tr>
                  <th style={tableTh}>Event ID</th>
                  <th style={tableTh}>Date</th>
                  <th style={tableTh}>Customer</th>
                  <th style={tableTh}>Reference</th>
                  <th style={tableTh}>Status</th>
                  <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }}>Lines</th>
                  <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }}>Total Qty</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => {
                  const customer = Array.isArray(ev.customers) ? ev.customers[0] : ev.customers
                  const lines = ev.dispatch_lines ?? []
                  const totalQty = lines.reduce((s, l) => s + Number(l.quantity_dispatched), 0)

                  return (
                    <tr key={ev.id}>
                      <td style={tableTd}>
                        <a href={`/dispatch/${ev.id}`} style={{ color: 'var(--info)', textDecoration: 'none' }}>
                          {ev.id.slice(0, 8)}
                        </a>
                      </td>
                      <td style={tableTd}>{ev.dispatch_date}</td>
                      <td style={tableTd}>{(customer as { name: string } | null)?.name ?? '—'}</td>
                      <td style={{ ...tableTd, color: ev.reference ? undefined : 'var(--text-secondary)' }}>
                        {ev.reference ?? '—'}
                      </td>
                      <td style={tableTd}>
                        <Badge variant={statusBadgeVariant(ev.status)} label={ev.status} size="sm" />
                      </td>
                      <td style={tdNum}>{lines.length}</td>
                      <td style={tdNum}>{fmt(totalQty)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mobile-card-list">
            {events.map((ev) => {
              const customer = Array.isArray(ev.customers) ? ev.customers[0] : ev.customers
              const lines = ev.dispatch_lines ?? []
              const totalQty = lines.reduce((s, l) => s + Number(l.quantity_dispatched), 0)

              return (
                <article key={ev.id} className="mobile-data-card">
                  <div className="mobile-card-top">
                    <div style={{ minWidth: 0 }}>
                      <Link href={`/dispatch/${ev.id}`} className="mobile-card-title" style={{ color: 'var(--info)' }}>
                        {ev.id.slice(0, 8)}
                      </Link>
                      <div className="mobile-card-meta">
                        {ev.dispatch_date} / {(customer as { name: string } | null)?.name ?? '—'}
                      </div>
                    </div>
                    <Badge variant={statusBadgeVariant(ev.status)} label={ev.status} size="sm" />
                  </div>
                  <div className="mobile-card-grid">
                    <div><span className="mobile-card-label">Reference</span><strong className="mobile-card-value">{ev.reference ?? '—'}</strong></div>
                    <div><span className="mobile-card-label">Lines</span><strong className="mobile-card-value">{lines.length}</strong></div>
                    <div><span className="mobile-card-label">Total Qty</span><strong className="mobile-card-value">{fmt(totalQty)}</strong></div>
                  </div>
                  <div className="mobile-card-actions">
                    <Link
                      href={`/dispatch/${ev.id}`}
                      style={{
                        padding: '0.35rem 0.7rem',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 700,
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-secondary)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      View
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}
    </main>
  )
}
