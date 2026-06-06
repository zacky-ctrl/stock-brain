import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { tableTd, tableTh } from '@/lib/ui'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AccountingTabs } from '../AccountingTabs'
import { ReceiptForm } from './ReceiptForm'

type CustomerRow = {
  id: string
  name: string
  entity_name: string | null
}

type ReceiptRow = {
  id: string
  receipt_number: string | null
  customer_id: string
  receipt_date: string
  amount: number | string
  mode: string
  reference: string | null
  notes: string | null
  status: string
  accounting_journal_entry_id: string | null
  created_at: string
  customers: { name: string; entity_name: string | null } | { name: string; entity_name: string | null }[] | null
}

function money(value: number | string): string {
  return Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function todayInIndia(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function resolveRef<T>(raw: T | T[] | null | undefined): T | null {
  if (!raw) return null
  return Array.isArray(raw) ? raw[0] ?? null : raw
}

function statusVariant(status: string): 'success' | 'warning' | 'neutral' | 'danger' {
  if (status === 'confirmed') return 'success'
  if (status === 'voided') return 'danger'
  return 'neutral'
}

export default async function ReceiptsPage() {
  const supabase = createServerSupabaseClient()

  const [{ data: customersRaw, error: customersError }, { data: receiptsRaw, error: receiptsError }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, entity_name')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('customer_receipts')
      .select(`
        id,
        receipt_number,
        customer_id,
        receipt_date,
        amount,
        mode,
        reference,
        notes,
        status,
        accounting_journal_entry_id,
        created_at,
        customers (
          name,
          entity_name
        )
      `)
      .order('receipt_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const customers = (customersRaw ?? []) as unknown as CustomerRow[]
  const receipts = (receiptsRaw ?? []) as unknown as ReceiptRow[]
  const confirmedReceipts = receipts.filter((receipt) => receipt.status === 'confirmed')
  const cashTotal = confirmedReceipts
    .filter((receipt) => receipt.mode === 'cash')
    .reduce((total, receipt) => total + Number(receipt.amount), 0)
  const bankTotal = confirmedReceipts
    .filter((receipt) => receipt.mode !== 'cash')
    .reduce((total, receipt) => total + Number(receipt.amount), 0)
  const totalReceipts = cashTotal + bankTotal

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1280px' }}>
      <PageHeader
        title="Receipts"
        subtitle="Record customer payments. Posting a receipt credits customer ledger and posts the accounting journal."
      />
      <AccountingTabs active="receipts" />

      {(customersError || receiptsError) && (
        <p style={{ color: 'var(--danger)', fontWeight: 800 }}>
          {customersError?.message ?? receiptsError?.message}
        </p>
      )}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '0.85rem',
          marginBottom: '1rem',
        }}
      >
        <Card padding="sm">
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>Total Received</div>
          <div style={{ marginTop: '0.4rem', fontSize: 'var(--text-xl)', fontWeight: 900 }}>{money(totalReceipts)}</div>
        </Card>
        <Card padding="sm">
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>Cash</div>
          <div style={{ marginTop: '0.4rem', fontSize: 'var(--text-xl)', fontWeight: 900 }}>{money(cashTotal)}</div>
        </Card>
        <Card padding="sm">
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>Bank / UPI / Cheque</div>
          <div style={{ marginTop: '0.4rem', fontSize: 'var(--text-xl)', fontWeight: 900 }}>{money(bankTotal)}</div>
        </Card>
      </section>

      <Card style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: 'var(--text-lg)' }}>Post Customer Receipt</h2>
        <ReceiptForm customers={customers} defaultReceiptDate={todayInIndia()} />
      </Card>

      <Card>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: 'var(--text-lg)' }}>Recent Receipts</h2>
        <div className="desktop-table-card" style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '880px' }}>
            <thead>
              <tr>
                <th style={tableTh}>Receipt</th>
                <th style={tableTh}>Date</th>
                <th style={tableTh}>Customer</th>
                <th style={tableTh}>Mode</th>
                <th style={tableTh}>Reference</th>
                <th style={tableTh}>Status</th>
                <th style={{ ...tableTh, textAlign: 'right' }}>Amount</th>
                <th style={tableTh}>Action</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => {
                const customer = resolveRef(receipt.customers)
                return (
                  <tr key={receipt.id}>
                    <td style={{ ...tableTd, fontWeight: 900 }}>{receipt.receipt_number ?? receipt.id.slice(0, 8)}</td>
                    <td style={tableTd}>{receipt.receipt_date}</td>
                    <td style={{ ...tableTd, fontWeight: 800 }}>{customer?.name ?? 'Unknown customer'}</td>
                    <td style={tableTd}>{receipt.mode.toUpperCase()}</td>
                    <td style={tableTd}>{receipt.reference ?? '-'}</td>
                    <td style={tableTd}>
                      <Badge variant={statusVariant(receipt.status)} label={receipt.status} size="sm" />
                    </td>
                    <td style={{ ...tableTd, textAlign: 'right', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{money(receipt.amount)}</td>
                    <td style={tableTd}>
                      <Link href={`/accounting/ledger?customer=${receipt.customer_id}`}>
                        <Button type="button" size="sm" variant="secondary">Ledger</Button>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="mobile-card-list" style={{ marginTop: '1rem' }}>
          {receipts.map((receipt) => {
            const customer = resolveRef(receipt.customers)
            return (
              <Card key={receipt.id} className="mobile-data-card" padding="sm">
                <div className="mobile-card-top">
                  <div style={{ minWidth: 0 }}>
                    <div className="mobile-card-title">{customer?.name ?? 'Unknown customer'}</div>
                    <div className="mobile-card-meta">{receipt.receipt_number ?? receipt.id.slice(0, 8)} · {receipt.receipt_date}</div>
                  </div>
                  <Badge variant={statusVariant(receipt.status)} label={receipt.status} size="sm" />
                </div>
                <div className="mobile-card-grid">
                  <div><span className="mobile-card-label">Amount</span><strong className="mobile-card-value">{money(receipt.amount)}</strong></div>
                  <div><span className="mobile-card-label">Mode</span><strong className="mobile-card-value">{receipt.mode.toUpperCase()}</strong></div>
                  <div><span className="mobile-card-label">Ref</span><strong className="mobile-card-value">{receipt.reference ?? '-'}</strong></div>
                </div>
                <div className="mobile-card-actions">
                  <Link href={`/accounting/ledger?customer=${receipt.customer_id}`}>
                    <Button type="button" size="sm" variant="secondary">Ledger</Button>
                  </Link>
                </div>
              </Card>
            )
          })}
        </div>

        {receipts.length === 0 && (
          <p style={{ margin: '1rem 0 0', color: 'var(--text-secondary)' }}>
            No receipts yet.
          </p>
        )}
      </Card>
    </main>
  )
}
