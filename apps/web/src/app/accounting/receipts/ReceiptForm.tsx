'use client'

import { useActionState } from 'react'
import { Banknote } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { ActionState } from '@/lib/masters'
import { postCustomerReceiptAction } from './actions'

type CustomerOption = {
  id: string
  name: string
  entity_name: string | null
}

type Props = {
  customers: CustomerOption[]
  defaultReceiptDate: string
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

export function ReceiptForm({ customers, defaultReceiptDate }: Props) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    postCustomerReceiptAction,
    null,
  )

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
          <select name="customer_id" required style={inputStyle}>
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}{customer.entity_name ? ` — ${customer.entity_name}` : ''}
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
          <input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required style={inputStyle} />
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
