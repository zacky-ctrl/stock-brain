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

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1200px' }}>
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
            <span style={{ color: 'var(--text-secondary)' }}>Other</span>
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
        <Card>
          <h3 style={{ margin: '0 0 0.35rem', fontSize: 'var(--text-base)' }}>Issue invoice</h3>
          <p style={{ margin: '0 0 0.9rem', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            This will generate the invoice number and post the customer ledger debit.
          </p>
          <IssueInvoiceForm invoiceId={invoice.id} />
        </Card>
      )}
    </main>
  )
}
