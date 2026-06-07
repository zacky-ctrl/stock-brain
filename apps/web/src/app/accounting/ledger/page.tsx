import Link from 'next/link'
import {
  calculateCustomerLedgerSummaries,
  calculateCustomerRunningLedger,
  resolveInvoicePaymentStatus,
  type InvoicePaymentStatus,
} from '@stock-brain/domain'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { selectStyle, tableTd, tableTh } from '@/lib/ui'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AccountingTabs } from '../AccountingTabs'
import { LedgerRowActions } from './LedgerRowActions'

type SearchParams = {
  customer?: string
}

type CustomerRow = {
  id: string
  name: string
  entity_name: string | null
}

type LedgerEntryRow = {
  id: string
  customer_id: string
  entry_date: string
  entry_type: string
  source_type: string
  source_id: string | null
  debit_amount: number | string
  credit_amount: number | string
  description: string
  accounting_journal_entry_id: string | null
  created_at: string
  customers: { name: string; entity_name: string | null } | { name: string; entity_name: string | null }[] | null
}

type InvoiceRefRow = {
  id: string
  invoice_number: string | null
}

type CustomerInvoiceRow = {
  id: string
  invoice_number: string | null
  invoice_date: string
  due_date: string | null
  total_amount: number | string
  status: string
}

type InvoiceAllocationRow = {
  sales_invoice_id: string
  customer_receipt_id: string
  amount_allocated: number | string
  customer_receipts: { status: string } | { status: string }[] | null
}

type CustomerReceiptRow = {
  id: string
  receipt_number: string | null
  receipt_date: string
  amount: number | string
  mode: string
  reference: string | null
  status: string
}

function money(value: number | string): string {
  return Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function resolveRef<T>(raw: T | T[] | null | undefined): T | null {
  if (!raw) return null
  return Array.isArray(raw) ? raw[0] ?? null : raw
}

function toLedgerInput(row: LedgerEntryRow) {
  return {
    id: row.id,
    customerId: row.customer_id,
    entryDate: row.entry_date,
    createdAt: row.created_at,
    debitAmount: Number(row.debit_amount),
    creditAmount: Number(row.credit_amount),
  }
}

function balanceLabel(balance: number): string {
  if (balance > 0) return `${money(balance)} receivable`
  if (balance < 0) return `${money(Math.abs(balance))} advance`
  return '0.00 clear'
}

function paymentStatusVariant(status: InvoicePaymentStatus): 'success' | 'warning' | 'neutral' | 'danger' {
  if (status === 'paid') return 'success'
  if (status === 'partial') return 'warning'
  if (status === 'overpaid') return 'danger'
  return 'neutral'
}

export default async function CustomerLedgerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { customer: selectedCustomerId } = await searchParams
  const supabase = createServerSupabaseClient()

  const [{ data: customersRaw }, { data: allEntriesRaw, error: allEntriesError }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, entity_name')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('customer_ledger_entries')
      .select('id, customer_id, entry_date, created_at, debit_amount, credit_amount')
      .order('entry_date', { ascending: false })
      .limit(5000),
  ])

  const customers = (customersRaw ?? []) as unknown as CustomerRow[]
  const allEntries = (allEntriesRaw ?? []) as unknown as Array<{
    id: string
    customer_id: string
    entry_date: string
    created_at: string
    debit_amount: number | string
    credit_amount: number | string
  }>

  let ledgerQuery = supabase
    .from('customer_ledger_entries')
    .select(`
      id,
      customer_id,
      entry_date,
      entry_type,
      source_type,
      source_id,
      debit_amount,
      credit_amount,
      description,
      accounting_journal_entry_id,
      created_at,
      customers (
        name,
        entity_name
      )
    `)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(250)

  if (selectedCustomerId) {
    ledgerQuery = ledgerQuery.eq('customer_id', selectedCustomerId)
  }

  const { data: entriesRaw, error: entriesError } = await ledgerQuery
  const entries = (entriesRaw ?? []) as unknown as LedgerEntryRow[]
  const invoiceSourceIds = entries
    .filter((entry) => entry.source_type === 'sales_invoice' && entry.source_id)
    .map((entry) => entry.source_id as string)

  const { data: invoiceRefsRaw } = invoiceSourceIds.length > 0
    ? await supabase
        .from('sales_invoices')
        .select('id, invoice_number')
        .in('id', invoiceSourceIds)
    : { data: [] }

  const [{ data: selectedInvoicesRaw }, { data: selectedReceiptsRaw }] = selectedCustomerId
    ? await Promise.all([
        supabase
          .from('sales_invoices')
          .select('id, invoice_number, invoice_date, due_date, total_amount, status')
          .eq('customer_id', selectedCustomerId)
          .eq('status', 'issued')
          .order('invoice_date', { ascending: false })
          .limit(100),
        supabase
          .from('customer_receipts')
          .select('id, receipt_number, receipt_date, amount, mode, reference, status')
          .eq('customer_id', selectedCustomerId)
          .order('receipt_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(100),
      ])
    : [{ data: [] }, { data: [] }]

  const selectedInvoices = (selectedInvoicesRaw ?? []) as unknown as CustomerInvoiceRow[]
  const selectedReceipts = (selectedReceiptsRaw ?? []) as unknown as CustomerReceiptRow[]
  const selectedInvoiceIds = selectedInvoices.map((invoice) => invoice.id)
  const selectedReceiptIds = selectedReceipts.map((receipt) => receipt.id)
  const { data: selectedAllocationsRaw } =
    selectedInvoiceIds.length > 0 || selectedReceiptIds.length > 0
      ? await supabase
          .from('sales_invoice_receipt_allocations')
          .select(`
            sales_invoice_id,
            customer_receipt_id,
            amount_allocated,
            customer_receipts (
              status
            )
          `)
          .or([
            selectedInvoiceIds.length > 0 ? `sales_invoice_id.in.(${selectedInvoiceIds.join(',')})` : '',
            selectedReceiptIds.length > 0 ? `customer_receipt_id.in.(${selectedReceiptIds.join(',')})` : '',
          ].filter(Boolean).join(','))
      : { data: [] }

  const selectedAllocations = (selectedAllocationsRaw ?? []) as unknown as InvoiceAllocationRow[]
  const allocatedByInvoice = new Map<string, number>()
  const allocatedByReceipt = new Map<string, number>()

  for (const allocation of selectedAllocations) {
    const receipt = resolveRef(allocation.customer_receipts)
    if (receipt?.status !== 'confirmed') continue

    const amount = Number(allocation.amount_allocated)
    allocatedByInvoice.set(
      allocation.sales_invoice_id,
      (allocatedByInvoice.get(allocation.sales_invoice_id) ?? 0) + amount,
    )
    allocatedByReceipt.set(
      allocation.customer_receipt_id,
      (allocatedByReceipt.get(allocation.customer_receipt_id) ?? 0) + amount,
    )
  }

  const invoiceRefs = new Map(
    ((invoiceRefsRaw ?? []) as unknown as InvoiceRefRow[]).map((invoice) => [invoice.id, invoice.invoice_number]),
  )

  const summaries = calculateCustomerLedgerSummaries(
    allEntries.map((entry) => ({
      id: entry.id,
      customerId: entry.customer_id,
      entryDate: entry.entry_date,
      createdAt: entry.created_at,
      debitAmount: Number(entry.debit_amount),
      creditAmount: Number(entry.credit_amount),
    })),
  )
  const customerById = new Map(customers.map((customer) => [customer.id, customer]))
  const selectedSummary = selectedCustomerId
    ? summaries.find((summary) => summary.customerId === selectedCustomerId)
    : null
  const receivableTotal = summaries
    .filter((summary) => summary.balance > 0)
    .reduce((total, summary) => total + summary.balance, 0)
  const advanceTotal = summaries
    .filter((summary) => summary.balance < 0)
    .reduce((total, summary) => total + Math.abs(summary.balance), 0)
  const netReceivable = receivableTotal - advanceTotal
  const runningEntries = selectedCustomerId
    ? calculateCustomerRunningLedger(entries.map((entry) => ({ ...toLedgerInput(entry), row: entry }))).reverse()
    : []

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1280px' }}>
      <PageHeader
        title="Customer Ledger"
        subtitle="Outstanding is calculated from posted ledger entries. Invoices debit customers; receipts will credit them."
      />
      <AccountingTabs active="ledger" />

      {(allEntriesError || entriesError) && (
        <p style={{ color: 'var(--danger)', fontWeight: 800 }}>
          {allEntriesError?.message ?? entriesError?.message}
        </p>
      )}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: '0.85rem',
          marginBottom: '1rem',
        }}
      >
        <Card padding="sm">
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>Receivable</div>
          <div style={{ marginTop: '0.4rem', fontSize: 'var(--text-xl)', fontWeight: 900 }}>{money(receivableTotal)}</div>
        </Card>
        <Card padding="sm">
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>Advance</div>
          <div style={{ marginTop: '0.4rem', fontSize: 'var(--text-xl)', fontWeight: 900 }}>{money(advanceTotal)}</div>
        </Card>
        <Card padding="sm">
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>Net</div>
          <div style={{ marginTop: '0.4rem', fontSize: 'var(--text-xl)', fontWeight: 900 }}>{money(netReceivable)}</div>
        </Card>
        <Card padding="sm">
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>Customers With Balance</div>
          <div style={{ marginTop: '0.4rem', fontSize: 'var(--text-xl)', fontWeight: 900 }}>{summaries.filter((summary) => summary.balance !== 0).length}</div>
        </Card>
      </section>

      <Card padding="sm" style={{ marginBottom: '1rem' }}>
        <form style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: '0.3rem', minWidth: '260px', flex: '1 1 260px', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Customer
            <select name="customer" defaultValue={selectedCustomerId ?? ''} style={selectStyle}>
              <option value="">All customers</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}{customer.entity_name ? ` — ${customer.entity_name}` : ''}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="primary">Apply</Button>
          {selectedCustomerId && (
            <Link href="/accounting/ledger">
              <Button type="button" variant="secondary">Clear</Button>
            </Link>
          )}
        </form>
      </Card>

      {!selectedCustomerId && (
        <Card style={{ marginBottom: '1rem' }}>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: 'var(--text-lg)' }}>Customer Balances</h2>
          <div className="desktop-table-card" style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '720px' }}>
              <thead>
                <tr>
                  <th style={tableTh}>Customer</th>
                  <th style={{ ...tableTh, textAlign: 'right' }}>Debit</th>
                  <th style={{ ...tableTh, textAlign: 'right' }}>Credit</th>
                  <th style={{ ...tableTh, textAlign: 'right' }}>Balance</th>
                  <th style={tableTh}>Action</th>
                </tr>
              </thead>
              <tbody>
                {summaries.slice(0, 80).map((summary) => {
                  const customer = customerById.get(summary.customerId)
                  return (
                    <tr key={summary.customerId}>
                      <td style={{ ...tableTd, fontWeight: 800 }}>{customer?.name ?? 'Unknown customer'}</td>
                      <td style={{ ...tableTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(summary.debitTotal)}</td>
                      <td style={{ ...tableTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(summary.creditTotal)}</td>
                      <td style={{ ...tableTd, textAlign: 'right', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{balanceLabel(summary.balance)}</td>
                      <td style={tableTd}>
                        <LedgerRowActions customerId={summary.customerId} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {selectedCustomerId && selectedSummary && (
        <Card padding="sm" style={{ marginBottom: '1rem', borderColor: 'var(--accent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>Selected customer</div>
              <h2 style={{ margin: '0.25rem 0 0', fontSize: 'var(--text-xl)' }}>
                {customerById.get(selectedSummary.customerId)?.name ?? 'Unknown customer'}
              </h2>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>Balance</div>
              <div style={{ marginTop: '0.25rem', fontSize: 'var(--text-xl)', fontWeight: 900 }}>{balanceLabel(selectedSummary.balance)}</div>
            </div>
          </div>
        </Card>
      )}

      {selectedCustomerId && (
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 0.8fr)',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Invoice Settlement</h2>
              <Link href={`/accounting/receipts?customer=${selectedCustomerId}`}>
                <Button type="button" size="sm" variant="primary">Receive Payment</Button>
              </Link>
            </div>
            <div className="desktop-table-card" style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '760px' }}>
                <thead>
                  <tr>
                    <th style={tableTh}>Invoice</th>
                    <th style={tableTh}>Date</th>
                    <th style={tableTh}>Due</th>
                    <th style={tableTh}>Status</th>
                    <th style={{ ...tableTh, textAlign: 'right' }}>Total</th>
                    <th style={{ ...tableTh, textAlign: 'right' }}>Received</th>
                    <th style={{ ...tableTh, textAlign: 'right' }}>Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoices.map((invoice) => {
                    const allocatedAmount = allocatedByInvoice.get(invoice.id) ?? 0
                    const outstandingAmount = Math.max(0, Number(invoice.total_amount) - allocatedAmount)
                    const paymentStatus = resolveInvoicePaymentStatus(Number(invoice.total_amount), allocatedAmount)
                    return (
                      <tr key={invoice.id}>
                        <td style={tableTd}>
                          <Link href={`/accounting/invoices/${invoice.id}`} style={{ color: 'var(--accent-bright)', fontWeight: 900 }}>
                            {invoice.invoice_number ?? invoice.id.slice(0, 8)}
                          </Link>
                        </td>
                        <td style={tableTd}>{invoice.invoice_date}</td>
                        <td style={tableTd}>{invoice.due_date ?? '-'}</td>
                        <td style={tableTd}>
                          <Badge variant={paymentStatusVariant(paymentStatus)} label={paymentStatus} size="sm" />
                        </td>
                        <td style={{ ...tableTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(invoice.total_amount)}</td>
                        <td style={{ ...tableTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(allocatedAmount)}</td>
                        <td style={{ ...tableTd, textAlign: 'right', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{money(outstandingAmount)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {selectedInvoices.length === 0 && (
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                No issued invoices for this customer yet.
              </p>
            )}
          </Card>

          <Card>
            <h2 style={{ margin: '0 0 0.75rem', fontSize: 'var(--text-lg)' }}>Recent Receipts</h2>
            <div style={{ display: 'grid', gap: '0.65rem' }}>
              {selectedReceipts.slice(0, 8).map((receipt) => {
                const allocatedAmount = allocatedByReceipt.get(receipt.id) ?? 0
                const advanceAmount = Math.max(0, Number(receipt.amount) - allocatedAmount)
                return (
                  <div
                    key={receipt.id}
                    style={{
                      display: 'grid',
                      gap: '0.35rem',
                      padding: '0.65rem 0',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                      <strong>{receipt.receipt_number ?? receipt.id.slice(0, 8)}</strong>
                      <Badge variant={receipt.status === 'confirmed' ? 'success' : 'danger'} label={receipt.status} size="sm" />
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                      {receipt.receipt_date} · {receipt.mode.toUpperCase()}{receipt.reference ? ` · ${receipt.reference}` : ''}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.5rem', fontSize: 'var(--text-sm)' }}>
                      <span>Total <strong>{money(receipt.amount)}</strong></span>
                      <span>Linked <strong>{money(allocatedAmount)}</strong></span>
                      <span>Advance <strong>{money(advanceAmount)}</strong></span>
                    </div>
                  </div>
                )
              })}
            </div>
            {selectedReceipts.length === 0 && (
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                No receipts posted for this customer yet.
              </p>
            )}
          </Card>
        </section>
      )}

      <Card>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: 'var(--text-lg)' }}>
          {selectedCustomerId ? 'Ledger Entries' : 'Recent Ledger Entries'}
        </h2>
        <div className="desktop-table-card" style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '920px' }}>
            <thead>
              <tr>
                <th style={tableTh}>Date</th>
                {!selectedCustomerId && <th style={tableTh}>Customer</th>}
                <th style={tableTh}>Type</th>
                <th style={tableTh}>Description</th>
                <th style={{ ...tableTh, textAlign: 'right' }}>Debit</th>
                <th style={{ ...tableTh, textAlign: 'right' }}>Credit</th>
                {selectedCustomerId && <th style={{ ...tableTh, textAlign: 'right' }}>Running</th>}
                <th style={tableTh}>Source</th>
              </tr>
            </thead>
            <tbody>
              {(selectedCustomerId ? runningEntries.map((entry) => entry.row) : entries).map((entry) => {
                const customer = resolveRef(entry.customers)
                const running = selectedCustomerId
                  ? runningEntries.find((candidate) => candidate.row.id === entry.id)?.runningBalance
                  : null
                const invoiceNumber = entry.source_id ? invoiceRefs.get(entry.source_id) : null
                return (
                  <tr key={entry.id}>
                    <td style={tableTd}>{entry.entry_date}</td>
                    {!selectedCustomerId && <td style={{ ...tableTd, fontWeight: 800 }}>{customer?.name ?? 'Unknown customer'}</td>}
                    <td style={tableTd}><Badge variant={entry.entry_type === 'invoice' ? 'warning' : 'success'} label={entry.entry_type} size="sm" /></td>
                    <td style={tableTd}>{entry.description}</td>
                    <td style={{ ...tableTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Number(entry.debit_amount) > 0 ? money(entry.debit_amount) : '-'}</td>
                    <td style={{ ...tableTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Number(entry.credit_amount) > 0 ? money(entry.credit_amount) : '-'}</td>
                    {selectedCustomerId && <td style={{ ...tableTd, textAlign: 'right', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{running === null || running === undefined ? '-' : money(running)}</td>}
                    <td style={tableTd}>
                      {entry.source_type === 'sales_invoice' && entry.source_id ? (
                        <Link href={`/accounting/invoices/${entry.source_id}`} style={{ color: 'var(--accent-bright)', fontWeight: 800 }}>
                          {invoiceNumber ?? entry.source_id.slice(0, 8)}
                        </Link>
                      ) : (
                        entry.source_type
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {entries.length === 0 && (
          <p style={{ margin: '1rem 0 0', color: 'var(--text-secondary)' }}>
            No ledger entries yet. Issued invoices will appear here first; receipts will come in the next accounting step.
          </p>
        )}
      </Card>
    </main>
  )
}
