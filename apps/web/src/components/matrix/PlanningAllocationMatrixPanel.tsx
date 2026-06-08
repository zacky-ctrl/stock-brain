'use client'

import { useState, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { MatrixViewToggle } from './MatrixViewToggle'
import { MatrixGrid, PrintButton } from './MatrixGrid'
import { MatrixFilterBar } from './MatrixFilterBar'
import { buildMatrixFromPlanningRows, filterMatrixData } from '@stock-brain/domain'
import type { SizeMasterRow, DesignMasterRow, ColourMasterRow } from '@stock-brain/domain'
import type {
  PlanningAllocationRow,
  MatrixRow,
  MatrixCellHighlight,
  FilterConfig,
  ActiveFilters,
} from '@stock-brain/types'
import type { CSSProperties } from 'react'

export type PlanningAllocationMatrixPanelProps = {
  rows: PlanningAllocationRow[]
  sizeMaster: SizeMasterRow[]
  designMaster: DesignMasterRow[]
  colourMaster: ColourMasterRow[]
  printTitle: string
  children: ReactNode
  /** When true, skip the list/matrix toggle and always render the matrix. */
  matrixOnly?: boolean
}

type MatrixMetric = 'pending' | 'ready' | 'labour' | 'cut'

const STATUS_TO_HIGHLIGHT: Record<string, MatrixCellHighlight> = {
  ready_to_dispatch: 'covered',
  covered_by_wip:    'partial',
  partially_ready:   'partial',
  partial_coverage:  'shortage',
  no_coverage:       'shortage',
}

const STATUS_LABELS: Record<string, string> = {
  ready_to_dispatch: 'Ready to dispatch',
  covered_by_wip:    'Covered by WIP',
  partially_ready:   'Partially ready',
  partial_coverage:  'Partial coverage',
  no_coverage:       'No coverage',
}

const METRIC_HIGHLIGHT: Record<MatrixMetric, MatrixCellHighlight> = {
  pending: 'normal',
  ready:   'covered',
  labour:  'partial',
  cut:     'shortage',
}

export function PlanningAllocationMatrixPanel({
  rows,
  sizeMaster,
  designMaster,
  colourMaster,
  printTitle,
  children,
  matrixOnly = false,
}: PlanningAllocationMatrixPanelProps) {
  const [view, setView] = useState<'list' | 'matrix'>(matrixOnly ? 'matrix' : 'list')
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({})
  const [metric, setMetric] = useState<MatrixMetric>('pending')

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  // Derive filter options from the raw rows
  const filterConfig: FilterConfig = useMemo(() => {
    const customersSeen = new Map<string, string>()
    const statusesSeen = new Set<string>()
    const designsSeen = new Map<string, string>()
    const coloursSeen = new Map<string, string>()

    for (const r of rows) {
      customersSeen.set(r.customer_id, r.customer_name)
      statusesSeen.add(r.planning_status)
    }

    const designIdsInData = new Set(rows.map((r) => r.shape_design_id))
    const colourIdsInData = new Set(rows.map((r) => r.bindi_colour_id))
    for (const d of designMaster) {
      if (designIdsInData.has(d.id)) designsSeen.set(d.id, d.name)
    }
    for (const c of colourMaster) {
      if (colourIdsInData.has(c.id)) coloursSeen.set(c.id, c.code)
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
        {
          key: 'status',
          label: 'Status',
          multiSelect: true,
          options: [...statusesSeen].map((s) => ({ id: s, label: STATUS_LABELS[s] ?? s })),
        },
        {
          key: 'customer',
          label: 'Customer',
          options: [...customersSeen.entries()].map(([id, label]) => ({ id, label })),
        },
      ],
    }
  }, [rows, designMaster, colourMaster])

  // Apply customer + status filters and substitute metric value into open_qty
  const filteredPlanningRows = useMemo(() => {
    const customerFilter = activeFilters['customer'] ?? []
    const statusFilter = activeFilters['status'] ?? []

    return rows
      .filter((r) => customerFilter.length === 0 || customerFilter.includes(r.customer_id))
      .filter((r) => statusFilter.length === 0 || statusFilter.includes(r.planning_status))
      .map((r) => {
        let cellQty: number
        if (metric === 'ready') {
          cellQty = r.ready_allocated_qty
        } else if (metric === 'labour') {
          cellQty = r.cuttings_allocated_qty
        } else if (metric === 'cut') {
          const isCutStatus = r.planning_status === 'cut_on_machine'
            || r.planning_status === 'cut_on_machine_override'
            || r.planning_status === 'procure_velvet'
          cellQty = isCutStatus ? r.shortage_qty : 0
        } else {
          cellQty = r.open_qty
        }
        return {
          shape_design_id:     r.shape_design_id,
          bindi_colour_id:     r.bindi_colour_id,
          size_id:             r.size_id,
          open_qty:            cellQty,
          ready_allocated_qty: r.ready_allocated_qty,
          wip_allocated_qty:   r.wip_allocated_qty,
          shortage_qty:        r.shortage_qty,
          planning_status:     r.planning_status,
          recommended_action:  r.recommended_action,
        }
      })
  }, [rows, activeFilters, metric])

  // Build matrix from filtered planning rows
  const fullMatrixData = useMemo(() => {
    if (sizeMaster.length === 0 || designMaster.length === 0 || colourMaster.length === 0) return null
    return buildMatrixFromPlanningRows(filteredPlanningRows, sizeMaster, designMaster, colourMaster, {
      context_label: 'Shortage / Planning Report',
      date_label: today,
    })
  }, [filteredPlanningRows, sizeMaster, designMaster, colourMaster, today])

  // Apply design/colour filters to the matrix
  const matrixData = useMemo(
    () => fullMatrixData ? filterMatrixData(fullMatrixData, activeFilters, { design: 'design', colour: 'colour' }) : null,
    [fullMatrixData, activeFilters],
  )

  const highlightCell = useCallback((row: MatrixRow, sizeId: string): MatrixCellHighlight => {
    if (metric !== 'pending') {
      // For non-pending metrics, use a fixed highlight per metric (non-zero cells only)
      const cellQty = row.cells[sizeId] ?? 0
      return cellQty > 0 ? METRIC_HIGHLIGHT[metric] : 'normal'
    }
    const cellStatus = (row.metadata?.cell_status ?? {}) as Record<string, string>
    const status = cellStatus[sizeId] ?? 'ready_to_dispatch'
    return STATUS_TO_HIGHLIGHT[status] ?? 'normal'
  }, [metric])

  const toggleBarStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '0.75rem',
  }

  const metricBtnBase: CSSProperties = {
    cursor: 'pointer',
    padding: '0.25rem 0.65rem',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
  }

  function metricBtn(m: MatrixMetric, color?: string): CSSProperties {
    const active = metric === m
    return {
      ...metricBtnBase,
      background: active && color ? `${color}22` : (active ? 'var(--bg-secondary)' : 'var(--bg-elevated)'),
      color: active && color ? color : (active ? 'var(--text-primary)' : 'var(--text-secondary)'),
      borderColor: active && color ? color : 'var(--border)',
    }
  }

  return (
    <div>
      {!matrixOnly && (
        <div style={toggleBarStyle} className="no-print">
          <MatrixViewToggle view={view} onViewChange={setView} />
          {view === 'matrix' && <PrintButton label="Print" />}
        </div>
      )}

      {view === 'list' && children}

      {view === 'matrix' && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }} className="no-print">
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginRight: '0.1rem' }}>Show:</span>
            <button onClick={() => setMetric('pending')} style={metricBtn('pending')}>Pending</button>
            <button onClick={() => setMetric('ready')} style={metricBtn('ready', 'var(--success)')}>Ready</button>
            <button onClick={() => setMetric('labour')} style={metricBtn('labour', 'var(--warning)')}>Labour</button>
            <button onClick={() => setMetric('cut')} style={metricBtn('cut', 'var(--danger)')}>Cut</button>
            {matrixOnly && <div style={{ marginLeft: 'auto' }}><PrintButton label="Print" /></div>}
          </div>
          <MatrixFilterBar
            filterConfig={filterConfig}
            activeFilters={activeFilters}
            onFilterChange={setActiveFilters}
          />
          {matrixData && matrixData.rows.length > 0 ? (
            <MatrixGrid
              data={matrixData}
              mode="view"
              highlightCell={highlightCell}
              printTitle={`${printTitle} — ${metric.charAt(0).toUpperCase() + metric.slice(1)}`}
            />
          ) : (
            <p style={{ fontFamily: 'monospace', fontSize: '0.88rem', color: '#888' }}>
              No data matching current filters.
            </p>
          )}
        </>
      )}
    </div>
  )
}
