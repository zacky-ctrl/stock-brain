'use client'

import { useActionState } from 'react'
import { releaseReservationAction, reassignReservationAction, partialReleaseReservationAction } from './actions'
import type { ActionState } from '@/lib/masters'
import { inputStyle, selectStyle, msgError, msgOk } from '@/lib/ui'

type OpenLineOption = { id: string; label: string }

// ── Release Form ──────────────────────────────────────────────

export function ReleaseForm({ allocationId }: { allocationId: string }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    releaseReservationAction, null,
  )

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <input type="hidden" name="allocation_id" value={allocationId} />
      {state && 'error' in state && (
        <span style={{ ...msgError, margin: 0, fontSize: '0.72rem' }}>✗ {state.error}</span>
      )}
      {state && 'success' in state && (
        <span style={{ ...msgOk, margin: 0, fontSize: '0.72rem' }}>✓ Released</span>
      )}
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <input
          name="reason"
          style={{ ...inputStyle, width: '180px', fontSize: '0.78rem', padding: '0.2rem 0.4rem' }}
          placeholder="Reason…"
          required
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending}
          style={{
            fontSize: '0.75rem', cursor: isPending ? 'not-allowed' : 'pointer',
            border: '1px solid var(--danger)', borderRadius: '2px',
            background: 'white', color: 'var(--danger)', padding: '0.2rem 0.5rem',
            whiteSpace: 'nowrap', opacity: isPending ? 0.6 : 1,
          }}
        >
          {isPending ? '…' : 'Release'}
        </button>
      </div>
    </form>
  )
}

// ── Partial Release Form ──────────────────────────────────────

export function PartialReleaseForm({
  allocationId,
  allocatedQty,
}: {
  allocationId: string
  allocatedQty: number
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    partialReleaseReservationAction, null,
  )

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.3rem' }}>
      <input type="hidden" name="allocation_id" value={allocationId} />
      {state && 'error' in state && (
        <span style={{ ...msgError, margin: 0, fontSize: '0.72rem' }}>✗ {state.error}</span>
      )}
      {state && 'success' in state && (
        <span style={{ ...msgOk, margin: 0, fontSize: '0.72rem' }}>✓ {typeof state.success === 'string' ? state.success : 'Partial release done'}</span>
      )}
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          name="release_qty"
          type="number"
          min="0.001"
          max={allocatedQty - 0.001}
          step="0.001"
          style={{ ...inputStyle, width: '80px', fontSize: '0.78rem', padding: '0.2rem 0.4rem' }}
          placeholder={`< ${allocatedQty}`}
          required
          disabled={isPending}
        />
        <input
          name="reason"
          style={{ ...inputStyle, width: '160px', fontSize: '0.78rem', padding: '0.2rem 0.4rem' }}
          placeholder="Reason (required)…"
          required
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending}
          style={{
            fontSize: '0.75rem', cursor: isPending ? 'not-allowed' : 'pointer',
            border: '1px solid var(--warning)', borderRadius: '2px',
            background: 'var(--warning-subtle)', color: 'var(--warning)', padding: '0.2rem 0.5rem',
            whiteSpace: 'nowrap', opacity: isPending ? 0.6 : 1,
          }}
        >
          {isPending ? '…' : 'Partial Release'}
        </button>
      </div>
    </form>
  )
}

// ── Reassign Form ─────────────────────────────────────────────

export function ReassignForm({
  allocationId,
  openLines,
}: {
  allocationId: string
  openLines: OpenLineOption[]
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    reassignReservationAction, null,
  )

  if (openLines.length === 0) {
    return <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>no other open lines</span>
  }

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <input type="hidden" name="allocation_id" value={allocationId} />
      {state && 'error' in state && (
        <span style={{ ...msgError, margin: 0, fontSize: '0.72rem' }}>✗ {state.error}</span>
      )}
      {state && 'success' in state && (
        <span style={{ ...msgOk, margin: 0, fontSize: '0.72rem' }}>✓ Reassigned</span>
      )}
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          name="new_order_line_id"
          style={{ ...selectStyle, width: '200px', fontSize: '0.78rem', padding: '0.2rem 0.4rem' }}
          required
          disabled={isPending}
        >
          <option value="">Reassign to…</option>
          {openLines.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
        <input
          name="reason"
          style={{ ...inputStyle, width: '140px', fontSize: '0.78rem', padding: '0.2rem 0.4rem' }}
          placeholder="Reason…"
          required
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending}
          style={{
            fontSize: '0.75rem', cursor: isPending ? 'not-allowed' : 'pointer',
            border: '1px solid var(--warning)', borderRadius: '2px',
            background: 'white', color: 'var(--warning)', padding: '0.2rem 0.5rem',
            whiteSpace: 'nowrap', opacity: isPending ? 0.6 : 1,
          }}
        >
          {isPending ? '…' : 'Reassign'}
        </button>
      </div>
    </form>
  )
}
