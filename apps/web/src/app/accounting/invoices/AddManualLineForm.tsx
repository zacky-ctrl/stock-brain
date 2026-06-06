'use client'

import { useActionState, useState } from 'react'
import { PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { ActionState } from '@/lib/masters'
import { addManualInvoiceLineAction } from './actions'

type Props = {
  invoiceId: string
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

export function AddManualLineForm({ invoiceId }: Props) {
  const [open, setOpen] = useState(false)
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    addManualInvoiceLineAction,
    null,
  )

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        icon={PlusCircle}
        onClick={() => setOpen(true)}
      >
        Add Manual Line
      </Button>
    )
  }

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '1rem',
        background: 'var(--bg-elevated)',
        marginTop: '0.5rem',
      }}
    >
      <p
        style={{
          margin: '0 0 0.75rem',
          fontSize: 'var(--text-xs)',
          fontWeight: 700,
          color: 'var(--warning)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Manual line — accounting only. Does not affect stock.
      </p>
      <form
        action={async (fd) => {
          await formAction(fd)
          setOpen(false)
        }}
        style={{ display: 'grid', gap: '0.75rem' }}
      >
        <input type="hidden" name="invoice_id" value={invoiceId} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.75rem',
          }}
        >
          <label style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
              Description
            </span>
            <input
              name="manual_description"
              type="text"
              required
              placeholder="e.g. Shortage recovery, previous bill balance"
              style={inputStyle}
            />
          </label>
          <label style={fieldStyle}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
              Amount (₹)
            </span>
            <input
              name="line_amount"
              type="number"
              step="0.01"
              min="0"
              required
              style={inputStyle}
            />
          </label>
          <label style={fieldStyle}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
              Reason (required)
            </span>
            <input
              name="manual_reason"
              type="text"
              required
              placeholder="Why this line is being added"
              style={inputStyle}
            />
          </label>
        </div>
        {state && 'error' in state && (
          <p style={{ margin: 0, color: 'var(--danger)', fontSize: 'var(--text-sm)', fontWeight: 700 }}>
            {state.error}
          </p>
        )}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button type="submit" variant="primary" size="sm" loading={isPending}>
            Add Line
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
