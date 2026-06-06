'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { JobRow } from './LabourJobsClient'

// ── helpers ────────────────────────────────────────────────────

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

function dateLabel(date: string | null | undefined): string {
  if (!date) return '—'
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function luFrom(job: JobRow) {
  return Array.isArray(job.labour_units) ? (job.labour_units as JobRow['labour_units'][])[0] : job.labour_units
}

const TERMINAL = new Set(['returned_complete', 'cancelled_recalled'])

function jobTotals(job: JobRow) {
  const lines = job.labour_job_lines ?? []
  const totalSent = lines.reduce((s, l) => s + Number(l.quantity_sent_gross), 0)
  const totalReturned = lines.reduce((s, l) => s + Number(l.quantity_returned_gross), 0)
  return { totalSent, totalReturned, variance: Math.max(0, totalSent - totalReturned) }
}

// ── performance badge ──────────────────────────────────────────

type PerfLevel = 'excellent' | 'good' | 'average' | 'review'

function perfLevel(variancePct: number): PerfLevel {
  if (variancePct < 2) return 'excellent'
  if (variancePct < 5) return 'good'
  if (variancePct < 10) return 'average'
  return 'review'
}

function perfBadge(level: PerfLevel): { variant: BadgeVariant; label: string } {
  switch (level) {
    case 'excellent': return { variant: 'success', label: 'Excellent' }
    case 'good':      return { variant: 'accent', label: 'Good' }
    case 'average':   return { variant: 'warning', label: 'Average' }
    case 'review':    return { variant: 'danger', label: 'Review' }
  }
}

// ── days taken colour ──────────────────────────────────────────

function daysTakenStyle(job: JobRow): CSSProperties {
  const today = todayIso()
  const isActive = !TERMINAL.has(job.status)

  if (isActive) {
    // Show elapsed in info colour
    return { color: 'var(--info)' }
  }

  if (!job.actual_return_date || !job.expected_return_date) {
    return { color: 'var(--text-muted)' }
  }

  const lateDays = daysBetween(job.expected_return_date, job.actual_return_date)
  if (lateDays <= 0) return { color: 'var(--success)', fontWeight: 700 }
  if (lateDays <= 3) return { color: 'var(--warning)', fontWeight: 700 }
  return { color: 'var(--danger)', fontWeight: 700 }
}

function daysTakenLabel(job: JobRow): string {
  const today = todayIso()
  const isActive = !TERMINAL.has(job.status)

  if (isActive) {
    const elapsed = daysBetween(job.date_assigned, today)
    return `${elapsed}d elapsed`
  }

  if (!job.actual_return_date) return '—'
  const taken = daysBetween(job.date_assigned, job.actual_return_date)
  return `${taken}d`
}

function jobStatusBadgeVariant(job: JobRow): BadgeVariant {
  if (!TERMINAL.has(job.status) && job.expected_return_date && job.expected_return_date < todayIso()) {
    return 'danger'
  }
  switch (job.status) {
    case 'assigned':           return 'info'
    case 'in_progress':        return 'accent'
    case 'partially_returned': return 'warning'
    case 'returned_complete':  return 'success'
    case 'cancelled_recalled': return 'neutral'
    default:                   return 'neutral'
  }
}

function jobStatusLabel(job: JobRow): string {
  if (!TERMINAL.has(job.status) && job.expected_return_date && job.expected_return_date < todayIso()) {
    return 'Overdue'
  }
  const map: Record<string, string> = {
    assigned: 'Assigned',
    in_progress: 'In Progress',
    partially_returned: 'Partial Return',
    returned_complete: 'Returned',
    cancelled_recalled: 'Cancelled',
  }
  return map[job.status] ?? job.status.replace(/_/g, ' ')
}

// ── table styles ───────────────────────────────────────────────

const th: CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontSize: 'var(--text-xs)',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  textAlign: 'left',
  borderBottom: '1px solid var(--border)',
  whiteSpace: 'nowrap',
  background: 'var(--bg-elevated)',
}

const thNum: CSSProperties = { ...th, textAlign: 'right' }

const td: CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontSize: 'var(--text-sm)',
  borderBottom: '1px solid var(--border-subtle)',
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
}

const tdNum: CSSProperties = {
  ...td,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
}

// ── types ──────────────────────────────────────────────────────

type UnitGroup = {
  key: string               // serial_number as string, or 'unknown'
  name: string
  serial_number: number | null
  jobs: JobRow[]
  total_sent: number
  total_returned: number
  total_variance: number
  variance_pct: number
  avg_return_days: number | null
  perf: PerfLevel
}

// ── main component ─────────────────────────────────────────────

export function LabourPortfolioView({ jobs }: { jobs: JobRow[] }) {
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set())

  const groups = useMemo<UnitGroup[]>(() => {
    const map = new Map<string, JobRow[]>()
    for (const job of jobs) {
      const lu = luFrom(job)
      const key = lu ? String(lu.serial_number) : 'unknown'
      const list = map.get(key) ?? []
      list.push(job)
      map.set(key, list)
    }

    return [...map.entries()]
      .map(([key, unitJobs]) => {
        const lu = luFrom(unitJobs[0])
        let total_sent = 0
        let total_returned = 0
        const completedWithDates: number[] = []

        for (const job of unitJobs) {
          const t = jobTotals(job)
          total_sent += t.totalSent
          total_returned += t.totalReturned

          if (job.actual_return_date && job.date_assigned) {
            completedWithDates.push(daysBetween(job.date_assigned, job.actual_return_date))
          }
        }

        const total_variance = Math.max(0, total_sent - total_returned)
        const variance_pct = total_sent > 0 ? (total_variance / total_sent) * 100 : 0
        const avg_return_days =
          completedWithDates.length > 0
            ? Math.round(completedWithDates.reduce((s, d) => s + d, 0) / completedWithDates.length)
            : null

        return {
          key,
          name: lu?.name ?? 'Unknown Unit',
          serial_number: lu?.serial_number ?? null,
          jobs: unitJobs,
          total_sent,
          total_returned,
          total_variance,
          variance_pct,
          avg_return_days,
          perf: perfLevel(variance_pct),
        }
      })
      .sort((a, b) => b.variance_pct - a.variance_pct)
  }, [jobs])

  function toggleUnit(key: string) {
    setExpandedUnits((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (groups.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        No labour jobs to display.
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
        <thead>
          <tr>
            <th style={th}>Labour Unit / Job</th>
            <th style={th}>Assigned</th>
            <th style={th}>Exp. Return</th>
            <th style={th}>Actual Return</th>
            <th style={thNum}>Days Taken</th>
            <th style={thNum}>Issued</th>
            <th style={thNum}>Returned</th>
            <th style={thNum}>Variance</th>
            <th style={th}>Performance / Status</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const isExpanded = expandedUnits.has(group.key)
            const badge = perfBadge(group.perf)

            return (
              <>
                {/* Unit header row */}
                <tr
                  key={group.key}
                  style={{ cursor: 'pointer', background: 'var(--bg-elevated)' }}
                  onClick={() => toggleUnit(group.key)}
                >
                  <td style={{ ...td, fontWeight: 700 }}>
                    {isExpanded
                      ? <ChevronDown size={14} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                      : <ChevronRight size={14} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                    }
                    {group.serial_number !== null ? `#${group.serial_number} ` : ''}{group.name}
                    <span style={{ marginLeft: '0.5rem', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 400 }}>
                      {group.jobs.length} job{group.jobs.length !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td colSpan={3} style={{ ...td, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    {group.avg_return_days !== null ? `Avg return: ${group.avg_return_days}d` : 'No completed jobs'}
                  </td>
                  <td style={{ ...tdNum, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    {group.variance_pct.toFixed(1)}% variance
                  </td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(group.total_sent)}</td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(group.total_returned)}</td>
                  <td style={{ ...tdNum, fontWeight: 700, color: group.total_variance > 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {fmt(group.total_variance)}
                  </td>
                  <td style={td}>
                    <Badge variant={badge.variant} label={badge.label} size="sm" />
                  </td>
                </tr>

                {/* Job rows */}
                {isExpanded && group.jobs.map((job) => {
                  const t = jobTotals(job)
                  return (
                    <tr key={job.id} style={{ background: 'var(--bg-base)' }}>
                      <td style={{ ...td, paddingLeft: '2.5rem' }}>
                        <Link
                          href={`/operations/labour-jobs/${job.id}`}
                          style={{ color: 'var(--info)', textDecoration: 'none', fontSize: 'var(--text-sm)' }}
                        >
                          {job.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td style={{ ...td, fontSize: 'var(--text-xs)' }}>{dateLabel(job.date_assigned)}</td>
                      <td style={{ ...td, fontSize: 'var(--text-xs)', color: job.expected_return_date ? undefined : 'var(--text-muted)' }}>
                        {dateLabel(job.expected_return_date)}
                      </td>
                      <td style={{ ...td, fontSize: 'var(--text-xs)', color: job.actual_return_date ? undefined : 'var(--text-muted)' }}>
                        {dateLabel(job.actual_return_date)}
                      </td>
                      <td style={{ ...tdNum, fontSize: 'var(--text-xs)', ...daysTakenStyle(job) }}>
                        {daysTakenLabel(job)}
                      </td>
                      <td style={{ ...tdNum, fontSize: 'var(--text-xs)' }}>{fmt(t.totalSent)}</td>
                      <td style={{ ...tdNum, fontSize: 'var(--text-xs)' }}>{fmt(t.totalReturned)}</td>
                      <td style={{ ...tdNum, fontSize: 'var(--text-xs)', color: t.variance > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {fmt(t.variance)}
                      </td>
                      <td style={td}>
                        <Badge variant={jobStatusBadgeVariant(job)} label={jobStatusLabel(job)} size="sm" />
                      </td>
                    </tr>
                  )
                })}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
