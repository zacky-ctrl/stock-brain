'use client'

import { useActionState, useMemo, useState } from 'react'
import { Banknote } from 'lucide-react'
import {
  calculateAutoReceiptAllocations,
  calculateReceiptAllocationPlan,
  type ReceiptAllocationInput,
} from '@stock-brain/domain'
import { Button } from '@/components/ui/Button'
import type { ActionState } from '@/lib/masters'
import { postCustomerReceiptAction } from './actions'

type CustomerOption = {
  id: string
  name: string
  entity_name: string | null
  ledgerBalance: number
  invoiceOutstanding: number
}

type InvoiceOption = {
  invoiceId: string
  customerId: string
  invoiceNumber: string | null
  invoiceDate: string
  dueDate: string | null
  totalAmount: number
  allocatedAmount: number
  outstandingAmount: number
}

type Props = {
  customers: CustomerOption[]
  invoices: InvoiceOption[]
  defaultReceiptDate: string
  initialCustomerId?: string
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
  if (value > 0) return `${money(value)} receivable`
  if (value < 0) return `${money(Math.abs(value))} advance`
  return '0.00 clear'
}

export function ReceiptForm({ customers, invoices, defaultReceiptDate, initialCustomerId }: Props) {
  const [selectedCustomerId, setSelectedCustomerId] = useState(() => initialCustomerId ?? '')
  const [receiptAmount, setReceiptAmount] = useState('')
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({})
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    postCustomerReceiptAction,
    null,
  )
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null
  const customerInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.customerId === selectedCustomerId),
    [invoices, selectedCustomerId],
  )
  const amountNumber = Number(receiptAmount || 0)
  const receiptAmountIsValid = Number.isFinite(amountNumber) && amountNumber > 0
  const allocationInputs: ReceiptAllocationInput[] = customerInvoices.map((invoice) => ({
    invoiceId: invoice.invoiceId,
    customerId: invoice.customerId,
    outstandingAmount: invoice.outstandingAmount,
    requestedAmount: Number(allocationAmounts[invoice.invoiceId] || 0),
  }))
  const allocationPlan = calculateReceiptAllocationPlan(
    receiptAmountIsValid ? amountNumber : 0,
    selectedCustomerId,
    allocationInputs,
  )
  const pendingAfterAllocation = selectedCustomer
    ? Math.max(0, selectedCustomer.invoiceOutstanding - allocationPlan.allocatedAmount)
    : 0

  function updateCustomer(customerId: string): void {
    setSelectedCustomerId(customerId)
    setAllocationAmounts({})
  }

  function updateAllocation(invoiceId: string, amount: string): void {
    setAllocationAmounts((current) => ({
      ...current,
      [invoiceId]: amount,
    }))
  }

  function setInvoiceFullAmount(invoice: InvoiceOption): void {
    updateAllocation(invoice.invoiceId, String(invoice.outstandingAmount))
  }

  function autoAllocate(): void {
    if (!receiptAmountIsValid || !selectedCustomerId) return
    const autoAllocations = calculateAutoReceiptAllocations(
      amountNumber,
      selectedCustomerId,
      customerInvoices,
    )
    const nextAmounts: Record<string, string> = {}
    for (const invoice of customerInvoices) {
      const amount = autoAllocations[invoice.invoiceId]
      nextAmounts[invoice.invoiceId] = amount ? String(amount) : ''
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
          Customer
          <select
            name="customer_id"
            required
            value={selectedCustomerId}
            onChange={(event) => updateCustomer(event.target.value)}
            style={inputStyle}
          >
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}{customer.entity_name ? ` — ${customer.entity_name}` : ''} · {balanceLabel(customer.ledgerBalance)}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          Receipt Date
          <input name="receipt_date" type="date" defaultValue={defaultReceiptDate} required style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Amount
          <input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            required
            value={receiptAmount}
            onChange={(event) => setReceiptAmount(event.target.value)}
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
          <input name="notes" placeholder="Optional receipt note" style={inputStyle} />
        </label>
      </div>
      {selectedCustomer && (
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
                {balanceLabel(selectedCustomer.ledgerBalance)}
              </strong>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Pending invoices
              </div>
              <strong style={{ display: 'block', marginTop: '0.25rem', fontSize: 'var(--text-lg)' }}>
                {money(selectedCustomer.invoiceOutstanding)}
              </strong>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Receipt treatment
              </div>
              <strong style={{ display: 'block', marginTop: '0.25rem', fontSize: 'var(--text-lg)' }}>
                {allocationPlan.unallocatedAmount > 0
                  ? `${money(allocationPlan.unallocatedAmount)} advance`
                  : 'Fully linked'}
              </strong>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: '0.75rem',
              padding: '0.75rem',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-surface)',
            }}
          >
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Receipt amount
              </div>
              <strong>{money(receiptAmountIsValid ? amountNumber : 0)}</strong>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Linked
              </div>
              <strong>{money(allocationPlan.allocatedAmount)}</strong>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Still pending
              </div>
              <strong>{money(pendingAfterAllocation)}</strong>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Advance
              </div>
              <strong>{money(allocationPlan.unallocatedAmount)}</strong>
            </div>
          </div>

          {allocationPlan.overAllocatedAmount > 0 && (
            <p style={{ margin: 0, color: 'var(--danger)', fontSize: 'var(--text-sm)', fontWeight: 800 }}>
              Allocations exceed receipt amount by {money(allocationPlan.overAllocatedAmount)}.
            </p>
          )}

          {customerInvoices.length > 0 ? (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', fontWeight: 800 }}>
                  Link this receipt to pending invoice numbers
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Button type="button" size="sm" variant="secondary" onClick={autoAllocate} disabled={!receiptAmountIsValid}>
                    Auto allocate
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={clearAllocations}>
                    Clear
                  </Button>
                </div>
              </div>
              {customerInvoices.map((invoice) => (
                <div
                  key={invoice.invoiceId}
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
                  <input type="hidden" name="allocation_invoice_id" value={invoice.invoiceId} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900 }}>{invoice.invoiceNumber ?? invoice.invoiceId.slice(0, 8)}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
                      {invoice.invoiceDate}{invoice.dueDate ? ` · Due ${invoice.dueDate}` : ''}
                    </div>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', fontWeight: 800 }}>
                    Pending {money(invoice.outstandingAmount)}
                  </div>
                  <label style={{ display: 'grid', gap: '0.25rem', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontWeight: 800 }}>
                    Allocate
                    <span style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '0.4rem' }}>
                      <input
                        name={`allocation_amount_${invoice.invoiceId}`}
                        type="number"
                        min="0"
                        max={invoice.outstandingAmount}
                        step="0.01"
                        placeholder="0.00"
                        value={allocationAmounts[invoice.invoiceId] ?? ''}
                        onChange={(event) => updateAllocation(invoice.invoiceId, event.target.value)}
                        style={inputStyle}
                      />
                      <Button type="button" size="sm" variant="secondary" onClick={() => setInvoiceFullAmount(invoice)}>
                        Full
                      </Button>
                    </span>
                  </label>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', fontWeight: 700 }}>
              This customer has no pending issued invoices. The receipt will be recorded as advance/unallocated credit.
            </p>
          )}
        </section>
      )}
      {state && 'error' in state && (
        <p style={{ margin: 0, color: 'var(--danger)', fontSize: 'var(--text-sm)', fontWeight: 800 }}>
          {state.error}
        </p>
      )}
      {state && 'success' in state && (
        <p style={{ margin: 0, color: 'var(--success)', fontSize: 'var(--text-sm)', fontWeight: 800 }}>
          {state.success}
        </p>
      )}
      <Button type="submit" variant="primary" icon={Banknote} loading={isPending} style={{ justifySelf: 'start' }}>
        Post Receipt
      </Button>
    </form>
  )
}
