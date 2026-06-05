'use client'

import { useActionState, useState } from 'react'
import { addVelvetRate } from './actions'
import type { ActionState } from '@/lib/masters'
import { inputStyle, selectStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'

type ShapeOption = { id: string; label: string }
type SizeOption = { id: string; code: string }

type Props = {
  shapes: ShapeOption[]
  sizes: SizeOption[]
}

const labelStyle = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
  display: 'block' as const,
  marginBottom: '0.15rem',
}

export function AddRateForm({ shapes, sizes }: Props) {
  const [open, setOpen] = useState(false)
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(addVelvetRate, null)

  return (
    <div style={{ marginTop: '1.5rem' }}>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{ ...btnPrimary, margin: 0 }}
        >
          + Add Rate
        </button>
      )}

      {state && 'error' in state && state.error && (
        <p style={{ ...msgError, padding: '0.25rem 0.5rem', marginTop: '0.25rem' }}>✗ {state.error}</p>
      )}
      {state && 'success' in state && state.success && (
        <p style={{ ...msgOk, padding: '0.25rem 0.5rem', marginTop: '0.25rem' }}>✓ {state.success}</p>
      )}

      {open && (
        <form
          action={(fd) => { formAction(fd); setOpen(false) }}
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '0.75rem', marginTop: '0.35rem', borderRadius: 'var(--radius-md)', maxWidth: '600px' }}
        >
          <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, margin: '0 0 0.6rem' }}>Add New Conversion Rate</p>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.6rem', alignItems: 'flex-end' }}>
            <div>
              <span style={labelStyle}>Shape</span>
              <select name="shape_design_id" style={{ ...selectStyle, width: '160px' }} required>
                <option value="">Select shape…</option>
                {shapes.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <span style={labelStyle}>Size</span>
              <select name="size_id" style={{ ...selectStyle, width: '100px' }} required>
                <option value="">Select size…</option>
                {sizes.map((s) => (
                  <option key={s.id} value={s.id}>{s.code}</option>
                ))}
              </select>
            </div>
            <div>
              <span style={labelStyle}>Gross / Metre</span>
              <input name="gross_per_metre" type="number" min="0.001" step="0.001" style={{ ...inputStyle, width: '100px' }} required placeholder="e.g. 144" />
            </div>
            <div>
              <span style={labelStyle}>Metres / Bundle</span>
              <input name="metres_per_bundle" type="number" min="0.001" step="0.001" style={{ ...inputStyle, width: '100px' }} required placeholder="e.g. 25" />
            </div>
            <div>
              <span style={labelStyle}>Notes (optional)</span>
              <input name="notes" style={{ ...inputStyle, width: '200px' }} placeholder="Optional" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button type="submit" disabled={isPending} style={{ ...btnPrimary, margin: 0 }}>
              {isPending ? 'Saving…' : 'Add Rate'}
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
