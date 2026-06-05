'use client'

import { useActionState, useState } from 'react'
import { updateVelvetRate } from './actions'
import type { ActionState } from '@/lib/masters'
import { inputStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'

type Props = {
  rateId: string
  currentGross: number
  currentMetresPerBundle: number
  currentNotes: string | null
}

const labelStyle = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
  display: 'block' as const,
  marginBottom: '0.15rem',
}

export function EditRateForm({ rateId, currentGross, currentMetresPerBundle, currentNotes }: Props) {
  const [open, setOpen] = useState(false)
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(updateVelvetRate, null)

  return (
    <div>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{ fontSize: 'var(--text-xs)', padding: '0.15rem 0.5rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}
        >
          Edit
        </button>
      )}

      {state && 'error' in state && state.error && (
        <p style={{ ...msgError, padding: '0.25rem 0.5rem', marginTop: '0.25rem' }}>✗ {state.error}</p>
      )}
      {state && 'success' in state && state.success && (
        <p style={{ ...msgOk, padding: '0.25rem 0.5rem', marginTop: '0.25rem' }}>✓ {state.success}</p>
      )}

      {open && (
        <form action={formAction} style={{ background: 'var(--warning-subtle)', border: '1px solid rgba(245,158,11,0.25)', padding: '0.75rem', marginTop: '0.35rem', borderRadius: 'var(--radius-md)' }}>
          <input type="hidden" name="rate_id" value={rateId} />

          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', margin: '0 0 0.6rem' }}>
            ⚠ Changing this rate affects velvet requirement calculations in the planning engine.
            Old rate is preserved in history (deactivated, not deleted).
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.6rem', alignItems: 'flex-end' }}>
            <div>
              <span style={labelStyle}>New Gross / Metre</span>
              <input name="gross_per_metre" type="number" min="0.001" step="0.001" defaultValue={currentGross} style={{ ...inputStyle, width: '100px' }} required />
            </div>
            <div>
              <span style={labelStyle}>Metres / Bundle</span>
              <input name="metres_per_bundle" type="number" min="0.001" step="0.001" defaultValue={currentMetresPerBundle} style={{ ...inputStyle, width: '100px' }} required />
            </div>
            <div>
              <span style={labelStyle}>Notes</span>
              <input name="notes" defaultValue={currentNotes ?? ''} style={{ ...inputStyle, width: '200px' }} placeholder="Optional" />
            </div>
            <div>
              <span style={labelStyle}>Reason (required)</span>
              <input name="reason" style={{ ...inputStyle, width: '220px' }} placeholder="Why is this rate changing?" required />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button type="submit" disabled={isPending} style={{ ...btnPrimary, margin: 0 }}>
              {isPending ? 'Saving…' : 'Update Rate'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ fontSize: 'var(--text-sm)', padding: '0.35rem 0.75rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
