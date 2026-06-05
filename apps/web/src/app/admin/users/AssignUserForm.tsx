'use client'

import { useActionState } from 'react'
import { assignUserRoleAction } from './actions'
import { fieldWrap, inputStyle, selectStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'
import type { ActionState } from '@/lib/masters'

export function AssignUserForm() {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    assignUserRoleAction,
    null,
  )

  return (
    <form action={formAction} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
      {state && 'error' in state && (
        <p style={{ ...msgError, width: '100%', marginBottom: 0 }}>✗ {state.error}</p>
      )}
      {state && 'success' in state && (
        <p style={{ ...msgOk, width: '100%', marginBottom: 0 }}>✓ {state.success}</p>
      )}

      <div style={{ ...fieldWrap, flex: '1', minWidth: '220px' }}>
        <label style={{ fontSize: 'var(--text-sm)' }}>Email</label>
        <input
          name="email"
          type="email"
          required
          placeholder="user@example.com"
          style={{ ...inputStyle, minHeight: '40px' }}
        />
      </div>

      <div style={{ ...fieldWrap, width: '140px' }}>
        <label style={{ fontSize: 'var(--text-sm)' }}>Role</label>
        <select name="role" style={{ ...selectStyle, minHeight: '40px' }} defaultValue="viewer">
          <option value="viewer">viewer</option>
          <option value="manager">manager</option>
          <option value="admin">admin</option>
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
