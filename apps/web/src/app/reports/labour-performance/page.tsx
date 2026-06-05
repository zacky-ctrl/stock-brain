import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ReportHeader } from '@/components/reports/ReportHeader'
import { ReportFilterBar } from '@/components/reports/ReportFilterBar'
import type { FilterField, ActiveFilters } from '@stock-brain/types'
import { tableTh, tableTd } from '@/lib/ui'
import type { CSSProperties } from 'react'

function fmt(n: number, decimals = 0): string {
  return n.toFixed(decimals)
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

type JobSummary = {
  job_id: string
  unit_id: string
  unit_name: string
  date_assigned: string
  expected_return_date: string | null
  actual_return_date: string | null
  status: string
  total_issued: number
  total_returned: number
  variance: number
  days_taken: number | null
  is_overdue: boolean
}

type UnitSummary = {
  unit_id: string
  unit_name: string
  jobs_completed: number
  jobs_active: number
  avg_days: number
  total_issued: number
  total_returned: number
  total_variance: number
}

export default async function LabourPerformanceReportPage({ searchParams }: PageProps) {
  const params = await searchParams
  const labourIds = typeof params.labour   === 'string' ? params.labour.split(',').filter(Boolean) : []
  const statusIds = typeof params.status   === 'string' ? params.status.split(',').filter(Boolean) : []
  const dateFrom  = typeof params.dateFrom === 'string' ? params.dateFrom : ''
  const dateTo    = typeof params.dateTo   === 'string' ? params.dateTo   : ''

  const supabase = createServerSupabaseClient()
  const today = new Date()
  const todayStr = today.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  const [labourUnitsResult, jobsResult] = await Promise.allSettled([
    supabase.from('labour_units').select('id, name, serial_number').eq('is_active', true).order('serial_number'),
    supabase
      .from('labour_jobs')
      .select(`
        id, date_assigned, expected_return_date, actual_return_date, status,
        labour_unit_id,
        labour_units(id, name),
        labour_job_lines(quantity_sent_gross, quantity_returned_gross)
      `)
      .order('date_assigned', { ascending: false }),
  ])

  const labourUnits = labourUnitsResult.status === 'fulfilled' ? (labourUnitsResult.value.data ?? []) : []

  type RawJob = {
    id: string
    date_assigned: string
    expected_return_date: string | null
    actual_return_date: string | null
    status: string
    labour_unit_id: string
    labour_units: { id: string; name: string } | { id: string; name: string }[] | null
    labour_job_lines: Array<{ quantity_sent_gross: number | string; quantity_returned_gross: number | string }> | null
  }

  const jobsRaw = jobsResult.status === 'fulfilled' ? (jobsResult.value.data ?? []) as unknown as RawJob[] : []

  let jobs: JobSummary[] = jobsRaw.map((job) => {
    const unitRaw = Array.isArray(job.labour_units) ? job.labour_units[0] : job.labour_units
    const unitName = unitRaw?.name ?? '—'
    const lines = job.labour_job_lines ?? []
    const totalIssued   = lines.reduce((s, l) => s + Number(l.quantity_sent_gross), 0)
    const totalReturned = lines.reduce((s, l) => s + Number(l.quantity_returned_gross), 0)

    let daysTaken: number | null = null
    let isOverdue = false
    const assigned = new Date(job.date_assigned)

    if (job.actual_return_date) {
      const returned = new Date(job.actual_return_date)
      daysTaken = Math.floor((returned.getTime() - assigned.getTime()) / (1000 * 60 * 60 * 24))
    } else if (job.expected_return_date) {
      const expected = new Date(job.expected_return_date)
      if (expected < today) {
        isOverdue = true
        daysTaken = Math.floor((today.getTime() - assigned.getTime()) / (1000 * 60 * 60 * 24))
      }
    }

    return {
      job_id:               job.id,
      unit_id:              job.labour_unit_id,
      unit_name:            unitName,
      date_assigned:        job.date_assigned,
      expected_return_date: job.expected_return_date,
      actual_return_date:   job.actual_return_date,
      status:               job.status,
      total_issued:         totalIssued,
      total_returned:       totalReturned,
      variance:             totalReturned - totalIssued,
      days_taken:           daysTaken,
      is_overdue:           isOverdue,
    }
  })

  // Apply filters
  if (labourIds.length > 0) jobs = jobs.filter((j) => labourIds.includes(j.unit_id))
  if (dateFrom)             jobs = jobs.filter((j) => j.date_assigned >= dateFrom)
  if (dateTo)               jobs = jobs.filter((j) => j.date_assigned <= dateTo)
  if (statusIds.length > 0) {
    jobs = jobs.filter((j) => {
      return statusIds.some((s) => {
        if (s === 'completed') return j.status === 'returned_complete'
        if (s === 'overdue')   return j.is_overdue
        if (s === 'active')    return j.status !== 'returned_complete' && j.status !== 'cancelled_recalled'
        return false
      })
    })
  }

  // Build per-unit summaries
  const unitSummaryMap = new Map<string, UnitSummary>()
  for (const job of jobs) {
    const prev = unitSummaryMap.get(job.unit_id) ?? {
      unit_id:       job.unit_id,
      unit_name:     job.unit_name,
      jobs_completed: 0,
      jobs_active:    0,
      avg_days:       0,
      total_issued:   0,
      total_returned: 0,
      total_variance: 0,
    }
    if (job.status === 'returned_complete') prev.jobs_completed += 1
    else prev.jobs_active += 1
    prev.total_issued   += job.total_issued
    prev.total_returned += job.total_returned
    prev.total_variance += job.variance
    unitSummaryMap.set(job.unit_id, prev)
  }

  // Calculate avg days per unit
  for (const [unitId, summary] of unitSummaryMap) {
    const completedJobs = jobs.filter((j) => j.unit_id === unitId && j.days_taken !== null)
    summary.avg_days = completedJobs.length > 0
      ? completedJobs.reduce((s, j) => s + (j.days_taken ?? 0), 0) / completedJobs.length
      : 0
    unitSummaryMap.set(unitId, summary)
  }

  const unitSummaries = Array.from(unitSummaryMap.values())

  const filters: FilterField[] = [
    { key: 'dateFrom', label: 'From', options: [], inputType: 'date' },
    { key: 'dateTo',   label: 'To',   options: [], inputType: 'date' },
    {
      key: 'labour',
      label: 'Labour Unit',
      options: labourUnits.map((u) => ({ id: u.id as string, label: u.name as string })),
      multiSelect: true,
    },
    {
      key: 'status',
      label: 'Status',
      options: [
        { id: 'active',    label: 'In Progress' },
        { id: 'completed', label: 'Completed' },
        { id: 'overdue',   label: 'Overdue' },
      ],
      multiSelect: true,
    },
  ]

  const activeFilters: ActiveFilters = {
    dateFrom: dateFrom ? [dateFrom] : [],
    dateTo:   dateTo   ? [dateTo]   : [],
    labour:   labourIds,
    status:   statusIds,
  }

  const unitLabel = labourIds.length > 0
    ? labourIds.map((id) => (labourUnits.find((u) => u.id === id) as { name: string } | undefined)?.name ?? id).join(', ')
    : 'All Units'

  const reportFilters = [
    { label: 'Unit',   value: unitLabel },
    { label: 'Status', value: statusIds.length > 0 ? statusIds.join(', ') : 'All' },
    { label: 'From',   value: dateFrom || '—' },
    { label: 'To',     value: dateTo   || '—' },
    { label: 'Date',   value: todayStr },
  ]

  const tdNum: CSSProperties = { ...tableTd, textAlign: 'right', paddingRight: '1rem', fontVariantNumeric: 'tabular-nums' }
  const thNum: CSSProperties = { ...tableTh, textAlign: 'right', paddingRight: '1rem' }

  function statusBadge(job: JobSummary) {
    if (job.is_overdue) return { label: 'OVERDUE', color: 'var(--danger)', bg: 'var(--danger-subtle)' }
    if (job.status === 'returned_complete') return { label: 'Complete', color: 'var(--success)', bg: 'var(--success-subtle)' }
    return { label: job.status.replace(/_/g, ' '), color: 'var(--text-secondary)', bg: 'var(--bg-hover)' }
  }

  return (
    <main className="print-portrait" style={{ padding: '1.5rem 2rem', maxWidth: '1400px' }}>
      <ReportHeader reportName="LABOUR PERFORMANCE REPORT" filters={reportFilters} />
      <ReportFilterBar filters={filters} activeFilters={activeFilters} printLabel="Print" />

      {/* Per-unit summary cards */}
      {unitSummaries.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Summary by Labour Unit
          </h2>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {unitSummaries.map((u) => (
              <div
                key={u.unit_id}
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderLeft: '3px solid var(--accent)', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', minWidth: '220px', flex: '1 0 220px' }}
              >
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{u.unit_name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  <span>Jobs completed:</span> <span style={{ color: 'var(--success)', fontWeight: 600 }}>{u.jobs_completed}</span>
                  <span>Active jobs:</span>     <span style={{ color: u.jobs_active > 0 ? 'var(--warning)' : 'var(--text-primary)', fontWeight: 600 }}>{u.jobs_active}</span>
                  <span>Avg return days:</span>  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(u.avg_days, 1)}d</span>
                  <span>Total issued:</span>     <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(u.total_issued)}</span>
                  <span>Total returned:</span>   <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(u.total_returned)}</span>
                  <span>Variance:</span>         <span style={{ fontWeight: 600, color: u.total_variance < 0 ? 'var(--danger)' : 'var(--text-primary)' }}>{fmt(u.total_variance)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail table */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Job Detail
        </h2>
        {jobs.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>No labour jobs match the current filters.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '900px' }}>
              <thead>
                <tr>
                  <th style={tableTh}>Labour Unit</th>
                  <th style={tableTh}>Assigned</th>
                  <th style={thNum}>Issued</th>
                  <th style={thNum}>Returned</th>
                  <th style={thNum}>Variance</th>
                  <th style={tableTh}>Expected Return</th>
                  <th style={thNum}>Days Taken</th>
                  <th style={tableTh}>Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => {
                  const badge = statusBadge(job)
                  return (
                    <tr key={job.job_id} style={{ background: job.is_overdue ? 'rgba(255,71,87,0.05)' : undefined }}>
                      <td style={tableTd}>{job.unit_name}</td>
                      <td style={tableTd}>{new Date(job.date_assigned).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td style={tdNum}>{fmt(job.total_issued)}</td>
                      <td style={tdNum}>{fmt(job.total_returned)}</td>
                      <td style={{ ...tdNum, color: job.variance < 0 ? 'var(--danger)' : job.variance > 0 ? 'var(--success)' : 'var(--text-secondary)', fontWeight: job.variance !== 0 ? 700 : 400 }}>
                        {job.variance > 0 ? `+${fmt(job.variance)}` : fmt(job.variance)}
                      </td>
                      <td style={tableTd}>{job.expected_return_date ? new Date(job.expected_return_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</td>
                      <td style={{ ...tdNum, color: job.is_overdue ? 'var(--danger)' : 'var(--text-primary)' }}>
                        {job.days_taken !== null ? `${fmt(job.days_taken)}d${job.is_overdue ? ' *' : ''}` : '—'}
                      </td>
                      <td style={tableTd}>
                        <span style={{ fontSize: 'var(--text-xs)', padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-sm)', background: badge.bg, color: badge.color, fontWeight: 600 }}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                  <td colSpan={2} style={{ ...tableTd, fontWeight: 700 }}>TOTALS</td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(jobs.reduce((s, j) => s + j.total_issued, 0))}</td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(jobs.reduce((s, j) => s + j.total_returned, 0))}</td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(jobs.reduce((s, j) => s + j.variance, 0))}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 1cm; }
        }
      `}</style>
    </main>
  )
}
