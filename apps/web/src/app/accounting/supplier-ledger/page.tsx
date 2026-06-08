import Link from 'next/link'
import {
  calculateSupplierLedgerSummaries,
  calculateSupplierRunningLedger,
} from '@stock-brain/domain'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { selectStyle, tableTd, tableTh } from '@/lib/ui'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AccountingTabs } from '../AccountingTabs'

type SearchParams = {
  supplier?: string
}

type SupplierRow = {
  id: string
  name: string
  entity_name: string | null
}

type LedgerEntryRow = {
  id: string
  supplier_id: string
  entry_date: string
  entry_type: string
  source_type: string
  source_id: string | null
  debit_amount: number | string
  credit_amount: number | string
  description: string
  accounting_journal_entry_id: string | null
  created_at: string
  suppliers: { name: string; entity_name: string | null } | { name: string; entity_name: string | null }[] | null
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

function balanceLabel(balance: number): string {
  if (balance > 0) return `${money(balance)} payable`
  if (balance < 0) return `${money(Math.abs(balance))} advance`
  return '0.00 clear'
}

export default async function SupplierLedgerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { supplier: selectedSupplierId } = await searchParams
  const supabase = createServerSupabaseClient()
  const [{ data: suppliersRaw }, { data: allEntriesRaw, error: allEntriesError }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('id, name, entity_name')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('supplier_ledger_entries')
      .select('id, supplier_id, entry_date, created_at, debit_amount, credit_amount')
      .order('entry_date', { ascending: false })
      .limit(5000),
  ])

  const suppliers = (suppliersRaw ?? []) as unknown as SupplierRow[]
  const allEntries = (allEntriesRaw ?? []) as unknown as Array<{
    id: string
    supplier_id: string
    entry_date: string
    created_at: string
    debit_amount: number | string
    credit_amount: number | string
  }>

  let ledgerQuery = supabase
    .from('supplier_ledger_entries')
    .select(`
      id,
      supplier_id,
      entry_date,
      entry_type,
      source_type,
      source_id,
      debit_amount,
      credit_amount,
      description,
      accounting_journal_entry_id,
      created_at,
      suppliers (
        name,
        entity_name
      )
    `)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(250)

  if (selectedSupplierId) {
    ledgerQuery = ledgerQuery.eq('supplier_id', selectedSupplierId)
  }

  const { data: entriesRaw, error: entriesError } = await ledgerQuery
  const entries = (entriesRaw ?? []) as unknown as LedgerEntryRow[]

  const summaries = calculateSupplierLedgerSummaries(
    allEntries.map((entry) => ({
      id: entry.id,
      supplierId: entry.supplier_id,
      entryDate: entry.entry_date,
      createdAt: entry.created_at,
      debitAmount: Number(entry.debit_amount),
      creditAmount: Number(entry.credit_amount),
    })),
  )
  const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]))
  const payableTotal = summaries
    .filter((summary) => summary.balance > 0)
    .reduce((total, summary) => total + summary.balance, 0)
  const advanceTotal = summaries
    .filter((summary) => summary.balance < 0)
    .reduce((total, summary) => total + Math.abs(summary.balance), 0)
  const netPayable = payableTotal - advanceTotal
  const runningEntries = selectedSupplierId
    ? calculateSupplierRunningLedger(entries.map((entry) => ({
        id: entry.id,
        supplierId: entry.supplier_id,
        entryDate: entry.entry_date,
        createdAt: entry.created_at,
        debitAmount: Number(entry.debit_amount),
        creditAmount: Number(entry.credit_amount),
        row: entry,
      }))).reverse()
    : []

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1280px' }}>
      <PageHeader
        title="Supplier Ledger"
        subtitle="Purchase bills credit suppliers; supplier payments debit them."
      />
      <AccountingTabs active="supplier-ledger" />

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
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>Payable</div>
          <strong style={{ display: 'block', marginTop: '0.35rem', fontSize: 'var(--text-xl)' }}>{money(payableTotal)}</strong>
        </Card>
        <Card padding="sm">
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>Advance</div>
          <strong style={{ display: 'block', marginTop: '0.35rem', fontSize: 'var(--text-xl)' }}>{money(advanceTotal)}</strong>
        </Card>
        <Card padding="sm">
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>Net</div>
          <strong style={{ display: 'block', marginTop: '0.35rem', fontSize: 'var(--text-xl)' }}>{money(netPayable)}</strong>
        </Card>
        <Card padding="sm">
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>Suppliers With Balance</div>
          <strong style={{ display: 'block', marginTop: '0.35rem', fontSize: 'var(--text-xl)' }}>{summaries.filter((summary) => summary.balance !== 0).length}</strong>
        </Card>
      </section>

      <Card padding="sm" style={{ marginBottom: '1rem' }}>
        <form style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: '0.3rem', minWidth: '260px', flex: '1 1 260px', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Supplier
            <select name="supplier" defaultValue={selectedSupplierId ?? ''} style={selectStyle}>
              <option value="">All suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}{supplier.entity_name ? ` — ${supplier.entity_name}` : ''}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="primary">Apply</Button>
        </form>
      </Card>

      {!selectedSupplierId && (
        <Card>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: 'var(--text-lg)' }}>Supplier Balances</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '760px' }}>
              <thead>
                <tr>
                  <th style={tableTh}>Supplier</th>
                  <th style={{ ...tableTh, textAlign: 'right' }}>Debit</th>
                  <th style={{ ...tableTh, textAlign: 'right' }}>Credit</th>
                  <th style={{ ...tableTh, textAlign: 'right' }}>Balance</th>
                  <th style={tableTh}>Action</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((summary) => {
                  const supplier = supplierById.get(summary.supplierId)
                  return (
                    <tr key={summary.supplierId}>
                      <td style={{ ...tableTd, fontWeight: 900 }}>{supplier?.name ?? 'Unknown supplier'}</td>
                      <td style={{ ...tableTd, textAlign: 'right' }}>{money(summary.debitTotal)}</td>
                      <td style={{ ...tableTd, textAlign: 'right' }}>{money(summary.creditTotal)}</td>
                      <td style={{ ...tableTd, textAlign: 'right', fontWeight: 900 }}>{balanceLabel(summary.balance)}</td>
                      <td style={tableTd}>
                        <Link href={`/accounting/supplier-ledger?supplier=${summary.supplierId}`}>
                          <Button type="button" size="sm" variant="secondary">Open</Button>
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {selectedSupplierId && (
        <Card>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: 'var(--text-lg)' }}>
            Ledger Detail — {supplierById.get(selectedSupplierId)?.name ?? 'Supplier'}
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '900px' }}>
              <thead>
                <tr>
                  <th style={tableTh}>Date</th>
                  <th style={tableTh}>Type</th>
                  <th style={tableTh}>Description</th>
                  <th style={{ ...tableTh, textAlign: 'right' }}>Debit</th>
                  <th style={{ ...tableTh, textAlign: 'right' }}>Credit</th>
                  <th style={{ ...tableTh, textAlign: 'right' }}>Running</th>
                </tr>
              </thead>
              <tbody>
                {runningEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td style={tableTd}>{entry.row.entry_date}</td>
                    <td style={tableTd}>{entry.row.entry_type}</td>
                    <td style={tableTd}>{entry.row.description}</td>
                    <td style={{ ...tableTd, textAlign: 'right' }}>{entry.debitAmount > 0 ? money(entry.debitAmount) : '-'}</td>
                    <td style={{ ...tableTd, textAlign: 'right' }}>{entry.creditAmount > 0 ? money(entry.creditAmount) : '-'}</td>
                    <td style={{ ...tableTd, textAlign: 'right', fontWeight: 900 }}>{balanceLabel(entry.runningBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </main>
  )
}
