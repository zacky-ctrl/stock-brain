'use client'

import { useState, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { Badge } from '@/components/ui/Badge'
import { StatCard } from '@/components/ui/StatCard'
import { tableTh, tableTd } from '@/lib/ui'

// ── Types ─────────────────────────────────────────────────────

export type DisplayRow = {
  id: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  brand_id: string
  shape_name: string
  shape_sort: number
  colour_code: string
  colour_sort: number
  size_code: string
  size_sort: number
  dabbi_code: string
  dabbi_name: string
  brand_name: string
  gross_qty: number
  committed_qty: number
  available_qty: number
  open_qty: number
  ready_allocated_qty: number
  shortage_qty: number
  planning_status: string
}

export type SizeEntry = { id: string; code: string; sort_order: number }
export type DabbiEntry = { id: string; code: string; name: string }
export type BrandEntry = { id: string; name: string }

export type HistoryRow = {
  id: string
  corrected_at: string
  source: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  sku: string
  shape_name: string
  colour_code: string
  size_code: string
  dabbi_name: string
  delta_qty: number
  reason: string
}

export type ReadyStockPageClientProps = {
  rows: DisplayRow[]
  sizes: SizeEntry[]
  dabbi_colours: DabbiEntry[]
  brands: BrandEntry[]
  stockHistory: HistoryRow[]
  fetchError: string | null
}

// ── Constants ─────────────────────────────────────────────────

const STATUS_PRIORITY: Record<string, number> = {
  in_stock: 0,
  ready_to_dispatch: 1,
  ready_to_dispatch_override: 1,
  covered_by_wip: 2,
  give_to_labour: 3,
  give_to_labour_override: 3,
  cut_on_machine: 4,
  cut_on_machine_override: 4,
  procure_velvet: 5,
}

function statusLabel(s: string): string {
  switch (s) {
    case 'ready_to_dispatch':
    case 'ready_to_dispatch_override': return 'READY'
    case 'give_to_labour':
    case 'give_to_labour_override': return 'NEEDS LABOUR'
    case 'covered_by_wip': return 'WITH LABOUR'
    case 'cut_on_machine':
    case 'cut_on_machine_override': return 'CUT ON MACHINE'
    case 'procure_velvet': return 'PROCURE VELVET'
    case 'in_stock': return 'IN STOCK'
    default: return s.toUpperCase()
  }
}

function statusBadgeVariant(s: string): 'success' | 'warning' | 'info' | 'danger' | 'neutral' {
  switch (s) {
    case 'ready_to_dispatch':
    case 'ready_to_dispatch_override': return 'success'
    case 'give_to_labour':
    case 'give_to_labour_override': return 'warning'
    case 'covered_by_wip': return 'info'
    case 'cut_on_machine':
    case 'cut_on_machine_override': return 'warning'
    case 'procure_velvet': return 'danger'
    default: return 'neutral'
  }
}

function actionLabel(s: string): string | null {
  switch (s) {
    case 'ready_to_dispatch':
    case 'ready_to_dispatch_override': return 'Dispatch'
    case 'give_to_labour':
    case 'give_to_labour_override': return 'Issue'
    case 'cut_on_machine':
    case 'cut_on_machine_override': return 'Cut'
    case 'covered_by_wip': return 'Await'
    case 'procure_velvet': return 'Procure'
    default: return null
  }
}

function actionStyle(s: string): CSSProperties {
  const base: CSSProperties = {
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    padding: '0.25rem 0.65rem',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    cursor: 'default',
    display: 'inline-block',
    whiteSpace: 'nowrap',
  }
  switch (s) {
    case 'ready_to_dispatch':
    case 'ready_to_dispatch_override':
      return { ...base, background: 'var(--success-subtle)', color: 'var(--success)', cursor: 'pointer' }
    case 'give_to_labour':
    case 'give_to_labour_override':
      return { ...base, background: 'var(--warning-subtle)', color: 'var(--warning)', cursor: 'pointer' }
    case 'cut_on_machine':
    case 'cut_on_machine_override':
      return { ...base, background: 'rgba(249,115,22,0.12)', color: '#f97316', cursor: 'pointer' }
    case 'covered_by_wip':
      return { ...base, background: 'transparent', color: 'var(--info)' }
    case 'procure_velvet':
      return { ...base, background: 'transparent', color: 'var(--danger)' }
    default: return base
  }
}

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

type MatrixMetric = 'available' | 'gross' | 'committed' | 'open_orders' | 'shortage'

// ── Sort helpers ──────────────────────────────────────────────

const IS_SHORTAGE: Record<string, boolean> = {
  give_to_labour: true,
  give_to_labour_override: true,
  cut_on_machine: true,
  cut_on_machine_override: true,
  procure_velvet: true,
}

function sortRows(rows: DisplayRow[]): DisplayRow[] {
  return [...rows].sort((a, b) => {
    const aShort = IS_SHORTAGE[a.planning_status] ?? false
    const bShort = IS_SHORTAGE[b.planning_status] ?? false
    if (aShort !== bShort) return aShort ? -1 : 1

    const aPrio = STATUS_PRIORITY[a.planning_status] ?? 0
    const bPrio = STATUS_PRIORITY[b.planning_status] ?? 0
    if (aPrio !== bPrio) return bPrio - aPrio  // higher priority number = worse = first

    if (b.open_qty !== a.open_qty) return b.open_qty - a.open_qty
    return a.available_qty - b.available_qty
  })
}

// ── Filter select ─────────────────────────────────────────────

type SelectProps = {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (v: string) => void
}

function FilterSelect({ label, value, options, onChange }: SelectProps) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 500 }}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontSize: 'var(--text-sm)',
          padding: '0.4rem 0.6rem',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-strong)',
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          minWidth: '110px',
        }}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

// ── Main component ────────────────────────────────────────────

const THIRTY_DAYS_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

export function ReadyStockPageClient({ rows, sizes, dabbi_colours, brands, stockHistory, fetchError }: ReadyStockPageClientProps) {
  const [view, setView] = useState<'list' | 'matrix'>('list')
  const [metric, setMetric] = useState<MatrixMetric>('available')
  const [fDesign, setFDesign] = useState('')
  const [fColour, setFColour] = useState('')
  const [fDabbi, setFDabbi] = useState('')
  const [fBrand, setFBrand] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fSize, setFSize] = useState('')

  // History filters
  const [hDateFrom, setHDateFrom] = useState(THIRTY_DAYS_AGO)
  const [hDateTo, setHDateTo] = useState('')
  const [hSource, setHSource] = useState('')
  const [hSku, setHSku] = useState('')
  const [hMovement, setHMovement] = useState('')
  const [historyLimit, setHistoryLimit] = useState(100)

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const sortedSizes = useMemo(() => [...sizes].sort((a, b) => a.sort_order - b.sort_order), [sizes])

  // ── Filter options (derived from data) ──────────────────────

  const designOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of rows) seen.set(r.shape_design_id, r.shape_name)
    return [...seen.entries()]
      .sort((a, b) => {
        const ra = rows.find((r) => r.shape_design_id === a[0])
        const rb = rows.find((r) => r.shape_design_id === b[0])
        return (ra?.shape_sort ?? 0) - (rb?.shape_sort ?? 0)
      })
      .map(([value, label]) => ({ value, label }))
  }, [rows])

  const colourOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of rows) seen.set(r.bindi_colour_id, r.colour_code)
    return [...seen.entries()]
      .sort((a, b) => {
        const ra = rows.find((r) => r.bindi_colour_id === a[0])
        const rb = rows.find((r) => r.bindi_colour_id === b[0])
        return (ra?.colour_sort ?? 0) - (rb?.colour_sort ?? 0)
      })
      .map(([value, label]) => ({ value, label }))
  }, [rows])

  const dabbiOptions = useMemo(
    () => dabbi_colours.map((d) => ({ value: d.id, label: d.name || d.code })),
    [dabbi_colours],
  )

  const brandOptions = useMemo(
    () => brands.map((b) => ({ value: b.id, label: b.name })),
    [brands],
  )

  const sizeOptions = useMemo(
    () => sortedSizes.map((s) => ({ value: s.id, label: s.code })),
    [sortedSizes],
  )

  const statusOptions = [
    { value: 'ready_to_dispatch', label: 'Ready to dispatch' },
    { value: 'give_to_labour', label: 'Needs labour' },
    { value: 'covered_by_wip', label: 'With labour' },
    { value: 'cut_on_machine', label: 'Cut on machine' },
    { value: 'procure_velvet', label: 'Procure velvet' },
    { value: 'in_stock', label: 'In stock (no orders)' },
  ]

  // ── Filtering ──────────────────────────────────────────────

  const filtered = useMemo(() => {
    let out = rows
    if (fDesign) out = out.filter((r) => r.shape_design_id === fDesign)
    if (fColour) out = out.filter((r) => r.bindi_colour_id === fColour)
    if (fDabbi) out = out.filter((r) => r.dabbi_colour_id === fDabbi)
    if (fBrand) out = out.filter((r) => r.brand_id === fBrand)
    if (fSize) out = out.filter((r) => r.size_id === fSize)
    if (fStatus) {
      out = out.filter((r) => {
        const s = r.planning_status
        // collapse overrides into base status for filter matching
        if (fStatus === 'ready_to_dispatch') return s === 'ready_to_dispatch' || s === 'ready_to_dispatch_override'
        if (fStatus === 'give_to_labour') return s === 'give_to_labour' || s === 'give_to_labour_override'
        if (fStatus === 'cut_on_machine') return s === 'cut_on_machine' || s === 'cut_on_machine_override'
        return s === fStatus
      })
    }
    return sortRows(out)
  }, [rows, fDesign, fColour, fDabbi, fBrand, fSize, fStatus])

  // ── Summary line ───────────────────────────────────────────

  const summaryGross = filtered.reduce((s, r) => s + r.available_qty, 0)
  const summaryShort = filtered.filter((r) => IS_SHORTAGE[r.planning_status]).length

  // ── History filtering (syncs dabbi with page filter) ──────

  const filteredHistory = useMemo(() => {
    let out = stockHistory
    if (hDateFrom) out = out.filter((r) => r.corrected_at >= hDateFrom)
    if (hDateTo) out = out.filter((r) => r.corrected_at.split('T')[0] <= hDateTo)
    if (hSource) out = out.filter((r) => r.source === hSource)
    if (hSku) {
      const q = hSku.toLowerCase()
      out = out.filter((r) =>
        r.shape_name.toLowerCase().includes(q) ||
        r.colour_code.toLowerCase().includes(q) ||
        r.size_code.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q),
      )
    }
    if (fDabbi) out = out.filter((r) => r.dabbi_colour_id === fDabbi)
    if (hMovement === 'positive') out = out.filter((r) => r.delta_qty > 0)
    if (hMovement === 'negative') out = out.filter((r) => r.delta_qty < 0)
    return out
  }, [stockHistory, hDateFrom, hDateTo, hSource, hSku, fDabbi, hMovement])

  const historySourceOptions = useMemo(() => {
    const seen = new Set<string>()
    for (const r of stockHistory) seen.add(r.source)
    return [...seen].sort().map((s) => ({ value: s, label: s }))
  }, [stockHistory])

  // ── Stat cards (full dataset, not filtered) ────────────────

  const totalGross = rows.reduce((s, r) => s + r.available_qty, 0)
  const readyToDispatch = rows.filter((r) =>
    r.planning_status === 'ready_to_dispatch' || r.planning_status === 'ready_to_dispatch_override',
  ).reduce((s, r) => s + r.available_qty, 0)
  const needsLabourCount = rows.filter((r) =>
    r.planning_status === 'give_to_labour' || r.planning_status === 'give_to_labour_override',
  ).length
  const shortCutCount = rows.filter((r) =>
    r.planning_status === 'cut_on_machine' ||
    r.planning_status === 'cut_on_machine_override' ||
    r.planning_status === 'procure_velvet',
  ).length

  // ── Matrix data ────────────────────────────────────────────

  const matrixDabbiGroups = useMemo(() => {
    const rowsForMatrix = fDabbi ? filtered.filter((r) => r.dabbi_colour_id === fDabbi) : filtered
    const groups = new Map<string, { dabbi: DabbiEntry; rows: DisplayRow[] }>()
    for (const r of rowsForMatrix) {
      if (!groups.has(r.dabbi_colour_id)) {
        const dabbi = dabbi_colours.find((d) => d.id === r.dabbi_colour_id) ?? {
          id: r.dabbi_colour_id,
          code: r.dabbi_code,
          name: r.dabbi_name || r.dabbi_code,
        }
        groups.set(r.dabbi_colour_id, { dabbi, rows: [] })
      }
      groups.get(r.dabbi_colour_id)!.rows.push(r)
    }
    return [...groups.values()].sort((a, b) => a.dabbi.code.localeCompare(b.dabbi.code))
  }, [filtered, fDabbi, dabbi_colours])

  // ── Print data (all rows, all dabbi) ───────────────────────

  const printDabbiGroups = useMemo(() => {
    const groups = new Map<string, { dabbi: DabbiEntry; rows: DisplayRow[] }>()
    for (const r of rows) {
      if (!groups.has(r.dabbi_colour_id)) {
        const dabbi = dabbi_colours.find((d) => d.id === r.dabbi_colour_id) ?? {
          id: r.dabbi_colour_id,
          code: r.dabbi_code,
          name: r.dabbi_name || r.dabbi_code,
        }
        groups.set(r.dabbi_colour_id, { dabbi, rows: [] })
      }
      groups.get(r.dabbi_colour_id)!.rows.push(r)
    }
    return [...groups.values()].sort((a, b) => a.dabbi.code.localeCompare(b.dabbi.code))
  }, [rows, dabbi_colours])

  // ── Cell value helper ──────────────────────────────────────

  function getCellValue(matchRows: DisplayRow[], m: MatrixMetric): number {
    switch (m) {
      case 'available': return matchRows.reduce((s, r) => s + r.available_qty, 0)
      case 'gross': return matchRows.reduce((s, r) => s + r.gross_qty, 0)
      case 'committed': return matchRows.reduce((s, r) => s + r.committed_qty, 0)
      case 'open_orders': return matchRows.reduce((s, r) => s + r.open_qty, 0)
      case 'shortage': return matchRows.reduce((s, r) => s + r.shortage_qty, 0)
    }
  }

  function cellBg(val: number, m: MatrixMetric, rows: DisplayRow[]): string | undefined {
    if (m === 'available') {
      if (val === 0 && rows.some((r) => r.open_qty > 0)) return 'rgba(255,71,87,0.08)'
    }
    if (m === 'shortage') {
      return val > 0 ? 'rgba(255,71,87,0.12)' : val === 0 ? 'rgba(0,217,126,0.07)' : undefined
    }
    if (m === 'open_orders') {
      const avail = rows.reduce((s, r) => s + r.available_qty, 0)
      if (val > avail) return 'rgba(245,158,11,0.1)'
      if (val > 0 && val <= avail) return 'rgba(0,217,126,0.07)'
    }
    return undefined
  }

  // ── Matrix section renderer ────────────────────────────────

  function renderMatrixSection(dabbiRows: DisplayRow[], dabbiLabel: string, sectionMetric: MatrixMetric) {
    // unique (shape_id, colour_id) pairs sorted
    const designColourPairs: Array<{ shapeId: string; colourId: string; shapeName: string; colourCode: string; shapeSrt: number; colourSrt: number }> = []
    const seen = new Set<string>()
    for (const r of dabbiRows) {
      const key = `${r.shape_design_id}|${r.bindi_colour_id}`
      if (!seen.has(key)) {
        seen.add(key)
        designColourPairs.push({
          shapeId: r.shape_design_id,
          colourId: r.bindi_colour_id,
          shapeName: r.shape_name,
          colourCode: r.colour_code,
          shapeSrt: r.shape_sort,
          colourSrt: r.colour_sort,
        })
      }
    }
    designColourPairs.sort((a, b) => a.shapeSrt - b.shapeSrt || a.colourSrt - b.colourSrt)

    // sizes present in this dabbi's rows
    const sizeIdsPresent = new Set(dabbiRows.map((r) => r.size_id))
    const activeSizes = sortedSizes.filter((s) => sizeIdsPresent.has(s.id))

    // lookup: shape|colour|size|dabbi → [rows]
    const lookup = new Map<string, DisplayRow[]>()
    for (const r of dabbiRows) {
      const key = `${r.shape_design_id}|${r.bindi_colour_id}|${r.size_id}`
      const existing = lookup.get(key) ?? []
      existing.push(r)
      lookup.set(key, existing)
    }

    const sectionGross = dabbiRows.reduce((s, r) => s + r.available_qty, 0)
    const sectionSkus = new Set(dabbiRows.map((r) => `${r.shape_design_id}|${r.bindi_colour_id}|${r.size_id}`)).size
    const sectionCommitted = dabbiRows.reduce((s, r) => s + r.committed_qty, 0)

    const thStyle: CSSProperties = { ...tableTh, padding: '0.5rem 0.6rem', textAlign: 'right' }
    const thLeftStyle: CSSProperties = { ...tableTh, padding: '0.5rem 0.6rem' }
    const tdStyle: CSSProperties = { ...tableTd, padding: '0.5rem 0.6rem', textAlign: 'right', fontSize: 'var(--text-xs)', fontVariantNumeric: 'tabular-nums' }
    const tdLeftStyle: CSSProperties = { ...tableTd, padding: '0.5rem 0.6rem', fontSize: 'var(--text-xs)', fontWeight: 500 }

    return (
      <div key={dabbiLabel} style={{ marginBottom: '2rem' }}>
        <div style={{
          padding: '0.5rem 0.85rem',
          background: dabbiLabel.toLowerCase().includes('white') ? 'var(--success-subtle)' : 'var(--warning-subtle)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
            {dabbiLabel.toUpperCase()} — {fmt(sectionGross)} gross available
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '500px' }}>
            <thead>
              <tr>
                <th style={thLeftStyle}>DESIGN</th>
                <th style={thLeftStyle}>CLR</th>
                {activeSizes.map((s) => (
                  <th key={s.id} style={thStyle}>{s.code}</th>
                ))}
                <th style={thStyle}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {designColourPairs.map((dc) => {
                const rowCells = activeSizes.map((sz) => {
                  const matchRows = lookup.get(`${dc.shapeId}|${dc.colourId}|${sz.id}`) ?? []
                  return { val: getCellValue(matchRows, sectionMetric), matchRows }
                })
                const rowTotal = rowCells.reduce((s, c) => s + c.val, 0)
                if (rowTotal === 0) return null
                return (
                  <tr key={`${dc.shapeId}|${dc.colourId}`}>
                    <td style={tdLeftStyle}>{dc.shapeName}</td>
                    <td style={tdLeftStyle}>{dc.colourCode}</td>
                    {rowCells.map((cell, i) => (
                      <td key={i} style={{ ...tdStyle, background: cellBg(cell.val, sectionMetric, cell.matchRows) }}>
                        {cell.val > 0 ? fmt(cell.val) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                    ))}
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{fmt(rowTotal)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--bg-hover)' }}>
                <td colSpan={2} style={{ ...tdLeftStyle, fontWeight: 700 }}>TOTAL</td>
                {activeSizes.map((sz) => {
                  const matchRows = dabbiRows.filter((r) => r.size_id === sz.id)
                  const val = getCellValue(matchRows, sectionMetric)
                  return (
                    <td key={sz.id} style={{ ...tdStyle, fontWeight: 700 }}>
                      {val > 0 ? fmt(val) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                  )
                })}
                <td style={{ ...tdStyle, fontWeight: 700 }}>
                  {fmt(getCellValue(dabbiRows, sectionMetric))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '0.4rem', paddingLeft: '0.2rem' }}>
          {sectionSkus} SKUs &nbsp;|&nbsp; {fmt(sectionGross)} gross available &nbsp;|&nbsp; {fmt(sectionCommitted)} committed
        </div>
      </div>
    )
  }

  // ── Print matrix section (plain HTML, no React state) ─────

  function buildPrintSection(dabbiRows: DisplayRow[], dabbiName: string): string {
    const seen = new Set<string>()
    const pairs: Array<{ shapeId: string; colourId: string; shapeName: string; colourCode: string; shapeSrt: number; colourSrt: number }> = []
    for (const r of dabbiRows) {
      const key = `${r.shape_design_id}|${r.bindi_colour_id}`
      if (!seen.has(key)) {
        seen.add(key)
        pairs.push({ shapeId: r.shape_design_id, colourId: r.bindi_colour_id, shapeName: r.shape_name, colourCode: r.colour_code, shapeSrt: r.shape_sort, colourSrt: r.colour_sort })
      }
    }
    pairs.sort((a, b) => a.shapeSrt - b.shapeSrt || a.colourSrt - b.colourSrt)

    const sizeIdsPresent = new Set(dabbiRows.map((r) => r.size_id))
    const activeSizes = sortedSizes.filter((s) => sizeIdsPresent.has(s.id))

    const lookup = new Map<string, DisplayRow[]>()
    for (const r of dabbiRows) {
      const key = `${r.shape_design_id}|${r.bindi_colour_id}|${r.size_id}`
      const existing = lookup.get(key) ?? []
      existing.push(r)
      lookup.set(key, existing)
    }

    const sectionGross = dabbiRows.reduce((s, r) => s + r.available_qty, 0)
    const sectionSkus = new Set(dabbiRows.map((r) => `${r.shape_design_id}|${r.bindi_colour_id}|${r.size_id}`)).size

    const sizeHeaders = activeSizes.map((s) => `<th>${s.code}</th>`).join('')
    const totalRow = activeSizes.map((sz) => {
      const val = dabbiRows.filter((r) => r.size_id === sz.id).reduce((s, r) => s + r.available_qty, 0)
      return `<td style="font-weight:700;text-align:right">${val > 0 ? fmt(val) : '—'}</td>`
    }).join('')
    const grandTotal = fmt(dabbiRows.reduce((s, r) => s + r.available_qty, 0))

    const dataRows = pairs.map((dc) => {
      const cells = activeSizes.map((sz) => {
        const matchRows = lookup.get(`${dc.shapeId}|${dc.colourId}|${sz.id}`) ?? []
        const val = matchRows.reduce((s, r) => s + r.available_qty, 0)
        return `<td style="text-align:right">${val > 0 ? fmt(val) : '—'}</td>`
      }).join('')
      const rowTotal = activeSizes.reduce((s, sz) => {
        const matchRows = lookup.get(`${dc.shapeId}|${dc.colourId}|${sz.id}`) ?? []
        return s + matchRows.reduce((ss, r) => ss + r.available_qty, 0)
      }, 0)
      if (rowTotal === 0) return ''
      return `<tr><td>${dc.shapeName}</td><td>${dc.colourCode}</td>${cells}<td style="font-weight:700;text-align:right">${fmt(rowTotal)}</td></tr>`
    }).filter(Boolean).join('')

    const shortageRows = metric === 'shortage'
      ? pairs.flatMap((dc) => {
          return activeSizes.flatMap((sz) => {
            const matchRows = lookup.get(`${dc.shapeId}|${dc.colourId}|${sz.id}`) ?? []
            const shortage = matchRows.reduce((s, r) => s + r.shortage_qty, 0)
            const open = matchRows.reduce((s, r) => s + r.open_qty, 0)
            const avail = matchRows.reduce((s, r) => s + r.available_qty, 0)
            if (shortage <= 0) return []
            return [`<tr><td>${dc.shapeName}</td><td>${dc.colourCode}</td><td>${sz.code}</td><td style="text-align:right">${fmt(open)}</td><td style="text-align:right">${fmt(avail)}</td><td style="text-align:right;color:#c00">${fmt(shortage)}</td></tr>`]
          })
        }).join('')
      : ''

    const shortageTable = metric === 'shortage' && shortageRows
      ? `<div style="margin-top:16px">
          <div style="font-size:12px;font-weight:700;margin-bottom:6px">SHORTAGE SUMMARY</div>
          <table>
            <thead><tr><th>DESIGN</th><th>CLR</th><th>SIZE</th><th>OPEN</th><th>AVAILABLE</th><th>SHORT</th></tr></thead>
            <tbody>${shortageRows}</tbody>
          </table>
        </div>`
      : ''

    return `
      <div style="font-size:18px;font-weight:700;margin-bottom:4px">NIRANKARI BINDI</div>
      <div style="font-size:14px;font-weight:700;margin-bottom:2px">READY STOCK POSITION — ${dabbiName.toUpperCase()}</div>
      <div style="font-size:11px;margin-bottom:8px">${today} | Stock Brain</div>
      <hr style="border:1px solid #000;margin-bottom:8px"/>
      <table>
        <thead>
          <tr>
            <th>DESIGN</th><th>CLR</th>${sizeHeaders}<th>TOTAL</th>
          </tr>
        </thead>
        <tbody>${dataRows}</tbody>
        <tfoot>
          <tr style="font-weight:700">
            <td colspan="2">GRAND TOTAL</td>${totalRow}<td style="font-weight:700;text-align:right">${grandTotal}</td>
          </tr>
        </tfoot>
      </table>
      <div style="font-size:11px;margin-top:8px">${sectionSkus} SKUs | ${fmt(sectionGross)} gross available</div>
      ${shortageTable}
    `
  }

  // ── Render ─────────────────────────────────────────────────

  const tdNum: CSSProperties = {
    ...tableTd,
    textAlign: 'right',
    paddingRight: '1rem',
    fontVariantNumeric: 'tabular-nums',
  }
  const thNum: CSSProperties = {
    ...tableTh,
    textAlign: 'right',
    paddingRight: '1rem',
  }

  return (
    <>
      {/* ── Print styles ─────────────────────────────────── */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }

          #ready-stock-print {
            visibility: visible !important;
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            background: white !important;
          }

          #ready-stock-print * {
            visibility: visible !important;
            font-family: Arial, sans-serif !important;
            color: #000 !important;
            background: #fff !important;
          }

          #ready-stock-print table {
            border-collapse: collapse !important;
            width: 100% !important;
          }

          #ready-stock-print th {
            background: #1a1a2e !important;
            color: #fff !important;
            border: 1px solid #000 !important;
            padding: 4px 6px !important;
            font-size: 10px !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          #ready-stock-print td {
            border: 1px solid #000 !important;
            padding: 4px 6px !important;
            font-size: 10px !important;
          }

          @page {
            size: A4 landscape;
            margin: 15mm;
          }
        }
        @media print { .no-print { display: none !important; } }
      `}</style>

      {/* ── Hidden print div ─────────────────────────────── */}
      <div id="ready-stock-print" style={{ display: 'none' }}>
        {printDabbiGroups.map(({ dabbi, rows: dRows }) => (
          <div key={dabbi.id} style={{ pageBreakAfter: 'always' }}
            dangerouslySetInnerHTML={{ __html: buildPrintSection(dRows, dabbi.name || dabbi.code) }}
          />
        ))}
      </div>

      {/* ── Error ────────────────────────────────────────── */}
      {fetchError && (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)', marginBottom: '1rem' }}>
          ✗ {fetchError}
        </p>
      )}

      {/* ── Stat cards ───────────────────────────────────── */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.75rem' }}>
        <StatCard label="Total Gross" value={fmt(totalGross)} sub="gross available" variant="default" />
        <StatCard label="Ready to Dispatch" value={fmt(readyToDispatch)} sub="gross available now" variant="success" />
        <StatCard label="Needs Labour" value={needsLabourCount} sub="SKUs" variant="warning" />
        <StatCard label="Short / Cut" value={shortCutCount} sub="SKUs needing action" variant="danger" />
      </div>

      {/* ── View toggle + print button ───────────────────── */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          {(['list', 'matrix'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '0.4rem 1rem',
                fontSize: 'var(--text-sm)',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                background: view === v ? 'var(--accent)' : 'var(--bg-elevated)',
                color: view === v ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {v === 'list' ? 'List' : 'Matrix'}
            </button>
          ))}
        </div>
        <button
          onClick={() => window.print()}
          style={{
            padding: '0.4rem 1rem',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          Print Ready Stock
        </button>
      </div>

      {/* ── Filters ──────────────────────────────────────── */}
      <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
        <FilterSelect label="Design" value={fDesign} options={designOptions} onChange={setFDesign} />
        <FilterSelect label="CLR" value={fColour} options={colourOptions} onChange={setFColour} />
        <FilterSelect label="Dabbi" value={fDabbi} options={dabbiOptions} onChange={setFDabbi} />
        <FilterSelect label="Brand" value={fBrand} options={brandOptions} onChange={setFBrand} />
        <FilterSelect label="Status" value={fStatus} options={statusOptions} onChange={setFStatus} />
        <FilterSelect label="Size" value={fSize} options={sizeOptions} onChange={setFSize} />
        {(fDesign || fColour || fDabbi || fBrand || fStatus || fSize) && (
          <button
            onClick={() => { setFDesign(''); setFColour(''); setFDabbi(''); setFBrand(''); setFStatus(''); setFSize('') }}
            style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-end', paddingBottom: '0.45rem' }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Summary line ─────────────────────────────────── */}
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        <strong style={{ color: 'var(--text-primary)' }}>{filtered.length}</strong> SKUs &nbsp;|&nbsp;
        <strong style={{ color: 'var(--text-primary)' }}>{fmt(summaryGross)}</strong> gross available &nbsp;|&nbsp;
        <strong style={{ color: summaryShort > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>{summaryShort}</strong> short
      </div>

      {/* ── Metric toggle (matrix only) ───────────────────── */}
      {view === 'matrix' && (
        <div className="no-print" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {(['available', 'gross', 'committed', 'open_orders', 'shortage'] as MatrixMetric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              style={{
                padding: '0.3rem 0.85rem',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-strong)',
                cursor: 'pointer',
                background: metric === m ? 'var(--accent)' : 'var(--bg-elevated)',
                color: metric === m ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {m === 'open_orders' ? 'Open Orders' : m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────── */}
      {filtered.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          {rows.length === 0
            ? 'No finished goods in ready stock.'
            : 'No SKUs match the current filters.'}
        </p>
      )}

      {/* ── List view ─────────────────────────────────────── */}
      {view === 'list' && filtered.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1000px' }}>
            <thead>
              <tr>
                <th style={tableTh}>SHAPE</th>
                <th style={tableTh}>CLR</th>
                <th style={tableTh}>SIZE</th>
                <th style={tableTh}>DABBI</th>
                <th style={tableTh}>BRAND</th>
                <th style={thNum}>GROSS</th>
                <th style={thNum}>COMMITTED</th>
                <th style={thNum}>AVAILABLE</th>
                <th style={thNum}>OPEN ORDERS</th>
                <th style={tableTh}>STATUS</th>
                <th style={tableTh}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const isShortage = IS_SHORTAGE[row.planning_status] ?? false
                const rowBg: CSSProperties = {
                  background: row.planning_status === 'procure_velvet'
                    ? 'var(--danger-subtle)'
                    : isShortage ? 'rgba(245,158,11,0.05)'
                    : undefined,
                }
                const action = actionLabel(row.planning_status)
                return (
                  <tr key={row.id} style={rowBg}>
                    <td style={tableTd}>{row.shape_name}</td>
                    <td style={tableTd}>{row.colour_code}</td>
                    <td style={tableTd}>{row.size_code}</td>
                    <td style={tableTd}>{row.dabbi_name || row.dabbi_code}</td>
                    <td style={tableTd}>{row.brand_name}</td>
                    <td style={tdNum}>{fmt(row.gross_qty)}</td>
                    <td style={tdNum}>{fmt(row.committed_qty)}</td>
                    <td style={{ ...tdNum, color: row.available_qty === 0 && row.gross_qty > 0 ? 'var(--text-secondary)' : undefined }}>
                      {fmt(row.available_qty)}
                    </td>
                    <td style={{ ...tdNum, color: row.open_qty > row.available_qty ? 'var(--danger)' : undefined, fontWeight: row.open_qty > 0 ? 600 : undefined }}>
                      {fmt(row.open_qty)}
                    </td>
                    <td style={{ ...tableTd, paddingLeft: '0.5rem' }}>
                      <Badge
                        variant={statusBadgeVariant(row.planning_status)}
                        label={statusLabel(row.planning_status)}
                        size="sm"
                      />
                    </td>
                    <td style={{ ...tableTd, paddingLeft: '0.5rem' }}>
                      {action && (
                        <span style={actionStyle(row.planning_status)}>{action}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Matrix view ───────────────────────────────────── */}
      {view === 'matrix' && filtered.length > 0 && (
        <div>
          {matrixDabbiGroups.length === 0 && (
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>No data for current filters.</p>
          )}
          {matrixDabbiGroups.map(({ dabbi, rows: dRows }) =>
            renderMatrixSection(dRows, dabbi.name || dabbi.code, metric),
          )}
          {matrixDabbiGroups.length > 1 && (
            <div style={{ paddingTop: '0.5rem', borderTop: '2px solid var(--border-strong)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              TOTAL: {filtered.length} SKUs &nbsp;|&nbsp; {fmt(summaryGross)} gross available
            </div>
          )}
        </div>
      )}

      {/* ── Stock Entry History ───────────────────────────── */}
      {stockHistory.length > 0 && (
        <section className="no-print" style={{ marginTop: '3rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '2rem' }}>
          <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Stock Entry History
          </h3>

          {/* History filters */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 500 }}>
              From
              <input
                type="date"
                value={hDateFrom}
                onChange={(e) => setHDateFrom(e.target.value)}
                style={{ fontSize: 'var(--text-sm)', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 500 }}>
              To
              <input
                type="date"
                value={hDateTo}
                onChange={(e) => setHDateTo(e.target.value)}
                style={{ fontSize: 'var(--text-sm)', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
              />
            </label>
            <FilterSelect
              label="Source"
              value={hSource}
              options={historySourceOptions}
              onChange={setHSource}
            />
            <FilterSelect
              label="Movement"
              value={hMovement}
              options={[
                { value: 'positive', label: 'Positive (+)' },
                { value: 'negative', label: 'Negative (−)' },
              ]}
              onChange={setHMovement}
            />
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 500 }}>
              SKU search
              <input
                type="text"
                value={hSku}
                onChange={(e) => setHSku(e.target.value)}
                placeholder="design, colour, size…"
                style={{ fontSize: 'var(--text-sm)', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', width: '160px' }}
              />
            </label>
            {(hDateFrom !== THIRTY_DAYS_AGO || hDateTo || hSource || hSku || hMovement) && (
              <button
                onClick={() => { setHDateFrom(THIRTY_DAYS_AGO); setHDateTo(''); setHSource(''); setHSku(''); setHMovement('') }}
                style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', alignSelf: 'flex-end', paddingBottom: '0.45rem' }}
              >
                Clear
              </button>
            )}
          </div>

          {fDabbi && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              Showing entries for <strong>{dabbi_colours.find((d) => d.id === fDabbi)?.name ?? fDabbi}</strong> dabbi only (from page filter).
            </p>
          )}

          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
            {filteredHistory.length} entr{filteredHistory.length === 1 ? 'y' : 'ies'}
            {filteredHistory.length > historyLimit && (
              <span> — showing first {historyLimit}</span>
            )}
          </div>

          {filteredHistory.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>No entries match current filters.</p>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '700px' }}>
                  <thead>
                    <tr>
                      <th style={tableTh}>Date</th>
                      <th style={tableTh}>Source</th>
                      <th style={tableTh}>SKU</th>
                      <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1rem' }}>Qty Changed</th>
                      <th style={tableTh}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.slice(0, historyLimit).map((row) => (
                      <tr key={row.id}>
                        <td style={tableTd}>
                          {new Date(row.corrected_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={tableTd}>{row.source}</td>
                        <td style={tableTd}>{row.sku}</td>
                        <td style={{ ...tableTd, textAlign: 'right', paddingRight: '1rem', fontVariantNumeric: 'tabular-nums', color: row.delta_qty >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                          {row.delta_qty > 0 ? '+' : ''}
                          {row.delta_qty % 1 === 0 ? row.delta_qty : row.delta_qty.toFixed(3)}
                        </td>
                        <td style={{ ...tableTd, color: 'var(--text-secondary)', maxWidth: '320px', fontSize: 'var(--text-xs)' }}>
                          {row.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredHistory.length > historyLimit && (
                <button
                  onClick={() => setHistoryLimit(filteredHistory.length)}
                  style={{ marginTop: '0.75rem', fontSize: 'var(--text-sm)', padding: '0.4rem 1rem', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  Load more ({filteredHistory.length - historyLimit} remaining)
                </button>
              )}
            </>
          )}
        </section>
      )}
    </>
  )
}
