import { createServerSupabaseClient } from '@/lib/supabase/server'
import { fetchPlanningAllocation } from '@/app/planning/allocation/fetchers'
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

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

type LabourJobRow = {
  id: string
  unit_name: string
  date_assigned: string
  expected_return_date: string | null
  status: string
  total_issued: number
  sku_count: number
  is_overdue: boolean
  days_until_return: number | null
}

export default async function ProductionPipelineReportPage({ searchParams }: PageProps) {
  const params = await searchParams
  const designIds = typeof params.design   === 'string' ? params.design.split(',').filter(Boolean) : []
  const clrIds    = typeof params.clr      === 'string' ? params.clr.split(',').filter(Boolean)    : []
  const stageIds  = typeof params.stage    === 'string' ? params.stage.split(',').filter(Boolean)  : []
  const dateFrom  = typeof params.dateFrom === 'string' ? params.dateFrom : ''
  const dateTo    = typeof params.dateTo   === 'string' ? params.dateTo   : ''

  const supabase = createServerSupabaseClient()
  const today = new Date()
  const todayStr = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  const [allocationResult, shapesResult, bindiResult, sizesResult, labourJobsResult] = await Promise.allSettled([
    fetchPlanningAllocation(supabase),
    supabase.from('shape_designs').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('bindi_colours').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('sizes').select('id, code, name, sort_order').order('sort_order'),
    supabase
      .from('labour_jobs')
      .select(`
        id, date_assigned, expected_return_date, status,
        labour_units(name),
        labour_job_lines(shape_design_id, bindi_colour_id, size_id, quantity_sent_gross, quantity_returned_gross)
      `)
      .not('status', 'in', '("returned_complete","cancelled_recalled")'),
  ])

  const allRows: PlanningAllocationRow[] = allocationResult.status === 'fulfilled' ? allocationResult.value : []
  const shapes = shapesResult.status === 'fulfilled' ? (shapesResult.value.data ?? []) as LookupRow[] : []
  const bindis = bindiResult.status === 'fulfilled'  ? (bindiResult.value.data ?? []) as LookupRow[]  : []
  const sizes  = sizesResult.status === 'fulfilled'  ? (sizesResult.value.data ?? []) as LookupRow[]  : []

  const shapeMap = buildLookup(shapes, true)
  const bindiMap = buildLookup(bindis)
  const sizeMap  = buildLookup(sizes)

  // Section 1: give_to_labour rows (available to issue)
  let issueRows = allRows
    .filter((r) => r.planning_status === 'give_to_labour' || r.planning_status === 'give_to_labour_override')
    .sort((a, b) => a.priority_rank - b.priority_rank)
    .map((r) => ({ ...r, suggested_issue_qty: Math.min(r.open_qty, r.cuttings_available_qty) }))

  // Section 2: active labour jobs (WIP)
  type RawJob = {
    id: string
    date_assigned: string
    expected_return_date: string | null
    status: string
    labour_units: { name: string } | { name: string }[] | null
    labour_job_lines: Array<{
      shape_design_id: string
      bindi_colour_id: string
      size_id: string
      quantity_sent_gross: number | string
      quantity_returned_gross: number | string
    }> | null
  }
  const labourJobsRaw = labourJobsResult.status === 'fulfilled' ? (labourJobsResult.value.data ?? []) as unknown as RawJob[] : []

  const labourJobs: LabourJobRow[] = labourJobsRaw.map((job) => {
    const unitRaw = Array.isArray(job.labour_units) ? job.labour_units[0] : job.labour_units
    const unitName = unitRaw?.name ?? '—'
    const lines = job.labour_job_lines ?? []
    const totalIssued = lines.reduce((s, l) => s + Number(l.quantity_sent_gross), 0)
    const skuCount = lines.length

    let daysUntilReturn: number | null = null
    let isOverdue = false
    if (job.expected_return_date) {
      const diff = Math.floor((new Date(job.expected_return_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      daysUntilReturn = diff
      isOverdue = diff < 0
    }

    return {
      id:                   job.id,
      unit_name:            unitName,
      date_assigned:        job.date_assigned,
      expected_return_date: job.expected_return_date,
      status:               job.status,
      total_issued:         totalIssued,
      sku_count:            skuCount,
      is_overdue:           isOverdue,
      days_until_return:    daysUntilReturn,
    }
  })

  // Section 3: ready_to_dispatch rows (ready vs demand)
  let readyRows = allRows
    .filter((r) => r.planning_status === 'ready_to_dispatch' || r.planning_status === 'ready_to_dispatch_override')
    .sort((a, b) => a.priority_rank - b.priority_rank)

  // Apply filters
  if (designIds.length > 0) {
    issueRows = issueRows.filter((r) => designIds.includes(r.shape_design_id))
    readyRows = readyRows.filter((r) => designIds.includes(r.shape_design_id))
  }
  if (clrIds.length > 0) {
    issueRows = issueRows.filter((r) => clrIds.includes(r.bindi_colour_id))
    readyRows = readyRows.filter((r) => clrIds.includes(r.bindi_colour_id))
  }

  const totalCuttingsAvail  = issueRows.reduce((s, r) => s + r.cuttings_available_qty, 0)
  const totalDemandForIssue = issueRows.reduce((s, r) => s + r.open_qty, 0)
  const totalWip            = labourJobs.reduce((s, j) => s + j.total_issued, 0)
  const totalReady          = readyRows.reduce((s, r) => s + r.ready_allocated_qty, 0)
  const overdueJobs         = labourJobs.filter((j) => j.is_overdue)

  const filters: FilterField[] = [
    { key: 'dateFrom', label: 'From', options: [], inputType: 'date' },
    { key: 'dateTo',   label: 'To',   options: [], inputType: 'date' },
    { key: 'design',   label: 'Design', options: shapes.map((s) => ({ id: s.id, label: s.name ?? s.code })), multiSelect: true },
    { key: 'clr',      label: 'CLR',    options: bindis.map((c) => ({ id: c.id, label: c.code })),           multiSelect: true },
    {
      key: 'stage',
      label: 'Stage',
      options: [
        { id: 'issue', label: 'Available to Issue' },
        { id: 'wip',   label: 'With Labour (WIP)' },
        { id: 'ready', label: 'Ready vs Demand' },
      ],
    },
  ]

  const activeFilters: ActiveFilters = {
    dateFrom: dateFrom    ? [dateFrom]  : [],
    dateTo:   dateTo      ? [dateTo]    : [],
    design:   designIds,
    clr:      clrIds,
    stage:    stageIds,
  }

  const reportFilters = [
    { label: 'Design', value: designIds.length > 0 ? designIds.map((id) => shapeMap.get(id) ?? id).join(', ') : 'All' },
    { label: 'From',   value: dateFrom || '—' },
    { label: 'To',     value: dateTo   || '—' },
    { label: 'Date',   value: todayStr },
  ]

  const tdNum: CSSProperties = { ...tableTd, textAlign: 'right', paddingRight: '1rem', fontVariantNumeric: 'tabular-nums' }
  const thNum: CSSProperties = { ...tableTh, textAlign: 'right', paddingRight: '1rem' }

  const showIssue = stageIds.length === 0 || stageIds.includes('issue')
  const showWip   = stageIds.length === 0 || stageIds.includes('wip')
  const showReady = stageIds.length === 0 || stageIds.includes('ready')

  return (
    <main className="print-portrait" style={{ padding: '1.5rem 2rem', maxWidth: '1400px' }}>
      <ReportHeader reportName="PRODUCTION PIPELINE REPORT" filters={reportFilters} />
      <ReportFilterBar filters={filters} activeFilters={activeFilters} printLabel="Print" />

      {/* Pipeline flow visual — screen only */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '2rem', padding: '1rem 1.25rem', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        {[
          { label: 'Cuttings Stock', value: `${fmt(totalCuttingsAvail)} gross`, color: 'var(--info)' },
          { label: '→' },
          { label: 'With Labour', value: `${fmt(totalWip)} gross`, color: 'var(--warning)' },
          { label: '→' },
          { label: 'Ready Stock', value: `${fmt(totalReady)} gross`, color: 'var(--success)' },
          { label: '→' },
          { label: 'Open Demand', value: `${fmt(totalDemandForIssue)} gross`, color: 'var(--danger)' },
        ].map((item, i) =>
          item.label === '→' ? (
            <span key={i} style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xl)' }}>→</span>
          ) : (
            <div key={i} style={{ textAlign: 'center', padding: '0.5rem 1rem', background: 'var(--bg-hover)', borderRadius: 'var(--radius-sm)', minWidth: '120px' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>{item.label}</div>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: item.color }}>{item.value}</div>
            </div>
          )
        )}
        {overdueJobs.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 'var(--text-sm)', color: 'var(--danger)', fontWeight: 600 }}>
            ⚠ {overdueJobs.length} overdue job{overdueJobs.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Section 1 */}
      {showIssue && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--info)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
            Section 1 — Available to Issue to Labour
          </h2>
          {issueRows.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>No lines available to issue.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '800px' }}>
                <thead>
                  <tr>
                    <th style={tableTh}>Customer</th>
                    <th style={tableTh}>Shape</th>
                    <th style={tableTh}>CLR</th>
                    <th style={tableTh}>Size</th>
                    <th style={thNum}>Cut Avail</th>
                    <th style={thNum}>Demand</th>
                    <th style={thNum}>Can Cover</th>
                  </tr>
                </thead>
                <tbody>
                  {issueRows.map((row) => (
                    <tr key={row.order_line_id}>
                      <td style={tableTd}>{row.customer_name}</td>
                      <td style={tableTd}>{shapeMap.get(row.shape_design_id) ?? '—'}</td>
                      <td style={tableTd}>{bindiMap.get(row.bindi_colour_id) ?? '—'}</td>
                      <td style={tableTd}>{sizeMap.get(row.size_id) ?? '—'}</td>
                      <td style={tdNum}>{fmt(row.cuttings_available_qty)}</td>
                      <td style={tdNum}>{fmt(row.open_qty)}</td>
                      <td style={{ ...tdNum, color: 'var(--success)', fontWeight: 700 }}>{fmt(Math.min(row.open_qty, row.cuttings_available_qty))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Section 2 */}
      {showWip && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
            Section 2 — Currently With Labour (WIP)
          </h2>
          {labourJobs.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>No active labour jobs.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '700px' }}>
                <thead>
                  <tr>
                    <th style={tableTh}>Labour Unit</th>
                    <th style={tableTh}>Assigned</th>
                    <th style={thNum}>SKUs</th>
                    <th style={thNum}>Issued Qty</th>
                    <th style={tableTh}>Expected Return</th>
                    <th style={thNum}>Days Until Return</th>
                    <th style={tableTh}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {labourJobs.map((job) => (
                    <tr key={job.id} style={{ background: job.is_overdue ? 'rgba(255,71,87,0.06)' : undefined }}>
                      <td style={tableTd}>{job.unit_name}</td>
                      <td style={tableTd}>{new Date(job.date_assigned).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                      <td style={tdNum}>{job.sku_count}</td>
                      <td style={tdNum}>{fmt(job.total_issued)}</td>
                      <td style={tableTd}>{job.expected_return_date ? new Date(job.expected_return_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</td>
                      <td style={{ ...tdNum, color: job.is_overdue ? 'var(--danger)' : job.days_until_return !== null && job.days_until_return <= 1 ? 'var(--warning)' : 'var(--success)' }}>
                        {job.days_until_return !== null ? (job.is_overdue ? `${Math.abs(job.days_until_return)}d late *` : `${job.days_until_return}d`) : '—'}
                      </td>
                      <td style={tableTd}>
                        <span style={{ fontSize: 'var(--text-xs)', padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-sm)', background: job.is_overdue ? 'var(--danger-subtle)' : 'var(--bg-hover)', color: job.is_overdue ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: job.is_overdue ? 700 : 400 }}>
                          {job.is_overdue ? 'OVERDUE' : job.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Section 3 */}
      {showReady && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
            Section 3 — Ready Stock vs Open Demand
          </h2>
          {readyRows.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>No ready-to-dispatch lines.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '700px' }}>
                <thead>
                  <tr>
                    <th style={tableTh}>Customer</th>
                    <th style={tableTh}>Shape</th>
                    <th style={tableTh}>CLR</th>
                    <th style={tableTh}>Size</th>
                    <th style={thNum}>Ready Avail</th>
                    <th style={thNum}>Open Demand</th>
                    <th style={thNum}>Surplus / Shortage</th>
                  </tr>
                </thead>
                <tbody>
                  {readyRows.map((row) => {
                    const diff = row.ready_allocated_qty - row.open_qty
                    return (
                      <tr key={row.order_line_id}>
                        <td style={tableTd}>{row.customer_name}</td>
                        <td style={tableTd}>{shapeMap.get(row.shape_design_id) ?? '—'}</td>
                        <td style={tableTd}>{bindiMap.get(row.bindi_colour_id) ?? '—'}</td>
                        <td style={tableTd}>{sizeMap.get(row.size_id) ?? '—'}</td>
                        <td style={tdNum}>{fmt(row.ready_allocated_qty)}</td>
                        <td style={tdNum}>{fmt(row.open_qty)}</td>
                        <td style={{ ...tdNum, color: diff >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                          {diff >= 0 ? `+${fmt(diff)}` : fmt(diff)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 1cm; }
        }
      `}</style>
    </main>
  )
}
