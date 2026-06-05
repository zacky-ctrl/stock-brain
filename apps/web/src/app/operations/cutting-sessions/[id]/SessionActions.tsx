'use client'

import { useActionState, useState } from 'react'
import { inputStyle } from '@/lib/ui'
import type { CSSProperties } from 'react'

type ActionState = { error: string } | undefined
type EditState = { error?: string; success?: string } | null

const fieldInputStyle: CSSProperties = {
  ...inputStyle,
  width: '240px',
}

const wideInput: CSSProperties = { ...fieldInputStyle, width: '100%' }
const labelStyle: CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
  display: 'block',
  marginBottom: '0.15rem',
}

type ConfirmActionProps = {
  action: (sessionId: string) => Promise<{ error?: string } | void>
  sessionId: string
}

export function ConfirmSessionButton({ action, sessionId }: ConfirmActionProps) {
  const [result, formAction, isPending] = useActionState<ActionState, FormData>(
    async (_prev, _formData) => {
      const res = await action(sessionId)
      return res && 'error' in res && res.error ? { error: res.error } : undefined
    },
    undefined,
  )

  return (
    <div>
      {result?.error && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)', margin: '0 0 0.5rem' }}>
          ✗ {result.error}
        </p>
      )}
      <form action={formAction}>
        <button
          type="submit"
          disabled={isPending}
          style={{
            fontSize: 'var(--text-sm)',
            padding: '0.4rem 1rem',
            cursor: isPending ? 'not-allowed' : 'pointer',
            border: '1px solid var(--success)',
            background: 'var(--success-subtle)',
            color: 'var(--success)',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 600,
          }}
        >
          {isPending ? 'Confirming…' : 'Confirm & Credit Stock'}
        </button>
      </form>
    </div>
  )
}

export type MachineOption = { id: string; code: string; name: string }

type EditDraftProps = {
  action: (sessionId: string, prevState: EditState, formData: FormData) => Promise<EditState>
  sessionId: string
  currentDate: string
  currentMachineId: string | null
  currentVelvet: number
  currentNotes: string | null
  machines: MachineOption[]
}

export function EditDraftForm({ action, sessionId, currentDate, currentMachineId, currentVelvet, currentNotes, machines }: EditDraftProps) {
  const [open, setOpen] = useState(false)
  const [state, formAction, isPending] = useActionState<EditState, FormData>(
    (prev, fd) => action(sessionId, prev, fd),
    null,
  )

  return (
    <div style={{ marginBottom: '1rem' }}>
      {!open && (
        <button onClick={() => setOpen(true)} style={{ fontSize: 'var(--text-xs)', padding: '0.2rem 0.65rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>
          Edit Draft
        </button>
      )}
      {state?.error && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)', margin: '0.4rem 0' }}>✗ {state.error}</p>}
      {state?.success && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--success)', margin: '0.4rem 0' }}>✓ {state.success}</p>}
      {open && (
        <form action={formAction} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', padding: '1rem', marginTop: '0.5rem', maxWidth: '480px', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
            <div>
              <span style={labelStyle}>Session Date</span>
              <input name="session_date" type="date" defaultValue={currentDate} style={wideInput} required />
            </div>
            <div>
              <span style={labelStyle}>Velvet Bundles Consumed</span>
              <input name="velvet_bundles_consumed" type="number" min="0.001" step="0.001" defaultValue={currentVelvet} style={wideInput} required />
            </div>
            <div>
              <span style={labelStyle}>Machine</span>
              <select name="machine_id" defaultValue={currentMachineId ?? ''} style={{ ...wideInput, cursor: 'pointer' }}>
                <option value="">No machine</option>
                {machines.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
              </select>
            </div>
            <div>
              <span style={labelStyle}>Notes</span>
              <input name="notes" defaultValue={currentNotes ?? ''} style={wideInput} placeholder="Optional" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={isPending} style={{ fontSize: 'var(--text-sm)', padding: '0.35rem 0.85rem', border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontWeight: 600 }}>
              {isPending ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={() => setOpen(false)} style={{ fontSize: 'var(--text-sm)', padding: '0.35rem 0.85rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}

type AdminVoidProps = {
  action: (sessionId: string, prevState: { error?: string } | null, formData: FormData) => Promise<{ error?: string } | void>
  sessionId: string
}

export function AdminVoidForm({ action, sessionId }: AdminVoidProps) {
  const [open, setOpen] = useState(false)
  const [state, formAction, isPending] = useActionState<{ error?: string } | null, FormData>(
    (prev, fd) => action(sessionId, prev, fd) as Promise<{ error?: string } | null>,
    null,
  )

  return (
    <div>
      {!open && (
        <button onClick={() => setOpen(true)} style={{ fontSize: 'var(--text-xs)', padding: '0.2rem 0.65rem', border: '1px solid var(--danger)', color: 'var(--danger)', background: 'var(--danger-subtle)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
          Admin Void (reverses stock)
        </button>
      )}
      {state?.error && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)', margin: '0.4rem 0' }}>✗ {state.error}</p>}
      {open && (
        <form action={formAction} style={{ background: 'var(--danger-subtle)', border: '1px solid rgba(244,63,94,0.25)', padding: '1rem', marginTop: '0.5rem', maxWidth: '480px', borderRadius: 'var(--radius-md)' }}>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)', margin: '0 0 0.75rem' }}>
            ⚠ This will reverse all cuttings balance credits and restore velvet balance. Creates stock_correction records.
          </p>
          <div style={{ marginBottom: '0.6rem' }}>
            <span style={labelStyle}>Reason (mandatory)</span>
            <input name="void_reason" style={{ ...inputStyle, width: '100%' }} placeholder="Why is this confirmed session being voided?" required />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={isPending} style={{ fontSize: 'var(--text-sm)', padding: '0.35rem 0.85rem', border: 'none', background: 'var(--danger)', color: 'white', cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontWeight: 600 }}>
              {isPending ? 'Voiding…' : 'Confirm Admin Void'}
            </button>
            <button type="button" onClick={() => setOpen(false)} style={{ fontSize: 'var(--text-sm)', padding: '0.35rem 0.85rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}

type VoidActionProps = {
  action: (sessionId: string, formData: FormData) => Promise<{ error?: string } | void>
  sessionId: string
}

export function VoidSessionForm({ action, sessionId }: VoidActionProps) {
  const [result, formAction, isPending] = useActionState<ActionState, FormData>(
    async (_prev, formData) => {
      const res = await action(sessionId, formData)
      return res && 'error' in res && res.error ? { error: res.error } : undefined
    },
    undefined,
  )

  return (
    <div>
      <p style={{ margin: '0 0 0.4rem', fontSize: 'var(--text-sm)', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
        Void this session
      </p>
      <p style={{ margin: '0 0 0.5rem', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
        Draft sessions can be voided with a reason. No stock effect.
      </p>
      {result?.error && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)', margin: '0 0 0.4rem' }}>
          ✗ {result.error}
        </p>
      )}
      <form action={formAction} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          name="void_reason"
          type="text"
          placeholder="Reason for voiding…"
          required
          style={{ ...inputStyle, width: '240px' }}
        />
        <button
          type="submit"
          disabled={isPending}
          style={{ fontSize: 'var(--text-sm)', padding: '0.35rem 0.75rem', cursor: isPending ? 'not-allowed' : 'pointer', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)' }}
        >
          {isPending ? 'Voiding…' : 'Void'}
        </button>
      </form>
    </div>
  )
}
