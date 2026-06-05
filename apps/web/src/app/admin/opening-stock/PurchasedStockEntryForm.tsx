'use client'

import { useActionState, useTransition, useCallback, useRef, useMemo, useEffect } from 'react'
import { applyPurchasedCuttingsStock } from './actions'
import type { ActionState } from '@/lib/masters'
import { fieldWrap, inputStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'
import { MatrixGrid } from '@/components/matrix/MatrixGrid'
import { buildMatrixFromOrderLines } from '@stock-brain/domain'
import type { SizeMasterRow, DesignMasterRow, ColourMasterRow } from '@stock-brain/domain'
import type { MatrixChangeEvent } from '@stock-brain/types'

export type PurchasedStockEntryFormProps = {
  sizeMaster: SizeMasterRow[]
  designMaster: DesignMasterRow[]
  colourMaster: ColourMasterRow[]
}

export function PurchasedStockEntryForm({ sizeMaster, designMaster, colourMaster }: PurchasedStockEntryFormProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    applyPurchasedCuttingsStock,
    null,
  )
  const [, startTransition] = useTransition()
  const matrixChanges = useRef<MatrixChangeEvent[]>([])
  const today = new Date().toISOString().split('T')[0]

  const handleCellChange = useCallback((change: MatrixChangeEvent) => {
    const idx = matrixChanges.current.findIndex(
      (c) => c.design_id === change.design_id && c.colour_id === change.colour_id && c.size_id === change.size_id,
    )
    if (idx >= 0) matrixChanges.current[idx] = change
    else matrixChanges.current.push(change)
  }, [])

  const matrixData = useMemo(
    () => buildMatrixFromOrderLines([], sizeMaster, designMaster, colourMaster, { showAllRows: true }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useEffect(() => {
    if (state && 'success' in state) {
      localStorage.removeItem('matrix-draft-opening-purchased')
    }
  }, [state])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const lines = matrixChanges.current
      .filter((c) => c.quantity > 0)
      .map((c) => ({
        shape_design_id: c.design_id,
        bindi_colour_id: c.colour_id,
        size_id: c.size_id,
        quantity: c.quantity,
      }))
    fd.set('lines', JSON.stringify(lines))
    startTransition(() => { formAction(fd) })
  }

  return (
    <form onSubmit={handleSubmit}>
      {state && 'error' in state && <p style={msgError}>✗ {state.error}</p>}
      {state && 'success' in state && (
        <div style={{ ...msgOk, marginBottom: '1.25rem', lineHeight: '1.6' }}>
          <p style={{ margin: '0 0 0.35rem' }}>✓ Purchased stock recorded. {state.success}</p>
          <p style={{ margin: 0 }}>
            <a href="/operations/cutting-sessions/stock" style={{ color: 'inherit', fontWeight: 600, textDecoration: 'underline' }}>
              View cuttings stock →
            </a>
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', maxWidth: '640px', marginBottom: '1rem' }}>
        <div style={fieldWrap}>
          <label>Purchase Date</label>
          <input name="purchase_date" type="date" defaultValue={today} style={inputStyle} required />
        </div>

        <div style={fieldWrap}>
          <label>Supplier (optional)</label>
          <input name="supplier" style={inputStyle} placeholder="Supplier name" />
        </div>

        <div style={fieldWrap}>
          <label>Bill / Invoice No. (optional)</label>
          <input name="bill_ref" style={inputStyle} placeholder="Invoice or bill number" />
        </div>

        <div style={{ ...fieldWrap, gridColumn: '1 / -1' }}>
          <label>Notes / Reason (required, min 3 chars)</label>
          <input
            name="notes"
            style={inputStyle}
            placeholder="e.g. Purchased Maroon cuttings for urgent order"
            required
            minLength={3}
          />
        </div>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem' }}>
          Enter quantities in gross. Each SKU is <strong>added</strong> to the existing cuttings balance.
          Every entry creates a stock_correction audit record tagged <code>PURCHASED:</code>.
        </p>
        <MatrixGrid data={matrixData} mode="edit" onCellChange={handleCellChange} draftKey="opening-purchased" />
      </div>

      <button type="submit" disabled={isPending} style={{ ...btnPrimary, marginTop: 0 }}>
        {isPending ? 'Applying…' : 'Record Purchased Stock'}
      </button>
    </form>
  )
}
