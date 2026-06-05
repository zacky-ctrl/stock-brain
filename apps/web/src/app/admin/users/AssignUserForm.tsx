'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { assignUserRoleAction } from './actions'
import { fieldWrap, inputStyle, selectStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'
import type { ActionState } from '@/lib/masters'

type Props = {
  defaultEmail?: string
  compact?: boolean
}

export function AssignUserForm({ defaultEmail, compact = false }: Props) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    assignUserRoleAction,
    null,
  )

  useEffect(() => {
    if (state && 'success' in state) {
      router.refresh()
    }
  }, [router, state])

  return (
    <form action={formAction} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
      {state && 'error' in state && (
        <p style={{ ...msgError, width: '100%', marginBottom: 0 }}>✗ {state.error}</p>
      )}
      {state && 'success' in state && (
        <p style={{ ...msgOk, width: '100%', marginBottom: 0 }}>✓ {state.success}</p>
      )}

      {compact ? (
        <input type="hidden" name="email" value={defaultEmail ?? ''} />
      ) : (
        <div style={{ ...fieldWrap, flex: '1', minWidth: '220px' }}>
          <label style={{ fontSize: 'var(--text-sm)' }}>Email</label>
          <input
            name="email"
            type="email"
            required
            placeholder="user@example.com"
            defaultValue={defaultEmail}
            style={{ ...inputStyle, minHeight: '40px' }}
          />
        </div>
      )}

      <div style={{ ...fieldWrap, width: '140px' }}>
        <label style={{ fontSize: 'var(--text-sm)' }}>{compact ? 'Assign Role' : 'Role'}</label>
        <select name="role" style={{ ...selectStyle, minHeight: '40px' }} defaultValue="stock_operator">
          <option value="stock_operator">Stock Operator</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
          <option value="accountant">Accountant</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={isPending}
        style={{ ...btnPrimary, marginTop: 0, minHeight: '40px', padding: '0 1.25rem' }}
      >
        {isPending ? 'Assigning…' : 'Assign'}
      </button>
    </form>
  )
}
