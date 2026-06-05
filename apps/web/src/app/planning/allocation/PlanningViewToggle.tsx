'use client'

import { useState, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { OrderGroupedView } from './OrderGroupedView'
import type { OrderGroupedViewProps, PlanningRowEnriched } from './OrderGroupedView'
import type { PlanningLineStatus } from '@stock-brain/types'
import { PlanningAllocationMatrixPanel } from '@/components/matrix/PlanningAllocationMatrixPanel'
import type { SizeMasterRow, DesignMasterRow, ColourMasterRow } from '@stock-brain/domain'

// ── filter helpers ─────────────────────────────────────────────

type FilterState = {
  customer: string
  design: string
  clr: string
  dabbi: string
  status: '' | 'ready' | 'labour' | 'cut' | 'wip'
  dateFrom: string
  dateTo: string
}

const DEFAULT_FILTERS: FilterState = {
  customer: '',
  design: '',
  clr: '',
  dabbi: '',
  status: '',
  dateFrom: '',
  dateTo: '',
}

function isFilterActive(f: FilterState): boolean {
  return Object.values(f).some((v) => v !== '')
}

function countActiveFilters(f: FilterState): number {
  return Object.values(f).filter((v) => v !== '').length
}

const STATUS_FILTER_MAP: Record<string, PlanningLineStatus[]> = {
  ready:  ['ready_to_dispatch', 'ready_to_dispatch_override'],
  labour: ['give_to_labour', 'give_to_labour_override'],
  cut:    ['cut_on_machine', 'cut_on_machine_override', 'procure_velvet'],
  wip:    ['covered_by_wip'],
}

function applyFilters(rows: PlanningRowEnriched[], f: FilterState): PlanningRowEnriched[] {
  return rows.filter((r) => {
    if (f.customer && r.customer_id !== f.customer) return false
    if (f.design && r.shape_design_id !== f.design) return false
    if (f.clr && r.bindi_colour_id !== f.clr) return false
    if (f.dabbi && r.dabbi_colour_id !== f.dabbi) return false
    if (f.status && STATUS_FILTER_MAP[f.status] && !STATUS_FILTER_MAP[f.status].includes(r.planning_status)) return false
    if (f.dateFrom && r.order_date && r.order_date < f.dateFrom) return false
    if (f.dateTo && r.order_date && r.order_date > f.dateTo) return false
    return true
  })
}

// ── filter bar ─────────────────────────────────────────────────

type FilterOption = { id: string; label: string }

type FilterBarProps = {
  filters: FilterState
  onChange: (f: FilterState) => void
  customers: FilterOption[]
  designs: FilterOption[]
  colours: FilterOption[]
  dabbis: FilterOption[]
  activeCount: number
}

function FilterBar({ filters, onChange, customers, designs, colours, dabbis, activeCount }: FilterBarProps) {
  const sel: React.CSSProperties = {
    fontSize: 'var(--text-xs)',
    padding: '0.3rem 0.55rem',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  }

  function field(key: keyof FilterState, label: string, options: FilterOption[]) {
    return (
      <select
        value={filters[key]}
        onChange={(e) => onChange({ ...filters, [key]: e.target.value })}
        style={{ ...sel, borderColor: filters[key] ? 'var(--accent)' : 'var(--border)' }}
      >
        <option value="">{label}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    )
  }

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
      {field('customer', 'Customer', customers)}
      {field('design', 'Design', designs)}
      {field('clr', 'CLR', colours)}
      {field('dabbi', 'Dabbi', dabbis)}
      <select
        value={filters.status}
        onChange={(e) => onChange({ ...filters, status: e.target.value as FilterState['status'] })}
        style={{ ...sel, borderColor: filters.status ? 'var(--accent)' : 'var(--border)' }}
      >
        <option value="">Status (all)</option>
        <option value="ready">Ready</option>
        <option value="labour">Labour</option>
        <option value="cut">Cut</option>
        <option value="wip">WIP</option>
      </select>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>From</span>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
          style={{ ...sel, padding: '0.25rem 0.4rem' }}
        />
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>To</span>
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
          style={{ ...sel, padding: '0.25rem 0.4rem' }}
        />
      </div>
      {activeCount > 0 && (
        <button
          onClick={() => onChange(DEFAULT_FILTERS)}
          style={{
            fontSize: 'var(--text-xs)',
            padding: '0.3rem 0.6rem',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
          }}
        >
          Clear
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--accent)',
            color: 'white',
            borderRadius: '999px',
            width: '16px',
            height: '16px',
            fontSize: '10px',
            fontWeight: 700,
          }}>
            {activeCount}
          </span>
        </button>
      )}
    </div>
  )
}

// ── props ──────────────────────────────────────────────────────

type Props = Omit<OrderGroupedViewProps, 'rows'> & {
  children: ReactNode         // SKU view table
  rows: PlanningRowEnriched[]
  // pre-computed unique option lists from server
  customers: { id: string; name: string }[]
  designs: { id: string; name: string }[]
  colours: { id: string; code: string }[]
  dabbis: { id: string; code: string }[]
  // masters for the matrix panel
  sizeMaster: SizeMasterRow[]
  designMaster: DesignMasterRow[]
  colourMaster: ColourMasterRow[]
  printTitle: string
  role?: string
}

const STORAGE_KEY = 'planning-view-v2'

// ── component ──────────────────────────────────────────────────

export function PlanningViewToggle({
  children,
  rows,
  customers,
  designs,
  colours,
  dabbis,
  sizeMaster,
  designMaster,
  colourMaster,
  printTitle,
  ...orderViewProps
}: Props) {
  // 'list' = List view (sub: order|sku), 'matrix' = Matrix view
  const [mainView, setMainView] = useState<'list' | 'matrix'>('list')
  const [subView, setSubView] = useState<'order' | 'sku'>('order')
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [hydrated, setHydrated] = useState(false)

  // Restore from localStorage after mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as { mainView?: string; subView?: string }
        if (saved.mainView === 'list' || saved.mainView === 'matrix') setMainView(saved.mainView)
        if (saved.subView === 'order' || saved.subView === 'sku') setSubView(saved.subView)
      }
    } catch { /* ignore */ }
    setHydrated(true)
  }, [])

  // Persist to localStorage
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mainView, subView }))
    } catch { /* ignore */ }
  }, [mainView, subView, hydrated])

  // Build filter options
  const customerOptions: FilterOption[] = customers.map((c) => ({ id: c.id, label: c.name }))
  const designOptions: FilterOption[]   = designs.map((d) => ({ id: d.id, label: d.name }))
  const colourOptions: FilterOption[]   = colours.map((c) => ({ id: c.id, label: c.code }))
  const dabbiOptions: FilterOption[]    = dabbis.map((d) => ({ id: d.id, label: d.code }))

  // Apply filters to rows
  const filteredRows = useMemo(() => applyFilters(rows, filters), [rows, filters])
  const activeFilterCount = countActiveFilters(filters)

  const btnBase: React.CSSProperties = {
    cursor: 'pointer',
    padding: '0.35rem 0.9rem',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
  }

  function tabBtn(active: boolean): React.CSSProperties {
    return {
      ...btnBase,
      background: active ? 'var(--accent)' : 'var(--bg-elevated)',
      color: active ? 'white' : 'var(--text-secondary)',
      borderColor: active ? 'var(--accent)' : 'var(--border)',
    }
  }

  const subBtnBase: React.CSSProperties = {
    ...btnBase,
    padding: '0.25rem 0.65rem',
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
  }

  function subTabBtn(active: boolean): React.CSSProperties {
    return {
      ...subBtnBase,
      background: active ? 'var(--bg-secondary)' : 'var(--bg-elevated)',
      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      borderColor: active ? 'var(--border-strong, var(--border))' : 'var(--border)',
    }
  }

  if (!hydrated) return null

  return (
    <>
      {/* Top tabs: List | Matrix */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        <button onClick={() => setMainView('list')} style={tabBtn(mainView === 'list')}>List</button>
        <button onClick={() => setMainView('matrix')} style={tabBtn(mainView === 'matrix')}>Matrix</button>

        {mainView === 'list' && (
          <div style={{ display: 'flex', gap: '0.35rem', marginLeft: '0.5rem' }}>
            <button onClick={() => setSubView('order')} style={subTabBtn(subView === 'order')}>Order View</button>
            <button onClick={() => setSubView('sku')} style={subTabBtn(subView === 'sku')}>SKU View</button>
          </div>
        )}

      </div>

      {/* Filter bar — shared across list + matrix */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        customers={customerOptions}
        designs={designOptions}
        colours={colourOptions}
        dabbis={dabbiOptions}
        activeCount={activeFilterCount}
      />

      {/* List view */}
      {mainView === 'list' && (
        <div>
          {subView === 'order' && (
            <OrderGroupedView
              rows={filteredRows}
              {...orderViewProps}
            />
          )}
          {subView === 'sku' && (
            <div>
              {children}
            </div>
          )}
        </div>
      )}

      {/* Matrix view — uses filteredRows so all active filters apply */}
      {mainView === 'matrix' && (
        <PlanningAllocationMatrixPanel
          rows={filteredRows}
          sizeMaster={sizeMaster}
          designMaster={designMaster}
          colourMaster={colourMaster}
          printTitle={printTitle}
          matrixOnly
        >
          <></>
        </PlanningAllocationMatrixPanel>
      )}
    </>
  )
}
