'use client'

import { useActionState, useEffect, useState } from 'react'
import { addCustomer } from './actions'
import type { ActionState } from '@/lib/masters'
import { formWrap, fieldWrap, inputStyle, selectStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'

const BRAND_RULES = [
  { value: 'no_preference',    label: 'No preference (either brand)' },
  { value: 'prefer_nirankari', label: 'Prefer Nirankari' },
  { value: 'prefer_suhela',    label: 'Prefer Suhela' },
  { value: 'strict_nirankari', label: 'Nirankari only' },
  { value: 'strict_suhela',    label: 'Suhela only' },
]

export function AddCustomerForm() {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    addCustomer,
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
          <input name="name" style={inputStyle} placeholder="e.g. Shree Traders" />
        </div>
        <div style={fieldWrap}>
          <label>Brand Rule</label>
          <select name="brand_rule" style={selectStyle}>
            {BRAND_RULES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div style={fieldWrap}>
          <label>Priority Weight (1–10)</label>
          <input
            name="priority_weight"
            type="number"
            min={1}
            max={10}
            defaultValue={5}
            style={inputStyle}
          />
        </div>
        <div style={{ fontSize: 'var(--text-sm)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input name="payment_risk_flag" type="checkbox" id="payment_risk_flag" />
          <label htmlFor="payment_risk_flag">Payment risk flag</label>
        </div>
        <button type="submit" disabled={isPending} style={btnPrimary}>
          {isPending ? 'Adding...' : 'Add Customer'}
        </button>
      </form>
    </div>
  )
}
