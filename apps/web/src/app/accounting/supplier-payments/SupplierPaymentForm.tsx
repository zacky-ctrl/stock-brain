'use client'

import { useActionState, useMemo, useState } from 'react'
import {
  calculateAutoSupplierPaymentAllocations,
  calculateSupplierPaymentAllocationPlan,
  type SupplierPaymentAllocationInput,
} from '@stock-brain/domain'
import { Button } from '@/components/ui/Button'
import type { ActionState } from '@/lib/masters'
import { postSupplierPaymentAction } from './actions'

type SupplierOption = {
  id: string
  name: string
  entity_name: string | null
  ledgerBalance: number
  billOutstanding: number
}

type BillOption = {
  billId: string
  supplierId: string
  billNumber: string | null
  purchaseDate: string
  dueDate: string | null
  totalAmount: number
  allocatedAmount: number
  outstandingAmount: number
}

type Props = {
  suppliers: SupplierOption[]
  bills: BillOption[]
  defaultPaymentDate: string
}

const fieldStyle = {
  display: 'grid',
  gap: '0.35rem',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-secondary)',
  fontWeight: 700,
} as const

const inputStyle = {
  width: '100%',
  minHeight: '2.5rem',
} as const

function money(value: number): string {
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function balanceLabel(value: number): string {
  if (value > 0) return `${money(value)} payable`
  if (value < 0) return `${money(Math.abs(value))} advance`
  return '0.00 clear'
}

export function SupplierPaymentForm({ suppliers, bills, defaultPaymentDate }: Props) {
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({})
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    postSupplierPaymentAction,
    null,
  )
  const selectedSupplier = suppliers.find((supplier) => supplier.id === selectedSupplierId) ?? null
  const supplierBills = useMemo(
    () => bills.filter((bill) => bill.supplierId === selectedSupplierId),
    [bills, selectedSupplierId],
  )
  const amountNumber = Number(paymentAmount || 0)
  const paymentAmountIsValid = Number.isFinite(amountNumber) && amountNumber > 0
  const allocationInputs: SupplierPaymentAllocationInput[] = supplierBills.map((bill) => ({
    billId: bill.billId,
    supplierId: bill.supplierId,
    outstandingAmount: bill.outstandingAmount,
    requestedAmount: Number(allocationAmounts[bill.billId] || 0),
  }))
  const allocationPlan = calculateSupplierPaymentAllocationPlan(
    paymentAmountIsValid ? amountNumber : 0,
    selectedSupplierId,
    allocationInputs,
  )

  function updateSupplier(supplierId: string): void {
    setSelectedSupplierId(supplierId)
    setAllocationAmounts({})
  }

  function updateAllocation(billId: string, amount: string): void {
    setAllocationAmounts((current) => ({
      ...current,
      [billId]: amount,
    }))
  }

  function autoAllocate(): void {
    if (!paymentAmountIsValid || !selectedSupplierId) return
    const autoAllocations = calculateAutoSupplierPaymentAllocations(
      amountNumber,
      selectedSupplierId,
      supplierBills,
    )
    const nextAmounts: Record<string, string> = {}
    for (const bill of supplierBills) {
      const amount = autoAllocations[bill.billId]
      nextAmounts[bill.billId] = amount ? String(amount) : ''
    }
    setAllocationAmounts(nextAmounts)
  }

  function clearAllocations(): void {
    setAllocationAmounts({})
  }

  return (
    <form action={formAction} style={{ display: 'grid', gap: '0.9rem' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 1.5fr) repeat(3, minmax(140px, 1fr))',
          gap: '0.75rem',
        }}
      >
        <label style={fieldStyle}>
          Supplier
          <select
            name="supplier_id"
            required
            value={selectedSupplierId}
            onChange={(event) => updateSupplier(event.target.value)}
            style={inputStyle}
          >
            <option value="">Select supplier</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}{supplier.entity_name ? ` — ${supplier.entity_name}` : ''} · {balanceLabel(supplier.ledgerBalance)}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          Payment Date
          <input name="payment_date" type="date" defaultValue={defaultPaymentDate} required style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Amount
          <input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={paymentAmount}
            onChange={(event) => setPaymentAmount(event.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={fieldStyle}>
          Mode
          <select name="mode" required defaultValue="bank" style={inputStyle}>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="upi">UPI</option>
            <option value="cheque">Cheque</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 0.7fr) minmax(240px, 1.3fr)', gap: '0.75rem' }}>
        <label style={fieldStyle}>
          Reference
          <input name="reference" placeholder="UTR / cheque / note" style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Notes
          <input name="notes" placeholder="Optional payment note" style={inputStyle} />
        </label>
      </div>

      {selectedSupplier && (
        <section
          style={{
            display: 'grid',
            gap: '0.75rem',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '1rem',
            background: 'var(--bg-elevated)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '0.75rem',
            }}
          >
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Ledger balance
              </div>
              <strong style={{ display: 'block', marginTop: '0.25rem', fontSize: 'var(--text-lg)' }}>
                {balanceLabel(selectedSupplier.ledgerBalance)}
              </strong>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Pending bills
              </div>
              <strong style={{ display: 'block', marginTop: '0.25rem', fontSize: 'var(--text-lg)' }}>
                {money(selectedSupplier.billOutstanding)}
              </strong>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Payment treatment
              </div>
              <strong style={{ display: 'block', marginTop: '0.25rem', fontSize: 'var(--text-lg)' }}>
                {allocationPlan.unallocatedAmount > 0
                  ? `${money(allocationPlan.unallocatedAmount)} advance`
                  : 'Fully linked'}
              </strong>
            </div>
          </div>

          {allocationPlan.overAllocatedAmount > 0 && (
            <p style={{ margin: 0, color: 'var(--danger)', fontSize: 'var(--text-sm)', fontWeight: 800 }}>
              Allocations exceed payment amount by {money(allocationPlan.overAllocatedAmount)}.
            </p>
          )}

          {supplierBills.length > 0 ? (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <strong>Link this payment to pending purchase bills</strong>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button type="button" size="sm" variant="secondary" onClick={autoAllocate} disabled={!paymentAmountIsValid}>
                    Auto allocate
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={clearAllocations}>
                    Clear
                  </Button>
                </div>
              </div>
              {supplierBills.map((bill) => (
                <div
                  key={bill.billId}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(180px, 1fr) minmax(120px, 0.5fr) minmax(180px, 0.7fr)',
                    gap: '0.75rem',
                    alignItems: 'center',
                    padding: '0.65rem',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-surface)',
                  }}
                >
                  <input type="hidden" name="allocation_bill_id" value={bill.billId} />
                  <div>
                    <div style={{ fontWeight: 900 }}>{bill.billNumber ?? bill.billId.slice(0, 8)}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
                      {bill.purchaseDate}{bill.dueDate ? ` · Due ${bill.dueDate}` : ''}
                    </div>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', fontWeight: 800 }}>
                    Pending {money(bill.outstandingAmount)}
                  </div>
                  <label style={{ display: 'grid', gap: '0.25rem', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontWeight: 800 }}>
                    Allocate
                    <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.4rem' }}>
                      <input
                        name={`allocation_amount_${bill.billId}`}
                        type="number"
                        min="0"
                        max={bill.outstandingAmount}
                        step="0.01"
                        value={allocationAmounts[bill.billId] ?? ''}
                        onChange={(event) => updateAllocation(bill.billId, event.target.value)}
                        style={inputStyle}
                      />
                      <Button type="button" size="sm" variant="secondary" onClick={() => updateAllocation(bill.billId, String(bill.outstandingAmount))}>
                        Full
                      </Button>
                    </span>
                  </label>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', fontWeight: 700 }}>
              This supplier has no pending confirmed bills. The payment will be recorded as advance/unallocated debit.
            </p>
          )}
        </section>
      )}

      {state && 'error' in state && <p style={{ margin: 0, color: 'var(--danger)', fontWeight: 800 }}>{state.error}</p>}
      {state && 'success' in state && <p style={{ margin: 0, color: 'var(--success)', fontWeight: 800 }}>{state.success}</p>}
      <div>
        <Button type="submit" variant="primary" loading={isPending}>
          Post Supplier Payment
        </Button>
      </div>
    </form>
  )
}
