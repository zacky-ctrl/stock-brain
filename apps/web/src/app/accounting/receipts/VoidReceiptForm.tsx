'use client'

import { useActionState, useState } from 'react'
import { XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { ActionState } from '@/lib/masters'
import { voidCustomerReceiptAction } from './actions'

type Props = {
  receiptId: string
  disabled?: boolean
}

export function VoidReceiptForm({ receiptId, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    voidCustomerReceiptAction,
    null,
  )

  if (disabled) {
    return (
      <Button type="button" size="sm" variant="secondary" disabled>
        Voided
      </Button>
    )
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="danger" icon={XCircle} onClick={() => setOpen(true)}>
        Void
      </Button>
    )
  }

  return (
    <form action={formAction} style={{ display: 'grid', gap: '0.45rem', minWidth: '240px' }}>
      <input type="hidden" name="receipt_id" value={receiptId} />
      <input
        name="void_reason"
        placeholder="Reason required"
        required
        style={{ minHeight: '2.2rem', width: '100%' }}
      />
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <Button type="submit" size="sm" variant="danger" loading={isPending}>
          Confirm Void
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {state && 'error' in state && (
        <p style={{ margin: 0, color: 'var(--danger)', fontSize: 'var(--text-xs)', fontWeight: 800 }}>
          {state.error}
        </p>
      )}
      {state && 'success' in state && (
        <p style={{ margin: 0, color: 'var(--success-bright)', fontSize: 'var(--text-xs)', fontWeight: 800 }}>
          {state.success}
        </p>
      )}
    </form>
  )
}
