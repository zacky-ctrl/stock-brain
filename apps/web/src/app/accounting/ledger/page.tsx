import Link from 'next/link'
import { calculateCustomerLedgerSummaries, calculateCustomerRunningLedger } from '@stock-brain/domain'
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
