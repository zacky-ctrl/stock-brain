'use client'

import { useActionState, useState, useTransition } from 'react'
import { applyVelvetOpeningStock } from './actions'
import type { ActionState } from '@/lib/masters'
import { fieldWrap, inputStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'

const METRES_PER_BUNDLE = 25

export type VelvetEntryFormProps = {
  currentBundles: number
}

export function VelvetEntryForm({ currentBundles }: VelvetEntryFormProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    applyVelvetOpeningStock,
    null,
  )
  const [, startTransition] = useTransition()

  const [unit, setUnit] = useState<'bundles' | 'metres'>('bundles')
  const [rawQty, setRawQty] = useState('')

  const bundlesValue = unit === 'bundles'
    ? (parseFloat(rawQty) || 0)
    : (parseFloat(rawQty) || 0) / METRES_PER_BUNDLE

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('bundles', String(bundlesValue))
    startTransition(() => { formAction(fd) })
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '450px' }}>
      {state && 'error' in state && <p style={msgError}>✗ {state.error}</p>}
      {state && 'success' in state && <p style={{ ...msgOk, marginBottom: '1rem' }}>✓ {state.success}</p>}

      <div style={{ fontSize: '0.85rem', padding: '0.75rem 1rem', background: 'var(--bg-elevated)', border: '1px solid var(--border)', marginBottom: '1.25rem' }}>
        <div>Current balance: <strong>{currentBundles.toFixed(3)} bundles</strong></div>
        <div style={{ color: 'var(--text-secondary)' }}>{(currentBundles * METRES_PER_BUNDLE).toFixed(1)} metres</div>
      </div>

      <div style={{ ...fieldWrap, marginBottom: '1rem' }}>
        <label>Unit</label>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.88rem', cursor: 'pointer' }}>
            <input type="radio" checked={unit === 'bundles'} onChange={() => setUnit('bundles')} /> Bundles
          </label>
          <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.88rem', cursor: 'pointer' }}>
            <input type="radio" checked={unit === 'metres'} onChange={() => setUnit('metres')} /> Metres
          </label>
        </div>
      </div>

      <div style={{ ...fieldWrap, marginBottom: '1rem' }}>
        <label>New Balance ({unit === 'bundles' ? 'bundles' : 'metres'})</label>
        <input
          type="number"
          min="0"
          step={unit === 'bundles' ? '0.001' : '0.1'}
          style={inputStyle}
          value={rawQty}
          onChange={(e) => setRawQty(e.target.value)}
          placeholder={unit === 'bundles' ? 'e.g. 12.500' : 'e.g. 312.5'}
          required
        />
        {rawQty && (
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            = {bundlesValue.toFixed(3)} bundles = {(bundlesValue * METRES_PER_BUNDLE).toFixed(1)} metres
          </span>
        )}
      </div>

      <div style={{ ...fieldWrap, marginBottom: '1.25rem' }}>
        <label>Reason (required, min 3 chars)</label>
        <input name="reason" style={inputStyle} placeholder="e.g. Physical count — opening balance" required minLength={3} />
      </div>

      <button type="submit" disabled={isPending || !rawQty} style={{ ...btnPrimary, marginTop: 0 }}>
        {isPending ? 'Applying…' : 'Set Velvet Balance'}
      </button>
    </form>
  )
}
