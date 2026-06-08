import Link from 'next/link'
import { Suspense } from 'react'
import { resolveInvoicePaymentStatus, type InvoicePaymentStatus } from '@stock-brain/domain'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { tableTd, tableTh } from '@/lib/ui'
import { getActorId } from '@/lib/get-actor'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { InvoicesTabs } from './InvoicesTabs'
import { ensureDraftInvoicesForConfirmedDispatches } from './draft-service'

type Tab = 'drafts' | 'invoices'

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

type ReceiptAllocationRow = {
  sales_invoice_id: string
  amount_allocated: number | string
  customer_receipts: { status: string } | { status: string }[] | null
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

function paymentStatusVariant(status: InvoicePaymentStatus): 'success' | 'warning' | 'neutral' | 'danger' {
  if (status === 'paid') return 'success'
  if (status === 'partial') return 'warning'
  if (status === 'overpaid') return 'danger'
  return 'neutral'
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

function InvoiceTable({
  invoices,
  allocatedByInvoice,
}: {
  invoices: InvoiceRow[]
  allocatedByInvoice: Map<string, number>
}) {
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
              <th style={tableTh}>Payment</th>
              <th style={tableTh}>Action</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => {
              const dispatchLink = resolveRef(invoice.sales_invoice_dispatches?.[0]?.dispatch_events)
              const allocatedAmount = allocatedByInvoice.get(invoice.id) ?? 0
              const paymentStatus = invoice.status === 'issued'
                ? resolveInvoicePaymentStatus(Number(invoice.total_amount), allocatedAmount)
                : null
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
                    {paymentStatus ? (
                      <Badge variant={paymentStatusVariant(paymentStatus)} label={paymentStatus} size="sm" />
                    ) : '-'}
                  </td>
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
          const allocatedAmount = allocatedByInvoice.get(invoice.id) ?? 0
          const paymentStatus = invoice.status === 'issued'
            ? resolveInvoicePaymentStatus(Number(invoice.total_amount), allocatedAmount)
            : null
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
                <div><span className="mobile-card-label">Payment</span><strong className="mobile-card-value">{paymentStatus ?? '-'}</strong></div>
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
  const rawTab = typeof params.tab === 'string' ? params.tab : 'drafts'
  const activeTab: Tab = rawTab === 'invoices' ? 'invoices' : 'drafts'

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()
  const autoDraftResult = await ensureDraftInvoicesForConfirmedDispatches(supabase, actor)

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
  const invoiceIds = invoices.map((invoice) => invoice.id)
  const { data: allocationsRaw } = invoiceIds.length > 0
    ? await supabase
        .from('sales_invoice_receipt_allocations')
        .select(`
          sales_invoice_id,
          amount_allocated,
          customer_receipts (
            status
          )
        `)
        .in('sales_invoice_id', invoiceIds)
    : { data: [] }
  const allocatedByInvoice = new Map<string, number>()
  for (const allocation of (allocationsRaw ?? []) as unknown as ReceiptAllocationRow[]) {
    const receipt = resolveRef(allocation.customer_receipts)
    if (receipt?.status !== 'confirmed') continue
    allocatedByInvoice.set(
      allocation.sales_invoice_id,
      (allocatedByInvoice.get(allocation.sales_invoice_id) ?? 0) + Number(allocation.amount_allocated),
    )
  }
  const drafts = invoices.filter((inv) => inv.status === 'draft')
  const issued = invoices.filter((inv) => inv.status === 'issued')

  const counts: Record<Tab, number> = {
    drafts: drafts.length,
    invoices: issued.length,
  }

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1280px' }}>
      <PageHeader
        title="Invoices"
        subtitle="Review draft invoices before issuing. Issued invoices are locked and posted to ledger."
      />

      {error && (
        <p style={{ color: 'var(--danger)', fontWeight: 700 }}>
          {error.message}
        </p>
      )}
      {autoDraftResult.errors.length > 0 && (
        <Card padding="sm" style={{ marginBottom: '1rem', borderColor: 'var(--warning)' }}>
          <p style={{ margin: 0, color: 'var(--warning)', fontSize: 'var(--text-sm)', fontWeight: 800 }}>
            {autoDraftResult.errors.length} challan{autoDraftResult.errors.length === 1 ? '' : 's'} could not become draft invoices automatically. Check dispatch line master data before issuing.
          </p>
          <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1rem', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
            {autoDraftResult.errors.slice(0, 5).map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Card>
      )}

      <Suspense>
        <InvoicesTabs activeTab={activeTab} counts={counts} />
      </Suspense>

      {activeTab === 'drafts' && (
        <section>
          {drafts.length === 0 ? (
            <EmptyNotice message="No draft invoices pending review." />
          ) : (
            <InvoiceTable invoices={drafts} allocatedByInvoice={allocatedByInvoice} />
          )}
        </section>
      )}

      {activeTab === 'invoices' && (
        <section>
          {issued.length === 0 ? (
            <EmptyNotice message="No issued invoices yet." />
          ) : (
            <InvoiceTable invoices={issued} allocatedByInvoice={allocatedByInvoice} />
          )}
        </section>
      )}
    </main>
  )
}
