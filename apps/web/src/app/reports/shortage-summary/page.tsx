import { createServerSupabaseClient } from '@/lib/supabase/server'
import { fetchPlanningAllocation } from '@/app/planning/allocation/fetchers'
import { METRES_PER_BUNDLE } from '@stock-brain/domain'
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

function computeBundlesNeeded(row: PlanningAllocationRow): number | null {
  if (row.shortage_qty <= 0 || row.velvet_bundles_on_hand <= 0 || row.velvet_can_cover_gross <= 0) return null
  const grossPerBundle = row.velvet_can_cover_gross / row.velvet_bundles_on_hand
  if (grossPerBundle <= 0) return null
  return row.recommended_cut_qty / grossPerBundle
}

function shortageTypeLabel(status: string): string {
  if (status.startsWith('give_to_labour'))  return 'Give to Labour'
  if (status.startsWith('cut_on_machine'))  return 'Cut on Machine'
  if (status.startsWith('procure_velvet'))  return 'Procure Velvet'
  return status
}

function statusBadgeColor(status: string): string {
  if (status.startsWith('give_to_labour')) return 'var(--warning)'
  if (status.startsWith('cut_on_machine')) return 'var(--danger)'
  if (status.startsWith('procure_velvet')) return 'var(--danger)'
  return 'var(--text-secondary)'
}

function statusBadgeBg(status: string): string {
  if (status.startsWith('give_to_labour')) return 'var(--warning-subtle)'
  if (status.startsWith('cut_on_machine')) return 'var(--danger-subtle)'
  if (status.startsWith('procure_velvet')) return 'var(--danger-subtle)'
  return 'var(--bg-hover)'
}

// Build a plain HTML matrix for print: rows = design+CLR, cols = sizes, cells = qtyFn(row)
type PrintSMatrixRow = { designName: string; colourCode: string; qtys: number[]; total: number }
type PrintSMatrix = { sizeCodes: string[]; mRows: PrintSMatrixRow[]; grandTotal: number }

function buildShortageMatrix(
  sectionRows: PlanningAllocationRow[],
  qtyFn: (r: PlanningAllocationRow) => number,
  shapeMap: Map<string, string>,
  bindiMap: Map<string, string>,
  sizeMap: Map<string, string>,
  allSizes: LookupRow[]
): PrintSMatrix {
  const relevant = sectionRows.filter((r) => qtyFn(r) > 0)
  if (relevant.length === 0) return { sizeCodes: [], mRows: [], grandTotal: 0 }

  const sectionSizeIdSet = new Set(relevant.map((r) => r.size_id))
  const orderedSizes = allSizes
    .filter((s) => sectionSizeIdSet.has(s.id))
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
  const sizeIds = orderedSizes.map((s) => s.id)
  const sizeCodes = orderedSizes.map((s) => sizeMap.get(s.id) ?? s.code)

  const seenPairs = new Set<string>()
  const pairs: { shapeId: string; bindiId: string }[] = []
  for (const r of relevant) {
    const key = `${r.shape_design_id}|${r.bindi_colour_id}`
    if (!seenPairs.has(key)) {
      seenPairs.add(key)
      pairs.push({ shapeId: r.shape_design_id, bindiId: r.bindi_colour_id })
    }
  }

  const mRows: PrintSMatrixRow[] = pairs.map(({ shapeId, bindiId }) => {
    const qtys = sizeIds.map((sizeId) =>
      relevant
        .filter((r) => r.shape_design_id === shapeId && r.bindi_colour_id === bindiId && r.size_id === sizeId)
        .reduce((s, r) => s + qtyFn(r), 0)
    )
    return {
      designName: shapeMap.get(shapeId) ?? shapeId,
      colourCode: bindiMap.get(bindiId) ?? bindiId,
      qtys,
      total: qtys.reduce((a, b) => a + b, 0),
    }
  })

  return { sizeCodes, mRows, grandTotal: mRows.reduce((s, r) => s + r.total, 0) }
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ShortageSummaryReportPage({ searchParams }: PageProps) {
  const params = await searchParams
  const customerIds     = typeof params.customer     === 'string' ? params.customer.split(',').filter(Boolean)     : []
  const designIds       = typeof params.design       === 'string' ? params.design.split(',').filter(Boolean)       : []
  const clrIds          = typeof params.clr          === 'string' ? params.clr.split(',').filter(Boolean)          : []
  const dabbiIds        = typeof params.dabbi        === 'string' ? params.dabbi.split(',').filter(Boolean)        : []
  const sizeIds         = typeof params.size         === 'string' ? params.size.split(',').filter(Boolean)         : []
  const shortageTypeIds = typeof params.shortageType === 'string' ? params.shortageType.split(',').filter(Boolean) : []
  const asOfFilter      = typeof params.asOf         === 'string' ? params.asOf : ''

  const supabase = createServerSupabaseClient()

  const [allocationResult, customersResult, shapesResult, bindiResult, sizesResult, dabbiResult] = await Promise.allSettled([
    fetchPlanningAllocation(supabase),
    supabase.from('customers').select('id, name').order('name'),
    supabase.from('shape_designs').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('bindi_colours').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('sizes').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('dabbi_colours').select('id, code, name').order('code'),
  ])

  const allRows: PlanningAllocationRow[] = allocationResult.status === 'fulfilled' ? allocationResult.value : []
  const customers = customersResult.status === 'fulfilled' ? (customersResult.value.data ?? []) : []
  const shapes    = shapesResult.status === 'fulfilled'    ? (shapesResult.value.data ?? []) as LookupRow[] : []
  const bindis    = bindiResult.status === 'fulfilled'     ? (bindiResult.value.data ?? []) as LookupRow[]  : []
  const sizes     = sizesResult.status === 'fulfilled'     ? (sizesResult.value.data ?? []) as LookupRow[]  : []
  const dabbis    = dabbiResult.status === 'fulfilled'     ? (dabbiResult.value.data ?? []) as LookupRow[]  : []

  const shapeMap = buildLookup(shapes, true)
  const bindiMap = buildLookup(bindis)
  const sizeMap  = buildLookup(sizes)
  const dabbiMap = buildLookup(dabbis, true)

  // Rows with any pending action: give_to_labour (cuttings_allocated_qty > 0) OR shortage (shortage_qty > 0)
  let shortageRows = allRows
    .filter((r) => r.cuttings_allocated_qty > 0 || r.shortage_qty > 0)
    .sort((a, b) => (b.shortage_qty - a.shortage_qty) || (b.cuttings_allocated_qty - a.cuttings_allocated_qty))

  // Apply screen filters
  if (customerIds.length > 0)     shortageRows = shortageRows.filter((r) => customerIds.includes(r.customer_id))
  if (designIds.length > 0)       shortageRows = shortageRows.filter((r) => designIds.includes(r.shape_design_id))
  if (clrIds.length > 0)          shortageRows = shortageRows.filter((r) => clrIds.includes(r.bindi_colour_id))
  if (dabbiIds.length > 0)        shortageRows = shortageRows.filter((r) => dabbiIds.includes(r.dabbi_colour_id))
  if (sizeIds.length > 0)         shortageRows = shortageRows.filter((r) => sizeIds.includes(r.size_id))
  if (shortageTypeIds.length > 0) {
    shortageRows = shortageRows.filter((r) =>
      shortageTypeIds.some((t) => {
        if (t === 'give_to_labour') return r.planning_status.startsWith('give_to_labour')
        if (t === 'cut_on_machine') return r.planning_status.startsWith('cut_on_machine')
        if (t === 'procure_velvet') return r.planning_status.startsWith('procure_velvet')
        return false
      })
    )
  }

  // Summary totals
  const giveToLabourTotal = shortageRows.reduce((s, r) => s + r.cuttings_allocated_qty, 0)
  const cutOnMachineTotal = shortageRows.reduce((s, r) => s + r.shortage_qty, 0)
  const totalPending      = shortageRows.reduce((s, r) => s + r.open_qty, 0)

  // Velvet requirement breakdown by design (cut_on_machine / procure only)
  type DesignVelvet = { name: string; shortageGross: number; bundles: number }
  const velvetByDesign = new Map<string, DesignVelvet>()
  for (const row of shortageRows.filter((r) => r.planning_status.startsWith('cut_on_machine') || r.planning_status.startsWith('procure_velvet'))) {
    const name    = shapeMap.get(row.shape_design_id) ?? row.shape_design_id
    const bundles = computeBundlesNeeded(row) ?? 0
    const prev    = velvetByDesign.get(row.shape_design_id) ?? { name, shortageGross: 0, bundles: 0 }
    velvetByDesign.set(row.shape_design_id, { name, shortageGross: prev.shortageGross + row.shortage_qty, bundles: prev.bundles + bundles })
  }
  const totalVelvetBundles = Array.from(velvetByDesign.values()).reduce((s, v) => s + v.bundles, 0)
  const totalVelvetMetres  = totalVelvetBundles * METRES_PER_BUNDLE

  // All dabbi groups in the unfiltered shortage set (for print — always all dabbis)
  const allShortageRows = allRows.filter((r) => r.cuttings_allocated_qty > 0 || r.shortage_qty > 0)
  // Apply non-dabbi filters to print rows too (customer/design/clr/size/type filters still apply)
  let printRows = allShortageRows
  if (customerIds.length > 0)     printRows = printRows.filter((r) => customerIds.includes(r.customer_id))
  if (designIds.length > 0)       printRows = printRows.filter((r) => designIds.includes(r.shape_design_id))
  if (clrIds.length > 0)          printRows = printRows.filter((r) => clrIds.includes(r.bindi_colour_id))
  if (sizeIds.length > 0)         printRows = printRows.filter((r) => sizeIds.includes(r.size_id))

  const printDabbiIds = [...new Set(printRows.map((r) => r.dabbi_colour_id))]
  const printSections = printDabbiIds.map((dabbiId) => {
    const sRows    = printRows.filter((r) => r.dabbi_colour_id === dabbiId)
    const name     = dabbiMap.get(dabbiId) ?? dabbiId
    const labourMx = buildShortageMatrix(sRows, (r) => r.cuttings_allocated_qty, shapeMap, bindiMap, sizeMap, sizes)
    const cutMx    = buildShortageMatrix(sRows, (r) => r.shortage_qty,           shapeMap, bindiMap, sizeMap, sizes)
    return { dabbiId, name, sRows, labourMx, cutMx }
  }).sort((a, b) => a.name.localeCompare(b.name))

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const displayDate = asOfFilter
    ? new Date(asOfFilter).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : today

  const customerMap  = new Map(customers.map((c) => [c.id as string, c.name as string]))
  const customerLabel = customerIds.length > 0
    ? customerIds.map((id) => customerMap.get(id) ?? id).join(', ')
    : 'All Customers'
  const dabbiLabel = dabbiIds.length > 0
    ? dabbiIds.map((id) => dabbiMap.get(id) ?? id).join(', ')
    : ''

  const filters: FilterField[] = [
    { key: 'asOf', label: 'As of Date', options: [], inputType: 'date' },
    {
      key: 'customer',
      label: 'Customer',
      options: customers.map((c) => ({ id: c.id as string, label: c.name as string })),
      multiSelect: true,
    },
    {
      key: 'design',
      label: 'Design',
      options: shapes.map((s) => ({ id: s.id, label: s.name ?? s.code })),
      multiSelect: true,
    },
    {
      key: 'clr',
      label: 'CLR',
      options: bindis.map((c) => ({ id: c.id, label: c.code })),
      multiSelect: true,
    },
    {
      key: 'dabbi',
      label: 'Dabbi',
      options: dabbis.map((d) => ({ id: d.id, label: d.name ?? d.code })),
      multiSelect: true,
    },
    {
      key: 'size',
      label: 'Size',
      options: sizes.map((s) => ({ id: s.id, label: s.code })),
      multiSelect: true,
    },
    {
      key: 'shortageType',
      label: 'Type',
      options: [
        { id: 'give_to_labour', label: 'Give to Labour' },
        { id: 'cut_on_machine', label: 'Cut on Machine' },
        { id: 'procure_velvet', label: 'Procure Velvet' },
      ],
      multiSelect: true,
    },
  ]

  const activeFilters: ActiveFilters = {
    asOf:         asOfFilter         ? [asOfFilter]     : [],
    customer:     customerIds,
    design:       designIds,
    clr:          clrIds,
    dabbi:        dabbiIds,
    size:         sizeIds,
    shortageType: shortageTypeIds,
  }

  const reportFilters = [
    { label: 'Date',     value: displayDate },
    { label: 'Customer', value: customerLabel },
    { label: 'Design',   value: designIds.length > 0 ? designIds.map((id) => shapeMap.get(id) ?? id).join(', ') : 'All' },
    { label: 'Dabbi',    value: dabbiLabel || 'All' },
  ]

  const tdNum: CSSProperties = { ...tableTd, textAlign: 'right', paddingRight: '1rem', fontVariantNumeric: 'tabular-nums' }
  const thNum: CSSProperties = { ...tableTh, textAlign: 'right', paddingRight: '1rem' }

  return (
    <main className="print-landscape" style={{ padding: '1.5rem 2rem', maxWidth: '1600px' }}>
      <ReportHeader reportName="SHORTAGE SUMMARY" filters={reportFilters} />
      <ReportFilterBar filters={filters} activeFilters={activeFilters} printLabel={`Print — ${displayDate}`} />

      {/* ── Summary cards ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        {[
          { label: 'Give to Labour',  value: `${fmt(giveToLabourTotal)} gross`, accent: '#d97706' },
          { label: 'Cut on Machine',  value: `${fmt(cutOnMachineTotal)} gross`, accent: '#dc2626' },
          { label: 'Total Pending',   value: `${fmt(totalPending)} gross`,       accent: 'var(--border-strong)' },
          { label: 'Velvet Required', value: `${fmt(totalVelvetBundles)} bun`,   accent: 'var(--border-strong)' },
        ].map((card) => (
          <div key={card.label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderLeft: `3px solid ${card.accent}`, borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', minWidth: '180px' }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>{card.label}</div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{card.value}</div>
          </div>
        ))}
      </div>

      {shortageRows.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          No shortage or pending issue lines match the current filters.
        </p>
      ) : (
        <>
          {/* ── Detail table ──────────────────────────────────── */}
          <div style={{ marginBottom: '2rem', overflowX: 'auto' }}>
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Shortage Detail — {shortageRows.length} lines
            </h2>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1100px' }}>
              <thead>
                <tr>
                  <th style={tableTh}>Customer</th>
                  <th style={tableTh}>Shape</th>
                  <th style={tableTh}>CLR</th>
                  <th style={tableTh}>Size</th>
                  <th style={{ ...tableTh, color: 'var(--accent)', fontWeight: 700 }}>Dabbi</th>
                  <th style={thNum}>Open Qty</th>
                  <th style={{ ...thNum, color: 'var(--warning)', fontWeight: 'bold' }}>Issue</th>
                  <th style={{ ...thNum, color: 'var(--danger)', fontWeight: 'bold' }}>Cut</th>
                  <th style={tableTh}>Action</th>
                  <th style={thNum}>Velvet Bun</th>
                </tr>
              </thead>
              <tbody>
                {shortageRows.map((row) => {
                  const bundles = computeBundlesNeeded(row)
                  return (
                    <tr key={row.order_line_id}>
                      <td style={tableTd}>{row.customer_name}</td>
                      <td style={tableTd}>{shapeMap.get(row.shape_design_id) ?? '—'}</td>
                      <td style={tableTd}>{bindiMap.get(row.bindi_colour_id) ?? '—'}</td>
                      <td style={tableTd}>{sizeMap.get(row.size_id) ?? '—'}</td>
                      <td style={{ ...tableTd, fontWeight: 700, color: 'var(--accent)' }}>
                        {dabbiMap.get(row.dabbi_colour_id) ?? '—'}
                      </td>
                      <td style={tdNum}>{fmt(row.open_qty)}</td>
                      <td style={{ ...tdNum, color: row.cuttings_allocated_qty > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                        {row.cuttings_allocated_qty > 0 ? fmt(row.cuttings_allocated_qty) : '—'}
                      </td>
                      <td style={{ ...tdNum, color: row.shortage_qty > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: row.shortage_qty > 0 ? 700 : 400 }}>
                        {row.shortage_qty > 0 ? fmt(row.shortage_qty) : '—'}
                      </td>
                      <td style={tableTd}>
                        <span style={{ fontSize: 'var(--text-xs)', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-sm)', background: statusBadgeBg(row.planning_status), color: statusBadgeColor(row.planning_status), fontWeight: 600 }}>
                          {shortageTypeLabel(row.planning_status)}
                        </span>
                      </td>
                      <td style={tdNum}>
                        {bundles !== null ? fmt(bundles) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                  <td colSpan={5} style={{ ...tableTd, fontWeight: 700 }}>TOTALS</td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(totalPending)}</td>
                  <td style={{ ...tdNum, fontWeight: 700, color: 'var(--warning)' }}>{fmt(giveToLabourTotal)}</td>
                  <td style={{ ...tdNum, fontWeight: 700, color: 'var(--danger)' }}>{fmt(cutOnMachineTotal)}</td>
                  <td />
                  <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(totalVelvetBundles)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Velvet requirement by design ──────────────────── */}
          {velvetByDesign.size > 0 && (
            <div style={{ marginBottom: '2rem', padding: '1rem 1.25rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderLeft: '3px solid var(--danger)', borderRadius: 'var(--radius-md)' }}>
              <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--danger)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Velvet Required (Cut on Machine / Procure)
              </h2>
              <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: '600px' }}>
                <thead>
                  <tr>
                    <th style={tableTh}>Design</th>
                    <th style={thNum}>Cut Qty</th>
                    <th style={thNum}>Bundles</th>
                    <th style={thNum}>Metres</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(velvetByDesign.values()).map((v) => (
                    <tr key={v.name}>
                      <td style={tableTd}>{v.name}</td>
                      <td style={tdNum}>{fmt(v.shortageGross)}</td>
                      <td style={{ ...tdNum, fontWeight: 700, color: 'var(--danger)' }}>{fmt(v.bundles)}</td>
                      <td style={tdNum}>{fmt(v.bundles * METRES_PER_BUNDLE)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                    <td style={{ ...tableTd, fontWeight: 700 }}>TOTAL</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(cutOnMachineTotal)}</td>
                    <td style={{ ...tdNum, fontWeight: 700, color: 'var(--danger)' }}>{fmt(totalVelvetBundles)}</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(totalVelvetMetres)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── Print-only: per-dabbi matrices, hidden on screen ── */}
      <div id="shortage-print">
        <p style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: '4px' }}>NIRANKARI BINDI</p>
        <p style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '2px' }}>
          SHORTAGE SUMMARY{dabbiLabel ? ` — ${dabbiLabel}` : ''} — {displayDate}
        </p>
        <p style={{ fontSize: '11px', marginBottom: '4px' }}>
          Give to Labour: {fmt(giveToLabourTotal)} gross &nbsp;|&nbsp;
          Cut on Machine: {fmt(cutOnMachineTotal)} gross &nbsp;|&nbsp;
          Total Pending: {fmt(totalPending)} gross
        </p>
        <hr style={{ border: '1px solid #000', margin: '8px 0 12px' }} />

        {printSections.map((sec, idx) => (
          <div key={sec.dabbiId} style={{ pageBreakAfter: idx < printSections.length - 1 ? 'always' : 'auto' }}>
            <p style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '6px' }}>
              DABBI: {sec.name}
            </p>

            {/* Give to Labour matrix */}
            {sec.labourMx.mRows.length > 0 && (
              <>
                <p style={{ fontSize: '11px', fontWeight: 'bold', margin: '0 0 4px' }}>
                  Give to Labour — {fmt(sec.labourMx.grandTotal)} gross
                </p>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Design</th>
                      <th style={{ textAlign: 'left' }}>CLR</th>
                      {sec.labourMx.sizeCodes.map((code) => (
                        <th key={code} style={{ textAlign: 'right' }}>{code}</th>
                      ))}
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sec.labourMx.mRows.map((mr, i) => (
                      <tr key={i}>
                        <td>{mr.designName}</td>
                        <td>{mr.colourCode}</td>
                        {mr.qtys.map((q, j) => (
                          <td key={j} style={{ textAlign: 'right' }}>{q > 0 ? fmt(q) : ''}</td>
                        ))}
                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{fmt(mr.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* Cut on Machine matrix */}
            {sec.cutMx.mRows.length > 0 && (
              <>
                <p style={{ fontSize: '11px', fontWeight: 'bold', margin: '0 0 4px' }}>
                  Cut on Machine — {fmt(sec.cutMx.grandTotal)} gross
                </p>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Design</th>
                      <th style={{ textAlign: 'left' }}>CLR</th>
                      {sec.cutMx.sizeCodes.map((code) => (
                        <th key={code} style={{ textAlign: 'right' }}>{code}</th>
                      ))}
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sec.cutMx.mRows.map((mr, i) => (
                      <tr key={i}>
                        <td>{mr.designName}</td>
                        <td>{mr.colourCode}</td>
                        {mr.qtys.map((q, j) => (
                          <td key={j} style={{ textAlign: 'right' }}>{q > 0 ? fmt(q) : ''}</td>
                        ))}
                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{fmt(mr.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <p style={{ fontSize: '11px', textAlign: 'right', marginBottom: '8px' }}>
              {sec.sRows.length} lines | Issue: {fmt(sec.labourMx.grandTotal)} | Cut: {fmt(sec.cutMx.grandTotal)}
            </p>
          </div>
        ))}

        <p style={{ marginTop: '16px', fontSize: '11px' }}>
          Action approved by: _______________________________ &nbsp;&nbsp;&nbsp; Date: ___________
        </p>
      </div>

      <style>{`
        @media screen {
          #shortage-print { display: none; }
        }
        @media print {
          main.print-landscape > *:not(#shortage-print) { display: none !important; }
          .app-sidebar, .app-topnav, .app-bottomtabs, nav, aside, header { display: none !important; }
          main { padding: 0 !important; max-width: 100% !important; }
          .app-content { padding: 0 !important; margin: 0 !important; }

          #shortage-print { display: block !important; }

          #shortage-print * {
            font-family: Arial, sans-serif !important;
            color: #000 !important;
            background: #fff !important;
          }

          #shortage-print table {
            border-collapse: collapse !important;
            width: 100% !important;
          }

          #shortage-print th,
          #shortage-print td {
            border: 1px solid #000 !important;
            padding: 3px 6px !important;
            font-size: 10px !important;
          }

          #shortage-print thead th {
            background: #000 !important;
            color: #fff !important;
          }

          @page { size: A4 landscape; margin: 15mm; }
        }
      `}</style>
    </main>
  )
}
