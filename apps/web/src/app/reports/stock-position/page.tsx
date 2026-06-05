import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ReportHeader } from '@/components/reports/ReportHeader'
import { ReportFilterBar } from '@/components/reports/ReportFilterBar'
import type { FilterField, ActiveFilters } from '@stock-brain/types'
import { tableTh, tableTd } from '@/lib/ui'
import type { CSSProperties } from 'react'

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

type LookupRow = { id: string; code: string; name?: string | null; sort_order?: number | null }

type StockCell = {
  design_id: string
  design_name: string
  colour_id: string
  colour_name: string
  size_id: string
  size_name: string
  qty: number
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

type StatCardProps = {
  label: string
  value: string
  variant?: 'default' | 'warning' | 'success' | 'info'
}

function MiniStatCard({ label, value, variant = 'default' }: StatCardProps) {
  const accent = variant === 'warning' ? 'var(--warning)' : variant === 'success' ? 'var(--success)' : variant === 'info' ? 'var(--info)' : 'var(--border-strong)'
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderLeft: `3px solid ${accent}`, borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', minWidth: '160px' }}>
      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

export default async function StockPositionReportPage({ searchParams }: PageProps) {
  const params = await searchParams
  const stageFilter  = typeof params.stage  === 'string' ? params.stage  : ''
  const designFilter = typeof params.design === 'string' ? params.design : ''
  const clrFilter    = typeof params.clr    === 'string' ? params.clr    : ''
  const asOfFilter   = typeof params.asOf   === 'string' ? params.asOf   : ''
  const showZero     = params.zeros === 'true'

  const supabase = createServerSupabaseClient()

  const [shapesResult, bindisResult, sizesResult, velvetResult, cuttingsResult, readyResult, jobsResult] =
    await Promise.allSettled([
      supabase.from('shape_designs').select('id, code, name, sort_order').order('sort_order'),
      supabase.from('bindi_colours').select('id, code, name, sort_order').order('sort_order'),
      supabase.from('sizes').select('id, code, name, sort_order').order('sort_order'),
      supabase.from('velvet_stock_balance').select('velvet_type, bundles_on_hand, last_updated_at').eq('velvet_type', 'standard').single(),
      supabase.from('cuttings_stock_balance').select('shape_design_id, bindi_colour_id, size_id, gross_qty, available_qty'),
      supabase.from('ready_stock_balance').select('shape_design_id, bindi_colour_id, size_id, gross_qty, available_qty').gt('gross_qty', 0),
      supabase
        .from('labour_jobs')
        .select('id')
        .not('status', 'in', '("returned_complete","cancelled_recalled")'),
    ])

  const shapes = shapesResult.status === 'fulfilled' ? (shapesResult.value.data ?? []) as LookupRow[] : []
  const bindis = bindisResult.status === 'fulfilled'  ? (bindisResult.value.data ?? []) as LookupRow[]  : []
  const sizes  = sizesResult.status === 'fulfilled'   ? (sizesResult.value.data ?? []) as LookupRow[]   : []

  const shapeMap  = new Map(shapes.map((s) => [s.id, s.name ?? s.code]))
  const bindiMap  = new Map(bindis.map((c) => [c.id, c.code]))
  const sizeMap   = new Map(sizes.map((s)  => [s.id, s.code]))

  const velvetData = velvetResult.status === 'fulfilled' ? velvetResult.value.data : null
  const velvetBundles = velvetData ? Number(velvetData.bundles_on_hand) : 0

  // Cuttings stock cells
  type RawStock = { shape_design_id: string; bindi_colour_id: string; size_id: string; gross_qty: number | string; available_qty: number | string }
  const cuttingsRaw = cuttingsResult.status === 'fulfilled' ? (cuttingsResult.value.data ?? []) as unknown as RawStock[] : []
  const readyRaw    = readyResult.status === 'fulfilled'    ? (readyResult.value.data ?? []) as unknown as RawStock[]    : []

  // WIP stock — load lines for active jobs
  const activeJobIds = jobsResult.status === 'fulfilled' ? (jobsResult.value.data ?? []).map((j) => j.id as string) : []
  type WipLine = { shape_design_id: string; bindi_colour_id: string; size_id: string; quantity_sent_gross: number | string; quantity_returned_gross: number | string }
  let wipRaw: WipLine[] = []
  if (activeJobIds.length > 0) {
    const { data: wipLines } = await supabase
      .from('labour_job_lines')
      .select('shape_design_id, bindi_colour_id, size_id, quantity_sent_gross, quantity_returned_gross')
      .in('labour_job_id', activeJobIds)
    wipRaw = (wipLines ?? []) as unknown as WipLine[]
  }

  // Aggregate WIP qty per SKU
  const wipMap = new Map<string, number>()
  for (const w of wipRaw) {
    const key = `${w.shape_design_id}:${w.bindi_colour_id}:${w.size_id}`
    const wip = Math.max(0, Number(w.quantity_sent_gross) - Number(w.quantity_returned_gross))
    wipMap.set(key, (wipMap.get(key) ?? 0) + wip)
  }

  function toStockCells(rows: RawStock[], qtyField: 'gross_qty' | 'available_qty'): StockCell[] {
    return rows
      .map((r) => ({
        design_id:   r.shape_design_id,
        design_name: shapeMap.get(r.shape_design_id) ?? r.shape_design_id,
        colour_id:   r.bindi_colour_id,
        colour_name: bindiMap.get(r.bindi_colour_id) ?? r.bindi_colour_id,
        size_id:     r.size_id,
        size_name:   sizeMap.get(r.size_id) ?? r.size_id,
        qty:         Number(r[qtyField]),
      }))
      .filter((c) => showZero || c.qty > 0)
  }

  const wipCells: StockCell[] = Array.from(wipMap.entries())
    .map(([key, wip]) => {
      const [design_id, colour_id, size_id] = key.split(':')
      return {
        design_id,
        design_name: shapeMap.get(design_id) ?? design_id,
        colour_id,
        colour_name: bindiMap.get(colour_id) ?? colour_id,
        size_id,
        size_name: sizeMap.get(size_id) ?? size_id,
        qty: wip,
      }
    })
    .filter((c) => showZero || c.qty > 0)

  let cuttingsCells = toStockCells(cuttingsRaw, 'gross_qty')
  let readyCells    = toStockCells(readyRaw, 'available_qty')
  let wipCellsFilt  = wipCells

  // Apply filters
  function applySkuFilter(cells: StockCell[]): StockCell[] {
    let out = cells
    if (designFilter) out = out.filter((c) => c.design_id === designFilter)
    if (clrFilter)    out = out.filter((c) => c.colour_id === clrFilter)
    return out
  }

  cuttingsCells = applySkuFilter(cuttingsCells)
  readyCells    = applySkuFilter(readyCells)
  wipCellsFilt  = applySkuFilter(wipCellsFilt)

  const totalCuttings = cuttingsCells.reduce((s, c) => s + c.qty, 0)
  const totalWip      = wipCellsFilt.reduce((s, c) => s + c.qty, 0)
  const totalReady    = readyCells.reduce((s, c) => s + c.qty, 0)

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const displayDate = asOfFilter
    ? new Date(asOfFilter).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : today

  const filters: FilterField[] = [
    { key: 'asOf', label: 'Snapshot Date', options: [], inputType: 'date' },
    {
      key: 'stage',
      label: 'Stage',
      options: [
        { id: 'velvet',   label: 'Velvet' },
        { id: 'cuttings', label: 'Cuttings' },
        { id: 'wip',      label: 'WIP' },
        { id: 'ready',    label: 'Ready' },
      ],
    },
    { key: 'design', label: 'Design', options: shapes.map((s) => ({ id: s.id, label: s.name ?? s.code })) },
    { key: 'clr',    label: 'CLR',    options: bindis.map((c) => ({ id: c.id, label: c.code })) },
    {
      key: 'zeros',
      label: 'Show Zeros',
      options: [{ id: 'true', label: 'Yes' }],
    },
  ]

  const activeFilters: ActiveFilters = {
    asOf:   asOfFilter   ? [asOfFilter]   : [],
    stage:  stageFilter  ? [stageFilter]  : [],
    design: designFilter ? [designFilter] : [],
    clr:    clrFilter    ? [clrFilter]    : [],
    zeros:  showZero     ? ['true']       : [],
  }

  const reportFilters = [
    { label: 'Date',   value: displayDate },
    { label: 'Stage',  value: stageFilter  || 'All' },
    { label: 'Design', value: designFilter ? (shapeMap.get(designFilter) ?? designFilter) : 'All' },
  ]

  const tdNum: CSSProperties = { ...tableTd, textAlign: 'right', paddingRight: '1rem', fontVariantNumeric: 'tabular-nums' }
  const thNum: CSSProperties = { ...tableTh, textAlign: 'right', paddingRight: '1rem' }

  const showCuttings = !stageFilter || stageFilter === 'cuttings'
  const showWip      = !stageFilter || stageFilter === 'wip'
  const showReady    = !stageFilter || stageFilter === 'ready'
  const showVelvet   = !stageFilter || stageFilter === 'velvet'

  function StockMatrix({ cells, label }: { cells: StockCell[]; label: string }) {
    if (cells.length === 0) {
      return <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: '1rem' }}>No {label} stock entries.</p>
    }

    // Group by design+colour for table rows; sizes as columns
    type Row = { design_id: string; design_name: string; colour_id: string; colour_name: string; cells: Record<string, number>; total: number }
    const rowMap = new Map<string, Row>()
    for (const c of cells) {
      const key = `${c.design_id}:${c.colour_id}`
      const existing = rowMap.get(key) ?? { design_id: c.design_id, design_name: c.design_name, colour_id: c.colour_id, colour_name: c.colour_name, cells: {}, total: 0 }
      existing.cells[c.size_id] = (existing.cells[c.size_id] ?? 0) + c.qty
      existing.total += c.qty
      rowMap.set(key, existing)
    }

    const sizesCols = sizes.filter((s) => cells.some((c) => c.size_id === s.id))
    const tableRows = Array.from(rowMap.values())

    return (
      <div style={{ overflowX: 'auto', marginBottom: '0.5rem' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={tableTh}>Design</th>
              <th style={tableTh}>CLR</th>
              {sizesCols.map((s) => <th key={s.id} style={thNum}>{s.code}</th>)}
              <th style={{ ...thNum, fontWeight: 700 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => (
              <tr key={`${row.design_id}:${row.colour_id}`}>
                <td style={tableTd}>{row.design_name}</td>
                <td style={tableTd}>{row.colour_name}</td>
                {sizesCols.map((s) => (
                  <td key={s.id} style={{ ...tdNum, color: (row.cells[s.id] ?? 0) > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {row.cells[s.id] ? fmt(row.cells[s.id]) : '—'}
                  </td>
                ))}
                <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(row.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  function SectionHead({ title, total, variant }: { title: string; total: number; variant?: string }) {
    const color = variant === 'warning' ? 'var(--warning)' : variant === 'success' ? 'var(--success)' : variant === 'info' ? 'var(--info)' : 'var(--text-secondary)'
    return (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.5rem', marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color, margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</h2>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{fmt(total)} gross</span>
      </div>
    )
  }

  return (
    <main className="print-landscape" style={{ padding: '1.5rem 2rem', maxWidth: '1600px' }}>
      <ReportHeader reportName="DAILY STOCK POSITION" filters={reportFilters} />
      <ReportFilterBar filters={filters} activeFilters={activeFilters} printLabel="Print" />

      {/* Summary stat cards */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        <MiniStatCard label="Velvet" value={`${fmt(velvetBundles)} bundles`} variant="warning" />
        <MiniStatCard label="Cuttings" value={`${fmt(totalCuttings)} gross`} variant="info" />
        <MiniStatCard label="WIP" value={`${fmt(totalWip)} gross`} variant="warning" />
        <MiniStatCard label="Ready" value={`${fmt(totalReady)} gross`} variant="success" />
      </div>

      {/* Velvet section */}
      {showVelvet && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderLeft: '3px solid var(--warning)', borderRadius: 'var(--radius-md)' }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--warning)', margin: '0 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>VELVET STOCK</h2>
          <p style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(velvetBundles)} bundles (standard)</p>
          {velvetData && <p style={{ margin: '0.25rem 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Last updated: {new Date(velvetData.last_updated_at as string).toLocaleDateString('en-IN')}</p>}
        </div>
      )}

      {/* Cuttings section */}
      {showCuttings && (
        <div style={{ marginBottom: '1.5rem' }}>
          <SectionHead title="CUTTINGS STOCK" total={totalCuttings} variant="info" />
          <StockMatrix cells={cuttingsCells} label="cuttings" />
        </div>
      )}

      {/* WIP section */}
      {showWip && (
        <div style={{ marginBottom: '1.5rem' }}>
          <SectionHead title="WIP (WITH LABOUR)" total={totalWip} variant="warning" />
          <StockMatrix cells={wipCellsFilt} label="WIP" />
        </div>
      )}

      {/* Ready section */}
      {showReady && (
        <div style={{ marginBottom: '1.5rem' }}>
          <SectionHead title="READY STOCK" total={totalReady} variant="success" />
          <StockMatrix cells={readyCells} label="ready" />
        </div>
      )}

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 1cm; }
        }
      `}</style>
    </main>
  )
}
