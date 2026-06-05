'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { revokeUserRoleAction } from './actions'
import type { ActionState } from '@/lib/masters'

export function RevokeButton({ email }: { email: string }) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    revokeUserRoleAction,
    null,
  )

  useEffect(() => {
    if (state && 'success' in state) {
      router.refresh()
    }
  }, [router, state])

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
