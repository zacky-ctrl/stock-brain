'use client'

import { useState, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { MatrixViewToggle } from './MatrixViewToggle'
import { MatrixGrid, PrintButton } from './MatrixGrid'
import { MatrixFilterBar } from './MatrixFilterBar'
import { buildMatrixFromPlanningRows, filterMatrixData } from '@stock-brain/domain'
import type { SizeMasterRow, DesignMasterRow, ColourMasterRow, PlanningRowInput } from '@stock-brain/domain'
import type {
  PlanningAllocationRow,
  MatrixRow,
  MatrixGridData,
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
  /** Map of dabbi_colour_id → display code/name for section headings. */
  dabbiLabels?: Record<string, string>
}

type MatrixMetric = 'pending' | 'ready' | 'labour' | 'cut'

type DabbiMatrix = {
  dabbiId: string
  dabbiLabel: string
  matrix: MatrixGridData
}

const STATUS_TO_HIGHLIGHT: Record<string, MatrixCellHighlight> = {
  ready_to_dispatch:          'covered',
  ready_to_dispatch_override: 'covered',
  covered_by_wip:             'wip',
  give_to_labour:             'partial',
  give_to_labour_override:    'partial',
  cut_on_machine:             'shortage',
  cut_on_machine_override:    'shortage',
  procure_velvet:             'shortage',
  partially_ready:            'partial',
  partial_coverage:           'shortage',
  no_coverage:                'shortage',
}

const STATUS_LABELS: Record<string, string> = {
  ready_to_dispatch:          'Ready to dispatch',
  ready_to_dispatch_override: '⚠ Ready (Override)',
  covered_by_wip:             'Covered by WIP',
  give_to_labour:             'Give to Labour',
  give_to_labour_override:    '⚠ Labour (Override)',
  cut_on_machine:             'Cut on Machine',
  cut_on_machine_override:    '⚠ Cut (Override)',
  procure_velvet:             'Procure Velvet',
  partially_ready:            'Partially ready',
  partial_coverage:           'Partial coverage',
  no_coverage:                'No coverage',
  fully_dispatched:           'Dispatched',
  closed:                     'Closed',
}

const STATUS_COLORS: Record<string, string> = {
  ready_to_dispatch:          '#10b981',
  ready_to_dispatch_override: '#10b981',
  covered_by_wip:             '#3b82f6',
  give_to_labour:             '#f59e0b',
  give_to_labour_override:    '#f59e0b',
  cut_on_machine:             '#ef4444',
  cut_on_machine_override:    '#ef4444',
  procure_velvet:             '#ef4444',
}

const METRIC_COLORS: Record<string, string> = {
  ready:  '#10b981',
  labour: '#f59e0b',
  cut:    '#ef4444',
}

const METRIC_HIGHLIGHT: Record<MatrixMetric, MatrixCellHighlight> = {
  pending: 'normal',
  ready:   'covered',
  labour:  'partial',
  cut:     'shortage',
}

// Converts planning rows for one dabbi group into PlanningRowInput[] with metric-adjusted open_qty
function toPlanningRowInputs(groupRows: PlanningAllocationRow[], metric: MatrixMetric): PlanningRowInput[] {
  return groupRows.map((r) => {
    let cellQty: number
    if (metric === 'ready') {
      cellQty = r.ready_allocated_qty
    } else if (metric === 'labour') {
      cellQty = r.cuttings_allocated_qty
    } else if (metric === 'cut') {
      const isCutStatus =
        r.planning_status === 'cut_on_machine' ||
        r.planning_status === 'cut_on_machine_override' ||
        r.planning_status === 'procure_velvet'
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
}

export function PlanningAllocationMatrixPanel({
  rows,
  sizeMaster,
  designMaster,
  colourMaster,
  printTitle,
  children,
  matrixOnly = false,
  dabbiLabels,
}: PlanningAllocationMatrixPanelProps) {
  const [view, setView] = useState<'list' | 'matrix'>(matrixOnly ? 'matrix' : 'list')
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({})
  const [metric, setMetric] = useState<MatrixMetric>('pending')

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  // Filter config: design, colour, status (customer is handled upstream)
  const filterConfig: FilterConfig = useMemo(() => {
    const statusesSeen = new Set<string>()
    const designsSeen = new Map<string, string>()
    const coloursSeen = new Map<string, string>()

    for (const r of rows) {
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
          options: [...statusesSeen].map((s) => ({
            id: s,
            label: STATUS_LABELS[s] ?? s,
            color: STATUS_COLORS[s],
          })),
        },
      ],
    }
  }, [rows, designMaster, colourMaster])

  // Group rows by dabbi_colour_id, apply status filter, build one matrix per dabbi group.
  // Design/colour filters are applied via filterMatrixData after matrix construction.
  const dabbiMatrices = useMemo((): DabbiMatrix[] => {
    if (sizeMaster.length === 0 || designMaster.length === 0 || colourMaster.length === 0) return []

    const statusFilter = activeFilters['status'] ?? []

    const statusFiltered = statusFilter.length === 0
      ? rows
      : rows.filter((r) => statusFilter.includes(r.planning_status))

    // Group by dabbi_colour_id
    const groups = new Map<string, PlanningAllocationRow[]>()
    for (const r of statusFiltered) {
      const key = r.dabbi_colour_id || '__none__'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(r)
    }

    return [...groups.entries()]
      .sort(([a], [b]) => {
        const la = dabbiLabels?.[a] ?? a
        const lb = dabbiLabels?.[b] ?? b
        return la.localeCompare(lb)
      })
      .map(([dabbiId, groupRows]) => {
        const dabbiLabel = dabbiLabels?.[dabbiId] ?? dabbiId

        const rowInputs = toPlanningRowInputs(groupRows, metric)

        const fullMatrix = buildMatrixFromPlanningRows(
          rowInputs,
          sizeMaster,
          designMaster,
          colourMaster,
          { context_label: 'Shortage / Planning Report', date_label: today },
        )

        const matrix = filterMatrixData(fullMatrix, activeFilters, { design: 'design', colour: 'colour' })

        return { dabbiId, dabbiLabel, matrix }
      })
  }, [rows, activeFilters, metric, sizeMaster, designMaster, colourMaster, dabbiLabels, today])

  const highlightCell = useCallback((row: MatrixRow, sizeId: string): MatrixCellHighlight => {
    if (metric !== 'pending') {
      const cellQty = row.cells[sizeId] ?? 0
      return cellQty > 0 ? METRIC_HIGHLIGHT[metric] : 'normal'
    }
    const cellStatus = (row.metadata?.cell_status ?? {}) as Record<string, string>
    const status = cellStatus[sizeId] ?? 'ready_to_dispatch'
    return STATUS_TO_HIGHLIGHT[status] ?? 'normal'
  }, [metric])

  const cellTextColor = useCallback((row: MatrixRow, sizeId: string): string | undefined => {
    if (metric !== 'pending') {
      return METRIC_COLORS[metric]
    }
    const cellStatus = (row.metadata?.cell_status ?? {}) as Record<string, string>
    const status = cellStatus[sizeId]
    return status ? STATUS_COLORS[status] : undefined
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

  // Collect visible dabbi sections (after design/colour filter)
  const visibleSections = dabbiMatrices.filter(({ matrix }) => matrix.rows.length > 0)

  // Active status labels for print
  const activeStatusLabels = useMemo(() => {
    const statuses = activeFilters['status'] ?? []
    return statuses.map((s) => STATUS_LABELS[s] ?? s)
  }, [activeFilters])

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
          {/* Metric selector + print button */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }} className="no-print">
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginRight: '0.1rem' }}>Show:</span>
            <button onClick={() => setMetric('pending')} style={metricBtn('pending')}>Pending</button>
            <button onClick={() => setMetric('ready')} style={metricBtn('ready', 'var(--success)')}>Ready</button>
            <button onClick={() => setMetric('labour')} style={metricBtn('labour', 'var(--warning)')}>Labour</button>
            <button onClick={() => setMetric('cut')} style={metricBtn('cut', 'var(--danger)')}>Cut</button>
            {matrixOnly && <div style={{ marginLeft: 'auto' }}><PrintButton label="Print" /></div>}
          </div>

          {/* Design / CLR / Status filter bar */}
          <MatrixFilterBar
            filterConfig={filterConfig}
            activeFilters={activeFilters}
            onFilterChange={setActiveFilters}
          />

          {/* Print-only: active status filter summary */}
          {activeStatusLabels.length > 0 && (
            <div className="matrix-print-only" style={{ display: 'none', fontSize: '9pt', color: '#444', marginBottom: '6pt' }}>
              Status: {activeStatusLabels.join(', ')}
            </div>
          )}

          {/* Per-dabbi matrix sections */}
          {visibleSections.length === 0 ? (
            <p style={{ fontFamily: 'monospace', fontSize: '0.88rem', color: '#888' }}>
              No data matching current filters.
            </p>
          ) : (
            visibleSections.map(({ dabbiId, dabbiLabel, matrix }) => (
              <div key={dabbiId} style={{ marginBottom: '2.5rem' }}>
                {/* Screen-only dabbi section heading */}
                <div
                  className="matrix-no-print"
                  style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: '0.5rem',
                    paddingBottom: '0.3rem',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  {dabbiLabel}
                </div>
                <MatrixGrid
                  data={matrix}
                  mode="view"
                  highlightCell={highlightCell}
                  cellTextColor={cellTextColor}
                  printTitle={`${printTitle} — ${metric.charAt(0).toUpperCase() + metric.slice(1)} — ${dabbiLabel}`}
                />
              </div>
            ))
          )}
        </>
      )}
    </div>
  )
}
