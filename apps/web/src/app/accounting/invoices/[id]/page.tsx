import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { PrintButton } from '@/components/ui/PrintButton'
import { tableTd, tableTh } from '@/lib/ui'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { IssueInvoiceForm } from '../IssueInvoiceForm'
import { EditDraftInvoiceForm } from '../EditDraftInvoiceForm'

type InvoiceRow = {
  id: string
  invoice_number: string | null
  customer_name_snapshot: string
  entity_name_snapshot: string | null
  address_snapshot: string | null
  phone_snapshot: string | null
  transport_name_snapshot: string | null
  yellow_rate_per_gross: number | string | null
  white_rate_per_gross: number | string | null
  invoice_date: string
  due_date: string | null
  status: string
  goods_amount: number | string
  transport_charges: number | string
  other_charges: number | string
  discount_amount: number | string
  round_off_amount: number | string
  total_amount: number | string
  notes: string | null
  issued_at: string | null
  accounting_journal_entry_id: string | null
}

type InvoiceLineRow = {
  id: string
  shape_name_snapshot: string
  bindi_colour_code_snapshot: string
  size_code_snapshot: string
  dabbi_colour_code_snapshot: string
  brand_name_snapshot: string | null
  rate_kind: string
  quantity_gross: number | string
  rate_per_gross: number | string
  line_amount: number | string
}

type DispatchLinkRow = {
  dispatch_event_id: string
  dispatch_events: { id: string; challan_number: string | null; dispatch_date: string } | { id: string; challan_number: string | null; dispatch_date: string }[] | null
}

type PrintMatrixGroup = {
  key: string
  title: string
  rows: Array<{
    rowKey: string
    shape: string
    colour: string
    quantities: Map<string, number>
    total: number
  }>
  total: number
}

type RateSummaryRow = {
  rateKind: string
  gross: number
  rate: number
  amount: number
}

const SIZE_PRINT_ORDER = ['000', '00', '0', '1', '2', '3', '4', '5', '6', '0.1', '0000']

function money(value: number | string | null): string {
  return Number(value ?? 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function qty(value: number | string): string {
  const number = Number(value)
  return number % 1 === 0 ? String(number) : number.toFixed(3)
}

function statusVariant(status: string): 'success' | 'warning' | 'neutral' | 'danger' {
  if (status === 'issued') return 'success'
  if (status === 'draft') return 'warning'
  if (status === 'cancelled') return 'danger'
  return 'neutral'
}

function resolveRef<T>(raw: T | T[] | null | undefined): T | null {
  if (!raw) return null
  return Array.isArray(raw) ? raw[0] ?? null : raw
}

function sortSizeCodes(sizeCodes: string[]): string[] {
  return [...sizeCodes].sort((a, b) => {
    const indexA = SIZE_PRINT_ORDER.indexOf(a)
    const indexB = SIZE_PRINT_ORDER.indexOf(b)
    if (indexA !== -1 || indexB !== -1) {
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
    }
    return a.localeCompare(b)
  })
}

function buildPrintMatrixGroups(lines: InvoiceLineRow[]): { groups: PrintMatrixGroup[]; sizeCodes: string[] } {
  const sizeCodes = sortSizeCodes([...new Set(lines.map((line) => line.size_code_snapshot))])
  const groupsByKey = new Map<string, PrintMatrixGroup>()

  for (const line of lines) {
    const groupKey = `${line.dabbi_colour_code_snapshot}__${line.brand_name_snapshot ?? '-'}__${line.rate_kind}`
    const group = groupsByKey.get(groupKey) ?? {
      key: groupKey,
      title: `${line.dabbi_colour_code_snapshot} / ${line.brand_name_snapshot ?? '-'} / ${line.rate_kind.toUpperCase()}`,
      rows: [],
      total: 0,
    }

    const rowKey = `${line.shape_name_snapshot}__${line.bindi_colour_code_snapshot}`
    let row = group.rows.find((candidate) => candidate.rowKey === rowKey)
    if (!row) {
      row = {
        rowKey,
        shape: line.shape_name_snapshot,
        colour: line.bindi_colour_code_snapshot,
        quantities: new Map<string, number>(),
        total: 0,
      }
      group.rows.push(row)
    }

    const quantity = Number(line.quantity_gross)
    row.quantities.set(line.size_code_snapshot, (row.quantities.get(line.size_code_snapshot) ?? 0) + quantity)
    row.total += quantity
    group.total += quantity
    groupsByKey.set(groupKey, group)
  }

  const groups = [...groupsByKey.values()].map((group) => ({
    ...group,
    rows: group.rows.sort((a, b) => a.shape.localeCompare(b.shape) || a.colour.localeCompare(b.colour)),
  }))

  return { groups, sizeCodes }
}

function buildRateSummary(lines: InvoiceLineRow[]): RateSummaryRow[] {
  const byRateKind = new Map<string, RateSummaryRow>()

  for (const line of lines) {
    const existing = byRateKind.get(line.rate_kind) ?? {
      rateKind: line.rate_kind,
      gross: 0,
      rate: Number(line.rate_per_gross),
      amount: 0,
    }

    existing.gross += Number(line.quantity_gross)
    existing.amount += Number(line.line_amount)
    byRateKind.set(line.rate_kind, existing)
  }

  return [...byRateKind.values()].sort((a, b) => a.rateKind.localeCompare(b.rateKind))
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServerSupabaseClient()

  const { data: invoiceRaw, error: invoiceError } = await supabase
    .from('sales_invoices')
    .select(`
      id,
      invoice_number,
      customer_name_snapshot,
      entity_name_snapshot,
      address_snapshot,
      phone_snapshot,
      transport_name_snapshot,
      yellow_rate_per_gross,
      white_rate_per_gross,
      invoice_date,
      due_date,
      status,
      goods_amount,
      transport_charges,
      other_charges,
      discount_amount,
      round_off_amount,
      total_amount,
      notes,
      issued_at,
      accounting_journal_entry_id
    `)
    .eq('id', id)
    .single()

  if (invoiceError || !invoiceRaw) notFound()

  const invoice = invoiceRaw as unknown as InvoiceRow

  const { data: linesRaw } = await supabase
    .from('sales_invoice_lines')
    .select(`
      id,
      shape_name_snapshot,
      bindi_colour_code_snapshot,
      size_code_snapshot,
      dabbi_colour_code_snapshot,
      brand_name_snapshot,
      rate_kind,
      quantity_gross,
      rate_per_gross,
      line_amount
    `)
    .eq('sales_invoice_id', id)
    .order('created_at')

  const { data: dispatchLinksRaw } = await supabase
    .from('sales_invoice_dispatches')
    .select(`
      dispatch_event_id,
      dispatch_events (
        id,
        challan_number,
        dispatch_date
      )
    `)
    .eq('sales_invoice_id', id)

  const lines = (linesRaw ?? []) as unknown as InvoiceLineRow[]
  const dispatchLinks = (dispatchLinksRaw ?? []) as unknown as DispatchLinkRow[]
  const pageTitle = invoice.invoice_number ?? 'Draft Invoice'
  const primaryDispatch = resolveRef(dispatchLinks[0]?.dispatch_events)
  const { groups: printMatrixGroups, sizeCodes: printSizeCodes } = buildPrintMatrixGroups(lines)
  const rateSummary = buildRateSummary(lines)
  const sizeColumnWidth = `${72 / Math.max(printSizeCodes.length, 1)}%`

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1200px' }}>
      <div className="invoice-screen no-print">
        <PageHeader
          title={pageTitle}
          backHref="/accounting/invoices"
          badge={<Badge variant={statusVariant(invoice.status)} label={invoice.status} size="sm" />}
          subtitle={invoice.status === 'issued' ? `Issued ${invoice.issued_at ?? ''}` : 'Review before issuing. Ledger is posted only after issue.'}
          actions={
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {primaryDispatch && (
                <Link href={`/dispatch/${primaryDispatch.id}`}>
                  <Button type="button" variant="secondary" size="sm">
                    View Challan
                  </Button>
                </Link>
              )}
              {invoice.status === 'issued' && <PrintButton label="Print Invoice" />}
            </div>
          }
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(280px, 0.75fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <Card>
            <h2 style={{ margin: '0 0 0.8rem', fontSize: 'var(--text-lg)' }}>{invoice.customer_name_snapshot}</h2>
            {invoice.entity_name_snapshot && <p style={{ margin: '0 0 0.25rem' }}>{invoice.entity_name_snapshot}</p>}
            {invoice.address_snapshot && <p style={{ margin: '0 0 0.25rem', color: 'var(--text-secondary)' }}>{invoice.address_snapshot}</p>}
            {invoice.phone_snapshot && <p style={{ margin: '0 0 0.25rem', color: 'var(--text-secondary)' }}>Phone: {invoice.phone_snapshot}</p>}
            {invoice.transport_name_snapshot && <p style={{ margin: '0', color: 'var(--text-secondary)' }}>Transport: {invoice.transport_name_snapshot}</p>}
          </Card>

          <Card>
            <div style={{ display: 'grid', gap: '0.45rem', fontSize: 'var(--text-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Invoice date</span>
                <strong>{invoice.invoice_date}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Due date</span>
                <strong>{invoice.due_date ?? '-'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Yellow rate / gross</span>
                <strong>{money(invoice.yellow_rate_per_gross)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>White rate / gross</span>
                <strong>{money(invoice.white_rate_per_gross)}</strong>
              </div>
              {primaryDispatch && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Challan</span>
                  <Link href={`/dispatch/${primaryDispatch.id}`} style={{ color: 'var(--info)', fontWeight: 700 }}>
                    {primaryDispatch.challan_number ?? primaryDispatch.id.slice(0, 8)}
                  </Link>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="desktop-table-card" style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '840px' }}>
            <thead>
              <tr>
                <th style={tableTh}>Shape</th>
                <th style={tableTh}>CLR</th>
                <th style={tableTh}>Size</th>
                <th style={tableTh}>Dabbi</th>
                <th style={tableTh}>Brand</th>
                <th style={tableTh}>Rate</th>
                <th style={{ ...tableTh, textAlign: 'right' }}>Qty</th>
                <th style={{ ...tableTh, textAlign: 'right' }}>Rate / Gross</th>
                <th style={{ ...tableTh, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td style={{ ...tableTd, fontWeight: 700 }}>{line.shape_name_snapshot}</td>
                  <td style={tableTd}>{line.bindi_colour_code_snapshot}</td>
                  <td style={tableTd}>{line.size_code_snapshot}</td>
                  <td style={tableTd}>{line.dabbi_colour_code_snapshot}</td>
                  <td style={tableTd}>{line.brand_name_snapshot ?? '-'}</td>
                  <td style={tableTd}><Badge variant="neutral" label={line.rate_kind} size="sm" /></td>
                  <td style={{ ...tableTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{qty(line.quantity_gross)}</td>
                  <td style={{ ...tableTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(line.rate_per_gross)}</td>
                  <td style={{ ...tableTd, textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{money(line.line_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mobile-card-list" style={{ marginBottom: '1.5rem' }}>
          {lines.map((line) => (
            <Card key={line.id} className="mobile-data-card" padding="sm">
              <div className="mobile-card-top">
                <div style={{ minWidth: 0 }}>
                  <div className="mobile-card-title">
                    {line.shape_name_snapshot} / {line.bindi_colour_code_snapshot} / {line.size_code_snapshot}
                  </div>
                  <div className="mobile-card-meta">
                    {line.dabbi_colour_code_snapshot} · {line.brand_name_snapshot ?? '-'}
                  </div>
                </div>
                <Badge variant="neutral" label={line.rate_kind} size="sm" />
              </div>
              <div className="mobile-card-grid">
                <div><span className="mobile-card-label">Qty</span><strong className="mobile-card-value">{qty(line.quantity_gross)}</strong></div>
                <div><span className="mobile-card-label">Rate</span><strong className="mobile-card-value">{money(line.rate_per_gross)}</strong></div>
                <div><span className="mobile-card-label">Amount</span><strong className="mobile-card-value">{money(line.line_amount)}</strong></div>
              </div>
            </Card>
          ))}
        </div>

        <Card style={{ marginLeft: 'auto', maxWidth: '440px', marginBottom: '1.5rem' }}>
          <div style={{ display: 'grid', gap: '0.5rem', fontSize: 'var(--text-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Goods</span>
              <strong>{money(invoice.goods_amount)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Transport</span>
              <strong>{money(invoice.transport_charges)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Manual addition</span>
              <strong>{money(invoice.other_charges)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Discount</span>
              <strong>- {money(invoice.discount_amount)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Round off</span>
              <strong>{money(invoice.round_off_amount)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '0.75rem', fontSize: 'var(--text-lg)' }}>
              <span>Total</span>
              <strong>{money(invoice.total_amount)}</strong>
            </div>
          </div>
        </Card>

        {invoice.notes && (
          <Card style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.45rem', fontSize: 'var(--text-sm)' }}>Notes</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{invoice.notes}</p>
          </Card>
        )}

        {invoice.status === 'draft' && (
          <Card style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.35rem', fontSize: 'var(--text-base)' }}>Edit draft</h3>
            <p style={{ margin: '0 0 0.9rem', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
              Adjust rates, dates, transport, discount, round off, or a manual addition before issuing.
            </p>
            <EditDraftInvoiceForm invoice={invoice} />
          </Card>
        )}

        {invoice.status === 'draft' && (
          <Card>
            <h3 style={{ margin: '0 0 0.35rem', fontSize: 'var(--text-base)' }}>Issue invoice</h3>
            <p style={{ margin: '0 0 0.9rem', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
              This will generate the invoice number and post the customer ledger debit.
            </p>
            <IssueInvoiceForm invoiceId={invoice.id} />
          </Card>
        )}
      </div>

      <section id="invoice-print-doc">
        <header className="invoice-print-header">
          <div>
            <div className="invoice-print-brand">Nirankari Bindi</div>
            <div className="invoice-print-subtitle">Sales Invoice</div>
          </div>
          <div className="invoice-print-meta">
            <div><span>Invoice No.</span><strong>{invoice.invoice_number ?? 'Draft'}</strong></div>
            <div><span>Date</span><strong>{invoice.invoice_date}</strong></div>
            <div><span>Challan</span><strong>{primaryDispatch?.challan_number ?? '-'}</strong></div>
          </div>
        </header>

        <section className="invoice-print-parties">
          <div>
            <div className="invoice-print-label">Bill To</div>
            <h2>{invoice.customer_name_snapshot}</h2>
            {invoice.entity_name_snapshot && <p>{invoice.entity_name_snapshot}</p>}
            {invoice.address_snapshot && <p>{invoice.address_snapshot}</p>}
            {invoice.phone_snapshot && <p>Phone: {invoice.phone_snapshot}</p>}
            {invoice.transport_name_snapshot && <p>Transport: {invoice.transport_name_snapshot}</p>}
          </div>
          <div>
            <div className="invoice-print-label">Invoice Details</div>
            <dl>
              <div><dt>Due date</dt><dd>{invoice.due_date ?? '-'}</dd></div>
              <div><dt>Yellow rate / gross</dt><dd>{money(invoice.yellow_rate_per_gross)}</dd></div>
              <div><dt>White rate / gross</dt><dd>{money(invoice.white_rate_per_gross)}</dd></div>
              <div><dt>Status</dt><dd>{invoice.status.toUpperCase()}</dd></div>
            </dl>
          </div>
        </section>

        <section className="invoice-print-section">
          <h3>SKU Quantity Matrix</h3>
          {printMatrixGroups.map((group) => (
            <div key={group.key} className="invoice-print-matrix-group">
              <div className="invoice-print-matrix-title">
                <span>{group.title}</span>
                <strong>{qty(group.total)} gross</strong>
              </div>
              <table className="invoice-print-matrix-table">
                <colgroup>
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '7%' }} />
                  {printSizeCodes.map((sizeCode) => (
                    <col key={sizeCode} style={{ width: sizeColumnWidth }} />
                  ))}
                  <col style={{ width: '8%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Shape</th>
                    <th>CLR</th>
                    {printSizeCodes.map((sizeCode) => <th key={sizeCode}>{sizeCode}</th>)}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.rowKey}>
                      <td>{row.shape}</td>
                      <td>{row.colour}</td>
                      {printSizeCodes.map((sizeCode) => (
                        <td key={sizeCode}>{row.quantities.has(sizeCode) ? qty(row.quantities.get(sizeCode) ?? 0) : ''}</td>
                      ))}
                      <td>{qty(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>

        <section className="invoice-print-bottom">
          <div>
            <h3>Rate Summary</h3>
            <table className="invoice-print-summary-table">
              <thead>
                <tr>
                  <th>Dabbi</th>
                  <th>Gross</th>
                  <th>Rate / Gross</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {rateSummary.map((row) => (
                  <tr key={row.rateKind}>
                    <td>{row.rateKind.toUpperCase()}</td>
                    <td>{qty(row.gross)}</td>
                    <td>{money(row.rate)}</td>
                    <td>{money(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {invoice.notes && (
              <p className="invoice-print-notes"><strong>Notes:</strong> {invoice.notes}</p>
            )}
          </div>

          <div className="invoice-print-total-box">
            <div><span>Goods amount</span><strong>{money(invoice.goods_amount)}</strong></div>
            <div><span>Transport</span><strong>{money(invoice.transport_charges)}</strong></div>
            <div><span>Manual addition</span><strong>{money(invoice.other_charges)}</strong></div>
            <div><span>Discount</span><strong>- {money(invoice.discount_amount)}</strong></div>
            <div><span>Round off</span><strong>{money(invoice.round_off_amount)}</strong></div>
            <div className="invoice-print-grand-total"><span>Total</span><strong>{money(invoice.total_amount)}</strong></div>
          </div>
        </section>

        <footer className="invoice-print-footer">
          <span>© 2026 Nirankari Bindi · A project by GrowthARCH</span>
          <span>Authorised Signatory</span>
        </footer>
      </section>

      <style>{`
        #invoice-print-doc {
          display: none;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 9mm;
          }

          main {
            padding: 0 !important;
            max-width: none !important;
          }

          #invoice-print-doc {
            display: block !important;
            color: #111 !important;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 8.5pt;
            line-height: 1.28;
          }

          #invoice-print-doc * {
            box-shadow: none !important;
            text-shadow: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .invoice-print-header {
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
          .invoice-print-total-box > div,
          .invoice-print-parties dl > div {
            display: flex;
            justify-content: space-between;
            gap: 8mm;
          }

          .invoice-print-meta span,
          .invoice-print-total-box span,
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

          .invoice-print-parties p {
            margin: 0 0 1mm;
          }

          .invoice-print-parties dl {
            margin: 1.5mm 0 0;
            display: grid;
            gap: 1.5mm;
          }

          .invoice-print-parties dd {
            margin: 0;
            font-weight: 700;
          }

          .invoice-print-section h3,
          .invoice-print-bottom h3 {
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

          .invoice-print-matrix-table,
          .invoice-print-summary-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }

          .invoice-print-matrix-table th,
          .invoice-print-matrix-table td,
          .invoice-print-summary-table th,
          .invoice-print-summary-table td {
            border: 1px solid #111 !important;
            padding: 1.8mm 1.4mm !important;
            background: #fff !important;
            color: #111 !important;
            font-size: 8pt;
          }

          .invoice-print-matrix-table th,
          .invoice-print-summary-table th {
            background: #f2f2f2 !important;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }

          .invoice-print-matrix-table th:first-child,
          .invoice-print-matrix-table td:first-child {
            text-align: left;
            font-weight: 700;
          }

          .invoice-print-matrix-table th:nth-child(2),
          .invoice-print-matrix-table td:nth-child(2) {
            text-align: center;
            font-weight: 700;
          }

          .invoice-print-matrix-table th:not(:first-child):not(:nth-child(2)),
          .invoice-print-matrix-table td:not(:first-child):not(:nth-child(2)) {
            text-align: center;
          }

          .invoice-print-matrix-table th:last-child,
          .invoice-print-matrix-table td:last-child {
            font-weight: 800;
          }

          .invoice-print-bottom {
            display: grid;
            grid-template-columns: 1fr 64mm;
            gap: 7mm;
            align-items: start;
            margin-top: 5mm;
            break-inside: avoid;
          }

          .invoice-print-summary-table th,
          .invoice-print-summary-table td {
            text-align: right;
          }

          .invoice-print-summary-table th:first-child,
          .invoice-print-summary-table td:first-child {
            text-align: left;
          }

          .invoice-print-total-box {
            border: 1px solid #111;
            padding: 3mm;
            display: grid;
            gap: 1.8mm;
          }

          .invoice-print-grand-total {
            border-top: 2px solid #111;
            padding-top: 2.4mm;
            margin-top: 1mm;
            font-size: 11pt;
          }

          .invoice-print-notes {
            margin: 3mm 0 0;
            font-size: 8pt;
          }

          .invoice-print-footer {
            display: flex;
            justify-content: space-between;
            gap: 8mm;
            margin-top: 12mm;
            padding-top: 5mm;
            border-top: 1px solid #111;
            font-size: 8pt;
            break-inside: avoid;
          }
        }
      `}</style>
    </main>
  )
}
