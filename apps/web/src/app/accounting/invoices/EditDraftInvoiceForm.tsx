'use client'

import { useActionState } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { ActionState } from '@/lib/masters'
import { updateDraftInvoiceAction } from './actions'

type Props = {
  invoice: {
    id: string
    invoice_date: string
    due_date: string | null
    yellow_rate_per_gross: number | string | null
    white_rate_per_gross: number | string | null
    transport_charges: number | string
    other_charges: number | string
    discount_amount: number | string
    round_off_amount: number | string
    notes: string | null
  }
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

export function EditDraftInvoiceForm({ invoice }: Props) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    updateDraftInvoiceAction,
    null,
  )

  return (
    <form action={formAction} style={{ display: 'grid', gap: '0.9rem' }}>
      <input type="hidden" name="invoice_id" value={invoice.id} />
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
          <input name="invoice_date" type="date" defaultValue={invoice.invoice_date} required style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Due Date
          </span>
          <input name="due_date" type="date" defaultValue={invoice.due_date ?? ''} style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Yellow Rate / Gross
          </span>
          <input
            name="yellow_rate_per_gross"
            type="number"
            step="0.01"
            min="0"
            defaultValue={invoice.yellow_rate_per_gross ?? ''}
            required
            style={inputStyle}
          />
        </label>
        <label style={fieldStyle}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            White Rate / Gross
          </span>
          <input
            name="white_rate_per_gross"
            type="number"
            step="0.01"
            min="0"
            defaultValue={invoice.white_rate_per_gross ?? ''}
            required
            style={inputStyle}
          />
        </label>
        <label style={fieldStyle}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Transport
          </span>
          <input name="transport_charges" type="number" step="0.01" min="0" defaultValue={invoice.transport_charges} style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Manual Addition / Correction
          </span>
          <input name="other_charges" type="number" step="0.01" min="0" defaultValue={invoice.other_charges} style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Discount
          </span>
          <input name="discount_amount" type="number" step="0.01" min="0" defaultValue={invoice.discount_amount} style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Round Off
          </span>
          <input name="round_off_amount" type="number" step="0.01" defaultValue={invoice.round_off_amount} style={inputStyle} />
        </label>
      </div>
      <label style={fieldStyle}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
          Notes / Reason
        </span>
        <input
          name="notes"
          defaultValue={invoice.notes ?? ''}
          placeholder="Why rates or amount were changed"
          style={inputStyle}
        />
      </label>
      {state && 'error' in state && (
        <p style={{ margin: 0, color: 'var(--danger)', fontSize: 'var(--text-sm)', fontWeight: 700 }}>
          {state.error}
        </p>
      )}
      {state && 'success' in state && (
        <p style={{ margin: 0, color: 'var(--success-bright)', fontSize: 'var(--text-sm)', fontWeight: 700 }}>
          {state.success}
        </p>
      )}
      <Button type="submit" variant="secondary" icon={Save} loading={isPending} style={{ justifySelf: 'start' }}>
        Save Draft Changes
      </Button>
    </form>
  )
}
