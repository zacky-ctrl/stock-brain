'use client'

import { useActionState } from 'react'
import { ReceiptText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { ActionState } from '@/lib/masters'
import { createDraftInvoiceFromDispatchAction } from './actions'

type Props = {
  dispatchId: string
  defaultInvoiceDate: string
  defaultTransportCharges?: number
}

const fieldStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
} as const

const inputStyle = {
  width: '100%',
  minHeight: '2.5rem',
} as const

export function CreateDraftInvoiceForm({
  dispatchId,
  defaultInvoiceDate,
  defaultTransportCharges = 0,
}: Props) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createDraftInvoiceFromDispatchAction,
    null,
  )

  return (
    <form action={formAction} style={{ display: 'grid', gap: '0.9rem' }}>
      <input type="hidden" name="dispatch_id" value={dispatchId} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '0.75rem',
        }}
      >
        <label style={fieldStyle}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Invoice Date
          </span>
          <input name="invoice_date" type="date" defaultValue={defaultInvoiceDate} required style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Due Date
          </span>
          <input name="due_date" type="date" style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Transport
          </span>
          <input
            name="transport_charges"
            type="number"
            step="0.01"
            min="0"
            defaultValue={defaultTransportCharges || ''}
            style={inputStyle}
          />
        </label>
        <label style={fieldStyle}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Other
          </span>
          <input name="other_charges" type="number" step="0.01" min="0" style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Discount
          </span>
          <input name="discount_amount" type="number" step="0.01" min="0" style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Round Off
          </span>
          <input name="round_off_amount" type="number" step="0.01" style={inputStyle} />
        </label>
      </div>
      <label style={fieldStyle}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
          Notes
        </span>
        <input name="notes" placeholder="Invoice review note" style={inputStyle} />
      </label>
      {state && 'error' in state && (
        <p style={{ margin: 0, color: 'var(--danger)', fontSize: 'var(--text-sm)', fontWeight: 700 }}>
          {state.error}
        </p>
      )}
      <Button type="submit" variant="primary" icon={ReceiptText} loading={isPending} style={{ justifySelf: 'start' }}>
        Create Draft Invoice
      </Button>
    </form>
  )
}
