import Link from 'next/link'
import { Suspense } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { tableTd, tableTh } from '@/lib/ui'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { InvoicesTabs } from './InvoicesTabs'
import { ExpandableChallanCard } from './ExpandableChallanCard'

type Tab = 'challans' | 'drafts' | 'invoices'

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

function EmptyNotice({ message }: { message: string }) {
  return (
    <Card>
      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
        {message}
      </p>
    </Card>
  )
}

function InvoiceTable({ invoices }: { invoices: InvoiceRow[] }) {
  if (invoices.length === 0) return null

  return (
    <>
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
    </>
  )
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const rawTab = typeof params.tab === 'string' ? params.tab : 'challans'
  const activeTab: Tab = (rawTab === 'drafts' || rawTab === 'invoices' || rawTab === 'challans')
    ? rawTab
    : 'challans'

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
  const drafts = invoices.filter((inv) => inv.status === 'draft')
  const issued = invoices.filter((inv) => inv.status === 'issued')

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

  const counts: Record<Tab, number> = {
    challans: pendingDispatches.length,
    drafts: drafts.length,
    invoices: issued.length,
  }

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1280px' }}>
      <PageHeader
        title="Invoices"
        subtitle="Challans ready for billing, drafts pending review, and issued invoices."
      />

      {error && (
        <p style={{ color: 'var(--danger)', fontWeight: 700 }}>
          {error.message}
        </p>
      )}

      <Suspense>
        <InvoicesTabs activeTab={activeTab} counts={counts} />
      </Suspense>

      {activeTab === 'challans' && (
        <section>
          {pendingDispatches.length === 0 ? (
            <EmptyNotice message="No challans are currently waiting to be invoiced." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {pendingDispatches.map((dispatch) => {
                const customer = resolveRef(dispatch.customers)
                return (
                  <ExpandableChallanCard
                    key={dispatch.id}
                    dispatchId={dispatch.id}
                    challanNumber={dispatch.challan_number}
                    dispatchDate={dispatch.dispatch_date}
                    customerName={customer?.name ?? 'Unknown customer'}
                    transportName={customer?.transport_name ?? null}
                    yellowRate={customer?.yellow_rate_per_gross ?? null}
                    whiteRate={customer?.white_rate_per_gross ?? null}
                  />
                )
              })}
            </div>
          )}
        </section>
      )}

      {activeTab === 'drafts' && (
        <section>
          {drafts.length === 0 ? (
            <EmptyNotice message="No draft invoices. Create one from the Challans Ready tab." />
          ) : (
            <InvoiceTable invoices={drafts} />
          )}
        </section>
      )}

      {activeTab === 'invoices' && (
        <section>
          {issued.length === 0 ? (
            <EmptyNotice message="No issued invoices yet." />
          ) : (
            <InvoiceTable invoices={issued} />
          )}
        </section>
      )}
    </main>
  )
}
