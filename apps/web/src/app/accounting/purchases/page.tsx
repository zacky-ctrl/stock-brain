import Link from 'next/link'
import {
  resolvePurchasePaymentStatus,
  type PurchasePaymentStatus,
} from '@stock-brain/domain'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { tableTd, tableTh } from '@/lib/ui'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AccountingTabs } from '../AccountingTabs'
import { PurchaseBillForm } from './PurchaseBillForm'

type SupplierRow = {
  id: string
  name: string
  entity_name: string | null
  payment_terms_days: number
}

type PurchaseBillRow = {
  id: string
  purchase_bill_number: string | null
  supplier_bill_number: string | null
  supplier_name_snapshot: string
  purchase_date: string
  due_date: string | null
  status: string
  goods_amount: number | string
  transport_charges: number | string
  total_amount: number | string
  stock_impact_status: string
  created_at: string
}

type PaymentAllocationRow = {
  purchase_bill_id: string
  amount_allocated: number | string
  supplier_payments: { status: string } | { status: string }[] | null
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
  if (status === 'draft') return 'warning'
  if (status === 'voided') return 'danger'
  return 'neutral'
}

function paymentStatusVariant(status: PurchasePaymentStatus): 'success' | 'warning' | 'neutral' | 'danger' {
  if (status === 'paid') return 'success'
  if (status === 'partial') return 'warning'
  if (status === 'overpaid') return 'danger'
  return 'neutral'
}

export default async function PurchasesPage() {
  const supabase = createServerSupabaseClient()
  const [
    { data: suppliersRaw, error: suppliersError },
    { data: billsRaw, error: billsError },
  ] = await Promise.all([
    supabase
      .from('suppliers')
      .select('id, name, entity_name, payment_terms_days')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('purchase_bills')
      .select('id, purchase_bill_number, supplier_bill_number, supplier_name_snapshot, purchase_date, due_date, status, goods_amount, transport_charges, total_amount, stock_impact_status, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const suppliers = (suppliersRaw ?? []) as unknown as SupplierRow[]
  const bills = (billsRaw ?? []) as unknown as PurchaseBillRow[]
  const billIds = bills.map((bill) => bill.id)
  const { data: allocationsRaw } = billIds.length > 0
    ? await supabase
        .from('purchase_bill_payment_allocations')
        .select(`
          purchase_bill_id,
          amount_allocated,
          supplier_payments (
            status
          )
        `)
        .in('purchase_bill_id', billIds)
    : { data: [] }

  const allocatedByBill = new Map<string, number>()
  for (const allocation of (allocationsRaw ?? []) as unknown as PaymentAllocationRow[]) {
    const payment = resolveRef(allocation.supplier_payments)
    if (payment?.status !== 'confirmed') continue
    allocatedByBill.set(
      allocation.purchase_bill_id,
      (allocatedByBill.get(allocation.purchase_bill_id) ?? 0) + Number(allocation.amount_allocated),
    )
  }

  const draftTotal = bills
    .filter((bill) => bill.status === 'draft')
    .reduce((total, bill) => total + Number(bill.total_amount), 0)
  const confirmedTotal = bills
    .filter((bill) => bill.status === 'confirmed')
    .reduce((total, bill) => total + Number(bill.total_amount), 0)
  const pendingStockCount = bills.filter((bill) => bill.stock_impact_status === 'pending').length

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1400px' }}>
      <PageHeader
        title="Purchases"
        subtitle="Record supplier bills for velvet, purchased stock, packaging material, and outside expenses."
      />
      <AccountingTabs active="purchases" />

      {(suppliersError || billsError) && (
        <p style={{ color: 'var(--danger)', fontWeight: 800 }}>
          {suppliersError?.message ?? billsError?.message}
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
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Draft Bills</div>
          <strong style={{ display: 'block', marginTop: '0.35rem', fontSize: 'var(--text-xl)' }}>{money(draftTotal)}</strong>
        </Card>
        <Card padding="sm">
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Confirmed</div>
          <strong style={{ display: 'block', marginTop: '0.35rem', fontSize: 'var(--text-xl)' }}>{money(confirmedTotal)}</strong>
        </Card>
        <Card padding="sm">
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pending Stock Impact</div>
          <strong style={{ display: 'block', marginTop: '0.35rem', fontSize: 'var(--text-xl)' }}>{pendingStockCount}</strong>
        </Card>
        <Card padding="sm">
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Suppliers</div>
          <strong style={{ display: 'block', marginTop: '0.35rem', fontSize: 'var(--text-xl)' }}>{suppliers.length}</strong>
        </Card>
      </section>

      <Card style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: 'var(--text-lg)' }}>Create Purchase Bill</h2>
        {suppliers.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--warning)', fontWeight: 800 }}>
            Add a supplier before creating purchase bills.
          </p>
        ) : (
          <PurchaseBillForm suppliers={suppliers} defaultPurchaseDate={todayInIndia()} />
        )}
      </Card>

      <Card>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: 'var(--text-lg)' }}>Recent Purchase Bills</h2>
        <div className="desktop-table-card" style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '960px' }}>
            <thead>
              <tr>
                <th style={tableTh}>Bill</th>
                <th style={tableTh}>Supplier</th>
                <th style={tableTh}>Date</th>
                <th style={tableTh}>Due</th>
                <th style={tableTh}>Status</th>
                <th style={tableTh}>Stock</th>
                <th style={{ ...tableTh, textAlign: 'right' }}>Goods</th>
                <th style={{ ...tableTh, textAlign: 'right' }}>Total</th>
                <th style={tableTh}>Payment</th>
                <th style={tableTh}>Action</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => {
                const allocated = allocatedByBill.get(bill.id) ?? 0
                const paymentStatus = bill.status === 'confirmed'
                  ? resolvePurchasePaymentStatus(Number(bill.total_amount), allocated)
                  : null
                return (
                  <tr key={bill.id}>
                    <td style={tableTd}>
                      <Link href={`/accounting/purchases/${bill.id}`} style={{ color: 'var(--accent-bright)', fontWeight: 900 }}>
                        {bill.purchase_bill_number ?? 'Draft'}
                      </Link>
                      {bill.supplier_bill_number && (
                        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{bill.supplier_bill_number}</div>
                      )}
                    </td>
                    <td style={{ ...tableTd, fontWeight: 800 }}>{bill.supplier_name_snapshot}</td>
                    <td style={tableTd}>{bill.purchase_date}</td>
                    <td style={tableTd}>{bill.due_date ?? '-'}</td>
                    <td style={tableTd}><Badge variant={statusVariant(bill.status)} label={bill.status} size="sm" /></td>
                    <td style={tableTd}><Badge variant={bill.stock_impact_status === 'pending' ? 'warning' : 'neutral'} label={bill.stock_impact_status} size="sm" /></td>
                    <td style={{ ...tableTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(bill.goods_amount)}</td>
                    <td style={{ ...tableTd, textAlign: 'right', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{money(bill.total_amount)}</td>
                    <td style={tableTd}>{paymentStatus ? <Badge variant={paymentStatusVariant(paymentStatus)} label={paymentStatus} size="sm" /> : '-'}</td>
                    <td style={tableTd}>
                      <Link href={`/accounting/purchases/${bill.id}`}>
                        <Button type="button" size="sm" variant="secondary">Open</Button>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {bills.length === 0 && (
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>No purchase bills yet.</p>
        )}
      </Card>
    </main>
  )
}
