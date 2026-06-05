import { createServerSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { tableTh, tableTd } from '@/lib/ui'
import { VoidDispatchForm } from './VoidDispatchForm'
import type { AffectedOrder } from './VoidDispatchForm'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import type { CSSProperties } from 'react'
import Link from 'next/link'

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

function LineTypeBadge({ lineType }: { lineType: string }) {
  if (lineType === 'substitute') {
    return <Badge variant="warning" label="SUB" size="sm" />
  }
  if (lineType === 'extra') {
    return <Badge variant="info" label="EXTRA" size="sm" />
  }
  if (lineType === 'short') {
    return <Badge variant="neutral" label="SHORT" size="sm" />
  }
  return <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>—</span>
}

function resolveRef<T>(raw: T | T[] | null): T | null {
  if (!raw) return null
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw
}

export default async function DispatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServerSupabaseClient()

  const { data: eventRaw, error: eventErr } = await supabase
    .from('dispatch_events')
    .select('id, dispatch_date, reference, status, notes, confirmed_at, customers(name)')
    .eq('id', id)
    .single()

  if (eventErr || !eventRaw) notFound()

  type EventRow = typeof eventRaw & {
    customers: { name: string } | { name: string }[] | null
  }
  const event = eventRaw as unknown as EventRow
  const customer = resolveRef(event.customers)

  const { data: linesRaw } = await supabase
    .from('dispatch_lines')
    .select(`
      id,
      line_type,
      quantity_dispatched,
      colour_match,
      qty_variance,
      override_reason,
      order_line_id,
      ready_stock_balance_id,
      ready_stock_balance:ready_stock_balance_id (
        shape_design:shape_design_id (name),
        bindi_colour:bindi_colour_id (code),
        size:size_id (code),
        dabbi_colour:dabbi_colour_id (name),
        brand:brand_id (name)
      ),
      order_line:order_line_id (
        order_id,
        ordered_qty
      )
    `)
    .eq('dispatch_event_id', id)
    .order('created_at')

  type RsbRow = {
    shape_design: { name: string } | null
    bindi_colour: { code: string } | null
    size: { code: string } | null
    dabbi_colour: { name: string } | null
    brand: { name: string } | null
  }

  type LineRow = {
    id: string
    order_line_id: string | null
    ready_stock_balance_id: string
    quantity_dispatched: number | string
    line_type: string | null
    colour_match: boolean | null
    qty_variance: number | string | null
    override_reason: string | null
    ready_stock_balance: RsbRow | RsbRow[] | null
    order_line: { order_id: string; ordered_qty: number | string } | { order_id: string; ordered_qty: number | string }[] | null
  }

  const lines = (linesRaw ?? []) as unknown as LineRow[]

  // Separate ordered vs extra lines by line_type
  const extraDispatchLines = lines.filter((l) => l.line_type === 'extra')
  const orderedDispatchLines = lines.filter((l) => l.line_type !== 'extra')

  const orderedDispatchedQty = orderedDispatchLines.reduce((s, l) => s + Number(l.quantity_dispatched), 0)
  const extrasQty = extraDispatchLines.reduce((s, l) => s + Number(l.quantity_dispatched), 0)
  const totalSentQty = orderedDispatchedQty + extrasQty

  // Compute totals for footer
  const orderedLines = lines.filter((l) => l.order_line_id)
  const totalOrderedQty = orderedLines.reduce((s, l) => {
    const ol = resolveRef(l.order_line)
    return s + (ol ? Number(ol.ordered_qty) : 0)
  }, 0)
  const substitutionCount = lines.filter((l) => l.line_type === 'substitute').length
  const extraCount = extraDispatchLines.length
  const shortCount = lines.filter((l) => l.line_type === 'short').length
  const fulfilmentPct = totalOrderedQty > 0 ? Math.min(orderedDispatchedQty / totalOrderedQty * 100, 100) : 100

  // Void impact — unique order lines and per-order qty for the confirmation panel
  const affectedLineIds = new Set(
    orderedLines.map((l) => l.order_line_id).filter((x): x is string => !!x),
  )
  const orderLineCount = affectedLineIds.size

  const qtyByOrderId = new Map<string, number>()
  for (const l of orderedLines) {
    const ol = resolveRef(l.order_line)
    if (ol?.order_id) {
      qtyByOrderId.set(ol.order_id, (qtyByOrderId.get(ol.order_id) ?? 0) + Number(l.quantity_dispatched))
    }
  }

  const affectedOrderIds = [...qtyByOrderId.keys()]
  let affectedOrders: AffectedOrder[] = []
  if (affectedOrderIds.length > 0) {
    const { data: ordersRaw } = await supabase
      .from('orders')
      .select('id, customers(name)')
      .in('id', affectedOrderIds)

    affectedOrders = (ordersRaw ?? []).map((o) => {
      const cust = Array.isArray(o.customers) ? o.customers[0] : o.customers
      return {
        id: o.id as string,
        customerName: (cust as { name: string } | null)?.name ?? '—',
        qty: qtyByOrderId.get(o.id as string) ?? 0,
      }
    })
  }

  const metaLabel: CSSProperties = { fontSize: '0.78rem', color: 'var(--text-secondary)', width: '120px', flexShrink: 0 }
  const metaValue: CSSProperties = { fontSize: '0.88rem' }
  const metaRow: CSSProperties = { display: 'flex', gap: '0.5rem', marginBottom: '0.3rem' }
  const tdNum: CSSProperties = { ...tableTd, textAlign: 'right', paddingRight: '1.5rem', fontVariantNumeric: 'tabular-nums' }

  const dispatchDate = (event as { dispatch_date: string }).dispatch_date
  const dispatchRef = (event as { reference?: string | null }).reference
  const pageTitle = `Dispatch — ${dispatchDate}${dispatchRef ? ` — ${dispatchRef}` : ''}`

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1200px' }}>
      <PageHeader
        title={pageTitle}
        backHref="/dispatch"
        badge={<Badge variant={statusBadgeVariant((event as { status: string }).status)} label={(event as { status: string }).status} size="sm" />}
        subtitle={(event as { id: string }).id}
      />

      {/* Meta */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <div style={metaRow}><span style={metaLabel}>Customer</span><span style={metaValue}>{(customer as { name: string } | null)?.name ?? '—'}</span></div>
        <div style={metaRow}><span style={metaLabel}>Date</span><span style={metaValue}>{dispatchDate}</span></div>
        {dispatchRef && (
          <div style={metaRow}><span style={metaLabel}>Reference</span><span style={metaValue}>{dispatchRef}</span></div>
        )}
        {(event as { notes?: string | null }).notes && (
          <div style={metaRow}><span style={metaLabel}>Notes</span><span style={{ ...metaValue, color: 'var(--text-secondary)' }}>{(event as { notes: string }).notes}</span></div>
        )}
        <div style={metaRow}>
          <span style={metaLabel}>Total Sent</span>
          <div>
            <span style={{ ...metaValue, fontWeight: 'bold' }}>{fmt(totalSentQty)} gross</span>
            {extrasQty > 0 && (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.15rem', fontVariantNumeric: 'tabular-nums' }}>
                Ordered lines: {fmt(orderedDispatchedQty)} · Extras: {fmt(extrasQty)} · Total parcel: {fmt(totalSentQty)}
              </div>
            )}
          </div>
        </div>
      </Card>

      {extrasQty > 0 && (
        <div style={{ padding: '0.6rem 0.9rem', marginBottom: '1.5rem', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', color: 'var(--info)' }}>
          This dispatch included <strong>{fmt(extrasQty)} gross</strong> of parcel fillers not linked to order lines.
        </div>
      )}

      {/* Lines — challan table */}
      <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.75rem' }}>Dispatch Lines</h3>
      <div className="desktop-table-card" style={{ overflowX: 'auto', marginBottom: '2rem' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '900px' }}>
          <thead>
            <tr>
              <th style={tableTh}>Type</th>
              <th style={tableTh}>Shape</th>
              <th style={tableTh}>CLR</th>
              <th style={tableTh}>Size</th>
              <th style={tableTh}>Dabbi</th>
              <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }}>Ordered Qty</th>
              <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }}>Sent Qty</th>
              <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }}>Variance</th>
              <th style={tableTh}>Order</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const rsb = resolveRef(l.ready_stock_balance)
              const ol = resolveRef(l.order_line)
              const lineType = l.line_type ?? 'ordered'
              const sentQty = Number(l.quantity_dispatched)
              const orderedQty = ol ? Number(ol.ordered_qty) : 0
              const variance = Number(l.qty_variance ?? 0)
              const isExtra = lineType === 'extra'

              return (
                <tr key={l.id} style={{ background: isExtra ? 'var(--info-subtle)' : undefined }}>
                  <td style={{ ...tableTd, fontSize: '0.75rem' }}>
                    <LineTypeBadge lineType={lineType} />
                    {l.colour_match === false && (
                      <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--warning)', marginTop: '0.15rem' }}>
                        CLR mismatch
                      </span>
                    )}
                    {l.override_reason && (
                      <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--danger)', marginTop: '0.15rem' }} title={l.override_reason}>
                        overridden
                      </span>
                    )}
                  </td>
                  <td style={tableTd}>{rsb?.shape_design?.name ?? '—'}</td>
                  <td style={tableTd}>{rsb?.bindi_colour?.code ?? '—'}</td>
                  <td style={tableTd}>{rsb?.size?.code ?? '—'}</td>
                  <td style={tableTd}>{rsb?.dabbi_colour?.name ?? '—'}</td>
                  <td style={tdNum}>{isExtra ? '—' : fmt(orderedQty)}</td>
                  <td style={{ ...tdNum, fontWeight: 'bold' }}>{fmt(sentQty)}</td>
                  <td style={{ ...tdNum, color: variance < 0 ? 'var(--text-secondary)' : variance > 0 ? 'var(--success)' : 'var(--text-secondary)', fontSize: '0.82rem' }}>
                    {isExtra ? '—' : variance === 0 ? '—' : `${variance > 0 ? '+' : ''}${fmt(variance)}`}
                  </td>
                  <td style={{ ...tableTd, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                    {ol?.order_id ? (
                      <Link href={`/orders/${ol.order_id}`} style={{ color: 'var(--info)', textDecoration: 'none' }}>
                        {ol.order_id.slice(0, 8)}
                      </Link>
                    ) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} style={{ ...tableTd, fontWeight: 'bold', borderTop: `2px solid var(--border)`, paddingTop: '0.75rem' }}>
                Totals
              </td>
              <td style={{ ...tdNum, fontWeight: 'bold', borderTop: `2px solid var(--border)`, paddingTop: '0.75rem' }}>
                {fmt(totalOrderedQty)}
              </td>
              <td style={{ ...tdNum, fontWeight: 'bold', borderTop: `2px solid var(--border)`, paddingTop: '0.75rem' }}>
                {fmt(totalSentQty)}
              </td>
              <td colSpan={2} style={{ borderTop: `2px solid var(--border)`, paddingTop: '0.75rem' }} />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="mobile-card-list" style={{ marginBottom: '2rem' }}>
        {lines.map((l) => {
          const rsb = resolveRef(l.ready_stock_balance)
          const ol = resolveRef(l.order_line)
          const lineType = l.line_type ?? 'ordered'
          const sentQty = Number(l.quantity_dispatched)
          const orderedQty = ol ? Number(ol.ordered_qty) : 0
          const variance = Number(l.qty_variance ?? 0)
          const isExtra = lineType === 'extra'

          return (
            <article key={l.id} className="mobile-data-card" style={{ background: isExtra ? 'var(--info-subtle)' : undefined }}>
              <div className="mobile-card-top">
                <div style={{ minWidth: 0 }}>
                  <div className="mobile-card-title">
                    {rsb?.shape_design?.name ?? '—'} / {rsb?.bindi_colour?.code ?? '—'} / {rsb?.size?.code ?? '—'}
                  </div>
                  <div className="mobile-card-meta">
                    Dabbi {rsb?.dabbi_colour?.name ?? '—'} / {rsb?.brand?.name ?? '—'}
                  </div>
                </div>
                <LineTypeBadge lineType={lineType} />
              </div>

              <div className="mobile-card-grid">
                <div><span className="mobile-card-label">Ordered</span><strong className="mobile-card-value">{isExtra ? '—' : fmt(orderedQty)}</strong></div>
                <div><span className="mobile-card-label">Sent</span><strong className="mobile-card-value">{fmt(sentQty)}</strong></div>
                <div><span className="mobile-card-label">Variance</span><strong className="mobile-card-value">{isExtra || variance === 0 ? '—' : `${variance > 0 ? '+' : ''}${fmt(variance)}`}</strong></div>
                <div><span className="mobile-card-label">Order</span><strong className="mobile-card-value">{ol?.order_id ? ol.order_id.slice(0, 8) : '—'}</strong></div>
              </div>

              {(l.colour_match === false || l.override_reason || ol?.order_id) && (
                <div className="mobile-card-actions">
                  {ol?.order_id && (
                    <Link href={`/orders/${ol.order_id}`} style={{ padding: '0.35rem 0.7rem', fontSize: 'var(--text-xs)', fontWeight: 700, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)' }}>
                      View Order
                    </Link>
                  )}
                  {l.colour_match === false && (
                    <span style={{ alignSelf: 'center', color: 'var(--warning)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>CLR mismatch</span>
                  )}
                  {l.override_reason && (
                    <span style={{ alignSelf: 'center', color: 'var(--danger)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>Overridden</span>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>

      {/* Fulfilment summary footer */}
      <Card style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', fontSize: '0.82rem' }}>
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>Fulfilment: </span>
            <span style={{ fontWeight: 'bold', color: fulfilmentPct >= 95 ? 'var(--success)' : fulfilmentPct >= 80 ? 'var(--warning)' : 'var(--danger)' }}>
              {fulfilmentPct.toFixed(1)}%
            </span>
          </div>
          {substitutionCount > 0 && (
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Substitutions: </span>
              <span style={{ color: 'var(--warning)' }}>{substitutionCount}</span>
            </div>
          )}
          {extraCount > 0 && (
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Extras: </span>
              <span style={{ color: 'var(--info)' }}>{extraCount}</span>
            </div>
          )}
          {shortCount > 0 && (
            <div>
              <span style={{ color: 'var(--text-secondary)' }}>Short lines: </span>
              <span style={{ color: 'var(--text-secondary)' }}>{shortCount}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Void action — intentionally at the bottom, separated from other controls */}
      {(event as { status: string }).status === 'confirmed' && (
        <VoidDispatchForm
          eventId={id}
          totalGross={totalSentQty}
          orderLineCount={orderLineCount}
          affectedOrders={affectedOrders}
        />
      )}
      {(event as { status: string }).status === 'voided' && (
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '0.75rem', background: 'var(--bg-elevated)', border: `1px solid var(--border)` }}>
          This dispatch has been voided. Stock has been restored.
        </p>
      )}
    </main>
  )
}
