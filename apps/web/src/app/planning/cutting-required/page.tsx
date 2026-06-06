import { createServerSupabaseClient } from '@/lib/supabase/server'
import { fetchPlanningAllocation } from '../allocation/fetchers'
import { buildMatrixFromPlanningRows, METRES_PER_BUNDLE } from '@stock-brain/domain'
import { MatrixGrid } from '@/components/matrix/MatrixGrid'
import { ReportHeader } from '@/components/reports/ReportHeader'
import { ReportFilterBar } from '@/components/reports/ReportFilterBar'
import type { PlanningAllocationRow, FilterField, ActiveFilters } from '@stock-brain/types'
import { tableTh, tableTd } from '@/lib/ui'
import type { CSSProperties } from 'react'

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

type LookupRow = { id: string; code: string; name?: string | null; sort_order?: number | null }

function buildLookup(rows: LookupRow[] | null, preferName = false): Map<string, string> {
  return new Map((rows ?? []).map((r) => [r.id, preferName && r.name ? r.name : r.code]))
}

function computeBundlesNeeded(row: PlanningAllocationRow, qty?: number): number | null {
  const cutQty = qty ?? row.recommended_cut_qty
  if (
    row.velvet_bundles_on_hand <= 0 ||
    row.velvet_can_cover_gross <= 0 ||
    cutQty <= 0
  ) return null
  const grossPerMetre = row.velvet_can_cover_gross / row.velvet_bundles_on_hand
  if (grossPerMetre <= 0) return null
  const metresNeeded = cutQty / grossPerMetre
  return metresNeeded / METRES_PER_BUNDLE
}

function withParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
  value: string,
): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (k === key) continue
    if (typeof v === 'string' && v) sp.set(k, v)
    else if (Array.isArray(v) && v.length > 0 && v[0]) sp.set(k, v[0])
  }
  if (value) sp.set(key, value)
  const s = sp.toString()
  return s ? `?${s}` : '?'
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function CuttingRequiredPage({ searchParams }: PageProps) {
  const params = await searchParams
  const designFilter   = typeof params.design   === 'string' ? params.design   : ''
  const clrFilter      = typeof params.clr      === 'string' ? params.clr      : ''
  const sizeFilter     = typeof params.size     === 'string' ? params.size     : ''
  const machineFilter  = typeof params.machine  === 'string' ? params.machine  : ''
  const dateFrom       = typeof params.dateFrom === 'string' ? params.dateFrom : ''
  const dateTo         = typeof params.dateTo   === 'string' ? params.dateTo   : ''
  const dabbiFilter    = typeof params.dabbi    === 'string' ? params.dabbi    : ''
  const customerFilter = typeof params.customer === 'string' ? params.customer : ''
  const priorityFilter = typeof params.priority === 'string' ? params.priority : ''
  const bufferMode     = typeof params.bufferMode === 'string' && params.bufferMode === 'with_buffer' ? 'with_buffer' : 'exact'

  const supabase = createServerSupabaseClient()

  const [allocationResult, shapesResult, bindiResult, sizesResult, machinesResult, dabbiResult] = await Promise.allSettled([
    fetchPlanningAllocation(supabase),
    supabase.from('shape_designs').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('bindi_colours').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('sizes').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('machines').select('id, code, name').order('code'),
    supabase.from('dabbi_colours').select('id, code').order('code'),
  ])

  const rows: PlanningAllocationRow[] = allocationResult.status === 'fulfilled' ? allocationResult.value : []

  console.log('ENGINE OUTPUT SUMMARY:', {
    total: rows.length,
    cut_on_machine: rows.filter(r => r.planning_status === 'cut_on_machine').length,
    give_to_labour: rows.filter(r => r.planning_status === 'give_to_labour').length,
    procure_velvet: rows.filter(r => r.planning_status === 'procure_velvet').length,
    ready_to_dispatch: rows.filter(r => r.planning_status === 'ready_to_dispatch').length,
    covered_by_wip: rows.filter(r => r.planning_status === 'covered_by_wip').length,
  })

  const shapes   = shapesResult.status === 'fulfilled'   ? (shapesResult.value.data ?? []) as LookupRow[]  : []
  const bindis   = bindiResult.status === 'fulfilled'    ? (bindiResult.value.data ?? []) as LookupRow[]   : []
  const sizes    = sizesResult.status === 'fulfilled'    ? (sizesResult.value.data ?? []) as LookupRow[]   : []
  const machines = machinesResult.status === 'fulfilled' ? (machinesResult.value.data ?? []) : []
  const dabbis   = dabbiResult.status === 'fulfilled'    ? (dabbiResult.value.data ?? []) as LookupRow[] : []

  const shapeMap = buildLookup(shapes, true)
  const bindiMap = buildLookup(bindis)
  const sizeMap  = buildLookup(sizes)
  const dabbiMap = buildLookup(dabbis)

  // Build dabbi demand per base3 SKU from ALL open demand rows (not just cut_on_machine)
  const dabbiByBase3 = new Map<string, Set<string>>()
  for (const row of rows) {
    const key = `${row.shape_design_id}|${row.bindi_colour_id}|${row.size_id}`
    const set = dabbiByBase3.get(key) ?? new Set<string>()
    set.add(row.dabbi_colour_id)
    dabbiByBase3.set(key, set)
  }

  const sizeMaster   = sizes.map((s)  => ({ id: s.id, code: s.code, name: s.name ?? s.code, sort_order: Number(s.sort_order ?? 0) }))
  const designMaster = shapes.map((s) => ({ id: s.id, name: s.name ?? s.code, sort_order: Number(s.sort_order ?? 0) }))
  const colourMaster = bindis.map((c) => ({ id: c.id, code: c.code, name: c.name ?? c.code, sort_order: Number(c.sort_order ?? 0) }))

  let cutRows = rows
    .filter((r) =>
      r.planning_status === 'cut_on_machine' ||
      r.planning_status === 'cut_on_machine_override' ||
      r.planning_status === 'procure_velvet'
    )
    .sort((a, b) => a.priority_rank - b.priority_rank)

  if (designFilter) cutRows = cutRows.filter((r) => r.shape_design_id === designFilter)
  if (clrFilter)    cutRows = cutRows.filter((r) => r.bindi_colour_id === clrFilter)
  if (sizeFilter)   cutRows = cutRows.filter((r) => r.size_id === sizeFilter)
  if (dateFrom)     cutRows = cutRows.filter((r) => r.order_date >= dateFrom)
  if (dateTo)       cutRows = cutRows.filter((r) => r.order_date <= dateTo)

  // Derive customer options from current cutRows before applying customer filter
  const customerOptions = [...new Map(cutRows.map((r) => [r.customer_id, r.customer_name])).entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label))

  if (dabbiFilter)    cutRows = cutRows.filter((r) => r.dabbi_colour_id === dabbiFilter)
  if (customerFilter) cutRows = cutRows.filter((r) => r.customer_id === customerFilter)
  if (priorityFilter === 'p1') cutRows = cutRows.filter((r) => r.sort_tier === 0 && r.priority_rank <= 1)
  if (priorityFilter === 'p2') cutRows = cutRows.filter((r) => r.sort_tier === 0 && r.priority_rank <= 2)
  if (priorityFilter === 'p3') cutRows = cutRows.filter((r) => r.sort_tier === 0 && r.priority_rank <= 3)

  const cutOnMachineRows = cutRows.filter((r) =>
    r.planning_status === 'cut_on_machine' ||
    r.planning_status === 'cut_on_machine_override'
  )
  const procureVelvetRows = cutRows.filter((r) => r.planning_status === 'procure_velvet')

  const displayQty = (r: PlanningAllocationRow) =>
    bufferMode === 'exact' ? r.shortage_qty : r.recommended_cut_qty

  const totalCutQty     = cutOnMachineRows.reduce((s, r) => s + displayQty(r), 0)
  const totalBundles    = cutOnMachineRows.reduce((s, r) => s + (computeBundlesNeeded(r, displayQty(r)) ?? 0), 0)
  const totalProcureQty = procureVelvetRows.reduce((s, r) => s + r.shortage_qty, 0)

  type DesignVelvet = { name: string; gross: number; bundles: number }
  const velvetByDesign = new Map<string, DesignVelvet>()
  for (const row of cutOnMachineRows) {
    const name    = shapeMap.get(row.shape_design_id) ?? row.shape_design_id
    const dqty    = displayQty(row)
    const bundles = computeBundlesNeeded(row, dqty) ?? 0
    const prev    = velvetByDesign.get(row.shape_design_id) ?? { name, gross: 0, bundles: 0 }
    velvetByDesign.set(row.shape_design_id, { name, gross: prev.gross + dqty, bundles: prev.bundles + bundles })
  }

  const showVelvetCols = cutOnMachineRows.some((r) => computeBundlesNeeded(r) !== null)

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  const cutMatrixData = buildMatrixFromPlanningRows(
    cutOnMachineRows.map((r) => ({
      shape_design_id: r.shape_design_id,
      bindi_colour_id: r.bindi_colour_id,
      size_id: r.size_id,
      open_qty: displayQty(r),
      ready_allocated_qty: 0,
      wip_allocated_qty: 0,
      shortage_qty: r.shortage_qty,
      planning_status: r.planning_status,
      recommended_action: r.recommended_action,
    })),
    sizeMaster, designMaster, colourMaster,
    { context_label: 'Cut on Machine', date_label: today },
  )

  const procureMatrixData = buildMatrixFromPlanningRows(
    procureVelvetRows.map((r) => ({
      shape_design_id: r.shape_design_id,
      bindi_colour_id: r.bindi_colour_id,
      size_id: r.size_id,
      open_qty: r.shortage_qty,
      ready_allocated_qty: 0,
      wip_allocated_qty: 0,
      shortage_qty: r.shortage_qty,
      planning_status: r.planning_status,
      recommended_action: r.recommended_action,
    })),
    sizeMaster, designMaster, colourMaster,
    { context_label: 'Procure Velvet', date_label: today },
  )

  const machineMap = new Map((machines as Array<{ id: string; code: string; name?: string | null }>).map((m) => [m.id, m.name ?? m.code]))

  const filters: FilterField[] = [
    { key: 'dateFrom',  label: 'From',     options: [], inputType: 'date' },
    { key: 'dateTo',    label: 'To',       options: [], inputType: 'date' },
    { key: 'machine',   label: 'Machine',  options: (machines as Array<{ id: string; code: string; name?: string | null }>).map((m) => ({ id: m.id, label: m.name ?? m.code })) },
    { key: 'design',    label: 'Design',   options: shapes.map((s) => ({ id: s.id, label: s.name ?? s.code })) },
    { key: 'clr',       label: 'CLR',      options: bindis.map((c) => ({ id: c.id, label: c.code })) },
    { key: 'size',      label: 'Size',     options: sizes.map((s)  => ({ id: s.id, label: s.code })) },
    { key: 'dabbi',     label: 'Dabbi',    options: dabbis.map((d) => ({ id: d.id, label: d.code })) },
    { key: 'customer',  label: 'Customer', options: customerOptions },
    { key: 'priority',  label: 'Priority', options: [
      { id: 'p1', label: 'P1 only' },
      { id: 'p2', label: 'P1–P2' },
      { id: 'p3', label: 'P1–P3' },
    ]},
  ]

  const activeFilters: ActiveFilters = {
    dateFrom:  dateFrom        ? [dateFrom]        : [],
    dateTo:    dateTo          ? [dateTo]          : [],
    machine:   machineFilter   ? [machineFilter]   : [],
    design:    designFilter    ? [designFilter]    : [],
    clr:       clrFilter       ? [clrFilter]       : [],
    size:      sizeFilter      ? [sizeFilter]      : [],
    dabbi:     dabbiFilter     ? [dabbiFilter]     : [],
    customer:  customerFilter  ? [customerFilter]  : [],
    priority:  priorityFilter  ? [priorityFilter]  : [],
  }

  const reportFilters = [
    { label: 'Design',  value: designFilter ? (shapeMap.get(designFilter) ?? designFilter) : 'All' },
    { label: 'Machine', value: machineFilter ? (machineMap.get(machineFilter) ?? machineFilter) : 'All' },
    { label: 'From',    value: dateFrom || '—' },
    { label: 'To',      value: dateTo   || '—' },
    { label: 'Date',    value: today },
  ]

  const tdNum: CSSProperties = { ...tableTd, textAlign: 'right', paddingRight: '1rem', fontVariantNumeric: 'tabular-nums' }
  const thNum: CSSProperties = { ...tableTh, textAlign: 'right', paddingRight: '1rem' }
  const sectionHeading: CSSProperties = { fontSize: 'var(--text-base)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem', marginTop: '0' }
  const sectionSummary: CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: '1rem' }
  const subHeading: CSSProperties = { fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.06em' }

  return (
    <main className="print-landscape" style={{ padding: '1.5rem 2rem', maxWidth: '1600px' }}>
      <ReportHeader reportName="MACHINE CUTTING REQUIRED" filters={reportFilters} />
      <ReportFilterBar filters={filters} activeFilters={activeFilters} printLabel="Print" />

      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
        Cut on Machine = cuttings needed, velvet available. Procure Velvet = cuttings needed, velvet not in system yet.
      </p>

      {/* Buffer mode toggle */}
      <div className="no-print" style={{ display: 'flex', gap: '0', marginBottom: '1.25rem', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginRight: '0.6rem' }}>Show qty as:</span>
        <a
          href={withParam(params, 'bufferMode', 'with_buffer')}
          style={{
            fontSize: 'var(--text-xs)', padding: '0.25rem 0.65rem',
            borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)',
            border: '1px solid var(--border)',
            borderRight: 'none',
            textDecoration: 'none',
            background: bufferMode === 'with_buffer' ? 'var(--accent)' : 'var(--bg-elevated)',
            color:      bufferMode === 'with_buffer' ? 'white' : 'var(--text-secondary)',
            fontWeight: bufferMode === 'with_buffer' ? 700 : 400,
          }}
        >
          With Buffer
        </a>
        <a
          href={withParam(params, 'bufferMode', 'exact')}
          style={{
            fontSize: 'var(--text-xs)', padding: '0.25rem 0.65rem',
            borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
            border: '1px solid var(--border)',
            textDecoration: 'none',
            background: bufferMode === 'exact' ? 'var(--accent)' : 'var(--bg-elevated)',
            color:      bufferMode === 'exact' ? 'white' : 'var(--text-secondary)',
            fontWeight: bufferMode === 'exact' ? 700 : 400,
          }}
        >
          Exact Shortage
        </a>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginLeft: '0.75rem' }}>
          Recommended qty = shortage + per-SKU buffer (default 10), rounded to nearest 5. Toggle &lsquo;Exact Shortage&rsquo; to see raw shortage only.
        </span>
      </div>

      {cutRows.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          No lines match the current filters.
        </p>
      ) : (
        <>
          {/* ── Section 1: CUT ON MACHINE TODAY ── */}
          {cutOnMachineRows.length > 0 && (
            <div className="print-section">
              {/* Print-only section header — hidden on screen */}
              <div className="print-only-header" style={{ display: 'none', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #000' }}>
                <div style={{ fontSize: '15px', fontWeight: 'bold' }}>NIRANKARI BINDI</div>
                <div style={{ fontSize: '12px', fontWeight: 'bold', textDecoration: 'underline', marginTop: '2px' }}>Machine Cutting Required — {today}</div>
                <div style={{ fontSize: '10px', marginTop: '3px', color: '#333' }}>
                  Cut on Machine &nbsp;|&nbsp; {cutOnMachineRows.length} SKUs &nbsp;·&nbsp; {fmt(totalCutQty)} gross
                  {totalBundles > 0 && ` · Velvet: ${fmt(totalBundles)} bundles (${fmt(totalBundles * METRES_PER_BUNDLE)} m)`}
                </div>
              </div>

              <div style={{ borderLeft: '3px solid var(--danger)', paddingLeft: '0.75rem', marginBottom: '1rem' }}>
                <h2 style={{ ...sectionHeading, color: 'var(--danger)' }}>Cut on Machine Today</h2>
                <p style={sectionSummary}>
                  <strong style={{ color: 'var(--text-primary)' }}>{cutOnMachineRows.length} SKUs</strong>
                  {' · '}
                  <strong style={{ color: 'var(--text-primary)' }}>{fmt(totalCutQty)} gross</strong>
                  {totalBundles > 0 && (
                    <>{' · '}Velvet: <strong style={{ color: 'var(--warning)' }}>{fmt(totalBundles)} bundles ({fmt(totalBundles * METRES_PER_BUNDLE)} m)</strong></>
                  )}
                </p>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h3 style={subHeading}>Matrix View — Cut Qty (gross)</h3>
                <MatrixGrid data={cutMatrixData} mode="view" />
              </div>

              {totalBundles > 0 && (
                <div style={{ marginBottom: '2rem', padding: '1rem 1.25rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderLeft: '3px solid var(--warning)', borderRadius: 'var(--radius-md)' }}>
                  <h3 style={{ ...subHeading, color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Velvet Requirement by Design</h3>
                  <p style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--warning)', margin: '0 0 0.75rem' }}>
                    Total: {fmt(totalBundles)} bundles ({fmt(totalBundles * METRES_PER_BUNDLE)} metres)
                  </p>
                  <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: '600px' }}>
                    <thead>
                      <tr>
                        <th style={tableTh}>Design</th>
                        <th style={thNum}>Gross to Cut</th>
                        <th style={thNum}>Bundles Required</th>
                        <th style={thNum}>Metres</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(velvetByDesign.values()).map((v) => (
                        <tr key={v.name}>
                          <td style={tableTd}>{v.name}</td>
                          <td style={tdNum}>{fmt(v.gross)}</td>
                          <td style={tdNum}>{fmt(v.bundles)}</td>
                          <td style={tdNum}>{fmt(v.bundles * METRES_PER_BUNDLE)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="no-print" style={{ marginBottom: '2.5rem' }}>
                <h3 style={subHeading}>Detail View</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1000px' }}>
                    <thead>
                      <tr>
                        <th style={tableTh}>Priority</th>
                        <th style={tableTh}>Customer</th>
                        <th style={tableTh}>Shape</th>
                        <th style={tableTh}>CLR</th>
                        <th style={tableTh}>Size</th>
                        <th style={{ ...tableTh, color: 'var(--accent)', fontWeight: 700 }}>Needed Dabbi</th>
                        <th style={{ ...thNum, color: 'var(--danger)' }}>Shortage</th>
                        <th style={{ ...thNum, color: 'var(--danger)', fontWeight: 'bold' }}>Cut Qty</th>
                        {showVelvetCols && (<th style={thNum}>Bundles</th>)}
                        {showVelvetCols && (<th style={thNum}>Metres</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {cutOnMachineRows.map((row) => {
                        const label    = row.sort_tier === 0 ? `P${row.priority_rank} ★` : `W${11 - row.priority_rank}`
                        const dqty     = displayQty(row)
                        const bundles  = computeBundlesNeeded(row, dqty)
                        const metres   = bundles !== null ? bundles * METRES_PER_BUNDLE : null
                        const base3    = `${row.shape_design_id}|${row.bindi_colour_id}|${row.size_id}`
                        const dabbiSet = dabbiByBase3.get(base3) ?? new Set<string>()
                        const dabbiCodes = [...dabbiSet].map((id) => dabbiMap.get(id) ?? id).sort().join(', ')
                        return (
                          <tr key={row.order_line_id} style={{ background: row.override_active ? 'rgba(245,158,11,0.06)' : undefined }}>
                            <td style={tableTd}>
                              <span style={{ fontSize: 'var(--text-xs)', padding: '0.1rem 0.35rem', border: '1px solid', borderRadius: 'var(--radius-sm)', borderColor: row.sort_tier === 0 ? 'var(--accent)' : 'var(--border)', color: row.sort_tier === 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                                {label}
                              </span>
                            </td>
                            <td style={tableTd}>{row.customer_name}</td>
                            <td style={tableTd}>{shapeMap.get(row.shape_design_id) ?? '—'}</td>
                            <td style={tableTd}>{bindiMap.get(row.bindi_colour_id) ?? '—'}</td>
                            <td style={tableTd}>{sizeMap.get(row.size_id) ?? '—'}</td>
                            <td style={{ ...tableTd, fontWeight: 700, color: 'var(--accent)', fontSize: 'var(--text-xs)' }}>{dabbiCodes || '—'}</td>
                            <td style={{ ...tdNum, color: 'var(--danger)', fontWeight: 'bold' }}>{fmt(row.shortage_qty)}</td>
                            <td style={{ ...tdNum, fontWeight: 'bold', color: 'var(--danger)' }}>{fmt(dqty)}</td>
                            {showVelvetCols && (<td style={tdNum}>{bundles !== null ? fmt(bundles) : '—'}</td>)}
                            {showVelvetCols && (<td style={tdNum}>{metres !== null ? fmt(metres) : '—'}</td>)}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Section 2: PROCURE VELVET FIRST ── */}
          {procureVelvetRows.length > 0 && (
            <div className="print-section">
              {/* Print-only section header — hidden on screen */}
              <div className="print-only-header" style={{ display: 'none', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #000' }}>
                <div style={{ fontSize: '15px', fontWeight: 'bold' }}>NIRANKARI BINDI</div>
                <div style={{ fontSize: '12px', fontWeight: 'bold', textDecoration: 'underline', marginTop: '2px' }}>Procure Velvet — {today}</div>
                <div style={{ fontSize: '10px', marginTop: '3px', color: '#333' }}>
                  Procure Velvet &nbsp;|&nbsp; {procureVelvetRows.length} SKUs &nbsp;·&nbsp; {fmt(totalProcureQty)} gross shortage
                </div>
              </div>

              <div style={{ borderLeft: '3px solid var(--warning)', paddingLeft: '0.75rem', marginBottom: '1rem' }}>
                <h2 style={{ ...sectionHeading, color: 'var(--warning)' }}>Procure Velvet First</h2>
                <p style={sectionSummary}>
                  <strong style={{ color: 'var(--text-primary)' }}>{procureVelvetRows.length} SKUs</strong>
                  {' · '}
                  <strong style={{ color: 'var(--text-primary)' }}>{fmt(totalProcureQty)} gross shortage</strong>
                </p>
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <h3 style={subHeading}>Matrix View — Shortage Qty (gross)</h3>
                <MatrixGrid data={procureMatrixData} mode="view" />
              </div>

              <div className="no-print" style={{ marginBottom: '2.5rem' }}>
                <h3 style={subHeading}>Detail View</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '900px' }}>
                    <thead>
                      <tr>
                        <th style={tableTh}>Priority</th>
                        <th style={tableTh}>Customer</th>
                        <th style={tableTh}>Shape</th>
                        <th style={tableTh}>CLR</th>
                        <th style={tableTh}>Size</th>
                        <th style={{ ...tableTh, color: 'var(--accent)', fontWeight: 700 }}>Needed Dabbi</th>
                        <th style={{ ...thNum, color: 'var(--warning)' }}>Shortage</th>
                        <th style={{ ...thNum, color: 'var(--warning)', fontWeight: 'bold' }}>Cut Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {procureVelvetRows.map((row) => {
                        const label    = row.sort_tier === 0 ? `P${row.priority_rank} ★` : `W${11 - row.priority_rank}`
                        const dqty     = displayQty(row)
                        const base3    = `${row.shape_design_id}|${row.bindi_colour_id}|${row.size_id}`
                        const dabbiSet = dabbiByBase3.get(base3) ?? new Set<string>()
                        const dabbiCodes = [...dabbiSet].map((id) => dabbiMap.get(id) ?? id).sort().join(', ')
                        return (
                          <tr key={row.order_line_id} style={{ background: row.override_active ? 'rgba(245,158,11,0.06)' : undefined }}>
                            <td style={tableTd}>
                              <span style={{ fontSize: 'var(--text-xs)', padding: '0.1rem 0.35rem', border: '1px solid', borderRadius: 'var(--radius-sm)', borderColor: row.sort_tier === 0 ? 'var(--accent)' : 'var(--border)', color: row.sort_tier === 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                                {label}
                              </span>
                            </td>
                            <td style={tableTd}>{row.customer_name}</td>
                            <td style={tableTd}>{shapeMap.get(row.shape_design_id) ?? '—'}</td>
                            <td style={tableTd}>{bindiMap.get(row.bindi_colour_id) ?? '—'}</td>
                            <td style={tableTd}>{sizeMap.get(row.size_id) ?? '—'}</td>
                            <td style={{ ...tableTd, fontWeight: 700, color: 'var(--accent)', fontSize: 'var(--text-xs)' }}>{dabbiCodes || '—'}</td>
                            <td style={{ ...tdNum, color: 'var(--warning)', fontWeight: 'bold' }}>{fmt(row.shortage_qty)}</td>
                            <td style={{ ...tdNum, fontWeight: 'bold', color: 'var(--warning)' }}>{fmt(dqty)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                  Velvet procurement quantities — coming once conversion rates are fully entered
                </p>
              </div>
              {/* Signature line — only on the last section when printed */}
              <div className="print-signature" style={{ marginTop: '28px', fontSize: '11px' }}>
                <p style={{ margin: 0 }}>
                  Prepared by: _______________________________ &nbsp;&nbsp;&nbsp; Approved by: _______________________________ &nbsp;&nbsp;&nbsp; Date: ___________
                </p>
              </div>
            </div>
          )}

          {/* Signature line on cut-on-machine section when procure section is absent */}
          {cutOnMachineRows.length > 0 && procureVelvetRows.length === 0 && (
            <div className="print-signature" style={{ marginTop: '28px', fontSize: '11px' }}>
              <p style={{ margin: 0 }}>
                Prepared by: _______________________________ &nbsp;&nbsp;&nbsp; Approved by: _______________________________ &nbsp;&nbsp;&nbsp; Date: ___________
              </p>
            </div>
          )}
        </>
      )}

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm 12mm 15mm 12mm; }
          /* Section page breaks */
          .print-section { page-break-after: auto; }
          .print-section + .print-section { page-break-before: always !important; break-before: page !important; }
          /* Show print-only elements */
          .print-only-header { display: block !important; }
          .print-signature { display: block !important; margin-top: 24px !important; }
          /* Hide screen-only chrome */
          .no-print,
          .report-header-screen,
          .report-filter-bar { display: none !important; }
          /* Section heading strip — hide coloured left-border heading, keep matrix */
          .print-section > div:nth-child(2) { display: none !important; }
          /* Table print rules */
          table { width: 100% !important; font-size: 9pt !important; border-collapse: collapse !important; }
          thead { display: table-header-group !important; }
          tfoot { display: table-footer-group !important; }
          tr { page-break-inside: avoid !important; }
          th, td { border: 1px solid #000 !important; padding: 3px 6px !important; background: #fff !important; color: #000 !important; }
          th { background: #e8e8e8 !important; font-weight: bold !important; }
          /* Matrix header row keeps dark blue */
          .matrix-header-row th { background: #1e3a5f !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          /* Layout reset */
          main { padding: 0 !important; max-width: 100% !important; }
          .matrix-print-root { overflow: visible !important; max-height: none !important; }
          /* SKU summary text */
          .matrix-print-root > div:last-of-type { font-size: 9pt !important; color: #333 !important; }
          /* Velvet requirement table */
          .velvet-req-table { margin-top: 10pt !important; }
        }
        @media screen {
          .print-only-header { display: none !important; }
          .print-signature { display: none; }
        }
      `}</style>
    </main>
  )
}
