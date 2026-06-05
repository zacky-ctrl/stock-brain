import { createServerSupabaseClient } from '@/lib/supabase/server'
import { fetchPlanningAllocation } from '@/app/planning/allocation/fetchers'
import { buildMatrixFromPlanningRows } from '@stock-brain/domain'
import { MatrixGrid } from '@/components/matrix/MatrixGrid'
import { ReportHeader } from '@/components/reports/ReportHeader'
import { ReportFilterBar } from '@/components/reports/ReportFilterBar'
import { CollapsibleSection } from '@/components/ui/CollapsibleSection'
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

type IssueRow = PlanningAllocationRow & { suggested_issue_qty: number }

type PrintMatrixRow = { designName: string; colourCode: string; qtys: number[]; total: number }
type PrintMatrix = { sizeCodes: string[]; matrixRows: PrintMatrixRow[]; grandTotal: number }

function buildPrintMatrix(
  sectionRows: IssueRow[],
  shapeMap: Map<string, string>,
  bindiMap: Map<string, string>,
  sizeMap: Map<string, string>,
  allSizes: LookupRow[]
): PrintMatrix {
  const sectionSizeIdSet = new Set(sectionRows.map((r) => r.size_id))
  const orderedSizes = allSizes
    .filter((s) => sectionSizeIdSet.has(s.id))
    .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
  const sizeIds = orderedSizes.map((s) => s.id)
  const sizeCodes = orderedSizes.map((s) => sizeMap.get(s.id) ?? s.code)

  const seenPairs = new Set<string>()
  const pairs: { shapeId: string; bindiId: string }[] = []
  for (const r of sectionRows) {
    const key = `${r.shape_design_id}|${r.bindi_colour_id}`
    if (!seenPairs.has(key)) {
      seenPairs.add(key)
      pairs.push({ shapeId: r.shape_design_id, bindiId: r.bindi_colour_id })
    }
  }

  const matrixRows: PrintMatrixRow[] = pairs.map(({ shapeId, bindiId }) => {
    const qtys = sizeIds.map((sizeId) =>
      sectionRows
        .filter((r) => r.shape_design_id === shapeId && r.bindi_colour_id === bindiId && r.size_id === sizeId)
        .reduce((s, r) => s + r.suggested_issue_qty, 0)
    )
    return {
      designName: shapeMap.get(shapeId) ?? shapeId,
      colourCode: bindiMap.get(bindiId) ?? bindiId,
      qtys,
      total: qtys.reduce((a, b) => a + b, 0),
    }
  })

  return { sizeCodes, matrixRows, grandTotal: matrixRows.reduce((s, r) => s + r.total, 0) }
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function LabourIssueReportPage({ searchParams }: PageProps) {
  const params = await searchParams
  const designFilter   = typeof params.design    === 'string' ? params.design    : ''
  const clrFilter      = typeof params.clr       === 'string' ? params.clr       : ''
  const sizeFilter     = typeof params.size      === 'string' ? params.size      : ''
  const priorityFilter = typeof params.priority  === 'string' ? params.priority  : ''
  const asOfFilter     = typeof params.asOf      === 'string' ? params.asOf      : ''
  const customerIds    = typeof params.customer  === 'string' ? params.customer.split(',').filter(Boolean) : []
  const dabbiFilter    = typeof params.dabbi     === 'string' ? params.dabbi     : ''

  const supabase = createServerSupabaseClient()

  const [allocationResult, shapesResult, bindiResult, sizesResult, customersResult, dabbiResult] = await Promise.allSettled([
    fetchPlanningAllocation(supabase),
    supabase.from('shape_designs').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('bindi_colours').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('sizes').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('customers').select('id, name').order('name'),
    supabase.from('dabbi_colours').select('id, code, name').order('code'),
  ])

  const rows: PlanningAllocationRow[] = allocationResult.status === 'fulfilled' ? allocationResult.value : []

  const shapes    = shapesResult.status === 'fulfilled'    ? (shapesResult.value.data ?? []) as LookupRow[]   : []
  const bindis    = bindiResult.status === 'fulfilled'     ? (bindiResult.value.data ?? []) as LookupRow[]    : []
  const sizes     = sizesResult.status === 'fulfilled'     ? (sizesResult.value.data ?? []) as LookupRow[]    : []
  const customers = customersResult.status === 'fulfilled' ? (customersResult.value.data ?? []) : []
  const dabbis    = dabbiResult.status === 'fulfilled'     ? (dabbiResult.value.data ?? []) as LookupRow[]    : []

  const shapeMap = buildLookup(shapes, true)
  const bindiMap = buildLookup(bindis)
  const sizeMap  = buildLookup(sizes)
  const dabbiMap = buildLookup(dabbis, true)

  const sizeMaster   = sizes.map((s)  => ({ id: s.id, code: s.code, name: s.name ?? s.code, sort_order: Number(s.sort_order ?? 0) }))
  const designMaster = shapes.map((s) => ({ id: s.id, name: s.name ?? s.code, sort_order: Number(s.sort_order ?? 0) }))
  const colourMaster = bindis.map((c) => ({ id: c.id, code: c.code, name: c.name ?? c.code, sort_order: Number(c.sort_order ?? 0) }))

  // All give_to_labour rows — used for per-dabbi print sections
  // suggested_issue_qty = cuttings_allocated_qty from engine (priority-aware allocation)
  const allLabourRows: IssueRow[] = rows
    .filter((r) => r.planning_status === 'give_to_labour' || r.planning_status === 'give_to_labour_override')
    .sort((a, b) => a.priority_rank - b.priority_rank)
    .map((r) => ({ ...r, suggested_issue_qty: r.cuttings_allocated_qty }))

  // Apply non-dabbi filters first (shared between main view and dabbi sections)
  let baseRows = allLabourRows
  if (designFilter)            baseRows = baseRows.filter((r) => r.shape_design_id === designFilter)
  if (clrFilter)               baseRows = baseRows.filter((r) => r.bindi_colour_id === clrFilter)
  if (sizeFilter)              baseRows = baseRows.filter((r) => r.size_id === sizeFilter)
  if (customerIds.length > 0)  baseRows = baseRows.filter((r) => customerIds.includes(r.customer_id))

  // Main view: also apply dabbi + priority filters
  let labourRows = baseRows
  if (dabbiFilter)             labourRows = labourRows.filter((r) => r.dabbi_colour_id === dabbiFilter)
  if (priorityFilter === 'top5')  labourRows = labourRows.slice(0, 5)
  if (priorityFilter === 'top10') labourRows = labourRows.slice(0, 10)

  const totalIssueQty = labourRows.reduce((s, r) => s + r.suggested_issue_qty, 0)

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const displayDate = asOfFilter
    ? new Date(asOfFilter).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : today

  const dabbiFilterName = dabbiFilter ? (dabbiMap.get(dabbiFilter) ?? dabbiFilter) : ''
  const reportName = dabbiFilterName ? `LABOUR ISSUE SHEET — ${dabbiFilterName}` : 'LABOUR ISSUE SHEET'

  // Build per-dabbi sections — each gets its own separate matrix
  const dabbiIdsInUse = [...new Set(baseRows.map((r) => r.dabbi_colour_id))]
  const dabbiSections = dabbiIdsInUse
    .map((dabbiId) => {
      const sectionRows = baseRows.filter((r) => r.dabbi_colour_id === dabbiId)
      const sectionQty = sectionRows.reduce((s, r) => s + r.suggested_issue_qty, 0)
      const sectionMatrixRows = sectionRows.map((r) => ({
        shape_design_id: r.shape_design_id,
        bindi_colour_id: r.bindi_colour_id,
        size_id: r.size_id,
        open_qty: r.suggested_issue_qty,
        ready_allocated_qty: 0,
        wip_allocated_qty: 0,
        shortage_qty: 0,
        planning_status: r.planning_status,
        recommended_action: r.recommended_action,
      }))
      const dabbiMasterRow = dabbis.find((d) => d.id === dabbiId)
      const dabbiName = dabbiMasterRow?.name ?? dabbiMasterRow?.code ?? dabbiId
      const dabbiCode = dabbiMasterRow?.code ?? ''
      const sectionMatrixData = buildMatrixFromPlanningRows(sectionMatrixRows, sizeMaster, designMaster, colourMaster, {
        context_label: `Labour Issue — ${dabbiName}`,
        date_label: displayDate,
      })
      return { dabbiId, dabbiCode, dabbiName, rows: sectionRows, totalQty: sectionQty, matrixData: sectionMatrixData }
    })
    .sort((a, b) => a.dabbiName.localeCompare(b.dabbiName))

  // visibleSections: dabbi filter controls which sections are shown on screen
  const visibleSections = dabbiFilter
    ? dabbiSections.filter((s) => s.dabbiId === dabbiFilter)
    : dabbiSections

  // allSections: never filtered by dabbi — always all groups, used only for print
  const allSections = dabbiSections

  // detailRows: sorted by dabbi name ASC then priority ASC for the detail table
  const detailRows = [...labourRows].sort((a, b) => {
    const da = dabbiMap.get(a.dabbi_colour_id) ?? ''
    const db = dabbiMap.get(b.dabbi_colour_id) ?? ''
    if (da !== db) return da.localeCompare(db)
    return a.priority_rank - b.priority_rank
  })

  const customerMap = new Map(customers.map((c) => [c.id as string, c.name as string]))

  const filters: FilterField[] = [
    {
      key: 'asOf',
      label: 'As of Date',
      options: [],
      inputType: 'date',
    },
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
    },
    {
      key: 'clr',
      label: 'CLR',
      options: bindis.map((c) => ({ id: c.id, label: c.code })),
    },
    {
      key: 'size',
      label: 'Size',
      options: sizes.map((s) => ({ id: s.id, label: s.code })),
    },
    {
      key: 'dabbi',
      label: 'Dabbi',
      options: dabbis.map((d) => ({ id: d.id, label: d.name ?? d.code })),
    },
    {
      key: 'priority',
      label: 'Priority',
      options: [
        { id: 'top5',  label: 'Top 5' },
        { id: 'top10', label: 'Top 10' },
      ],
    },
  ]

  const activeFilters: ActiveFilters = {
    asOf:     asOfFilter     ? [asOfFilter]     : [],
    customer: customerIds,
    design:   designFilter   ? [designFilter]   : [],
    clr:      clrFilter      ? [clrFilter]      : [],
    size:     sizeFilter     ? [sizeFilter]      : [],
    dabbi:    dabbiFilter    ? [dabbiFilter]    : [],
    priority: priorityFilter ? [priorityFilter] : [],
  }

  const customerLabel = customerIds.length > 0
    ? customerIds.map((id) => customerMap.get(id) ?? id).join(', ')
    : 'All Customers'

  const reportFilters = [
    { label: 'Date',     value: displayDate },
    { label: 'Customer', value: customerLabel },
    { label: 'Design',   value: designFilter  ? (shapeMap.get(designFilter) ?? designFilter) : 'All' },
    { label: 'CLR',      value: clrFilter     ? (bindiMap.get(clrFilter)    ?? clrFilter)    : 'All' },
    { label: 'Size',     value: sizeFilter    ? (sizeMap.get(sizeFilter)    ?? sizeFilter)   : 'All' },
    { label: 'Dabbi',    value: dabbiFilterName || 'All' },
  ]

  const tdNum: CSSProperties = { ...tableTd, textAlign: 'right', paddingRight: '1rem', fontVariantNumeric: 'tabular-nums' }
  const thNum: CSSProperties = { ...tableTh, textAlign: 'right', paddingRight: '1rem' }

  return (
    <main className="print-landscape" style={{ padding: '1.5rem 2rem', maxWidth: '1600px' }}>
      <ReportHeader reportName={reportName} filters={reportFilters} />

      <ReportFilterBar filters={filters} activeFilters={activeFilters} printLabel={`Print — ${displayDate}`} />

      {labourRows.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          No give_to_labour lines match the current filters.
        </p>
      ) : (
        <>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{labourRows.length} SKUs</strong> to issue &nbsp;|&nbsp;
            Total: <strong style={{ color: 'var(--text-primary)' }}>{fmt(totalIssueQty)} gross</strong>
            {dabbiSections.length > 1 && !dabbiFilter && (
              <>
                &nbsp;|&nbsp;
                {dabbiSections.map((s) => (
                  <span key={s.dabbiId} style={{ marginRight: '0.75rem', color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{s.dabbiName}</strong>: {fmt(s.totalQty)}
                  </span>
                ))}
              </>
            )}
          </p>

          {visibleSections.map((section) => {
            const headerBg =
              section.dabbiCode === 'WHITE'  ? 'var(--success-subtle)' :
              section.dabbiCode === 'YELLOW' ? 'var(--warning-subtle)' :
              'var(--bg-elevated)'
            return (
              <section
                key={section.dabbiId}
                style={{ marginBottom: '2rem' }}
              >
                <h3 style={{ background: headerBg, padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', fontWeight: 700, marginBottom: '0.5rem' }}>
                  {section.dabbiName} — {fmt(section.totalQty)} gross across {section.rows.length} SKUs
                </h3>
                <MatrixGrid
                  data={section.matrixData}
                  mode="view"
                  printTitle={`Labour Issue Sheet — ${section.dabbiName} — ${displayDate}`}
                />
                <div className="no-print" style={{ textAlign: 'right', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  {section.rows.length} SKUs | {fmt(section.totalQty)} gross
                </div>
              </section>
            )
          })}
          {visibleSections.length > 1 && (
            <div style={{ marginBottom: '2rem', fontWeight: 700, fontSize: 'var(--text-base)', borderTop: '2px solid var(--border)', paddingTop: '0.75rem' }}>
              TOTAL ALL DABBI: {fmt(totalIssueQty)} gross
            </div>
          )}

          <div className="no-print" style={{ marginBottom: '2rem' }}>
            <CollapsibleSection title="Detail View" count={detailRows.length}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1050px' }}>
                <thead>
                  <tr>
                    <th style={tableTh}>Priority</th>
                    <th style={tableTh}>Customer</th>
                    <th style={tableTh}>Shape</th>
                    <th style={tableTh}>CLR</th>
                    <th style={tableTh}>Size</th>
                    <th style={{ ...tableTh, color: 'var(--accent)', fontWeight: 700 }}>Dabbi</th>
                    <th style={thNum}>Open Qty</th>
                    <th style={{ ...thNum, color: 'var(--info)' }}>WIP</th>
                    <th style={thNum}>Cut Avail</th>
                    <th style={{ ...thNum, color: 'var(--warning)', fontWeight: 'bold' }}>Issue Qty</th>
                    <th style={tableTh}>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((row) => {
                    const priorityLabel = row.sort_tier === 0 ? `P${row.priority_rank} ★` : `W${11 - row.priority_rank}`
                    return (
                      <tr key={row.order_line_id} style={{ background: row.override_active ? 'rgba(245,158,11,0.06)' : undefined }}>
                        <td style={tableTd}>
                          <span style={{ fontSize: 'var(--text-xs)', padding: '0.1rem 0.35rem', border: '1px solid', borderRadius: 'var(--radius-sm)', borderColor: row.sort_tier === 0 ? 'var(--accent)' : 'var(--border)', color: row.sort_tier === 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                            {priorityLabel}
                          </span>
                        </td>
                        <td style={tableTd}>{row.customer_name}</td>
                        <td style={tableTd}>{shapeMap.get(row.shape_design_id) ?? '—'}</td>
                        <td style={tableTd}>{bindiMap.get(row.bindi_colour_id) ?? '—'}</td>
                        <td style={tableTd}>{sizeMap.get(row.size_id) ?? '—'}</td>
                        <td style={{ ...tableTd, fontWeight: 700, color: 'var(--accent)' }}>
                          {dabbiMap.get(row.dabbi_colour_id) ?? '—'}
                        </td>
                        <td style={tdNum}>{fmt(row.open_qty)}</td>
                        <td style={{ ...tdNum, color: row.wip_allocated_qty > 0 ? 'var(--info)' : 'var(--text-muted)' }}>
                          {row.wip_allocated_qty > 0 ? fmt(row.wip_allocated_qty) : '—'}
                        </td>
                        <td style={tdNum}>{fmt(row.cuttings_available_qty)}</td>
                        <td style={{ ...tdNum, fontWeight: 'bold', color: 'var(--warning)' }}>{fmt(row.suggested_issue_qty)}</td>
                        <td style={tableTd}>
                          {row.override_active && (
                            <span title={`${row.override_type} — ${row.override_reason}`} style={{ color: 'var(--accent)', fontSize: 'var(--text-xs)' }}>
                              ⚠ Override
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            </CollapsibleSection>
          </div>

        </>
      )}

      {/* ── Print-only: all dabbi groups, hidden on screen ── */}
      <div id="labour-dabbi-print" style={{ display: 'none' }}>
        {allSections.map((section) => {
          const pm = buildPrintMatrix(section.rows, shapeMap, bindiMap, sizeMap, sizes)
          return (
            <div key={section.dabbiId} style={{ pageBreakAfter: 'always' }}>
              <p style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: '4px' }}>
                NIRANKARI BINDI
              </p>
              <p style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '2px' }}>
                LABOUR ISSUE SHEET — {section.dabbiName}
              </p>
              <p style={{ fontSize: '11px', marginBottom: '12px' }}>
                {displayDate}
              </p>

              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Design</th>
                    <th style={{ textAlign: 'left' }}>CLR</th>
                    {pm.sizeCodes.map((code) => (
                      <th key={code} style={{ textAlign: 'right' }}>{code}</th>
                    ))}
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pm.matrixRows.map((mr, i) => (
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

              <p style={{ fontSize: '11px', textAlign: 'right' }}>
                {section.rows.length} SKUs | {fmt(section.totalQty)} gross
              </p>
              <p style={{ marginTop: '16px', fontSize: '11px' }}>
                Issue authorised by: _______________________________ &nbsp;&nbsp;&nbsp; Date: ___________
              </p>
            </div>
          )
        })}
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }

          #labour-dabbi-print {
            display: block !important;
            visibility: visible !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
          }

          #labour-dabbi-print * {
            visibility: visible !important;
            font-family: Arial, sans-serif !important;
            color: #000 !important;
            background: #fff !important;
          }

          #labour-dabbi-print table {
            border-collapse: collapse !important;
            width: 100% !important;
          }

          #labour-dabbi-print th {
            background: #1a1a2e !important;
            color: #fff !important;
            border: 1px solid #000 !important;
            padding: 4px 6px !important;
            font-size: 10px !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          #labour-dabbi-print td {
            border: 1px solid #000 !important;
            padding: 4px 6px !important;
            font-size: 10px !important;
          }

          @page { size: A4 landscape; margin: 15mm; }
        }
      `}</style>
    </main>
  )
}
