'use client'

import { useActionState, useState } from 'react'
import { editJobAction, forceCloseJobAction } from './actions'
import type { ActionState } from '@/lib/masters'
import { inputStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'
import type { CSSProperties } from 'react'

const labelStyle: CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
  display: 'block',
  marginBottom: '0.2rem',
}

// ── Edit job details ──────────────────────────────────────────

type EditJobProps = {
  jobId: string
  currentExpectedReturn: string | null
  currentNotes: string | null
}

export function EditJobForm({ jobId, currentExpectedReturn, currentNotes }: EditJobProps) {
  const [open, setOpen] = useState(false)
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    (prev, fd) => editJobAction(jobId, prev, fd),
    null,
  )

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      {!open && (
        <button onClick={() => setOpen(true)} style={{ fontSize: 'var(--text-xs)', padding: '0.2rem 0.65rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>
          Edit Job Details
        </button>
      )}
      {state && 'error' in state && state.error && <p style={{ ...msgError, marginTop: '0.4rem' }}>✗ {state.error}</p>}
      {state && 'success' in state && state.success && <p style={{ ...msgOk, marginTop: '0.4rem' }}>✓ {state.success}</p>}
      {open && (
        <form action={formAction} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', padding: '1rem', marginTop: '0.5rem', maxWidth: '480px', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
            <div>
              <span style={labelStyle}>Expected Return Date</span>
              <input name="expected_return_date" type="date" defaultValue={currentExpectedReturn ?? ''} style={{ ...inputStyle, width: '100%' }} />
            </div>
            <div>
              <span style={labelStyle}>Notes</span>
              <input name="notes" defaultValue={currentNotes ?? ''} style={{ ...inputStyle, width: '100%' }} placeholder="Optional" />
            </div>
          </div>
          <div style={{ marginBottom: '0.6rem' }}>
            <span style={labelStyle}>Reason (required)</span>
            <input name="reason" style={{ ...inputStyle, width: '100%' }} placeholder="Why is this being updated?" required />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={isPending} style={{ ...btnPrimary, margin: 0 }}>{isPending ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => setOpen(false)} style={{ fontSize: 'var(--text-sm)', padding: '0.4rem 1rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}

// ── Force close ───────────────────────────────────────────────

type ForceCloseProps = {
  jobId: string
  wipQty: number
}

export function ForceCloseForm({ jobId, wipQty }: ForceCloseProps) {
  const [open, setOpen] = useState(false)
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    (prev, fd) => forceCloseJobAction(jobId, prev, fd),
    null,
  )

  if (wipQty <= 0) return null

  return (
    <div>
      {!open && (
        <button onClick={() => setOpen(true)} style={{ fontSize: 'var(--text-xs)', padding: '0.2rem 0.65rem', border: '1px solid var(--danger)', color: 'var(--danger)', background: 'var(--danger-subtle)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
          Force Close (write off {wipQty.toFixed(1)} gross WIP)
        </button>
      )}
      {state && 'error' in state && state.error && <p style={{ ...msgError, marginTop: '0.4rem' }}>✗ {state.error}</p>}
      {state && 'success' in state && state.success && <p style={{ ...msgOk, marginTop: '0.4rem' }}>✓ {state.success}</p>}
      {open && (
        <form action={formAction} style={{ background: 'var(--danger-subtle)', border: '1px solid rgba(244,63,94,0.25)', padding: '1rem', marginTop: '0.5rem', maxWidth: '480px', borderRadius: 'var(--radius-md)' }}>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)', margin: '0 0 0.75rem' }}>
            ⚠ This will write off <strong>{wipQty.toFixed(3)} gross</strong> WIP as lost/damaged. Creates stock_correction records. Job status → cancelled/recalled.
          </p>
          <div style={{ marginBottom: '0.6rem' }}>
            <span style={labelStyle}>Reason (required) — damaged / lost / never returned</span>
            <input name="reason" style={{ ...inputStyle, width: '100%' }} placeholder="e.g. goods confirmed lost at labour unit" required />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={isPending} style={{ fontSize: 'var(--text-sm)', padding: '0.35rem 0.85rem', border: 'none', background: 'var(--danger)', color: 'white', cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontWeight: 600 }}>
              {isPending ? 'Closing…' : 'Confirm Force Close'}
            </button>
            <button type="button" onClick={() => setOpen(false)} style={{ fontSize: 'var(--text-sm)', padding: '0.35rem 0.85rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}
