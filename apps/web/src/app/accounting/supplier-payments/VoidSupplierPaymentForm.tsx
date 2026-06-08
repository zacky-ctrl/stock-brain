'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { ActionState } from '@/lib/masters'
import { voidSupplierPaymentAction } from './actions'

type Props = {
  paymentId: string
  disabled: boolean
}

export function VoidSupplierPaymentForm({ paymentId, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    voidSupplierPaymentAction,
    null,
  )

  if (disabled) {
    return <Button type="button" size="sm" variant="ghost" disabled>Void</Button>
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="danger" onClick={() => setOpen(true)}>
        Void
      </Button>
    )
  }

  return (
    <form action={formAction} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <input type="hidden" name="payment_id" value={paymentId} />
      <input
        name="void_reason"
        required
        placeholder="Reason"
        style={{ minHeight: '2rem', minWidth: '180px' }}
      />
      <Button type="submit" size="sm" variant="danger" loading={isPending}>Confirm</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      {state && 'error' in state && <span style={{ color: 'var(--danger)', fontSize: 'var(--text-xs)', fontWeight: 800 }}>{state.error}</span>}
    </form>
  )
}
