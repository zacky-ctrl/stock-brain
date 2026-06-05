'use client'

import { useActionState, useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createCuttingSessionAction } from './actions'
import type { ActionState } from '@/lib/masters'
import { fieldWrap, inputStyle, selectStyle, btnPrimary, msgError } from '@/lib/ui'
import { MatrixGrid } from '@/components/matrix/MatrixGrid'
import { MatrixFilterBar } from '@/components/matrix/MatrixFilterBar'
import { buildMatrixFromOrderLines, filterMatrixData } from '@stock-brain/domain'
import type { SizeMasterRow, DesignMasterRow, ColourMasterRow } from '@stock-brain/domain'
import type { MatrixChangeEvent, FilterConfig, ActiveFilters } from '@stock-brain/types'

export type MasterOption = { id: string; label: string }

export type CreateCuttingSessionFormProps = {
  machines: MasterOption[]
  sizeMaster: SizeMasterRow[]
  designMaster: DesignMasterRow[]
  colourMaster: ColourMasterRow[]
  velvetRatesExist: boolean
}

export function CreateCuttingSessionForm({
  machines,
  sizeMaster,
  designMaster,
  colourMaster,
  velvetRatesExist,
}: CreateCuttingSessionFormProps) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createCuttingSessionAction,
    null,
  )

  useEffect(() => {
    if (state && 'success' in state) {
      localStorage.removeItem('matrix-draft-cutting-session-new')
      router.push(`/operations/cutting-sessions/${state.success}`)
    }
  }, [state, router])

  const [machineId, setMachineId] = useState('')
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().split('T')[0])
  const [velvetBundles, setVelvetBundles] = useState('')
  const [notes, setNotes] = useState('')
  const [skipVelvet, setSkipVelvet] = useState(!velvetRatesExist)
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({})
  const matrixChanges = useRef<MatrixChangeEvent[]>([])

  const handleMatrixCellChange = useCallback((change: MatrixChangeEvent) => {
    const idx = matrixChanges.current.findIndex(
      (c) =>
        c.design_id === change.design_id &&
        c.colour_id === change.colour_id &&
        c.size_id === change.size_id,
    )
    if (idx >= 0) {
      matrixChanges.current[idx] = change
    } else {
      matrixChanges.current.push(change)
    }
  }, [])

  const fullMatrixData = useMemo(
    () =>
      sizeMaster.length > 0 && designMaster.length > 0 && colourMaster.length > 0
        ? buildMatrixFromOrderLines([], sizeMaster, designMaster, colourMaster, { showAllRows: true })
        : null,
    // Masters are stable within a session
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
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
        {
          key: 'design',
          label: 'Design',
          options: [...designsSeen.entries()].map(([id, label]) => ({ id, label })),
        },
        {
          key: 'colour',
          label: 'CLR',
          options: [...coloursSeen.entries()].map(([id, label]) => ({ id, label })),
        },
      ],
    }
  }, [fullMatrixData])

  const filteredMatrixData = useMemo(
    () =>
      fullMatrixData
        ? filterMatrixData(fullMatrixData, activeFilters, { design: 'design', colour: 'colour' })
        : null,
    [fullMatrixData, activeFilters],
  )

  const buildLinesPayload = () => {
    const changes = matrixChanges.current.filter((c) => c.quantity > 0)
    return changes.map((c) => ({
      shape_design_id: c.design_id,
      bindi_colour_id: c.colour_id,
      size_id: c.size_id,
      quantity_gross: c.quantity,
    }))
  }

  return (
    <div>
      {!isPending && state && 'error' in state && (
        <p style={{ ...msgError, marginBottom: '1rem' }}>✗ {state.error}</p>
      )}

      <form
        action={(formData) => {
          formData.set('lines', JSON.stringify(buildLinesPayload()))
          formAction(formData)
        }}
      >
        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, margin: '0 0 0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Session Details
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', maxWidth: '540px', marginBottom: '1rem' }}>
          <div style={fieldWrap}>
            <label>Machine</label>
            <select
              name="machine_id"
              style={selectStyle}
              required
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
            >
              <option value="">Select machine…</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          <div style={fieldWrap}>
            <label>Session Date</label>
            <input
              name="session_date"
              type="date"
              style={inputStyle}
              required
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
            />
          </div>
          {!skipVelvet && (
            <div style={fieldWrap}>
              <label>Velvet Bundles Consumed</label>
              <input
                name="velvet_bundles_consumed"
                type="number"
                min="0.001"
                step="0.001"
                style={inputStyle}
                placeholder="e.g. 12.5"
                value={velvetBundles}
                onChange={(e) => setVelvetBundles(e.target.value)}
                required
              />
            </div>
          )}
          <div style={fieldWrap}>
            <label>Notes (optional)</label>
            <input
              name="notes"
              style={inputStyle}
              placeholder="Any notes about this session"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <input type="hidden" name="skip_velvet_deduction" value={skipVelvet ? 'true' : 'false'} />

        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, margin: '0 0 0.5rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Velvet Tracking
          </h3>
          {!velvetRatesExist ? (
            <div style={{ background: 'var(--warning-subtle)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', maxWidth: '540px' }}>
              <p style={{ margin: '0 0 0.25rem', fontWeight: 600, color: 'var(--warning)' }}>⚠ Velvet deduction is disabled</p>
              <p style={{ margin: '0 0 0.15rem' }}>Conversion rates have not been set up yet. Velvet will not be deducted from this session.</p>
              <p style={{ margin: 0 }}>
                Set up rates in{' '}
                <a href="/masters/velvet-rates" style={{ color: 'var(--info)' }}>Masters → Velvet Rates</a>
                {' '}to enable automatic velvet tracking.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxWidth: '380px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: 'var(--text-sm)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', border: `1px solid ${!skipVelvet ? 'var(--info)' : 'var(--border)'}`, background: !skipVelvet ? 'color-mix(in srgb, var(--info) 8%, transparent)' : 'transparent' }}>
                <input type="radio" name="velvet_mode" checked={!skipVelvet} onChange={() => setSkipVelvet(false)} style={{ accentColor: 'var(--info)' }} />
                Deduct velvet automatically
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: 'var(--text-sm)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', border: `1px solid ${skipVelvet ? 'var(--warning)' : 'var(--border)'}`, background: skipVelvet ? 'var(--warning-subtle)' : 'transparent' }}>
                <input type="radio" name="velvet_mode" checked={skipVelvet} onChange={() => setSkipVelvet(true)} style={{ accentColor: 'var(--warning)' }} />
                Skip velvet deduction
              </label>
            </div>
          )}
        </div>

        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, margin: '1rem 0 0.4rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Quantity Cut — Design × Colour × Size
        </h3>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '0 0 0.75rem' }}>
          Enter quantities in gross. Leave blank or zero to skip.
          Cuttings are brand-neutral and dabbi-colour-neutral at this stage.
        </p>

        {fullMatrixData && filteredMatrixData ? (
          <div>
            <MatrixFilterBar
              filterConfig={filterConfig}
              activeFilters={activeFilters}
              onFilterChange={setActiveFilters}
            />
            <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
              <MatrixGrid
                data={filteredMatrixData}
                mode="edit"
                onCellChange={handleMatrixCellChange}
                draftKey="cutting-session-new"
              />
            </div>
          </div>
        ) : (
          <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>
            No masters loaded — cannot render matrix. Check that shapes, bindi colours, and sizes are configured.
          </p>
        )}

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '1.5rem' }}>
          <button
            type="submit"
            disabled={isPending}
            style={{ ...btnPrimary, fontWeight: 'bold', marginTop: 0 }}
          >
            {isPending ? 'Saving…' : 'Create Cutting Session (Draft)'}
          </button>
          <a
            href="/operations/cutting-sessions"
            style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', textDecoration: 'none' }}
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  )
}
