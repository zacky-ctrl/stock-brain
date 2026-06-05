'use client'

import { useActionState } from 'react'
import { reserveLineAction } from './actions'
import type { ActionState } from '@/lib/masters'

type ReserveButtonProps = {
  orderLineId: string
  qty: number
  balanceId: string
}

export function ReserveButton({ orderLineId, qty, balanceId }: ReserveButtonProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    reserveLineAction,
    null,
  )

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.2rem' }}>
      {state && 'error' in state && (
        <span style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--danger)',
          maxWidth: '200px',
          whiteSpace: 'normal',
        }}>
          ✗ {state.error}
        </span>
      )}
      <form action={formAction} style={{ display: 'inline' }}>
        <input type="hidden" name="order_line_id" value={orderLineId} />
        <input type="hidden" name="qty" value={String(qty)} />
        <input type="hidden" name="balance_id" value={balanceId} />
        <button
          type="submit"
          disabled={isPending}
          style={{
            fontSize: 'var(--text-xs)',
            cursor: isPending ? 'not-allowed' : 'pointer',
            border: '1px solid var(--warning)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--warning-subtle)',
            color: 'var(--warning)',
            padding: '0.1rem 0.4rem',
            opacity: isPending ? 0.6 : 1,
          }}
        >
          {isPending ? '…' : 'Reserve'}
        </button>
      </form>
    </span>
  )
}
