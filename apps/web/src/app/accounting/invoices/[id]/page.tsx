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
import { AddManualLineForm } from '../AddManualLineForm'
import { RemoveManualLineForm } from '../RemoveManualLineForm'

type InvoiceRow = {
  id: string
  invoice_number: string | null
  customer_id: string
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
  manual_lines_amount: number | string
  total_amount: number | string
  notes: string | null
  issued_at: string | null
  accounting_journal_entry_id: string | null
  created_at: string
}

type InvoiceLineRow = {
  id: string
  line_type: string
  shape_name_snapshot: string
  bindi_colour_code_snapshot: string
  size_code_snapshot: string
  dabbi_colour_code_snapshot: string
  brand_name_snapshot: string | null
  rate_kind: string | null
  quantity_gross: number | string | null
  rate_per_gross: number | string | null
  line_amount: number | string
  manual_description: string | null
  manual_reason: string | null
}

type DispatchLinkRow = {
  dispatch_event_id: string
  dispatch_events: {
    id: string
    challan_number: string | null
    dispatch_date: string
    status: string
    updated_at: string
  } | {
    id: string
    challan_number: string | null
    dispatch_date: string
    status: string
    updated_at: string
  }[] | null
}

type CustomerRow = {
  yellow_rate_per_gross: number | string | null
  white_rate_per_gross: number | string | null
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
  const dispatchLines = lines.filter((l) => l.line_type === 'dispatch')
  const sizeCodes = sortSizeCodes([...new Set(dispatchLines.map((line) => line.size_code_snapshot))])
  const groupsByKey = new Map<string, PrintMatrixGroup>()

  for (const line of dispatchLines) {
    const groupKey = `${line.dabbi_colour_code_snapshot}__${line.brand_name_snapshot ?? '-'}__${line.rate_kind}`
    const group = groupsByKey.get(groupKey) ?? {
      key: groupKey,
      title: `${line.dabbi_colour_code_snapshot} / ${line.brand_name_snapshot ?? '-'} / ${(line.rate_kind ?? 'manual').toUpperCase()}`,
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

    const quantity = Number(line.quantity_gross ?? 0)
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

  for (const line of lines.filter((l) => l.line_type === 'dispatch')) {
    const rateKind = line.rate_kind ?? 'unknown'
    const existing = byRateKind.get(rateKind) ?? {
      rateKind,
      gross: 0,
      rate: Number(line.rate_per_gross ?? 0),
      amount: 0,
    }

    existing.gross += Number(line.quantity_gross ?? 0)
    existing.amount += Number(line.line_amount)
    byRateKind.set(rateKind, existing)
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
      customer_id,
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
      manual_lines_amount,
      total_amount,
      notes,
      issued_at,
      accounting_journal_entry_id,
      created_at
    `)
    .eq('id', id)
    .single()

  if (invoiceError || !invoiceRaw) notFound()

  const invoice = invoiceRaw as unknown as InvoiceRow

  const { data: linesRaw } = await supabase
    .from('sales_invoice_lines')
    .select(`
      id,
      line_type,
      shape_name_snapshot,
      bindi_colour_code_snapshot,
      size_code_snapshot,
      dabbi_colour_code_snapshot,
      brand_name_snapshot,
      rate_kind,
      quantity_gross,
      rate_per_gross,
      line_amount,
      manual_description,
      manual_reason
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
        dispatch_date,
        status,
        updated_at
      )
    `)
    .eq('sales_invoice_id', id)

  // Fetch customer master rates for the rate-diff warning in the edit form
  const { data: customerRaw } = await supabase
    .from('customers')
    .select('yellow_rate_per_gross, white_rate_per_gross')
    .eq('id', invoice.customer_id)
    .single()

  const customer = customerRaw as unknown as CustomerRow | null

  const lines = (linesRaw ?? []) as unknown as InvoiceLineRow[]
  const dispatchLines = lines.filter((l) => l.line_type === 'dispatch')
  const manualLines = lines.filter((l) => l.line_type === 'manual')
  const dispatchLinks = (dispatchLinksRaw ?? []) as unknown as DispatchLinkRow[]
  const pageTitle = invoice.invoice_number ?? 'Draft Invoice'
  const primaryDispatch = resolveRef(dispatchLinks[0]?.dispatch_events)
  const { groups: printMatrixGroups, sizeCodes: printSizeCodes } = buildPrintMatrixGroups(lines)
  const rateSummary = buildRateSummary(lines)
  const matrixGridStyle = {
    gridTemplateColumns: `13% 7% repeat(${Math.max(printSizeCodes.length, 1)}, minmax(0, 1fr)) 8%`,
  }
  const rateSummaryGridStyle = {
    gridTemplateColumns: '1.15fr 0.7fr 1fr 1.15fr',
  }

  // Dispatch status warnings
  const dispatchVoided = dispatchLinks.some((link) => {
    const de = resolveRef(link.dispatch_events)
    return de?.status === 'voided'
  })
  const dispatchChangedAfterDraft = !dispatchVoided && dispatchLinks.some((link) => {
    const de = resolveRef(link.dispatch_events)
    if (!de) return false
    return de.updated_at > invoice.created_at
  })

  const canIssue = invoice.status === 'draft' && !dispatchVoided

  const customerYellowRate =
    customer?.yellow_rate_per_gross !== null && customer?.yellow_rate_per_gross !== undefined
      ? Number(customer.yellow_rate_per_gross)
      : null
  const customerWhiteRate =
    customer?.white_rate_per_gross !== null && customer?.white_rate_per_gross !== undefined
      ? Number(customer.white_rate_per_gross)
      : null

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

        {dispatchVoided && (
          <div
            style={{
              padding: '0.75rem 1rem',
              background: 'var(--danger-bg, #fef2f2)',
              border: '1px solid var(--danger)',
              borderRadius: 'var(--radius)',
              marginBottom: '1rem',
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
              color: 'var(--danger)',
            }}
          >
            Linked challan was voided. This draft cannot be issued.
          </div>
        )}

        {dispatchChangedAfterDraft && (
          <div
            style={{
              padding: '0.75rem 1rem',
              background: 'var(--warning-bg, #fffbeb)',
              border: '1px solid var(--warning)',
              borderRadius: 'var(--radius)',
              marginBottom: '1rem',
              fontSize: 'var(--text-sm)',
              color: 'var(--warning)',
            }}
          >
            <strong>Linked challan changed after this draft was created.</strong> Review line items carefully before issuing.
          </div>
        )}

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

        {/* Dispatch-backed lines */}
        {dispatchLines.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)' }}>Dispatch-backed lines</span>
              <Badge variant="neutral" label="Dispatch" size="sm" />
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
                  {dispatchLines.map((line) => (
                    <tr key={line.id}>
                      <td style={{ ...tableTd, fontWeight: 700 }}>{line.shape_name_snapshot}</td>
                      <td style={tableTd}>{line.bindi_colour_code_snapshot}</td>
                      <td style={tableTd}>{line.size_code_snapshot}</td>
                      <td style={tableTd}>{line.dabbi_colour_code_snapshot}</td>
                      <td style={tableTd}>{line.brand_name_snapshot ?? '-'}</td>
                      <td style={tableTd}><Badge variant="neutral" label={line.rate_kind ?? '-'} size="sm" /></td>
                      <td style={{ ...tableTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{qty(line.quantity_gross ?? 0)}</td>
                      <td style={{ ...tableTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(line.rate_per_gross)}</td>
                      <td style={{ ...tableTd, textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{money(line.line_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Manual invoice lines */}
        {manualLines.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-secondary)' }}>Manual lines</span>
              <Badge variant="warning" label="Manual" size="sm" />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Accounting-only. Do not affect stock.</span>
            </div>
            <div className="desktop-table-card" style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '600px' }}>
                <thead>
                  <tr>
                    <th style={tableTh}>Description</th>
                    <th style={tableTh}>Reason</th>
                    <th style={{ ...tableTh, textAlign: 'right' }}>Amount</th>
                    {invoice.status === 'draft' && <th style={tableTh}>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {manualLines.map((line) => (
                    <tr key={line.id}>
                      <td style={{ ...tableTd, fontWeight: 700 }}>{line.manual_description}</td>
                      <td style={{ ...tableTd, color: 'var(--text-secondary)' }}>{line.manual_reason}</td>
                      <td style={{ ...tableTd, textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{money(line.line_amount)}</td>
                      {invoice.status === 'draft' && (
                        <td style={tableTd}>
                          <RemoveManualLineForm invoiceId={invoice.id} lineId={line.id} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {invoice.status === 'draft' && (
          <div style={{ marginBottom: '1.5rem' }}>
            <AddManualLineForm invoiceId={invoice.id} />
          </div>
        )}

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
            {Number(invoice.manual_lines_amount) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Manual lines</span>
                <strong>{money(invoice.manual_lines_amount)}</strong>
              </div>
            )}
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
            <EditDraftInvoiceForm
              invoice={invoice}
              customerYellowRate={customerYellowRate}
              customerWhiteRate={customerWhiteRate}
            />
          </Card>
        )}

        {invoice.status === 'draft' && (
          <Card>
            <h3 style={{ margin: '0 0 0.35rem', fontSize: 'var(--text-base)' }}>Issue invoice</h3>
            {canIssue ? (
              <>
                <p style={{ margin: '0 0 0.9rem', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                  This will generate the invoice number and post the customer ledger debit.
                </p>
                <IssueInvoiceForm invoiceId={invoice.id} />
              </>
            ) : (
              <p style={{ margin: 0, color: 'var(--danger)', fontSize: 'var(--text-sm)', fontWeight: 700 }}>
                Cannot issue: linked challan has been voided.
              </p>
            )}
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
            {invoice.transport_name_snapshot && (
              <p className="invoice-print-transport-line">Transport: <strong>{invoice.transport_name_snapshot}</strong></p>
            )}
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

        <section className="invoice-print-highlight">
          <div>
            <span>Customer</span>
            <strong>{invoice.customer_name_snapshot}</strong>
          </div>
          <div>
            <span>Entity / Hindi name</span>
            <strong>{invoice.entity_name_snapshot ?? '-'}</strong>
          </div>
          <div className="invoice-print-highlight-transport">
            <span>Transport</span>
            <strong>{invoice.transport_name_snapshot ?? '-'}</strong>
          </div>
          <div>
            <span>Address</span>
            <strong>{invoice.address_snapshot ?? '-'}</strong>
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
              <div className="invoice-print-matrix-grid">
                <div className="invoice-print-matrix-row invoice-print-matrix-head" style={matrixGridStyle}>
                  <div>Shape</div>
                  <div>CLR</div>
                  {printSizeCodes.map((sizeCode) => <div key={sizeCode}>{sizeCode}</div>)}
                  <div>Total</div>
                </div>
                {group.rows.map((row) => (
                  <div key={row.rowKey} className="invoice-print-matrix-row" style={matrixGridStyle}>
                    <div className="invoice-print-shape-cell">{row.shape}</div>
                    <div>{row.colour}</div>
                    {printSizeCodes.map((sizeCode) => (
                      <div key={sizeCode}>{row.quantities.has(sizeCode) ? qty(row.quantities.get(sizeCode) ?? 0) : ''}</div>
                    ))}
                    <div className="invoice-print-total-cell">{qty(row.total)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* Manual lines in print */}
        {manualLines.length > 0 && (
          <section className="invoice-print-section">
            <h3>Manual / Adjustment Lines</h3>
            <div className="invoice-print-manual-grid">
              <div className="invoice-print-manual-row invoice-print-manual-head">
                <div>Description</div>
                <div>Amount</div>
              </div>
              {manualLines.map((line) => (
                <div key={line.id} className="invoice-print-manual-row">
                  <div>{line.manual_description}</div>
                  <div>{money(line.line_amount)}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="invoice-print-bottom">
          <div>
            <h3>Rate Summary</h3>
            <div className="invoice-print-rate-grid">
              <div className="invoice-print-rate-row invoice-print-rate-head" style={rateSummaryGridStyle}>
                <div>Dabbi</div>
                <div>Gross</div>
                <div>Rate / Gross</div>
                <div>Amount</div>
              </div>
              {rateSummary.map((row) => (
                <div key={row.rateKind} className="invoice-print-rate-row" style={rateSummaryGridStyle}>
                  <div>{row.rateKind.toUpperCase()}</div>
                  <div>{qty(row.gross)}</div>
                  <div>{money(row.rate)}</div>
                  <div>{money(row.amount)}</div>
                </div>
              ))}
            </div>
            {invoice.notes && (
              <p className="invoice-print-notes"><strong>Notes:</strong> {invoice.notes}</p>
            )}
          </div>

          <div className="invoice-print-total-box">
            <div><span>Goods amount</span><strong>{money(invoice.goods_amount)}</strong></div>
            <div><span>Transport</span><strong>{money(invoice.transport_charges)}</strong></div>
            <div><span>Manual addition</span><strong>{money(invoice.other_charges)}</strong></div>
            {Number(invoice.manual_lines_amount) > 0 && (
              <div><span>Manual lines</span><strong>{money(invoice.manual_lines_amount)}</strong></div>
            )}
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

          .invoice-print-parties dd {
            margin: 0;
            font-weight: 700;
          }

          .invoice-print-highlight {
            display: grid;
            grid-template-columns: 1.1fr 1fr 1fr;
            gap: 2mm;
            border: 2px solid #111;
            background: #f6f6f6 !important;
            padding: 3mm;
            margin-bottom: 5mm;
            break-inside: avoid;
          }

          .invoice-print-highlight > div {
            display: grid;
            gap: 1mm;
            min-width: 0;
          }

          .invoice-print-highlight > div:last-child {
            grid-column: 1 / -1;
          }

          .invoice-print-highlight span {
            color: #444;
            font-size: 7.4pt;
            font-weight: 800;
            letter-spacing: 0.07em;
            text-transform: uppercase;
          }

          .invoice-print-highlight strong {
            font-size: 10pt;
          }

          .invoice-print-highlight-transport {
            border: 1px solid #111;
            background: #fff3bf !important;
            padding: 2mm;
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

          .invoice-print-matrix-grid,
          .invoice-print-rate-grid,
          .invoice-print-manual-grid {
            border-top: 1px solid #111;
            border-left: 1px solid #111;
          }

          .invoice-print-matrix-row,
          .invoice-print-rate-row,
          .invoice-print-manual-row {
            display: grid;
          }

          .invoice-print-manual-row {
            grid-template-columns: 1fr 40mm;
          }

          .invoice-print-manual-head > div {
            background: #f2f2f2 !important;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }

          .invoice-print-matrix-row > div,
          .invoice-print-rate-row > div,
          .invoice-print-manual-row > div {
            border: 1px solid #111 !important;
            border-top: 0 !important;
            border-left: 0 !important;
            padding: 1.8mm 1.4mm !important;
            background: #fff !important;
            color: #111 !important;
            font-size: 8pt;
            min-width: 0;
            box-sizing: border-box;
          }

          .invoice-print-manual-row > div:last-child {
            text-align: right;
            font-weight: 700;
          }

          .invoice-print-matrix-head > div,
          .invoice-print-rate-head > div {
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

          .invoice-print-matrix-row > div:not(:first-child):not(:nth-child(2)) {
            text-align: center;
          }

          .invoice-print-total-cell {
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

          .invoice-print-rate-row > div {
            text-align: right;
          }

          .invoice-print-rate-row > div:first-child {
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
