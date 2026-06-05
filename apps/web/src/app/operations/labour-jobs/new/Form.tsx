'use client'

import { useActionState, useState, useCallback, useRef, useMemo } from 'react'
import { createLabourJob } from './actions'
import type { ActionState } from '@/lib/masters'
import { fieldWrap, inputStyle, selectStyle, btnPrimary, msgError } from '@/lib/ui'
import type { CSSProperties } from 'react'
import { MatrixViewToggle } from '@/components/matrix/MatrixViewToggle'
import { MatrixGrid } from '@/components/matrix/MatrixGrid'
import { MatrixFilterBar } from '@/components/matrix/MatrixFilterBar'
import { buildMatrixFromOrderLines, parseMatrixToOrderLines, filterMatrixData } from '@stock-brain/domain'
import type { SizeMasterRow, DesignMasterRow, ColourMasterRow } from '@stock-brain/domain'
import type { MatrixChangeEvent, FilterConfig, ActiveFilters } from '@stock-brain/types'

export type MasterOption = { id: string; label: string }

export type CreateLabourJobFormProps = {
  labourUnits: MasterOption[]
  shapes: MasterOption[]
  bindiColours: MasterOption[]
  sizes: MasterOption[]
  dabbiColours: MasterOption[]
  brands: MasterOption[]
  sizeMaster?: SizeMasterRow[]
  designMaster?: DesignMasterRow[]
  colourMaster?: ColourMasterRow[]
}

type LineState = {
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  brand_id: string
  quantity_sent_gross: string
}

const emptyLine = (): LineState => ({
  shape_design_id: '',
  bindi_colour_id: '',
  size_id: '',
  dabbi_colour_id: '',
  brand_id: '',
  quantity_sent_gross: '',
})

const lineBox: CSSProperties = {
  border: '1px solid var(--border)',
  padding: '0.75rem',
  marginBottom: '0.5rem',
  background: 'var(--bg-elevated)',
  borderRadius: 'var(--radius-sm)',
}

const lineGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 110px',
  gap: '0.5rem',
}

const smallLabel: CSSProperties = { fontSize: 'var(--text-xs)' }
const removeBtn: CSSProperties = {
  fontSize: 'var(--text-xs)', cursor: 'pointer',
  border: '1px solid var(--danger)', background: 'var(--danger-subtle)', padding: '0.15rem 0.5rem', color: 'var(--danger)',
  borderRadius: 'var(--radius-sm)',
}

const headerGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '0.5rem',
  marginBottom: '0.5rem',
}

export function CreateLabourJobForm({
  labourUnits, shapes, bindiColours, sizes, dabbiColours, brands,
  sizeMaster = [],
  designMaster = [],
  colourMaster = [],
}: CreateLabourJobFormProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(createLabourJob, null)
  const [labourUnitId, setLabourUnitId] = useState('')
  const [dateAssigned, setDateAssigned] = useState(() => new Date().toISOString().split('T')[0])
  const [expectedReturnDate, setExpectedReturnDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineState[]>([emptyLine()])
  const [view, setView] = useState<'list' | 'matrix'>('list')
  const [matrixDabbiId, setMatrixDabbiId] = useState<string>('')
  const [matrixBrandId, setMatrixBrandId] = useState<string>('')
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({})

  const matrixChanges = useRef<MatrixChangeEvent[]>([])

  const addLine = () => setLines((prev) => [...prev, emptyLine()])
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i))
  const updateLine = (i: number, field: keyof LineState, value: string) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))

  const handleMatrixCellChange = useCallback((change: MatrixChangeEvent) => {
    const idx = matrixChanges.current.findIndex(
      (c) => c.design_id === change.design_id && c.colour_id === change.colour_id && c.size_id === change.size_id,
    )
    if (idx >= 0) {
      matrixChanges.current[idx] = change
    } else {
      matrixChanges.current.push(change)
    }
  }, [])

  const canShowMatrix = sizeMaster.length > 0 && designMaster.length > 0 && colourMaster.length > 0

  const fullMatrixData = useMemo(() =>
    canShowMatrix
      ? buildMatrixFromOrderLines([], sizeMaster, designMaster, colourMaster, { showAllRows: true })
      : null,
    // Masters don't change within a session; stable dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canShowMatrix],
  )

  const filterConfig: FilterConfig = useMemo(() => {
    if (!fullMatrixData) return { fields: [] }
    const designsSeen = new Map<string, string>()
    const coloursSeen = new Map<string, string>()
    for (const row of fullMatrixData.rows) {
      designsSeen.set(row.design_id, row.design_name)
      coloursSeen.set(row.colour_id, row.colour_code)
    }
    return {
      fields: [
        { key: 'design', label: 'Design', options: [...designsSeen.entries()].map(([id, label]) => ({ id, label })) },
        { key: 'colour', label: 'CLR', options: [...coloursSeen.entries()].map(([id, label]) => ({ id, label })) },
      ],
    }
  }, [fullMatrixData])

  const emptyMatrixData = useMemo(
    () => fullMatrixData ? filterMatrixData(fullMatrixData, activeFilters, { design: 'design', colour: 'colour' }) : null,
    [fullMatrixData, activeFilters],
  )

  const buildMatrixLinesPayload = () => {
    if (!matrixDabbiId || !matrixBrandId) return null
    const inserts = parseMatrixToOrderLines(
      matrixChanges.current.filter((c) => c.quantity > 0),
      matrixDabbiId,
    )
    return inserts.map((ins) => ({
      shape_design_id:    ins.shape_design_id,
      bindi_colour_id:    ins.bindi_colour_id,
      size_id:            ins.size_id,
      dabbi_colour_id:    ins.dabbi_colour_id,
      brand_id:           matrixBrandId,
      quantity_sent_gross: ins.ordered_qty,
    }))
  }

  const listPayload = JSON.stringify(
    lines.map((l) => ({
      ...l,
      quantity_sent_gross: parseFloat(l.quantity_sent_gross) || 0,
    })),
  )

  const matrixPayload = JSON.stringify(buildMatrixLinesPayload() ?? [])

  const linesPayload = view === 'matrix' ? matrixPayload : listPayload

  return (
    <div className="labour-job-form">
      {state && 'error' in state && (
        <p style={{ ...msgError, marginBottom: '1rem' }}>✗ {state.error}</p>
      )}

      <form action={formAction}>
        <input type="hidden" name="lines" value={linesPayload} />

        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, margin: '0 0 0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Job Details
        </h3>

        <div className="labour-job-details" style={{ marginBottom: '1.5rem' }}>
          <div style={{ ...fieldWrap, marginBottom: '0.5rem' }}>
            <label>Labour Unit</label>
            <select
              name="labour_unit_id"
              style={selectStyle}
              required
              value={labourUnitId}
              onChange={(e) => setLabourUnitId(e.target.value)}
            >
              <option value="">Select labour unit…</option>
              {labourUnits.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </select>
          </div>

          <div className="labour-job-date-grid" style={headerGrid}>
            <div style={fieldWrap}>
              <label>Date Assigned</label>
              <input
                name="date_assigned"
                type="date"
                style={inputStyle}
                required
                value={dateAssigned}
                onChange={(e) => setDateAssigned(e.target.value)}
              />
            </div>
            <div style={fieldWrap}>
              <label>Expected Return (optional)</label>
              <input
                name="expected_return_date"
                type="date"
                style={inputStyle}
                value={expectedReturnDate}
                onChange={(e) => setExpectedReturnDate(e.target.value)}
              />
            </div>
          </div>

          <div style={fieldWrap}>
            <label>Notes (optional)</label>
            <input
              name="notes"
              style={inputStyle}
              placeholder="Any notes about this batch"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="labour-job-lines-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, margin: 0, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Lines — Cut Stock Being Issued
          </h3>
          {canShowMatrix && (
            <MatrixViewToggle view={view} onViewChange={setView} />
          )}
        </div>

        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '-0.25rem 0 0.75rem' }}>
          Dabbi colour and brand must be set at issue time — they determine the finished goods identity.
        </p>

        {/* ── Matrix mode ─────────────────────────────────────── */}
        {view === 'matrix' && fullMatrixData && (
          <div style={{ marginBottom: '1.25rem' }}>
            <MatrixFilterBar
              filterConfig={filterConfig}
              activeFilters={activeFilters}
              onFilterChange={setActiveFilters}
            />
            <div className="labour-job-matrix-masters" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', maxWidth: '440px', marginBottom: '0.75rem' }}>
              <div style={fieldWrap}>
                <label style={{ fontSize: 'var(--text-sm)' }}>Dabbi Colour (all cells)</label>
                <select
                  value={matrixDabbiId}
                  onChange={(e) => setMatrixDabbiId(e.target.value)}
                  style={selectStyle}
                  required
                >
                  <option value="">Select…</option>
                  {dabbiColours.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div style={fieldWrap}>
                <label style={{ fontSize: 'var(--text-sm)' }}>Brand (all cells)</label>
                <select
                  value={matrixBrandId}
                  onChange={(e) => setMatrixBrandId(e.target.value)}
                  style={selectStyle}
                  required
                >
                  <option value="">Select…</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '0 0 0.5rem' }}>
              Enter quantities in gross. Leave cells blank or zero to skip.
            </p>
            <div className="labour-job-matrix-wrap" style={{ overflowX: 'auto' }}>
              <MatrixGrid
                data={emptyMatrixData!}
                mode="edit"
                onCellChange={handleMatrixCellChange}
                draftKey="labour-job-new"
                compactMobile
              />
            </div>
            {(!matrixDabbiId || !matrixBrandId) && (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)', margin: '0.5rem 0 0' }}>
                Select dabbi colour and brand above before submitting.
              </p>
            )}
          </div>
        )}

        {/* ── List mode ─────────────────────────────────────────── */}
        {view === 'list' && lines.map((line, i) => (
          <div key={i} className="labour-job-line-card" style={lineBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ ...smallLabel, color: 'var(--text-secondary)' }}>Line {i + 1}</span>
              {lines.length > 1 && (
                <button type="button" onClick={() => removeLine(i)} style={removeBtn}>Remove</button>
              )}
            </div>
            <div className="labour-job-line-grid" style={lineGrid}>
              <div style={fieldWrap}>
                <label style={smallLabel}>Shape</label>
                <select value={line.shape_design_id} onChange={(e) => updateLine(i, 'shape_design_id', e.target.value)} style={selectStyle}>
                  <option value="">Select…</option>
                  {shapes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div style={fieldWrap}>
                <label style={smallLabel}>Bindi Colour</label>
                <select value={line.bindi_colour_id} onChange={(e) => updateLine(i, 'bindi_colour_id', e.target.value)} style={selectStyle}>
                  <option value="">Select…</option>
                  {bindiColours.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div style={fieldWrap}>
                <label style={smallLabel}>Size</label>
                <select value={line.size_id} onChange={(e) => updateLine(i, 'size_id', e.target.value)} style={selectStyle}>
                  <option value="">Select…</option>
                  {sizes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div style={fieldWrap}>
                <label style={smallLabel}>Dabbi Colour</label>
                <select value={line.dabbi_colour_id} onChange={(e) => updateLine(i, 'dabbi_colour_id', e.target.value)} style={selectStyle}>
                  <option value="">Select…</option>
                  {dabbiColours.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div style={fieldWrap}>
                <label style={smallLabel}>Brand</label>
                <select value={line.brand_id} onChange={(e) => updateLine(i, 'brand_id', e.target.value)} style={selectStyle}>
                  <option value="">Select…</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
                </select>
              </div>
              <div style={fieldWrap}>
                <label style={smallLabel}>Qty (gross)</label>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={line.quantity_sent_gross}
                  onChange={(e) => updateLine(i, 'quantity_sent_gross', e.target.value)}
                  style={inputStyle}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        ))}

        {view === 'list' && (
          <button type="button" className="labour-job-add-line" onClick={addLine} style={{ ...btnPrimary, marginTop: '0.25rem', marginBottom: '1.25rem', fontSize: 'var(--text-sm)' }}>
            + Add Line
          </button>
        )}

        <div className="labour-job-submit-row" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button type="submit" className="labour-job-submit" disabled={isPending} style={{ ...btnPrimary, fontWeight: 'bold', marginTop: 0 }}>
            {isPending ? 'Saving…' : 'Issue Labour Job'}
          </button>
          <a href="/operations/labour-jobs" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', textDecoration: 'none' }}>
            Cancel
          </a>
        </div>
      </form>
    </div>
  )
}
