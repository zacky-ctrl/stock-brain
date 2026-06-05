import { createServerSupabaseClient } from '@/lib/supabase/server'
import { fetchPlanningAllocation } from '../allocation/fetchers'
import { buildMatrixFromPlanningRows } from '@stock-brain/domain'
import type { PlanningAllocationRow, FilterField, ActiveFilters } from '@stock-brain/types'
import { tableTh, tableTd } from '@/lib/ui'
import { PageHeader } from '@/components/ui/PageHeader'
import { CollapsibleSection } from '@/components/ui/CollapsibleSection'
import { ReportFilterBar } from '@/components/reports/ReportFilterBar'
import { LabourIssueMatrixSection } from './LabourIssueMatrixSection'
import type { CSSProperties } from 'react'
import Link from 'next/link'

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
  allSizes: LookupRow[],
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
        .reduce((s, r) => s + r.suggested_issue_qty, 0),
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

export default async function LabourIssueSheetPage({ searchParams }: PageProps) {
  const params = await searchParams
  const designFilter   = typeof params.design   === 'string' ? params.design   : ''
  const clrFilter      = typeof params.clr      === 'string' ? params.clr      : ''
  const sizeFilter     = typeof params.size     === 'string' ? params.size     : ''
  const priorityFilter = typeof params.priority === 'string' ? params.priority : ''
  const customerIds    = typeof params.customer === 'string' ? params.customer.split(',').filter(Boolean) : []
  const dabbiFilter    = typeof params.dabbi    === 'string' ? params.dabbi    : ''

  const supabase = createServerSupabaseClient()

  const [
    allocationResult,
    shapesResult,
    bindiResult,
    sizesResult,
    customersResult,
    dabbiResult,
  ] = await Promise.allSettled([
    fetchPlanningAllocation(supabase),
    supabase.from('shape_designs').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('bindi_colours').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('sizes').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('customers').select('id, name').order('name'),
    supabase.from('dabbi_colours').select('id, code, name').order('code'),
  ])

  let fetchError: string | null = null
  let rows: PlanningAllocationRow[] = []

  if (allocationResult.status === 'rejected') {
    fetchError = allocationResult.reason instanceof Error
      ? allocationResult.reason.message
      : String(allocationResult.reason)
  } else {
    rows = allocationResult.value
  }

  const shapes    = shapesResult.status === 'fulfilled'    ? (shapesResult.value.data ?? []) as LookupRow[] : []
  const bindis    = bindiResult.status === 'fulfilled'     ? (bindiResult.value.data ?? []) as LookupRow[]  : []
  const sizes     = sizesResult.status === 'fulfilled'     ? (sizesResult.value.data ?? []) as LookupRow[]  : []
  const customers = customersResult.status === 'fulfilled' ? (customersResult.value.data ?? [])              : []
  const dabbis    = dabbiResult.status === 'fulfilled'     ? (dabbiResult.value.data ?? []) as LookupRow[]  : []

  const shapeMap = buildLookup(shapes, true)
  const bindiMap = buildLookup(bindis)
  const sizeMap  = buildLookup(sizes)
  const dabbiMap = buildLookup(dabbis, true)

  const sizeMaster   = sizes.map((s)  => ({ id: s.id, code: s.code, name: s.name ?? s.code, sort_order: Number(s.sort_order ?? 0) }))
  const designMaster = shapes.map((s) => ({ id: s.id, name: s.name ?? s.code, sort_order: Number(s.sort_order ?? 0) }))
  const colourMaster = bindis.map((c) => ({ id: c.id, code: c.code, name: c.name ?? c.code, sort_order: Number(c.sort_order ?? 0) }))

  // All give_to_labour rows — suggested_issue_qty = cuttings_allocated_qty (engine output, priority-aware)
  const allLabourRows: IssueRow[] = rows
    .filter((r) => r.planning_status === 'give_to_labour' || r.planning_status === 'give_to_labour_override')
    .sort((a, b) => a.priority_rank - b.priority_rank)
    .map((r) => ({ ...r, suggested_issue_qty: r.cuttings_allocated_qty }))

  // Base rows: filtered by design/clr/size/customer — used for print sections (dabbi filter excluded)
  let baseRows = allLabourRows
  if (designFilter)           baseRows = baseRows.filter((r) => r.shape_design_id === designFilter)
  if (clrFilter)              baseRows = baseRows.filter((r) => r.bindi_colour_id === clrFilter)
  if (sizeFilter)             baseRows = baseRows.filter((r) => r.size_id === sizeFilter)
  if (customerIds.length > 0) baseRows = baseRows.filter((r) => customerIds.includes(r.customer_id))

  // Display rows: additionally filtered by dabbi + priority
  let labourRows = baseRows
  if (dabbiFilter)                labourRows = labourRows.filter((r) => r.dabbi_colour_id === dabbiFilter)
  if (priorityFilter === 'top5')  labourRows = labourRows.slice(0, 5)
  if (priorityFilter === 'top10') labourRows = labourRows.slice(0, 10)

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const printTitle = `Labour Issue Sheet — ${today}`
  const totalIssueQty = labourRows.reduce((s, r) => s + r.suggested_issue_qty, 0)

  // Per-dabbi sections for screen (from filtered labourRows)
  const sections = [...new Set(labourRows.map((r) => r.dabbi_colour_id))]
    .map((dabbiId) => {
      const sectionRows = labourRows.filter((r) => r.dabbi_colour_id === dabbiId)
      const totalQty = sectionRows.reduce((s, r) => s + r.suggested_issue_qty, 0)
      const masterRow = dabbis.find((d) => d.id === dabbiId)
      const dabbiName = masterRow?.name ?? masterRow?.code ?? dabbiId
      const dabbiCode = masterRow?.code ?? ''
      const matrixData = buildMatrixFromPlanningRows(
        sectionRows.map((r) => ({
          shape_design_id: r.shape_design_id,
          bindi_colour_id: r.bindi_colour_id,
          size_id: r.size_id,
          open_qty: r.suggested_issue_qty,
          ready_allocated_qty: 0,
          wip_allocated_qty: 0,
          shortage_qty: 0,
          planning_status: r.planning_status,
          recommended_action: r.recommended_action,
        })),
        sizeMaster, designMaster, colourMaster,
        { context_label: `Labour Issue — ${dabbiName}`, date_label: today },
      )
      return { dabbiId, dabbiCode, dabbiName, matrixData, totalQty }
    })
    .sort((a, b) => a.dabbiName.localeCompare(b.dabbiName))

  // Combined matrix for toggle view — all filtered labourRows
  const combinedMatrixData = buildMatrixFromPlanningRows(
    labourRows.map((r) => ({
      shape_design_id: r.shape_design_id,
      bindi_colour_id: r.bindi_colour_id,
      size_id: r.size_id,
      open_qty: r.suggested_issue_qty,
      ready_allocated_qty: 0,
      wip_allocated_qty: 0,
      shortage_qty: 0,
      planning_status: r.planning_status,
      recommended_action: r.recommended_action,
    })),
    sizeMaster, designMaster, colourMaster,
    { context_label: 'Labour Issue Sheet', date_label: today },
  )

  // All sections for print — from baseRows (dabbi/priority filters excluded)
  const allSections = [...new Set(baseRows.map((r) => r.dabbi_colour_id))]
    .map((dabbiId) => {
      const sectionRows = baseRows.filter((r) => r.dabbi_colour_id === dabbiId)
      const totalQty = sectionRows.reduce((s, r) => s + r.suggested_issue_qty, 0)
      const masterRow = dabbis.find((d) => d.id === dabbiId)
      const dabbiName = masterRow?.name ?? masterRow?.code ?? dabbiId
      const dabbiCode = masterRow?.code ?? ''
      return { dabbiId, dabbiCode, dabbiName, rows: sectionRows, totalQty }
    })
    .sort((a, b) => a.dabbiName.localeCompare(b.dabbiName))

  const filters: FilterField[] = [
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
    customer: customerIds,
    design:   designFilter   ? [designFilter]   : [],
    clr:      clrFilter      ? [clrFilter]      : [],
    size:     sizeFilter     ? [sizeFilter]      : [],
    dabbi:    dabbiFilter    ? [dabbiFilter]    : [],
    priority: priorityFilter ? [priorityFilter] : [],
  }

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
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1500px' }}>
      <PageHeader
        backHref="/planning/allocation"
        title="Labour Issue Sheet"
        subtitle="Cuttings available today — issue to labour for same-day packaging. Sorted by priority."
      />

      <ReportFilterBar filters={filters} activeFilters={activeFilters} printLabel={printTitle} />

      {fetchError && (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>✗ {fetchError}</p>
      )}

      {labourRows.length === 0 && !fetchError && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          No give_to_labour lines today. All demand is either covered by ready stock or needs machine cutting.
        </p>
      )}

      {labourRows.length > 0 && (
        <>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{labourRows.length} SKUs</strong> to issue
            &nbsp;|&nbsp;
            Total: <strong style={{ color: 'var(--text-primary)' }}>{fmt(totalIssueQty)} gross</strong>
            {sections.length > 1 && (
              <>
                &nbsp;|&nbsp;
                {sections.map((s) => (
                  <span key={s.dabbiId} style={{ marginRight: '0.75rem', color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{s.dabbiName}</strong>: {fmt(s.totalQty)}
                  </span>
                ))}
              </>
            )}
          </p>

          <div style={{ marginBottom: '2rem' }}>
            <LabourIssueMatrixSection
              sections={sections}
              combinedMatrixData={combinedMatrixData}
              printTitle={printTitle}
            />
          </div>

          <div className="no-print">
            <CollapsibleSection title="Detail View" count={labourRows.length}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '900px' }}>
                  <thead>
                    <tr>
                      <th style={tableTh}>Priority</th>
                      <th style={tableTh}>Customer</th>
                      <th style={tableTh}>Order</th>
                      <th style={tableTh}>Shape</th>
                      <th style={tableTh}>Colour</th>
                      <th style={tableTh}>Size</th>
                      <th style={{ ...tableTh, color: 'var(--accent)', fontWeight: 700 }}>Dabbi</th>
                      <th style={thNum}>Open Qty</th>
                      <th style={thNum}>Cut Avail</th>
                      <th style={{ ...thNum, color: 'var(--warning)', fontWeight: 'bold' }}>Issue Qty</th>
                      <th style={tableTh}>Override</th>
                    </tr>
                  </thead>
                  <tbody>
                    {labourRows.map((row) => {
                      const priorityLabel = row.sort_tier === 0
                        ? `P${row.priority_rank} ★`
                        : `W${11 - row.priority_rank}`
                      return (
                        <tr
                          key={row.order_line_id}
                          style={{ background: row.override_active ? 'rgba(245, 158, 11, 0.06)' : undefined }}
                        >
                          <td style={{ ...tableTd, whiteSpace: 'nowrap' }}>
                            <span style={{
                              fontSize: 'var(--text-xs)',
                              padding: '0.1rem 0.35rem',
                              border: '1px solid',
                              borderRadius: 'var(--radius-sm)',
                              borderColor: row.sort_tier === 0 ? 'var(--accent)' : 'var(--border)',
                              color: row.sort_tier === 0 ? 'var(--accent)' : 'var(--text-secondary)',
                            }}>
                              {priorityLabel}
                            </span>
                          </td>
                          <td style={tableTd}>{row.customer_name}</td>
                          <td style={tableTd}>
                            <Link
                              href={`/orders/${row.order_id}`}
                              style={{ color: 'var(--accent)', fontSize: 'var(--text-xs)', textDecoration: 'none' }}
                            >
                              {row.order_id.slice(0, 8)}
                            </Link>
                          </td>
                          <td style={tableTd}>{shapeMap.get(row.shape_design_id) ?? '—'}</td>
                          <td style={tableTd}>{bindiMap.get(row.bindi_colour_id) ?? '—'}</td>
                          <td style={tableTd}>{sizeMap.get(row.size_id) ?? '—'}</td>
                          <td style={{ ...tableTd, fontWeight: 700, color: 'var(--accent)' }}>
                            {dabbiMap.get(row.dabbi_colour_id) ?? '—'}
                          </td>
                          <td style={tdNum}>{fmt(row.open_qty)}</td>
                          <td style={tdNum}>{fmt(row.cuttings_available_qty)}</td>
                          <td style={{ ...tdNum, fontWeight: 'bold', color: 'var(--warning)' }}>
                            {fmt(row.suggested_issue_qty)}
                          </td>
                          <td style={tableTd}>
                            {row.override_active && (
                              <span
                                title={`Override: ${row.override_type} — ${row.override_reason}`}
                                style={{ color: 'var(--accent)', fontSize: 'var(--text-xs)' }}
                              >
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

      {/* Print-only: all dabbi sections, always separated regardless of screen toggle */}
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
              <p style={{ fontSize: '11px', marginBottom: '12px' }}>{today}</p>
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
