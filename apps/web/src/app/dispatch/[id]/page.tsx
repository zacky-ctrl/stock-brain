import { createServerSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { tableTh, tableTd } from '@/lib/ui'
import { VoidDispatchForm } from './VoidDispatchForm'
import type { AffectedOrder } from './VoidDispatchForm'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { PrintButton } from '@/components/ui/PrintButton'
import { MatrixGrid } from '@/components/matrix/MatrixGrid'
import { buildMatrixFromOrderLines } from '@stock-brain/domain'
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
    .select('id, dispatch_date, challan_number, invoice_number, reference, status, notes, confirmed_at, customers(name, entity_name, address, phone_number, transport_name)')
    .eq('id', id)
    .single()

  if (eventErr || !eventRaw) notFound()

  type EventRow = typeof eventRaw & {
    challan_number: string | null
    invoice_number: string | null
    customers: {
      name: string
      entity_name: string | null
      address: string | null
      phone_number: string | null
      transport_name: string | null
    } | Array<{
      name: string
      entity_name: string | null
      address: string | null
      phone_number: string | null
      transport_name: string | null
    }> | null
  }
  const event = eventRaw as unknown as EventRow
  const customer = resolveRef(event.customers)

  const { data: invoiceLinkRaw } = await supabase
    .from('sales_invoice_dispatches')
    .select('sales_invoice_id, sales_invoices(id, invoice_number, status)')
    .eq('dispatch_event_id', id)
    .maybeSingle()

  type InvoiceLinkRow = {
    sales_invoice_id: string
    sales_invoices: { id: string; invoice_number: string | null; status: string } | { id: string; invoice_number: string | null; status: string }[] | null
  }

  const invoiceLink = invoiceLinkRaw as unknown as InvoiceLinkRow | null
  const linkedInvoice = resolveRef(invoiceLink?.sales_invoices)

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
        shape_design_id,
        bindi_colour_id,
        size_id,
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
    shape_design_id: string
    bindi_colour_id: string
    size_id: string
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

  // Fetch matrix masters
  const [shapesResult, bindiResult, sizesResult] = await Promise.allSettled([
    supabase.from('shape_designs').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('bindi_colours').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('sizes').select('id, code, name, sort_order').order('sort_order'),
  ])

  type LookupRow = { id: string; code: string; name?: string | null; sort_order?: number | null }
  const shapes = shapesResult.status === 'fulfilled' ? (shapesResult.value.data ?? []) as LookupRow[] : []
  const bindis = bindiResult.status === 'fulfilled' ? (bindiResult.value.data ?? []) as LookupRow[] : []
  const sizes = sizesResult.status === 'fulfilled' ? (sizesResult.value.data ?? []) as LookupRow[] : []

  const sizeMaster   = sizes.map((s)  => ({ id: s.id, code: s.code, name: s.name ?? s.code, sort_order: Number(s.sort_order ?? 0) }))
  const designMaster = shapes.map((s) => ({ id: s.id, name: s.name ?? s.code, sort_order: Number(s.sort_order ?? 0) }))
  const colourMaster = bindis.map((c) => ({ id: c.id, code: c.code, name: c.name ?? c.code, sort_order: Number(c.sort_order ?? 0) }))

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
  const challanNumber = event.challan_number ?? 'Pending challan number'
  const invoiceNumber = linkedInvoice?.invoice_number ?? event.invoice_number
  const invoiceId = linkedInvoice?.id ?? invoiceLink?.sales_invoice_id ?? null
  const pageTitle = `Challan — ${challanNumber}`

  // Build Matrix
  const dispatchAsOrderLines = lines.map(l => {
    const rsb = resolveRef(l.ready_stock_balance)
    return {
      shape_design_id: rsb?.shape_design_id ?? '',
      bindi_colour_id: rsb?.bindi_colour_id ?? '',
      size_id: rsb?.size_id ?? '',
      ordered_qty: Number(l.quantity_dispatched)
    }
  }).filter(l => l.shape_design_id && l.bindi_colour_id && l.size_id)

  const matrixData = buildMatrixFromOrderLines(
    dispatchAsOrderLines,
    sizeMaster, designMaster, colourMaster
  )

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1200px' }}>
      <div className="no-print">
        <PageHeader
        title={pageTitle}
        backHref="/dispatch"
        badge={<Badge variant={statusBadgeVariant((event as { status: string }).status)} label={(event as { status: string }).status} size="sm" />}
        subtitle={(event as { id: string }).id}
        actions={
          <>
            {invoiceId && (
              <Link href={`/accounting/invoices/${invoiceId}`}>
                <Button type="button" variant="secondary" size="sm">
                  {invoiceNumber ? 'View Invoice' : 'View Draft Invoice'}
                </Button>
              </Link>
            )}
            <PrintButton label="Print Challan" />
          </>
        }
      />
      </div>

      {/* Print-Only Header: Single Page Challan layout */}
      <div className="print-only-header" style={{ display: 'none' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '2px solid #000' }}>
          <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '18pt', fontWeight: 800 }}>NIRANKARI BINDI</h1>
          <div style={{ fontSize: '10pt', color: '#444' }}>DELIVERY CHALLAN</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', fontSize: '9pt', lineHeight: 1.6 }}>
          <div style={{ flex: 1 }}>
            <div><strong>To:</strong></div>
            <div style={{ fontSize: '11pt', fontWeight: 700, margin: '0.2rem 0' }}>{customer?.name ?? '—'}</div>
            {customer?.entity_name && <div>{customer.entity_name}</div>}
            {customer?.address && <div style={{ whiteSpace: 'pre-wrap' }}>{customer.address}</div>}
            {customer?.phone_number && <div>Ph: {customer.phone_number}</div>}
          </div>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <div style={{ marginBottom: '0.2rem' }}><strong>Challan No:</strong> <span style={{ fontSize: '11pt' }}>{challanNumber}</span></div>
            <div style={{ marginBottom: '0.2rem' }}><strong>Date:</strong> {dispatchDate}</div>
            {customer?.transport_name && <div><strong>Transport:</strong> {customer.transport_name}</div>}
            {dispatchRef && <div><strong>Ref:</strong> {dispatchRef}</div>}
          </div>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f5f5f5', padding: '0.5rem', border: '1px solid #000', marginBottom: '1.5rem' }}>
          <div><strong>Total Quantity Sent:</strong> {fmt(totalSentQty)} gross</div>
          {extrasQty > 0 && <div style={{ fontSize: '8pt' }}>Ordered: {fmt(orderedDispatchedQty)} · Extras: {fmt(extrasQty)}</div>}
        </div>
      </div>

      {/* Meta */}
      <Card className="no-print" style={{ marginBottom: '1.5rem' }}>
        <div style={metaRow}><span style={metaLabel}>Customer</span><span style={metaValue}>{customer?.name ?? '—'}</span></div>
        {customer?.entity_name && (
          <div style={metaRow}><span style={metaLabel}>Entity</span><span style={metaValue}>{customer.entity_name}</span></div>
        )}
        {customer?.address && (
          <div style={metaRow}><span style={metaLabel}>Address</span><span style={{ ...metaValue, color: 'var(--text-secondary)' }}>{customer.address}</span></div>
        )}
        {customer?.phone_number && (
          <div style={metaRow}><span style={metaLabel}>Phone</span><span style={metaValue}>{customer.phone_number}</span></div>
        )}
        {customer?.transport_name && (
          <div style={metaRow}><span style={metaLabel}>Transport</span><span style={metaValue}>{customer.transport_name}</span></div>
        )}
        <div style={metaRow}><span style={metaLabel}>Challan No.</span><span style={{ ...metaValue, fontWeight: 700 }}>{challanNumber}</span></div>
        {invoiceNumber && (
          <div style={metaRow}><span style={metaLabel}>Invoice No.</span><span style={{ ...metaValue, fontWeight: 700 }}>{invoiceNumber}</span></div>
        )}
        {!invoiceNumber && linkedInvoice?.status === 'draft' && (
          <div style={metaRow}><span style={metaLabel}>Invoice</span><span style={{ ...metaValue, fontWeight: 700 }}>Draft pending issue</span></div>
        )}
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
        <div className="no-print" style={{ padding: '0.6rem 0.9rem', marginBottom: '1.5rem', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', color: 'var(--info)' }}>
          This dispatch included <strong>{fmt(extrasQty)} gross</strong> of parcel fillers not linked to order lines.
        </div>
      )}

      {/* Matrix View (Visible in print and screen) */}
      <div className="print-section" style={{ marginBottom: '2.5rem' }}>
        <h3 className="no-print" style={{ fontSize: '0.95rem', margin: '0 0 0.75rem' }}>Dispatch Matrix</h3>
        <MatrixGrid data={matrixData} mode="view" />
      </div>

      {/* Lines — challan table (Hidden on print) */}
      <h3 className="no-print" style={{ fontSize: '0.95rem', margin: '0 0 0.75rem' }}>Detailed Dispatch Lines</h3>
      <div className="desktop-table-card no-print" style={{ overflowX: 'auto', marginBottom: '2rem' }}>
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
      <div className="mobile-card-list no-print" style={{ marginBottom: '2rem' }}>
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

      {/* Fulfilment summary footer (Hidden on print) */}
      <Card className="no-print" style={{ marginBottom: '2rem' }}>
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
        <div className="no-print">
          <VoidDispatchForm
            eventId={id}
            totalGross={totalSentQty}
            orderLineCount={orderLineCount}
            affectedOrders={affectedOrders}
          />
        </div>
      )}
      {(event as { status: string }).status === 'voided' && (
        <p className="no-print" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '0.75rem', background: 'var(--bg-elevated)', border: `1px solid var(--border)` }}>
          This dispatch has been voided. Stock has been restored.
        </p>
      )}

      {/* Print Signature Block */}
      <div className="print-signature" style={{ display: 'none', marginTop: '4rem', fontSize: '10pt' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #000', paddingTop: '0.5rem', margin: '0 1rem' }}>
          <div>Prepared By</div>
          <div>Checked By</div>
          <div>Received By</div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm 15mm; }
          .no-print, .report-header-screen, .report-filter-bar, nav, header, footer { display: none !important; }
          
          body { font-family: 'Inter', Arial, sans-serif !important; }
          main { padding: 0 !important; max-width: 100% !important; background: white !important; }
          
          .print-only-header { display: block !important; margin-bottom: 2rem !important; }
          .print-signature { display: block !important; }

          /* Print styles for MatrixGrid */
          .matrix-print-root { overflow: visible !important; max-height: none !important; margin-bottom: 1rem !important; }
          .matrix-print-root table { border-collapse: collapse !important; width: 100% !important; margin-bottom: 0 !important; }
          .matrix-print-root th,
          .matrix-print-root td {
            border: 1px solid #000 !important;
            padding: 5px 6px !important;
            font-size: 10pt !important;
            background: #fff !important;
            color: #000 !important;
          }
          .matrix-header-row th { 
            background: #f4f4f4 !important; 
            color: #000 !important;
            font-weight: 700 !important;
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact; 
          }
          /* Ensure size columns are somewhat compact */
          .matrix-print-root th, .matrix-print-root td {
            text-align: center;
          }
          .matrix-print-root td:first-child, .matrix-print-root th:first-child,
          .matrix-print-root td:nth-child(2), .matrix-print-root th:nth-child(2) {
            text-align: left;
          }
          /* Hide the matrix contextual texts if any, as we have the challan header */
          .matrix-print-root > div:last-child { display: none !important; }
        }
      `}</style>
    </main>
  )
}
