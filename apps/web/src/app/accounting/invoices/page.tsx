import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { tableTd, tableTh } from '@/lib/ui'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CreateDraftInvoiceForm } from './CreateDraftInvoiceForm'

type InvoiceRow = {
  id: string
  invoice_number: string | null
  customer_name_snapshot: string
  invoice_date: string
  due_date: string | null
  status: string
  goods_amount: number | string
  transport_charges: number | string
  total_amount: number | string
  created_at: string
  sales_invoice_dispatches: Array<{
    dispatch_events: { id: string; challan_number: string | null } | { id: string; challan_number: string | null }[] | null
  }> | null
}

type PendingDispatchRow = {
  id: string
  dispatch_date: string
  challan_number: string | null
  customers: {
    name: string
    entity_name: string | null
    transport_name: string | null
    yellow_rate_per_gross: number | string | null
    white_rate_per_gross: number | string | null
  } | Array<{
    name: string
    entity_name: string | null
    transport_name: string | null
    yellow_rate_per_gross: number | string | null
    white_rate_per_gross: number | string | null
  }> | null
}

function money(value: number | string): string {
  return Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
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

export default async function InvoicesPage() {
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('sales_invoices')
    .select(`
      id,
      invoice_number,
      customer_name_snapshot,
      invoice_date,
      due_date,
      status,
      goods_amount,
      transport_charges,
      total_amount,
      created_at,
      sales_invoice_dispatches (
        dispatch_events (
          id,
          challan_number
        )
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  const invoices = (data ?? []) as unknown as InvoiceRow[]

  const { data: linkedDispatchesRaw } = await supabase
    .from('sales_invoice_dispatches')
    .select('dispatch_event_id')

  const linkedDispatchIds = new Set(
    (linkedDispatchesRaw ?? []).map((row) => row.dispatch_event_id as string),
  )

  const { data: pendingDispatchesRaw } = await supabase
    .from('dispatch_events')
    .select(`
      id,
      dispatch_date,
      challan_number,
      customers (
        name,
        entity_name,
        transport_name,
        yellow_rate_per_gross,
        white_rate_per_gross
      )
    `)
    .eq('status', 'confirmed')
    .order('dispatch_date', { ascending: false })
    .limit(100)

  const pendingDispatches = ((pendingDispatchesRaw ?? []) as unknown as PendingDispatchRow[])
    .filter((dispatch) => !linkedDispatchIds.has(dispatch.id))
    .slice(0, 12)

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1280px' }}>
      <PageHeader
        title="Invoices"
        subtitle="Drafts come from confirmed challans. Issued invoices post to customer ledger."
      />

      {error && (
        <p style={{ color: 'var(--danger)', fontWeight: 700 }}>
          {error.message}
        </p>
      )}

      {pendingDispatches.length > 0 && (
        <section style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: 'var(--text-lg)' }}>
            Challans Ready For Invoice
          </h2>
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            {pendingDispatches.map((dispatch) => {
              const customer = resolveRef(dispatch.customers)
              return (
                <Card key={dispatch.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 'var(--text-base)' }}>
                        {customer?.name ?? 'Unknown customer'}
                      </h3>
                      <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                        Challan {dispatch.challan_number ?? dispatch.id.slice(0, 8)} · {dispatch.dispatch_date}
                        {customer?.transport_name ? ` · ${customer.transport_name}` : ''}
                      </p>
                    </div>
                    <Link href={`/dispatch/${dispatch.id}`}>
                      <Button type="button" size="sm" variant="secondary">View Challan</Button>
                    </Link>
                  </div>
                  <CreateDraftInvoiceForm
                    dispatchId={dispatch.id}
                    defaultInvoiceDate={dispatch.dispatch_date}
                    defaultYellowRate={customer?.yellow_rate_per_gross ?? null}
                    defaultWhiteRate={customer?.white_rate_per_gross ?? null}
                  />
                </Card>
              )
            })}
          </div>
        </section>
      )}

      <div className="desktop-table-card" style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '920px' }}>
          <thead>
            <tr>
              <th style={tableTh}>Invoice</th>
              <th style={tableTh}>Customer</th>
              <th style={tableTh}>Date</th>
              <th style={tableTh}>Due</th>
              <th style={tableTh}>Challan</th>
              <th style={tableTh}>Status</th>
              <th style={{ ...tableTh, textAlign: 'right' }}>Goods</th>
              <th style={{ ...tableTh, textAlign: 'right' }}>Transport</th>
              <th style={{ ...tableTh, textAlign: 'right' }}>Total</th>
              <th style={tableTh}>Action</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => {
              const dispatchLink = resolveRef(invoice.sales_invoice_dispatches?.[0]?.dispatch_events)
              return (
                <tr key={invoice.id}>
                  <td style={tableTd}>
                    <Link href={`/accounting/invoices/${invoice.id}`} style={{ color: 'var(--accent-bright)', fontWeight: 800 }}>
                      {invoice.invoice_number ?? 'Draft'}
                    </Link>
                  </td>
                  <td style={{ ...tableTd, fontWeight: 700 }}>{invoice.customer_name_snapshot}</td>
                  <td style={tableTd}>{invoice.invoice_date}</td>
                  <td style={tableTd}>{invoice.due_date ?? '-'}</td>
                  <td style={tableTd}>
                    {dispatchLink ? (
                      <Link href={`/dispatch/${dispatchLink.id}`} style={{ color: 'var(--info)' }}>
                        {dispatchLink.challan_number ?? dispatchLink.id.slice(0, 8)}
                      </Link>
                    ) : '-'}
                  </td>
                  <td style={tableTd}>
                    <Badge variant={statusVariant(invoice.status)} label={invoice.status} size="sm" />
                  </td>
                  <td style={{ ...tableTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(invoice.goods_amount)}</td>
                  <td style={{ ...tableTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(invoice.transport_charges)}</td>
                  <td style={{ ...tableTd, textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{money(invoice.total_amount)}</td>
                  <td style={tableTd}>
                    <Link href={`/accounting/invoices/${invoice.id}`}>
                      <Button type="button" size="sm" variant="secondary">View</Button>
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mobile-card-list" style={{ marginTop: '1rem' }}>
        {invoices.map((invoice) => {
          const dispatchLink = resolveRef(invoice.sales_invoice_dispatches?.[0]?.dispatch_events)
          return (
            <Card key={invoice.id} className="mobile-data-card" padding="sm">
              <div className="mobile-card-top">
                <div style={{ minWidth: 0 }}>
                  <div className="mobile-card-title">{invoice.customer_name_snapshot}</div>
                  <div className="mobile-card-meta">{invoice.invoice_number ?? 'Draft'} · {invoice.invoice_date}</div>
                </div>
                <Badge variant={statusVariant(invoice.status)} label={invoice.status} size="sm" />
              </div>
              <div className="mobile-card-grid">
                <div><span className="mobile-card-label">Goods</span><strong className="mobile-card-value">{money(invoice.goods_amount)}</strong></div>
                <div><span className="mobile-card-label">Transport</span><strong className="mobile-card-value">{money(invoice.transport_charges)}</strong></div>
                <div><span className="mobile-card-label">Total</span><strong className="mobile-card-value">{money(invoice.total_amount)}</strong></div>
                <div><span className="mobile-card-label">Challan</span><strong className="mobile-card-value">{dispatchLink?.challan_number ?? '-'}</strong></div>
              </div>
              <div className="mobile-card-actions">
                <Link href={`/accounting/invoices/${invoice.id}`}>
                  <Button type="button" size="sm" variant="secondary">Open</Button>
                </Link>
              </div>
            </Card>
          )
        })}
      </div>

      {invoices.length === 0 && !error && (
        <Card style={{ marginTop: '1rem' }}>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            No invoices yet. Confirmed challans ready for billing will appear above.
          </p>
        </Card>
      )}
    </main>
  )
}
