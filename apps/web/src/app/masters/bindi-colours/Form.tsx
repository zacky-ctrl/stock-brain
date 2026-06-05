'use client'

import { useActionState, useEffect, useState } from 'react'
import { addBindiColour } from './actions'
import type { ActionState } from '@/lib/masters'
import { formWrap, fieldWrap, inputStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'

export function AddBindiColourForm() {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    addBindiColour,
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
          <label>Code</label>
          <input name="code" style={inputStyle} placeholder="e.g. D" />
        </div>
        <div style={fieldWrap}>
          <label>Name</label>
          <input name="name" style={inputStyle} placeholder="e.g. Deep Red" />
        </div>
        <div style={fieldWrap}>
          <label>Sort Order</label>
          <input name="sort_order" type="number" defaultValue={0} style={inputStyle} />
        </div>
        <button type="submit" disabled={isPending} style={btnPrimary}>
          {isPending ? 'Adding...' : 'Add Bindi Colour'}
        </button>
      </form>
    </div>
  )
}
