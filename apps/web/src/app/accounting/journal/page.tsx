import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { tableTd, tableTh } from '@/lib/ui'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AccountingTabs } from '../AccountingTabs'

type JournalLineRow = {
  id: string
  debit_amount: number | string
  credit_amount: number | string
  memo: string | null
  customers: { name: string } | { name: string }[] | null
  suppliers: { name: string } | { name: string }[] | null
  accounting_accounts: { code: string; name: string } | { code: string; name: string }[] | null
}

type JournalEntryRow = {
  id: string
  entry_date: string
  source_type: string
  source_id: string | null
  status: string
  memo: string | null
  posted_at: string | null
  created_at: string
  accounting_journal_lines: JournalLineRow[] | null
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

function statusVariant(status: string): 'success' | 'warning' | 'neutral' | 'danger' {
  if (status === 'posted') return 'success'
  if (status === 'draft') return 'warning'
  if (status === 'voided') return 'danger'
  return 'neutral'
}

export default async function JournalPage() {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('accounting_journal_entries')
    .select(`
      id,
      entry_date,
      source_type,
      source_id,
      status,
      memo,
      posted_at,
      created_at,
      accounting_journal_lines (
        id,
        debit_amount,
        credit_amount,
        memo,
        customers (
          name
        ),
        suppliers (
          name
        ),
        accounting_accounts (
          code,
          name
        )
      )
    `)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)

  const entries = (data ?? []) as unknown as JournalEntryRow[]
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

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1280px' }}>
      <PageHeader
        title="Journal"
        subtitle="Posted accounting entries behind invoices and future receipts. Every entry must balance debit and credit."
      />
      <AccountingTabs active="journal" />

      {error && (
        <p style={{ color: 'var(--danger)', fontWeight: 800 }}>
          {error.message}
        </p>
      )}

      <div style={{ display: 'grid', gap: '1rem' }}>
        {entries.map((entry) => {
          const lines = entry.accounting_journal_lines ?? []
          const debitTotal = lines.reduce((total, line) => total + Number(line.debit_amount), 0)
          const creditTotal = lines.reduce((total, line) => total + Number(line.credit_amount), 0)
          const invoiceNumber = entry.source_id ? invoiceRefs.get(entry.source_id) : null
          return (
            <Card key={entry.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>{entry.memo ?? entry.source_type}</h2>
                    <Badge variant={statusVariant(entry.status)} label={entry.status} size="sm" />
                  </div>
                  <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                    {entry.entry_date}
                    {entry.source_type === 'sales_invoice' && entry.source_id ? (
                      <>
                        {' · '}
                        <Link href={`/accounting/invoices/${entry.source_id}`} style={{ color: 'var(--accent-bright)', fontWeight: 800 }}>
                          {invoiceNumber ?? entry.source_id.slice(0, 8)}
                        </Link>
                      </>
                    ) : ` · ${entry.source_type}`}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: debitTotal === creditTotal && debitTotal > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 900 }}>
                    {debitTotal === creditTotal && debitTotal > 0 ? 'Balanced' : 'Needs review'}
                  </div>
                  <div style={{ marginTop: '0.25rem', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                    Dr {money(debitTotal)} · Cr {money(creditTotal)}
                  </div>
                </div>
              </div>
              <div className="desktop-table-card" style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '760px' }}>
                  <thead>
                    <tr>
                      <th style={tableTh}>Account</th>
                      <th style={tableTh}>Party</th>
                      <th style={tableTh}>Memo</th>
                      <th style={{ ...tableTh, textAlign: 'right' }}>Debit</th>
                      <th style={{ ...tableTh, textAlign: 'right' }}>Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const account = resolveRef(line.accounting_accounts)
                      const customer = resolveRef(line.customers)
                      const supplier = resolveRef(line.suppliers)
                      return (
                        <tr key={line.id}>
                          <td style={{ ...tableTd, fontWeight: 800 }}>
                            {account ? `${account.code} — ${account.name}` : '-'}
                          </td>
                          <td style={tableTd}>{customer?.name ?? supplier?.name ?? '-'}</td>
                          <td style={tableTd}>{line.memo ?? '-'}</td>
                          <td style={{ ...tableTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {Number(line.debit_amount) > 0 ? money(line.debit_amount) : '-'}
                          </td>
                          <td style={{ ...tableTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {Number(line.credit_amount) > 0 ? money(line.credit_amount) : '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )
        })}
      </div>

      {entries.length === 0 && !error && (
        <Card>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            No journal entries yet. Issuing an invoice will post the first accounting journal.
          </p>
        </Card>
      )}
    </main>
  )
}
