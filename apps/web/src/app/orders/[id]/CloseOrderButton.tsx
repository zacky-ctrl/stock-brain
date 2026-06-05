'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { closeOrderAction } from './actions'

type Props = {
  orderId: string
  totalOpenQty: number
  openLineCount: number
  reservedQty: number
}

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

export function CloseOrderButton({ orderId, totalOpenQty, openLineCount, reservedQty }: Props) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const panelRef = useRef<HTMLDivElement>(null)

  // Close panel on outside click
  useEffect(() => {
    if (!showConfirm) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowConfirm(false)
        setReason('')
        setError(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showConfirm])

  function handleConfirm() {
    if (!reason.trim()) {
      setError('Reason is required')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await closeOrderAction({ orderId, reason: reason.trim() })
      if (result.error) {
        setError(result.error)
      }
      // On success, revalidatePath triggers a server re-render automatically
    })
  }

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <button
        onClick={() => { setShowConfirm(!showConfirm); setError(null) }}
        style={{
          padding: '0.4rem 0.85rem',
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
          background: 'var(--bg-elevated)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
        }}
      >
        Close Order
      </button>

      {showConfirm && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 0.5rem)',
          right: 0,
          width: '340px',
          zIndex: 200,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-md)',
          padding: '1.25rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--text-base)', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
            Close this order?
          </div>

          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: '0.5rem', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-primary)' }}>{fmt(totalOpenQty)} gross</strong> across{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{openLineCount}</strong> line{openLineCount !== 1 ? 's' : ''} will be marked as closed.
          </div>

          {reservedQty > 0 && (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              <strong style={{ color: 'var(--warning)' }}>{fmt(reservedQty)} gross</strong> reserved stock will be released.
            </div>
          )}

          <div style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            marginBottom: '1rem',
            padding: '0.5rem 0.65rem',
            background: 'var(--danger-subtle)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(255,71,87,0.2)',
          }}>
            This cannot be undone without manual correction.
          </div>

          <label style={{ display: 'block', marginBottom: '0.85rem' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Reason (required)
            </span>
            <textarea
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(null) }}
              placeholder="Enter reason for closing this order…"
              rows={2}
              disabled={isPending}
              style={{
                width: '100%',
                padding: '0.5rem 0.65rem',
                fontSize: 'var(--text-sm)',
                border: error ? '1px solid var(--danger)' : '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-base)',
                color: 'var(--text-primary)',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </label>

          {error && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)', marginBottom: '0.75rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleConfirm}
              disabled={isPending || !reason.trim()}
              style={{
                flex: 1,
                padding: '0.45rem 0.75rem',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                background: isPending ? 'var(--text-muted)' : 'var(--danger)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: isPending || !reason.trim() ? 'not-allowed' : 'pointer',
                opacity: isPending || !reason.trim() ? 0.7 : 1,
              }}
            >
              {isPending ? 'Closing…' : 'Confirm Close Order'}
            </button>
            <button
              onClick={() => { setShowConfirm(false); setReason(''); setError(null) }}
              disabled={isPending}
              style={{
                padding: '0.45rem 0.75rem',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                background: 'var(--bg-base)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
