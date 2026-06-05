'use client'

import { useActionState, useState, useEffect } from 'react'
import { voidDispatchAction } from './actions'
import type { ActionState } from '@/lib/masters'
import { inputStyle, msgError } from '@/lib/ui'
import { Card } from '@/components/ui/Card'
import type { CSSProperties } from 'react'

export type AffectedOrder = {
  id: string
  customerName: string
  qty: number
}

export type VoidDispatchFormProps = {
  eventId: string
  totalGross: number
  orderLineCount: number
  affectedOrders: AffectedOrder[]
}

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

const labelStyle: CSSProperties = {
  fontSize: '0.78rem',
  color: 'var(--text-secondary)',
  display: 'block',
  marginBottom: '0.2rem',
}

const outlinedDanger: CSSProperties = {
  fontSize: '0.82rem',
  padding: '0.35rem 0.85rem',
  cursor: 'pointer',
  border: '1px solid rgba(244,63,94,0.5)',
  background: 'transparent',
  color: 'var(--danger)',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 600,
}

export function VoidDispatchForm({ eventId, totalGross, orderLineCount, affectedOrders }: VoidDispatchFormProps) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    (prev, fd) => voidDispatchAction(eventId, prev, fd),
    null,
  )

  // Start 5-second countdown the moment user types "VOID" exactly
  useEffect(() => {
    if (confirmText !== 'VOID') {
      setCountdown(null)
      return
    }
    setCountdown(5)
    let n = 5
    const timer = setInterval(() => {
      n -= 1
      if (n <= 0) {
        clearInterval(timer)
        setCountdown(0)
      } else {
        setCountdown(n)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [confirmText])

  const isVoidTyped = confirmText === 'VOID'
  const canSubmit = isVoidTyped && countdown === 0 && reason.trim().length > 0 && !isPending

  function handleCancel() {
    setOpen(false)
    setConfirmText('')
    setReason('')
    setCountdown(null)
  }

  const submitLabel = isPending
    ? 'Voiding…'
    : isVoidTyped && countdown !== null && countdown > 0
    ? `Confirm Void (${countdown})…`
    : 'Confirm Void'

  if (!open) {
    return (
      <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)' }}>
        {state && 'error' in state && state.error && (
          <p style={{ ...msgError, marginBottom: '0.5rem' }}>✗ {state.error}</p>
        )}
        <button style={outlinedDanger} onClick={() => setOpen(true)}>
          Void Dispatch
        </button>
      </div>
    )
  }

  return (
    <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)' }}>
      <Card style={{ background: 'var(--danger-subtle)', border: '1px solid rgba(244,63,94,0.25)', maxWidth: '520px' }}>
        <p style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--danger)', margin: '0 0 0.75rem' }}>
          ⚠ This will restore {fmt(totalGross)} gross ready stock and reopen {orderLineCount} order line{orderLineCount !== 1 ? 's' : ''}.
        </p>

        {affectedOrders.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 0.35rem' }}>
              Affected orders:
            </p>
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              {affectedOrders.map((o) => (
                <li key={o.id} style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.15rem' }}>
                  {o.customerName} —{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>{fmt(o.qty)} gross</strong> will reopen
                </li>
              ))}
            </ul>
          </div>
        )}

        <form action={formAction}>
          {/* reason is controlled; hidden field passes it to the server action */}
          <input type="hidden" name="void_reason" value={reason} />

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={labelStyle}>Reason (required)</label>
            <input
              style={{ ...inputStyle, width: '100%' }}
              placeholder="Why is this dispatch being voided?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ ...labelStyle, color: 'var(--danger)', fontWeight: 600 }}>
              Type VOID to confirm:
            </label>
            <input
              style={{
                ...inputStyle,
                width: '180px',
                fontFamily: 'monospace',
                fontWeight: 700,
                letterSpacing: '0.08em',
                border: confirmText.length > 0 && !isVoidTyped
                  ? '1px solid var(--danger)'
                  : isVoidTyped
                  ? '1px solid var(--success)'
                  : undefined,
              }}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="VOID"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                fontSize: '0.82rem',
                padding: '0.35rem 0.85rem',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                border: '1px solid var(--danger)',
                background: canSubmit ? 'var(--danger)' : 'var(--bg-elevated)',
                color: canSubmit ? 'white' : 'var(--text-muted)',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {submitLabel}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              style={{
                fontSize: '0.82rem',
                padding: '0.35rem 0.85rem',
                cursor: 'pointer',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              Cancel
            </button>
          </div>

          {state && 'error' in state && state.error && (
            <p style={{ ...msgError, marginTop: '0.75rem' }}>✗ {state.error}</p>
          )}
        </form>
      </Card>
    </div>
  )
}
