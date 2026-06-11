'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { PrintButton } from '@/components/ui/PrintButton'
import { OrderGroupedView } from './OrderGroupedView'
import type { OrderGroupedViewProps, PlanningRowEnriched } from './OrderGroupedView'
import type { PlanningLineStatus } from '@stock-brain/types'
import { PlanningAllocationMatrixPanel } from '@/components/matrix/PlanningAllocationMatrixPanel'
import type { SizeMasterRow, DesignMasterRow, ColourMasterRow } from '@stock-brain/domain'

// ── filter helpers ─────────────────────────────────────────────

type FilterState = {
  customerIds: string[]
  design: string
  clr: string
  dabbi: string
  status: '' | 'ready' | 'labour' | 'cut' | 'wip'
  dateFrom: string
  dateTo: string
}

const DEFAULT_FILTERS: FilterState = {
  customerIds: [],
  design: '',
  clr: '',
  dabbi: '',
  status: '',
  dateFrom: '',
  dateTo: '',
}

function countActiveFilters(f: FilterState): number {
  let n = f.customerIds.length > 0 ? 1 : 0
  if (f.design) n++
  if (f.clr) n++
  if (f.dabbi) n++
  if (f.status) n++
  if (f.dateFrom) n++
  if (f.dateTo) n++
  return n
}

const STATUS_FILTER_MAP: Record<string, PlanningLineStatus[]> = {
  ready:  ['ready_to_dispatch', 'ready_to_dispatch_override'],
  labour: ['give_to_labour', 'give_to_labour_override'],
  cut:    ['cut_on_machine', 'cut_on_machine_override', 'procure_velvet'],
  wip:    ['covered_by_wip'],
}

function applyFilters(rows: PlanningRowEnriched[], f: FilterState): PlanningRowEnriched[] {
  return rows.filter((r) => {
    if (f.customerIds.length > 0 && !f.customerIds.includes(r.customer_id)) return false
    if (f.design && r.shape_design_id !== f.design) return false
    if (f.clr && r.bindi_colour_id !== f.clr) return false
    if (f.dabbi && r.dabbi_colour_id !== f.dabbi) return false
    if (f.status && STATUS_FILTER_MAP[f.status] && !STATUS_FILTER_MAP[f.status].includes(r.planning_status)) return false
    if (f.dateFrom && r.order_date && r.order_date < f.dateFrom) return false
    if (f.dateTo && r.order_date && r.order_date > f.dateTo) return false
    return true
  })
}

// ── customer multi-select ─────────────────────────────────────

type FilterOption = { id: string; label: string }

type CustomerMultiSelectProps = {
  selected: string[]
  options: FilterOption[]
  onChange: (ids: string[]) => void
}

function CustomerMultiSelect({ selected, options, onChange }: CustomerMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  let label: string
  if (selected.length === 0) {
    label = 'All Customers'
  } else if (selected.length === 1) {
    label = options.find((o) => o.id === selected[0])?.label ?? '1 customer'
  } else if (selected.length === 2) {
    const first = options.find((o) => o.id === selected[0])?.label ?? '?'
    label = `${first} + 1`
  } else {
    label = `${selected.length} customers`
  }

  const isActive = selected.length > 0

  const triggerStyle: React.CSSProperties = {
    fontSize: 'var(--text-xs)',
    padding: '0.3rem 0.55rem',
    border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-elevated)',
    color: isActive ? 'var(--accent)' : 'var(--text-primary)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    zIndex: 100,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
    minWidth: '200px',
    padding: '0.35rem 0',
  }

  const optionStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.45rem',
    padding: '0.3rem 0.75rem',
    cursor: 'pointer',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-primary)',
    userSelect: 'none',
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={triggerStyle}>
        {label} ▾
      </button>
      {open && (
        <div style={dropdownStyle}>
          <label style={optionStyle}>
            <input
              type="checkbox"
              checked={selected.length === 0}
              onChange={() => onChange([])}
              style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
            />
            All Customers
          </label>
          {options.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', margin: '0.25rem 0' }} />
          )}
          {options.map((opt) => (
            <label key={opt.id} style={optionStyle}>
              <input
                type="checkbox"
                checked={selected.includes(opt.id)}
                onChange={() => {
                  const next = selected.includes(opt.id)
                    ? selected.filter((x) => x !== opt.id)
                    : [...selected, opt.id]
                  onChange(next)
                }}
                style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── filter bar ─────────────────────────────────────────────────

type FilterBarProps = {
  filters: FilterState
  onChange: (f: FilterState) => void
  customers: FilterOption[]
  designs: FilterOption[]
  colours: FilterOption[]
  dabbis: FilterOption[]
  activeCount: number
  sort: string
  onSortChange: (v: string) => void
}

function FilterBar({ filters, onChange, customers, designs, colours, dabbis, activeCount, sort, onSortChange }: FilterBarProps) {
  const sel: React.CSSProperties = {
    fontSize: 'var(--text-xs)',
    padding: '0.3rem 0.55rem',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  }

  function field(key: keyof Omit<FilterState, 'customerIds' | 'status'>, label: string, options: FilterOption[]) {
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
    <div className="no-print" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
      <CustomerMultiSelect
        selected={filters.customerIds}
        options={customers}
        onChange={(ids) => onChange({ ...filters, customerIds: ids })}
      />
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
      <select
        value={sort}
        onChange={(e) => onSortChange(e.target.value)}
        style={{ ...sel, borderColor: sort !== 'priority' ? 'var(--accent)' : 'var(--border)' }}
      >
        <option value="priority">By Priority</option>
        <option value="order_date">By Order Date</option>
        <option value="due_date">By Due Date</option>
      </select>
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

// ── print filter summary helpers ───────────────────────────────

const TOP_STATUS_PRINT_LABELS: Record<string, string> = {
  ready:  'Ready to Dispatch',
  labour: 'Give to Labour',
  cut:    'Cut / Procure',
  wip:    'Covered by WIP',
}

function buildPrintFilterSummary(
  filters: FilterState,
  customerOptions: FilterOption[],
  designOptions: FilterOption[],
  colourOptions: FilterOption[],
  dabbiOptions: FilterOption[],
): string {
  const parts: string[] = []

  if (filters.customerIds.length > 0) {
    const MAX_SHOWN = 4
    const names = filters.customerIds.map((id) => customerOptions.find((c) => c.id === id)?.label ?? id)
    if (names.length <= MAX_SHOWN) {
      parts.push(`Customers: ${names.join(', ')}`)
    } else {
      parts.push(`Customers: ${names.slice(0, MAX_SHOWN).join(', ')} + ${names.length - MAX_SHOWN} more`)
    }
  }

  if (filters.design) parts.push(`Design: ${designOptions.find((d) => d.id === filters.design)?.label ?? filters.design}`)
  if (filters.clr) parts.push(`CLR: ${colourOptions.find((c) => c.id === filters.clr)?.label ?? filters.clr}`)
  if (filters.dabbi) parts.push(`Dabbi: ${dabbiOptions.find((d) => d.id === filters.dabbi)?.label ?? filters.dabbi}`)
  if (filters.status) parts.push(`Status: ${TOP_STATUS_PRINT_LABELS[filters.status] ?? filters.status}`)
  if (filters.dateFrom) parts.push(`From: ${filters.dateFrom}`)
  if (filters.dateTo) parts.push(`To: ${filters.dateTo}`)

  return parts.length > 0 ? parts.join(' | ') : 'No active filters'
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
  sort?: string
  // masters for the matrix panel
  sizeMaster: SizeMasterRow[]
  designMaster: DesignMasterRow[]
  colourMaster: ColourMasterRow[]
  printTitle: string
  role?: string
}

const STORAGE_KEY = 'planning-view-v2'

const SORT_LABELS: Record<string, string> = {
  priority:   'By Priority',
  order_date: 'By Order Date',
  due_date:   'By Due Date',
}

// ── component ──────────────────────────────────────────────────

export function PlanningViewToggle({
  children,
  rows,
  customers,
  designs,
  colours,
  dabbis,
  sort: initialSort = 'priority',
  sizeMaster,
  designMaster,
  colourMaster,
  printTitle,
  ...orderViewProps
}: Props) {
  const router = useRouter()
  // 'list' = List view (sub: order|sku), 'matrix' = Matrix view
  const [mainView, setMainView] = useState<'list' | 'matrix'>('list')
  const [subView, setSubView] = useState<'order' | 'sku'>('order')
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [hydrated, setHydrated] = useState(false)

  function handleSortChange(value: string) {
    const params = new URLSearchParams()
    if (value !== 'priority') params.set('sort', value)
    const qs = params.toString()
    router.push(`/planning/allocation${qs ? `?${qs}` : ''}`)
  }

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

  const printFilterSummary = useMemo(
    () => buildPrintFilterSummary(filters, customerOptions, designOptions, colourOptions, dabbiOptions),
    [filters, customerOptions, designOptions, colourOptions, dabbiOptions],
  )

  // Dabbi label map for the matrix panel
  const dabbiLabels = useMemo(
    () => Object.fromEntries(dabbis.map((d) => [d.id, d.code])),
    [dabbis],
  )

  const sortLabel = SORT_LABELS[initialSort] ?? initialSort
  const printDate = new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

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
      <style>{`
        .planning-print-header { display: none; }
        @media print {
          .planning-print-header {
            display: block !important;
            text-align: center;
            border-bottom: 2px solid #000;
            padding-bottom: 8px;
            margin-bottom: 14px;
          }
          .planning-page {
            display: flex !important;
            flex-direction: column !important;
            max-width: 100% !important;
            padding: 0 !important;
          }
          .print-stat-cards {
            order: 999 !important;
            page-break-before: always !important;
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 0.75rem !important;
            border-top: 2px solid #000 !important;
            padding-top: 1rem !important;
            margin-bottom: 0 !important;
          }
          .planning-toggle-wrapper { order: 1 !important; }
          @page { size: A4 landscape; margin: 1cm; }
          table { font-size: 9px !important; width: 100% !important; }
          thead { display: table-header-group !important; }
          tr { page-break-inside: avoid !important; }
          th { background: #f0f0f0 !important; color: #000 !important; font-size: 9px !important; }
          td { font-size: 9px !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* Print header — hidden on screen, visible on print */}
      <div className="planning-print-header">
        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>NIRANKARI BINDI</div>
        <div style={{ fontSize: '14px', fontWeight: 'bold', textDecoration: 'underline', marginTop: '2px' }}>Planning Report</div>
        <div style={{ fontSize: '11px', marginTop: '4px' }}>
          {printFilterSummary}
        </div>
        <div style={{ fontSize: '10px', color: '#555', marginTop: '2px' }}>
          Sort: {sortLabel} | Generated: {printDate}
        </div>
        <hr style={{ margin: '8px 0 0' }} />
      </div>

      {/* Top tabs: List | Matrix */}
      <div className="no-print" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        <button onClick={() => setMainView('list')} style={tabBtn(mainView === 'list')}>List</button>
        <button onClick={() => setMainView('matrix')} style={tabBtn(mainView === 'matrix')}>Matrix</button>

        {mainView === 'list' && (
          <div style={{ display: 'flex', gap: '0.35rem', marginLeft: '0.5rem' }}>
            <button onClick={() => setSubView('order')} style={subTabBtn(subView === 'order')}>Order View</button>
            <button onClick={() => setSubView('sku')} style={subTabBtn(subView === 'sku')}>SKU View</button>
          </div>
        )}

        <span style={{ marginLeft: 'auto' }}>
          <PrintButton label="Print Plan" variant="secondary" />
        </span>
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
        sort={initialSort}
        onSortChange={handleSortChange}
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
          dabbiLabels={dabbiLabels}
          matrixOnly
        >
          <></>
        </PlanningAllocationMatrixPanel>
      )}
    </>
  )
}
