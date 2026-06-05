'use client'

import { useActionState, useEffect, useState } from 'react'
import { addSize } from './actions'
import type { ActionState } from '@/lib/masters'
import { formWrap, fieldWrap, inputStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'

export function AddSizeForm() {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    addSize,
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
          <input name="code" style={inputStyle} placeholder="e.g. 1.5" />
        </div>
        <div style={fieldWrap}>
          <label>Name (optional — defaults to code)</label>
          <input name="name" style={inputStyle} placeholder="e.g. 1.5mm" />
        </div>
        <div style={fieldWrap}>
          <label>Sort Order</label>
          <input name="sort_order" type="number" defaultValue={0} style={inputStyle} />
        </div>
        <div style={{ fontSize: 'var(--text-sm)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input name="is_standard" type="checkbox" defaultChecked id="is_standard_sz" />
          <label htmlFor="is_standard_sz">Standard size</label>
        </div>
        <button type="submit" disabled={isPending} style={btnPrimary}>
          {isPending ? 'Adding...' : 'Add Size'}
        </button>
      </form>
    </div>
  )
}
