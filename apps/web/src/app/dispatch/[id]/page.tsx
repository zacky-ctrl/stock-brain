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

  // Build print matrix — group by (shape, colour) rows, columns = active sizes only
  const SIZE_ORDER = ['000', '00', '0', '1', '2', '3', '4', '5', '6', '0.1', '0000']
  function sortSizes(codes: string[]): string[] {
    return [...codes].sort((a, b) => {
      const ia = SIZE_ORDER.indexOf(a), ib = SIZE_ORDER.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
  }

  type ChallanMatrixGroup = { rowKey: string; shape: string; colour: string; quantities: Map<string, number>; total: number }
  const challanSizeSet = new Set<string>()
  const challanRowMap = new Map<string, ChallanMatrixGroup>()

  for (const l of lines) {
    const rsb = resolveRef(l.ready_stock_balance)
    if (!rsb) continue
    const shape = rsb.shape_design?.name ?? ''
    const colour = rsb.bindi_colour?.code ?? ''
    const size = rsb.size?.code ?? ''
    if (!shape || !colour || !size) continue
    challanSizeSet.add(size)
    const rowKey = `${shape}__${colour}`
    const row = challanRowMap.get(rowKey) ?? { rowKey, shape, colour, quantities: new Map<string, number>(), total: 0 }
    row.quantities.set(size, (row.quantities.get(size) ?? 0) + Number(l.quantity_dispatched))
    row.total += Number(l.quantity_dispatched)
    challanRowMap.set(rowKey, row)
  }

  const challanSizeCodes = sortSizes([...challanSizeSet])
  const challanRows = [...challanRowMap.values()].sort((a, b) => a.shape.localeCompare(b.shape) || a.colour.localeCompare(b.colour))
  const challanGridStyle = {
    gridTemplateColumns: `13% 7% repeat(${Math.max(challanSizeCodes.length, 1)}, minmax(0, 1fr)) 8%`,
  }

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

      {/* Print-Only Challan: clean invoice-style layout */}
      <div className="print-only-header" style={{ display: 'none', fontFamily: 'Arial, sans-serif', color: '#000' }}>

        {/* Company header */}
        <div style={{ marginBottom: '1rem', paddingBottom: '0.6rem', borderBottom: '2px solid #000' }}>
          <div style={{ fontSize: '18pt', fontWeight: 800, letterSpacing: '-0.02em' }}>NIRANKARI BINDI</div>
          <div style={{ fontSize: '10pt', fontWeight: 400, color: '#555', marginTop: '1px' }}>DELIVERY CHALLAN</div>
        </div>

        {/* Two-box row: Bill To + Challan Details */}
        <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {/* Bill To */}
          <div style={{ flex: 1, border: '1px solid #000', padding: '10px 12px', lineHeight: 1.55 }}>
            <div style={{ fontSize: '7pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555', marginBottom: '4px' }}>BILL TO</div>
            <div style={{ fontSize: '12pt', fontWeight: 700 }}>{customer?.name ?? '—'}</div>
            {customer?.entity_name && <div style={{ fontSize: '9pt' }}>{customer.entity_name}</div>}
            {customer?.address && <div style={{ fontSize: '9pt' }}>{customer.address}</div>}
            {customer?.phone_number && <div style={{ fontSize: '9pt' }}>Phone: {customer.phone_number}</div>}
            {customer?.transport_name && <div style={{ fontSize: '9pt' }}>Transport: {customer.transport_name}</div>}
          </div>
          {/* Challan Details */}
          <div style={{ flex: 1, border: '1px solid #000', padding: '10px 12px', lineHeight: 1.55 }}>
            <div style={{ fontSize: '7pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#555', marginBottom: '4px' }}>CHALLAN DETAILS</div>
            <table style={{ width: '100%', fontSize: '9pt', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ color: '#555', paddingBottom: '2px', width: '50%' }}>Challan No.</td>
                  <td style={{ fontWeight: 700, textAlign: 'right' }}>{challanNumber}</td>
                </tr>
                <tr>
                  <td style={{ color: '#555', paddingBottom: '2px' }}>Date</td>
                  <td style={{ fontWeight: 700, textAlign: 'right' }}>{dispatchDate}</td>
                </tr>
                <tr>
                  <td style={{ color: '#555', paddingBottom: '2px' }}>Total Sent</td>
                  <td style={{ fontWeight: 700, textAlign: 'right' }}>{fmt(totalSentQty)} gross</td>
                </tr>
                {extrasQty > 0 && (
                  <tr>
                    <td style={{ color: '#555', paddingBottom: '2px' }}>Extras</td>
                    <td style={{ fontWeight: 400, textAlign: 'right' }}>{fmt(extrasQty)} gross</td>
                  </tr>
                )}
                {dispatchRef && (
                  <tr>
                    <td style={{ color: '#555', paddingBottom: '2px' }}>Reference</td>
                    <td style={{ fontWeight: 400, textAlign: 'right' }}>{dispatchRef}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Matrix section heading */}
        <div style={{ fontSize: '11pt', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', marginTop: '0.25rem' }}>
          SKU Quantity Matrix
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

      {/* Screen-only: MatrixGrid for interactive viewing */}
      <div className="no-print" style={{ marginBottom: '2.5rem' }}>
        <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.75rem' }}>Dispatch Matrix</h3>
      </div>

      {/* ── PRINT DOCUMENT ─────────────────────────────────────────────── */}
      <section id="challan-print-doc">
        <header className="challan-print-header">
          <div>
            <div className="invoice-print-brand">NIRANKARI BINDI</div>
            <div className="invoice-print-subtitle">Delivery Challan</div>
          </div>
          <div className="invoice-print-meta">
            <div><span>Challan No.</span><strong>{challanNumber}</strong></div>
            <div><span>Date</span><strong>{dispatchDate}</strong></div>
            <div><span>Total Sent</span><strong>{fmt(totalSentQty)} gross</strong></div>
          </div>
        </header>

        <section className="invoice-print-parties">
          <div>
            <div className="invoice-print-label">Bill To</div>
            <h2>{customer?.name ?? '—'}</h2>
            {customer?.entity_name && <p>{customer.entity_name}</p>}
            {customer?.address && <p>{customer.address}</p>}
            {customer?.phone_number && <p>Phone: {customer.phone_number}</p>}
            {customer?.transport_name && (
              <p className="invoice-print-transport-line">Transport: <strong>{customer.transport_name}</strong></p>
            )}
          </div>
          <div>
            <div className="invoice-print-label">Challan Details</div>
            <dl>
              <div><dt>Challan No.</dt><dd>{challanNumber}</dd></div>
              <div><dt>Date</dt><dd>{dispatchDate}</dd></div>
              <div><dt>Total Sent</dt><dd>{fmt(totalSentQty)} gross</dd></div>
              {extrasQty > 0 && <div><dt>Extras</dt><dd>{fmt(extrasQty)} gross</dd></div>}
              {dispatchRef && <div><dt>Reference</dt><dd>{dispatchRef}</dd></div>}
            </dl>
          </div>
        </section>

        <section className="invoice-print-section">
          <h3>SKU Quantity Matrix</h3>
          <div className="invoice-print-matrix-group">
            <div className="invoice-print-matrix-title">
              <span>Dispatch: {challanNumber}</span>
              <strong>{fmt(totalSentQty)} gross</strong>
            </div>
            <div className="invoice-print-matrix-grid">
              <div className="invoice-print-matrix-row invoice-print-matrix-head" style={challanGridStyle}>
                <div>Shape</div>
                <div>CLR</div>
                {challanSizeCodes.map(s => <div key={s}>{s}</div>)}
                <div>Total</div>
              </div>
              {challanRows.map(row => (
                <div key={row.rowKey} className="invoice-print-matrix-row" style={challanGridStyle}>
                  <div className="invoice-print-shape-cell">{row.shape}</div>
                  <div>{row.colour}</div>
                  {challanSizeCodes.map(s => (
                    <div key={s}>{row.quantities.has(s) ? String(row.quantities.get(s) ?? 0) : ''}</div>
                  ))}
                  <div className="invoice-print-total-cell">{String(row.total)}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="challan-print-footer">
          <div className="challan-print-signature">
            <div>Prepared By</div>
            <div>Checked By</div>
            <div>Received By</div>
          </div>
          <span>© 2026 Nirankari Bindi</span>
        </footer>
      </section>

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
        #challan-print-doc { display: none; }

        @media screen {
          .print-only-header { display: none !important; }
          .print-signature { display: none; }
        }

        @media print {
          @page { size: A4 portrait; margin: 9mm; }

          main { padding: 0 !important; max-width: none !important; }

          #challan-print-doc {
            display: block !important;
            color: #111 !important;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 8.5pt;
            line-height: 1.28;
          }
          #challan-print-doc * {
            box-shadow: none !important;
            text-shadow: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          /* Reuse invoice print classes verbatim */
          .challan-print-header {
            display: flex;
            justify-content: space-between;
            gap: 12mm;
            align-items: flex-start;
            border-bottom: 2px solid #111;
            padding-bottom: 4mm;
            margin-bottom: 5mm;
          }
          .invoice-print-brand {
            font-size: 18pt;
            font-weight: 800;
            letter-spacing: 0;
            text-transform: uppercase;
          }
          .invoice-print-subtitle,
          .invoice-print-label {
            font-size: 8pt;
            color: #444;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .invoice-print-meta {
            min-width: 55mm;
            display: grid;
            gap: 1.5mm;
          }
          .invoice-print-meta > div,
          .invoice-print-parties dl > div {
            display: flex;
            justify-content: space-between;
            gap: 8mm;
          }
          .invoice-print-meta span,
          .invoice-print-parties dt {
            color: #444;
            font-weight: 600;
          }
          .invoice-print-parties {
            display: grid;
            grid-template-columns: 1.35fr 0.85fr;
            gap: 7mm;
            margin-bottom: 5mm;
            break-inside: avoid;
          }
          .invoice-print-parties > div {
            border: 1px solid #111;
            padding: 4mm;
          }
          .invoice-print-parties h2 {
            margin: 1.5mm 0 2mm;
            font-size: 12pt;
          }
          .invoice-print-parties p { margin: 0 0 1mm; }
          .invoice-print-transport-line {
            display: inline-block;
            margin-top: 1.5mm !important;
            padding: 1.5mm 2mm;
            border: 1px solid #111;
            background: #fff3bf !important;
            font-weight: 700;
          }
          .invoice-print-parties dl {
            margin: 1.5mm 0 0;
            display: grid;
            gap: 1.5mm;
          }
          .invoice-print-parties dd { margin: 0; font-weight: 700; }

          .invoice-print-section h3 {
            margin: 0 0 2.5mm;
            font-size: 10pt;
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }
          .invoice-print-matrix-group {
            break-inside: avoid;
            margin-bottom: 4mm;
          }
          .invoice-print-matrix-title {
            display: flex;
            justify-content: space-between;
            gap: 6mm;
            padding: 1.8mm 2.2mm;
            border: 1px solid #111;
            border-bottom: 0;
            background: #f2f2f2 !important;
            font-weight: 800;
          }
          .invoice-print-matrix-grid {
            border-top: 1px solid #111;
            border-left: 1px solid #111;
          }
          .invoice-print-matrix-row { display: grid; }
          .invoice-print-matrix-row > div {
            border: 1px solid #111 !important;
            border-top: 0 !important;
            border-left: 0 !important;
            padding: 1.8mm 1.4mm !important;
            background: #fff !important;
            color: #111 !important;
            font-size: 8pt;
            min-width: 0;
            box-sizing: border-box;
            text-align: center;
          }
          .invoice-print-matrix-head > div {
            background: #f2f2f2 !important;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }
          .invoice-print-matrix-row > div:first-child {
            text-align: left;
            font-weight: 700;
          }
          .invoice-print-matrix-row > div:nth-child(2) {
            text-align: center;
            font-weight: 700;
          }
          .invoice-print-total-cell { font-weight: 800; }
          .invoice-print-shape-cell { font-weight: 700; }

          /* Challan-specific footer */
          .challan-print-footer {
            margin-top: 8mm;
            border-top: 1px solid #bbb;
            padding-top: 3mm;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            font-size: 7.5pt;
            color: #555;
          }
          .challan-print-signature {
            display: flex;
            gap: 20mm;
          }
          .challan-print-signature > div {
            border-top: 1px solid #000;
            padding-top: 1.5mm;
            min-width: 35mm;
            text-align: center;
            font-size: 7.5pt;
          }
        }
      `}</style>
    </main>
  )
}
