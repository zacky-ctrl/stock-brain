'use client'

import { useActionState } from 'react'
import { revokeUserRoleAction } from './actions'
import type { ActionState } from '@/lib/masters'

export function RevokeButton({ email }: { email: string }) {
  const [, formAction, isPending] = useActionState<ActionState, FormData>(
    revokeUserRoleAction,
    null,
  )

  return (
    <form action={formAction} style={{ display: 'inline' }}>
      <input type="hidden" name="email" value={email} />
      <button
        type="submit"
        disabled={isPending}
        style={{
          background: 'none',
          border: '1px solid var(--danger)',
          color: 'var(--danger)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.2rem 0.65rem',
          fontSize: 'var(--text-xs)',
          cursor: isPending ? 'not-allowed' : 'pointer',
          opacity: isPending ? 0.6 : 1,
        }}
      >
        {isPending ? 'Revoking…' : 'Revoke'}
      </button>
    </form>
  )
}
