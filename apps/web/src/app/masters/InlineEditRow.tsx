'use client'

import { useActionState, useState } from 'react'
import type { ActionState } from '@/lib/masters'
import { inputStyle, msgError, msgOk } from '@/lib/ui'

export type FieldDef = {
  name: string
  label: string
  type: 'text' | 'number' | 'boolean'
  value: string | number | boolean
}

type Props = {
  rowId: string
  fields: FieldDef[]
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>
}

const labelStyle = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
  display: 'block' as const,
  marginBottom: '0.15rem',
}

export function InlineEditRow({ rowId, fields, action }: Props) {
  const [open, setOpen] = useState(false)
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, null)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ fontSize: 'var(--text-xs)', padding: '0.15rem 0.5rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}
      >
        Edit
      </button>
    )
  }

  return (
    <div style={{ marginTop: '0.4rem' }}>
      {state && 'error' in state && state.error && (
        <p style={{ ...msgError, padding: '0.25rem 0.5rem', marginBottom: '0.4rem' }}>✗ {state.error}</p>
      )}
      {state && 'success' in state && state.success && (
        <p style={{ ...msgOk, padding: '0.25rem 0.5rem', marginBottom: '0.4rem' }}>✓ {state.success}</p>
      )}
      <form action={formAction} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', padding: '0.75rem', maxWidth: '700px', borderRadius: 'var(--radius-md)' }}>
        <input type="hidden" name="id" value={rowId} />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
          {fields.map((f) => (
            <div key={f.name} style={{ minWidth: '120px' }}>
              <span style={labelStyle}>{f.label}</span>
              {f.type === 'boolean' ? (
                <select name={f.name} defaultValue={String(f.value)} style={{ ...inputStyle, width: '80px', padding: '0.25rem 0.35rem' }}>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <input
                  name={f.name}
                  type={f.type === 'number' ? 'number' : 'text'}
                  defaultValue={String(f.value ?? '')}
                  style={{ ...inputStyle, width: f.type === 'number' ? '80px' : '160px', padding: '0.25rem 0.35rem' }}
                />
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button type="submit" disabled={isPending} style={{ fontSize: 'var(--text-xs)', padding: '0.25rem 0.65rem', border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontWeight: 600 }}>
            {isPending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setOpen(false)} style={{ fontSize: 'var(--text-xs)', padding: '0.25rem 0.65rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
