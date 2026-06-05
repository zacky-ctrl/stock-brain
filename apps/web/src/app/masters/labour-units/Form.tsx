'use client'

import { useActionState, useEffect, useState } from 'react'
import { addLabourUnit } from './actions'
import type { ActionState } from '@/lib/masters'
import { formWrap, fieldWrap, inputStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'

export function AddLabourUnitForm() {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    addLabourUnit,
    null,
  )
  const [formKey, setFormKey] = useState(0)

  useEffect(() => {
    if (state && 'success' in state) setFormKey((k) => k + 1)
  }, [state])

  return (
    <div>
      {state && 'error' in state && <p style={msgError}>✗ {state.error}</p>}
      {state && 'success' in state && <p style={msgOk}>✓ {state.success}</p>}
      <form key={formKey} action={formAction} style={formWrap}>
        <div style={fieldWrap}>
          <label>Name</label>
          <input name="name" style={inputStyle} placeholder="e.g. Ramesh Kumar" />
        </div>
        <div style={fieldWrap}>
          <label>Phone (optional)</label>
          <input name="phone" style={inputStyle} placeholder="e.g. 9876543210" />
        </div>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '0' }}>
          Serial number is assigned automatically.
        </p>
        <button type="submit" disabled={isPending} style={btnPrimary}>
          {isPending ? 'Adding...' : 'Add Labour Unit'}
        </button>
      </form>
    </div>
  )
}
