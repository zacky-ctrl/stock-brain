'use client'

import { useActionState, useEffect, useState } from 'react'
import { addCustomer } from './actions'
import type { ActionState } from '@/lib/masters'
import { formWrap, fieldWrap, inputStyle, selectStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'
import type { DabbiOption } from './CustomerCards'

const BRAND_RULES = [
  { value: 'no_preference',    label: 'No preference (either brand)' },
  { value: 'prefer_nirankari', label: 'Prefer Nirankari' },
  { value: 'prefer_suhela',    label: 'Prefer Suhela' },
  { value: 'strict_nirankari', label: 'Nirankari only' },
  { value: 'strict_suhela',    label: 'Suhela only' },
]

export function AddCustomerForm({ dabbiColours }: { dabbiColours: DabbiOption[] }) {
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
          <label>Entity Name</label>
          <input name="entity_name" style={inputStyle} placeholder="Billing / firm name" />
        </div>
        <div style={fieldWrap}>
          <label>Address</label>
          <input name="address" style={inputStyle} placeholder="Full dispatch / billing address" />
        </div>
        <div style={fieldWrap}>
          <label>Phone Number</label>
          <input name="phone_number" style={inputStyle} placeholder="Customer phone" />
        </div>
        <div style={fieldWrap}>
          <label>Transport Name</label>
          <input name="transport_name" style={inputStyle} placeholder="Preferred transport" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div style={fieldWrap}>
            <label>Yellow Rate / gross</label>
            <input name="yellow_rate_per_gross" type="number" step="0.01" min="0" style={inputStyle} />
          </div>
          <div style={fieldWrap}>
            <label>White Rate / gross</label>
            <input name="white_rate_per_gross" type="number" step="0.01" min="0" style={inputStyle} />
          </div>
        </div>
        <div style={fieldWrap}>
          <label>Default Dabbi Colour</label>
          <select name="default_dabbi_colour_id" style={selectStyle}>
            <option value="">No default</option>
            {dabbiColours.map((dabbi) => (
              <option key={dabbi.id} value={dabbi.id}>{dabbi.label}</option>
            ))}
          </select>
        </div>
        <div style={fieldWrap}>
          <label>Brand Rule</label>
          <select name="brand_rule" style={selectStyle}>
            {BRAND_RULES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
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
