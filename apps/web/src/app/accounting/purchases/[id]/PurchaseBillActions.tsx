'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'
import type { ActionState } from '@/lib/masters'
import { confirmPurchaseBillAction, updatePurchaseBillDraftAction } from '../actions'

type DraftEditorProps = {
  bill: {
    id: string
    purchase_date: string
    due_date: string | null
    transport_charges: number | string
    other_charges: number | string
    discount_amount: number | string
    round_off_amount: number | string
    notes: string | null
  }
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

export function PurchaseBillDraftEditor({ bill }: DraftEditorProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    updatePurchaseBillDraftAction,
    null,
  )

  return (
    <form action={formAction} style={{ display: 'grid', gap: '0.85rem' }}>
      <input type="hidden" name="purchase_bill_id" value={bill.id} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))',
          gap: '0.75rem',
        }}
      >
        <label style={fieldStyle}>
          Purchase Date
          <input name="purchase_date" type="date" defaultValue={bill.purchase_date} required style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Due Date
          <input name="due_date" type="date" defaultValue={bill.due_date ?? ''} style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Transport
          <input name="transport_charges" type="number" min="0" step="0.01" defaultValue={bill.transport_charges} style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Other Charges
          <input name="other_charges" type="number" min="0" step="0.01" defaultValue={bill.other_charges} style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Discount
          <input name="discount_amount" type="number" min="0" step="0.01" defaultValue={bill.discount_amount} style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Round Off
          <input name="round_off_amount" type="number" step="0.01" defaultValue={bill.round_off_amount} style={inputStyle} />
        </label>
        <label style={{ ...fieldStyle, gridColumn: 'span 2' }}>
          Reason
          <input name="reason" required placeholder="Required for audit trail" style={inputStyle} />
        </label>
      </div>
      <label style={fieldStyle}>
        Notes
        <input name="notes" defaultValue={bill.notes ?? ''} placeholder="Optional note" style={inputStyle} />
      </label>
      {state && 'error' in state && <p style={{ margin: 0, color: 'var(--danger)', fontWeight: 800 }}>{state.error}</p>}
      {state && 'success' in state && <p style={{ margin: 0, color: 'var(--success)', fontWeight: 800 }}>{state.success}</p>}
      <div>
        <Button type="submit" variant="secondary" loading={isPending}>
          Save Draft Changes
        </Button>
      </div>
    </form>
  )
}

export function ConfirmPurchaseBillForm({ purchaseBillId }: { purchaseBillId: string }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    confirmPurchaseBillAction,
    null,
  )

  return (
    <form action={formAction} style={{ display: 'grid', gap: '0.65rem' }}>
      <input type="hidden" name="purchase_bill_id" value={purchaseBillId} />
      {state && 'error' in state && <p style={{ margin: 0, color: 'var(--danger)', fontWeight: 800 }}>{state.error}</p>}
      {state && 'success' in state && <p style={{ margin: 0, color: 'var(--success)', fontWeight: 800 }}>{state.success}</p>}
      <Button type="submit" variant="primary" loading={isPending}>
        Confirm Purchase Bill
      </Button>
    </form>
  )
}
