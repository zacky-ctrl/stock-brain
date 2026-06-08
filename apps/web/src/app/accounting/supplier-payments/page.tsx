import Link from 'next/link'
import {
  calculatePurchasePayables,
  calculateSupplierLedgerSummaries,
  calculateSupplierOutstandingFromBills,
} from '@stock-brain/domain'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { tableTd, tableTh } from '@/lib/ui'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AccountingTabs } from '../AccountingTabs'
import { SupplierPaymentForm } from './SupplierPaymentForm'
import { VoidSupplierPaymentForm } from './VoidSupplierPaymentForm'

type SupplierRow = {
  id: string
  name: string
  entity_name: string | null
}

type LedgerSummaryInputRow = {
  id: string
  supplier_id: string
  entry_date: string
  created_at: string
  debit_amount: number | string
  credit_amount: number | string
}

type PurchaseBillRow = {
  id: string
  supplier_id: string
  purchase_bill_number: string | null
  purchase_date: string
  due_date: string | null
  total_amount: number | string
}

type PaymentAllocationRow = {
  purchase_bill_id: string
  amount_allocated: number | string
  supplier_payments: { status: string } | { status: string }[] | null
}

type SupplierPaymentRow = {
  id: string
  payment_number: string | null
  supplier_id: string
  payment_date: string
  amount: number | string
  mode: string
  reference: string | null
  status: string
  suppliers: { name: string; entity_name: string | null } | { name: string; entity_name: string | null }[] | null
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

export default async function SupplierPaymentsPage() {
  const supabase = createServerSupabaseClient()
  const [
    { data: suppliersRaw, error: suppliersError },
    { data: ledgerEntriesRaw },
    { data: billsRaw },
    { data: paymentsRaw, error: paymentsError },
  ] = await Promise.all([
    supabase
      .from('suppliers')
      .select('id, name, entity_name')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('supplier_ledger_entries')
      .select('id, supplier_id, entry_date, created_at, debit_amount, credit_amount')
      .limit(5000),
    supabase
      .from('purchase_bills')
      .select('id, supplier_id, purchase_bill_number, purchase_date, due_date, total_amount')
      .eq('status', 'confirmed')
      .order('purchase_date', { ascending: true })
      .limit(1000),
    supabase
      .from('supplier_payments')
      .select(`
        id,
        payment_number,
        supplier_id,
        payment_date,
        amount,
        mode,
        reference,
        status,
        suppliers (
          name,
          entity_name
        )
      `)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const suppliers = (suppliersRaw ?? []) as unknown as SupplierRow[]
  const ledgerEntries = (ledgerEntriesRaw ?? []) as unknown as LedgerSummaryInputRow[]
  const confirmedBills = (billsRaw ?? []) as unknown as PurchaseBillRow[]
  const payments = (paymentsRaw ?? []) as unknown as SupplierPaymentRow[]
  const billIds = confirmedBills.map((bill) => bill.id)
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

  const payables = calculatePurchasePayables(
    confirmedBills.map((bill) => ({
      billId: bill.id,
      supplierId: bill.supplier_id,
      billNumber: bill.purchase_bill_number,
      purchaseDate: bill.purchase_date,
      dueDate: bill.due_date,
      totalAmount: Number(bill.total_amount),
      allocatedAmount: allocatedByBill.get(bill.id) ?? 0,
    })),
  )
  const ledgerSummaries = calculateSupplierLedgerSummaries(
    ledgerEntries.map((entry) => ({
      id: entry.id,
      supplierId: entry.supplier_id,
      entryDate: entry.entry_date,
      createdAt: entry.created_at,
      debitAmount: Number(entry.debit_amount),
      creditAmount: Number(entry.credit_amount),
    })),
  )
  const ledgerBalanceBySupplier = new Map(
    ledgerSummaries.map((summary) => [summary.supplierId, summary.balance]),
  )
  const supplierOptions = suppliers.map((supplier) => ({
    ...supplier,
    ledgerBalance: ledgerBalanceBySupplier.get(supplier.id) ?? 0,
    billOutstanding: calculateSupplierOutstandingFromBills(payables, supplier.id),
  }))
  const confirmedPayments = payments.filter((payment) => payment.status === 'confirmed')
  const cashTotal = confirmedPayments
    .filter((payment) => payment.mode === 'cash')
    .reduce((total, payment) => total + Number(payment.amount), 0)
  const bankTotal = confirmedPayments
    .filter((payment) => payment.mode !== 'cash')
    .reduce((total, payment) => total + Number(payment.amount), 0)

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1280px' }}>
      <PageHeader
        title="Supplier Payments"
        subtitle="Pay suppliers and link payments to pending purchase bill numbers."
      />
      <AccountingTabs active="supplier-payments" />

      {(suppliersError || paymentsError) && (
        <p style={{ color: 'var(--danger)', fontWeight: 800 }}>
          {suppliersError?.message ?? paymentsError?.message}
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
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>Total Paid</div>
          <strong style={{ display: 'block', marginTop: '0.35rem', fontSize: 'var(--text-xl)' }}>{money(cashTotal + bankTotal)}</strong>
        </Card>
        <Card padding="sm">
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>Cash</div>
          <strong style={{ display: 'block', marginTop: '0.35rem', fontSize: 'var(--text-xl)' }}>{money(cashTotal)}</strong>
        </Card>
        <Card padding="sm">
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>Bank / UPI / Cheque</div>
          <strong style={{ display: 'block', marginTop: '0.35rem', fontSize: 'var(--text-xl)' }}>{money(bankTotal)}</strong>
        </Card>
      </section>

      <Card style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: 'var(--text-lg)' }}>Post Supplier Payment</h2>
        <SupplierPaymentForm
          suppliers={supplierOptions}
          bills={payables}
          defaultPaymentDate={todayInIndia()}
        />
      </Card>

      <Card>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: 'var(--text-lg)' }}>Recent Supplier Payments</h2>
        <div className="desktop-table-card" style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '880px' }}>
            <thead>
              <tr>
                <th style={tableTh}>Payment</th>
                <th style={tableTh}>Date</th>
                <th style={tableTh}>Supplier</th>
                <th style={tableTh}>Mode</th>
                <th style={tableTh}>Reference</th>
                <th style={tableTh}>Status</th>
                <th style={{ ...tableTh, textAlign: 'right' }}>Amount</th>
                <th style={tableTh}>Action</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => {
                const supplier = resolveRef(payment.suppliers)
                return (
                  <tr key={payment.id}>
                    <td style={{ ...tableTd, fontWeight: 900 }}>{payment.payment_number ?? payment.id.slice(0, 8)}</td>
                    <td style={tableTd}>{payment.payment_date}</td>
                    <td style={{ ...tableTd, fontWeight: 800 }}>{supplier?.name ?? 'Unknown supplier'}</td>
                    <td style={tableTd}>{payment.mode.toUpperCase()}</td>
                    <td style={tableTd}>{payment.reference ?? '-'}</td>
                    <td style={tableTd}><Badge variant={statusVariant(payment.status)} label={payment.status} size="sm" /></td>
                    <td style={{ ...tableTd, textAlign: 'right', fontWeight: 900 }}>{money(payment.amount)}</td>
                    <td style={tableTd}>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Link href={`/accounting/supplier-ledger?supplier=${payment.supplier_id}`}>
                          <Button type="button" size="sm" variant="secondary">Ledger</Button>
                        </Link>
                        <VoidSupplierPaymentForm paymentId={payment.id} disabled={payment.status !== 'confirmed'} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  )
}
