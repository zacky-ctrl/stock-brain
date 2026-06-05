'use client'

import { useActionState, useTransition, useCallback, useRef, useMemo, useEffect } from 'react'
import { applyReadyStockOpeningStock } from './actions'
import type { ActionState } from '@/lib/masters'
import { fieldWrap, inputStyle, selectStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'
import { MatrixGrid } from '@/components/matrix/MatrixGrid'
import { buildMatrixFromOrderLines } from '@stock-brain/domain'
import type { SizeMasterRow, DesignMasterRow, ColourMasterRow } from '@stock-brain/domain'
import type { MatrixChangeEvent } from '@stock-brain/types'

export type MasterOption = { id: string; label: string }

export type ReadyStockEntryFormProps = {
  sizeMaster: SizeMasterRow[]
  designMaster: DesignMasterRow[]
  colourMaster: ColourMasterRow[]
  dabbiOptions: MasterOption[]
  brandOptions: MasterOption[]
}

export function ReadyStockEntryForm({
  sizeMaster, designMaster, colourMaster,
  dabbiOptions, brandOptions,
}: ReadyStockEntryFormProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    applyReadyStockOpeningStock,
    null,
  )
  const [, startTransition] = useTransition()

  const matrixChanges = useRef<MatrixChangeEvent[]>([])

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
      localStorage.removeItem('matrix-draft-opening-ready')
    }
  }, [state])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const lines = matrixChanges.current
      .filter((c) => c.quantity > 0)
      .map((c) => ({ shape_design_id: c.design_id, bindi_colour_id: c.colour_id, size_id: c.size_id, quantity: c.quantity }))
    fd.set('lines', JSON.stringify(lines))
    startTransition(() => { formAction(fd) })
  }

  return (
    <form onSubmit={handleSubmit}>
      {state && 'error' in state && <p style={msgError}>✗ {state.error}</p>}
      {state && 'success' in state && (
        <div style={{ ...msgOk, marginBottom: '1.25rem', lineHeight: '1.6' }}>
          <p style={{ margin: '0 0 0.35rem' }}>✓ Opening balance recorded successfully. {state.success}</p>
          <p style={{ margin: 0 }}>
            <a href="/planning/ready" style={{ color: 'inherit', fontWeight: 600, textDecoration: 'underline' }}>
              View ready stock →
            </a>
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div style={{ ...fieldWrap, minWidth: '180px' }}>
          <label>Dabbi Colour</label>
          <select name="dabbi_colour_id" style={selectStyle} required>
            <option value="">Select dabbi…</option>
            {dabbiOptions.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
        <div style={{ ...fieldWrap, minWidth: '180px' }}>
          <label>Brand</label>
          <select name="brand_id" style={selectStyle} required>
            <option value="">Select brand…</option>
            {brandOptions.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ ...fieldWrap, maxWidth: '500px', marginBottom: '1rem' }}>
        <label>Reason / Notes (required, min 3 chars)</label>
        <input name="reason" style={inputStyle} placeholder="e.g. Opening balance entry 2026-05-31" required minLength={3} />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem' }}>
          Quantities in gross. Dabbi colour and brand apply to all cells.
        </p>
        <MatrixGrid data={matrixData} mode="edit" onCellChange={handleCellChange} draftKey="opening-ready" />
      </div>

      <button type="submit" disabled={isPending} style={{ ...btnPrimary, marginTop: 0 }}>
        {isPending ? 'Applying…' : 'Apply Ready Stock Opening Balance'}
      </button>
    </form>
  )
}
