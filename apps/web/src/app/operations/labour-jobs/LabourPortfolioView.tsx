'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { JobRow, JobLineRow } from './LabourJobsClient'

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

function resolveRef<T>(raw: T | T[] | null | undefined): T | null {
  if (!raw) return null
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw
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
  const isActive = !TERMINAL.has(job.status)

  if (isActive) {
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
  key: string
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

// ── SKU line display ───────────────────────────────────────────

function skuLabels(line: JobLineRow) {
  const shape = resolveRef(line.shape_designs)
  const bindi = resolveRef(line.bindi_colours)
  const size  = resolveRef(line.sizes)
  const dabbi = resolveRef(line.dabbi_colours)
  const brand = resolveRef(line.brands)
  return {
    shape: shape?.name ?? shape?.code ?? '—',
    bindi: bindi?.code ?? '—',
    size:  size?.code  ?? '—',
    dabbi: dabbi?.code ?? '—',
    brand: brand?.name ?? brand?.code ?? '—',
  }
}

// ── Job detail card (shown in Detail mode) ─────────────────────

const skuTh: CSSProperties = {
  padding: '0.3rem 0.5rem',
  fontSize: '0.68rem',
  fontWeight: 700,
  color: 'var(--text-secondary)',
  textAlign: 'left',
  borderBottom: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  whiteSpace: 'nowrap',
}
const skuThR: CSSProperties = { ...skuTh, textAlign: 'right' }
const skuTd: CSSProperties = {
  padding: '0.3rem 0.5rem',
  fontSize: 'var(--text-xs)',
  borderBottom: '1px solid var(--border-subtle)',
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
}
const skuTdR: CSSProperties = { ...skuTd, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

function JobDetailCard({ job }: { job: JobRow }) {
  const t = jobTotals(job)
  const lines = job.labour_job_lines ?? []

  return (
    <div className="portfolio-detail-card">
      {/* Card header */}
      <div className="portfolio-detail-card-header">
        <Link
          href={`/operations/labour-jobs/${job.id}`}
          className="portfolio-detail-card-job-id"
        >
          {job.id.slice(0, 8)}
        </Link>
        <Badge variant={jobStatusBadgeVariant(job)} label={jobStatusLabel(job)} size="sm" />
      </div>

      {/* Meta row */}
      <div className="portfolio-detail-card-meta">
        <span>Assigned: <strong>{dateLabel(job.date_assigned)}</strong></span>
        <span>Exp. return: <strong>{dateLabel(job.expected_return_date)}</strong></span>
        {job.actual_return_date && (
          <span>Returned: <strong>{dateLabel(job.actual_return_date)}</strong></span>
        )}
        <span>Issued: <strong>{fmt(t.totalSent)}</strong></span>
        <span>Returned: <strong>{fmt(t.totalReturned)}</strong></span>
        <span>WIP: <strong style={{ color: t.variance > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{fmt(t.variance)}</strong></span>
      </div>

      {/* SKU table — desktop/tablet */}
      {lines.length === 0 ? (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', padding: '0.5rem 0' }}>
          No SKU lines
        </div>
      ) : (
        <>
          <div className="portfolio-detail-sku-table-wrap">
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={skuTh}>Shape</th>
                  <th style={skuTh}>Colour</th>
                  <th style={skuTh}>Size</th>
                  <th style={skuTh}>Dabbi</th>
                  <th style={skuTh}>Brand</th>
                  <th style={skuThR}>Sent</th>
                  <th style={skuThR}>Returned</th>
                  <th style={skuThR}>WIP</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const lbl  = skuLabels(line)
                  const sent = Number(line.quantity_sent_gross)
                  const ret  = Number(line.quantity_returned_gross)
                  const wip  = Math.max(0, sent - ret)
                  return (
                    <tr key={line.id}>
                      <td style={skuTd}>{lbl.shape}</td>
                      <td style={skuTd}>{lbl.bindi}</td>
                      <td style={skuTd}>{lbl.size}</td>
                      <td style={skuTd}>{lbl.dabbi}</td>
                      <td style={skuTd}>{lbl.brand}</td>
                      <td style={skuTdR}>{fmt(sent)}</td>
                      <td style={{ ...skuTdR, color: 'var(--text-secondary)' }}>{fmt(ret)}</td>
                      <td style={{ ...skuTdR, fontWeight: wip > 0 ? 700 : undefined }}>{fmt(wip)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* SKU rows — mobile only */}
          <div className="portfolio-detail-sku-mobile">
            {lines.map((line) => {
              const lbl  = skuLabels(line)
              const sent = Number(line.quantity_sent_gross)
              const ret  = Number(line.quantity_returned_gross)
              const wip  = Math.max(0, sent - ret)
              return (
                <div key={line.id} className="portfolio-detail-sku-row">
                  <div className="portfolio-detail-sku-row-label">
                    {lbl.shape} · {lbl.size} · {lbl.bindi} · {lbl.dabbi} · {lbl.brand}
                  </div>
                  <div className="portfolio-detail-sku-row-nums">
                    <span>Sent <strong>{fmt(sent)}</strong></span>
                    <span>Ret <strong>{fmt(ret)}</strong></span>
                    <span>WIP <strong style={{ color: wip > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{fmt(wip)}</strong></span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── main component ─────────────────────────────────────────────

export function LabourPortfolioView({ jobs }: { jobs: JobRow[] }) {
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set())
  const [unitDetailMode, setUnitDetailMode] = useState<Map<string, 'summary' | 'detail'>>(new Map())

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

  function getMode(key: string): 'summary' | 'detail' {
    return unitDetailMode.get(key) ?? 'summary'
  }

  function setMode(key: string, mode: 'summary' | 'detail') {
    setUnitDetailMode((prev) => {
      const next = new Map(prev)
      next.set(key, mode)
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

  const COL_SPAN = 9

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
            const mode = getMode(group.key)
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

                {/* Summary / Detail toggle — shown when expanded */}
                {isExpanded && (
                  <tr key={`${group.key}-toggle`} style={{ background: 'var(--bg-elevated)' }}>
                    <td
                      colSpan={COL_SPAN}
                      style={{
                        padding: '0.35rem 0.75rem 0.35rem 2.5rem',
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div className="portfolio-detail-toggle">
                        <button
                          type="button"
                          className={`portfolio-detail-toggle-btn${mode === 'summary' ? ' active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); setMode(group.key, 'summary') }}
                        >
                          Summary
                        </button>
                        <button
                          type="button"
                          className={`portfolio-detail-toggle-btn${mode === 'detail' ? ' active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); setMode(group.key, 'detail') }}
                        >
                          Detail
                        </button>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Summary rows — current job-level table rows */}
                {isExpanded && mode === 'summary' && group.jobs.map((job) => {
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

                {/* Detail section — full-width card grid */}
                {isExpanded && mode === 'detail' && (
                  <tr key={`${group.key}-detail`}>
                    <td colSpan={COL_SPAN} style={{ padding: '1rem 0.75rem', background: 'var(--bg-base)', borderBottom: '1px solid var(--border)' }}>
                      <div className="portfolio-detail-grid">
                        {group.jobs.map((job) => (
                          <JobDetailCard key={job.id} job={job} />
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
