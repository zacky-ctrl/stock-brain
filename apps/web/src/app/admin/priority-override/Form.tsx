'use client'

import { useActionState } from 'react'
import { setPriorityOverride, clearPriorityOverride } from './actions'
import type { ActionState } from '@/lib/masters'
import { fieldWrap, inputStyle, selectStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'

export type OrderLineOption = {
  id: string
  label: string               // customer · order · shape · colour · size · dabbi
  has_priority_override: boolean
  current_override_value: number | null
  customer_priority_weight: number
}

export type PriorityOverrideFormProps = {
  openLines: OrderLineOption[]
}

export function SetOverrideForm({ openLines }: PriorityOverrideFormProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    setPriorityOverride, null,
  )

  return (
    <form action={formAction} style={{ maxWidth: '600px', marginBottom: '2rem' }}>
      {state && 'error' in state && (
        <p style={{ ...msgError, marginBottom: '0.75rem' }}>✗ {state.error}</p>
      )}
      {state && 'success' in state && (
        <p style={{ ...msgOk, marginBottom: '0.75rem' }}>✓ {state.success}</p>
      )}

      <div style={{ ...fieldWrap, marginBottom: '0.75rem' }}>
        <label>Order Line</label>
        <select name="order_line_id" style={selectStyle} required>
          <option value="">Select open order line…</option>
          {openLines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
              {l.has_priority_override ? ` [override P${l.current_override_value}]` : ` [W${l.customer_priority_weight}]`}
            </option>
          ))}
        </select>
      </div>

      <div style={{ ...fieldWrap, marginBottom: '0.75rem' }}>
        <label>Priority Value</label>
        <input
          name="priority_value"
          type="number"
          min="1"
          step="1"
          style={{ ...inputStyle, width: '120px' }}
          placeholder="1"
          required
        />
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          1 = highest priority. Lower = served first. Override always ranks above customer-weight lines.
        </span>
      </div>

      <div style={{ ...fieldWrap, marginBottom: '0.75rem' }}>
        <label>Reason (required)</label>
        <input name="reason" style={inputStyle} placeholder="e.g. Customer urgent request, payment priority" required />
      </div>

      <div style={{ ...fieldWrap, marginBottom: '1.25rem' }}>
        <label>Expires On (optional)</label>
        <input name="expires_at" type="date" style={{ ...inputStyle, width: '180px' }} />
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          Leave blank for permanent override until explicitly cleared.
        </span>
      </div>

      <button type="submit" disabled={isPending} style={{ ...btnPrimary, marginTop: 0 }}>
        {isPending ? 'Setting…' : 'Set Priority Override'}
      </button>
    </form>
  )
}

export function ClearOverrideForm({ openLines }: PriorityOverrideFormProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    clearPriorityOverride, null,
  )

  const overriddenLines = openLines.filter((l) => l.has_priority_override)

  return (
    <form action={formAction} style={{ maxWidth: '600px' }}>
      {state && 'error' in state && (
        <p style={{ ...msgError, marginBottom: '0.75rem' }}>✗ {state.error}</p>
      )}
      {state && 'success' in state && (
        <p style={{ ...msgOk, marginBottom: '0.75rem' }}>✓ {state.success}</p>
      )}

      {overriddenLines.length === 0 ? (
        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
          No lines currently have an active override.
        </p>
      ) : (
        <>
          <div style={{ ...fieldWrap, marginBottom: '0.75rem' }}>
            <label>Order Line (currently overridden)</label>
            <select name="order_line_id" style={selectStyle} required>
              <option value="">Select line to clear…</option>
              {overriddenLines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label} [override P{l.current_override_value}]
                </option>
              ))}
            </select>
          </div>

          <div style={{ ...fieldWrap, marginBottom: '1.25rem' }}>
            <label>Reason (required)</label>
            <input name="reason" style={inputStyle} placeholder="Reason for clearing override" required />
          </div>

          <button type="submit" disabled={isPending} style={{ ...btnPrimary, marginTop: 0 }}>
            {isPending ? 'Clearing…' : 'Clear Override'}
          </button>
        </>
      )}
    </form>
  )
}
