'use client'

import { useActionState, useState, useTransition, useCallback, useRef, useMemo, useEffect } from 'react'
import { applyCuttingsOpeningStock } from './actions'
import type { ActionState } from '@/lib/masters'
import { fieldWrap, inputStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'
import { MatrixGrid } from '@/components/matrix/MatrixGrid'
import { buildMatrixFromOrderLines } from '@stock-brain/domain'
import type { SizeMasterRow, DesignMasterRow, ColourMasterRow } from '@stock-brain/domain'
import type { MatrixChangeEvent } from '@stock-brain/types'

export type CuttingsEntryFormProps = {
  sizeMaster: SizeMasterRow[]
  designMaster: DesignMasterRow[]
  colourMaster: ColourMasterRow[]
}

export function CuttingsEntryForm({ sizeMaster, designMaster, colourMaster }: CuttingsEntryFormProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    applyCuttingsOpeningStock,
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
      localStorage.removeItem('matrix-draft-opening-cuttings')
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
            <a href="/operations/cutting-sessions/stock" style={{ color: 'inherit', fontWeight: 600, textDecoration: 'underline' }}>
              View cuttings stock →
            </a>
          </p>
        </div>
      )}

      <div style={{ ...fieldWrap, maxWidth: '500px', marginBottom: '1rem' }}>
        <label>Reason / Notes (required, min 3 chars)</label>
        <input name="reason" style={inputStyle} placeholder="e.g. Physical count 2026-05-31 — opening balance entry" required minLength={3} />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem' }}>
          Enter quantities in gross. Cells left at zero are skipped.
        </p>
        <MatrixGrid data={matrixData} mode="edit" onCellChange={handleCellChange} draftKey="opening-cuttings" />
      </div>

      <button type="submit" disabled={isPending} style={{ ...btnPrimary, marginTop: 0 }}>
        {isPending ? 'Applying…' : 'Apply Cuttings Opening Stock'}
      </button>
    </form>
  )
}
