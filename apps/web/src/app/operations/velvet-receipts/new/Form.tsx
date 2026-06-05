'use client'

import { useActionState, useState } from 'react'
import { recordVelvetReceiptAction } from './actions'
import type { ActionState } from '@/lib/masters'
import { fieldWrap, inputStyle, btnPrimary, msgError } from '@/lib/ui'

const METRES_PER_BUNDLE = 25 // mirrored here for live UI calculation only

type Unit = 'bundles' | 'metres'

type ColourOption = { id: string; code: string; name: string | null }

type Props = {
  bindiColours: ColourOption[]
}

function fmt3(n: number) { return n.toFixed(3) }
function fmt1(n: number) { return n.toFixed(1) }

export function VelvetReceiptForm({ bindiColours }: Props) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    recordVelvetReceiptAction,
    null,
  )
  const today = new Date().toISOString().split('T')[0]
  const [unit, setUnit] = useState<Unit>('bundles')
  const [qty, setQty] = useState('')

  const parsed = parseFloat(qty)
  const valid = Number.isFinite(parsed) && parsed > 0

  const metresValue = valid
    ? unit === 'bundles' ? parsed * METRES_PER_BUNDLE : parsed
    : 0

  const bundlesRefValue = valid ? metresValue / METRES_PER_BUNDLE : 0

  const helperText = valid
    ? unit === 'bundles'
      ? `= ${fmt1(parsed * METRES_PER_BUNDLE)} metres`
      : `= ${fmt3(parsed / METRES_PER_BUNDLE)} bundles`
    : null

  const toggleActive = {
    fontSize: 'var(--text-sm)',
    padding: '0.25rem 0.75rem',
    border: '1px solid var(--accent)',
    background: 'var(--accent)',
    color: 'white',
    cursor: 'pointer',
  }

  const toggleInactive = {
    fontSize: 'var(--text-sm)',
    padding: '0.25rem 0.75rem',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  }

  return (
    <form action={formAction}>
          <input type="hidden" name="unit" value={unit} />
      <input type="hidden" name="quantity" value={qty} />

      {state && 'error' in state && (
        <p style={{ ...msgError, marginBottom: '0.75rem' }}>✗ {state.error}</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', maxWidth: '640px', marginBottom: '1.25rem' }}>
        <div style={fieldWrap}>
          <label>Receipt Date</label>
          <input name="receipt_date" type="date" defaultValue={today} style={inputStyle} required />
        </div>

        <div style={fieldWrap}>
          <label>Unit</label>
          <div style={{ display: 'flex', gap: 0 }}>
            <button type="button" onClick={() => setUnit('bundles')} style={{ ...unit === 'bundles' ? toggleActive : toggleInactive, borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)', borderRight: 'none' }}>
              Bundles
            </button>
            <button type="button" onClick={() => setUnit('metres')} style={{ ...unit === 'metres' ? toggleActive : toggleInactive, borderRadius: '0 var(--radius-sm) var(--radius-sm) 0' }}>
              Metres
            </button>
          </div>
        </div>

        <div style={fieldWrap}>
          <label>{unit === 'bundles' ? 'Bundles Received' : 'Metres Received'}</label>
          <input
            type="number"
            min="0.001"
            step="0.001"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            style={inputStyle}
            placeholder={unit === 'bundles' ? 'e.g. 4' : 'e.g. 100'}
            required
          />
          {helperText && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success)', marginTop: '0.2rem' }}>
              {helperText}
            </span>
          )}
        </div>

        <div style={fieldWrap}>
          <label>Velvet Colour (required)</label>
          <select name="bindi_colour_id" defaultValue="" style={inputStyle} required>
            <option value="" disabled>Select colour…</option>
            {bindiColours.map((c) => (
              <option key={c.id} value={c.id}>{c.name ?? c.code}</option>
            ))}
          </select>
        </div>

        <div style={fieldWrap}>
          <label>Supplier (optional)</label>
          <input name="supplier" style={inputStyle} placeholder="Supplier name" />
        </div>

        <div style={fieldWrap}>
          <label>Reference / Invoice (optional)</label>
          <input name="reference" style={inputStyle} placeholder="Invoice or receipt number" />
        </div>

        <div style={fieldWrap}>
          <label>Notes (optional)</label>
          <input name="notes" style={inputStyle} placeholder="Any notes" />
        </div>
      </div>

      {valid && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Will record: <strong>{fmt1(metresValue)} metres</strong> received ({fmt3(bundlesRefValue)} bundles ref)
        </p>
      )}

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button type="submit" disabled={isPending || !valid} style={{ ...btnPrimary, fontWeight: 'bold', marginTop: 0 }}>
          {isPending ? 'Saving…' : 'Record Receipt'}
        </button>
        <a href="/operations/velvet-receipts" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          Cancel
        </a>
      </div>
    </form>
  )
}
