'use client'

import { useState, useMemo } from 'react'
import { tableTh, tableTd, inputStyle, selectStyle } from '@/lib/ui'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import Link from 'next/link'
import type { CSSProperties } from 'react'

export type JobRow = {
  id: string
  date_assigned: string
  expected_return_date: string | null
  actual_return_date: string | null
  status: string
  notes: string | null
  created_at: string
  labour_units: { name: string; serial_number: number } | null
  labour_job_lines: { quantity_sent_gross: string | number; quantity_returned_gross: string | number }[]
}

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

function luFrom(job: JobRow) {
  return Array.isArray(job.labour_units) ? (job.labour_units as JobRow['labour_units'][])[0] : job.labour_units
}

const TERMINAL = new Set(['returned_complete', 'cancelled_recalled'])

function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

function isOverdue(job: JobRow): boolean {
  if (!job.expected_return_date) return false
  if (TERMINAL.has(job.status)) return false
  return job.expected_return_date < todayIso()
}

function jobBadgeVariant(job: JobRow): BadgeVariant {
  if (isOverdue(job)) return 'danger'
  switch (job.status) {
    case 'assigned':           return 'info'
    case 'in_progress':        return 'accent'
    case 'partially_returned': return 'warning'
    case 'returned_complete':  return 'success'
    case 'cancelled_recalled': return 'neutral'
    default:                   return 'neutral'
  }
}

const STATUS_LABEL: Record<string, string> = {
  assigned:           'Assigned',
  in_progress:        'In Progress',
  partially_returned: 'Partially Returned',
  returned_complete:  'Returned',
  cancelled_recalled: 'Cancelled',
}

function jobBadgeLabel(job: JobRow): string {
  if (isOverdue(job)) return 'Overdue'
  return STATUS_LABEL[job.status] ?? job.status.replace(/_/g, ' ')
}

const FILTER_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'assigned',           label: 'Assigned' },
  { value: 'in_progress',        label: 'In Progress' },
  { value: 'partially_returned', label: 'Partially Returned' },
  { value: 'returned_complete',  label: 'Returned Complete' },
  { value: 'cancelled_recalled', label: 'Cancelled Recalled' },
]

const filterLabelStyle: CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
  fontWeight: 600,
}

const filterGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.2rem',
}

export function LabourJobsClient({ jobs }: { jobs: JobRow[] }) {
  const [unitFilter, setUnitFilter]       = useState('')
  const [assignedFrom, setAssignedFrom]   = useState('')
  const [dueBy, setDueBy]                 = useState('')
  const [statusFilter, setStatusFilter]   = useState('')

  const unitOptions = useMemo(() => {
    const seen = new Map<number, { serial: number; name: string }>()
    for (const job of jobs) {
      const lu = luFrom(job)
      if (lu && !seen.has(lu.serial_number)) {
        seen.set(lu.serial_number, { serial: lu.serial_number, name: lu.name })
      }
    }
    return [...seen.values()].sort((a, b) => a.serial - b.serial)
  }, [jobs])

  const filtered = useMemo(() =>
    jobs.filter((job) => {
      const lu = luFrom(job)
      if (unitFilter && String(lu?.serial_number ?? '') !== unitFilter) return false
      if (assignedFrom && job.date_assigned < assignedFrom) return false
      if (dueBy && (!job.expected_return_date || job.expected_return_date > dueBy)) return false
      if (statusFilter && job.status !== statusFilter) return false
      return true
    }),
    [jobs, unitFilter, assignedFrom, dueBy, statusFilter],
  )

  const anyFilter = unitFilter || assignedFrom || dueBy || statusFilter

  function clearAll() {
    setUnitFilter('')
    setAssignedFrom('')
    setDueBy('')
    setStatusFilter('')
  }

  const tdNum: CSSProperties = {
    ...tableTd,
    textAlign: 'right',
    paddingRight: '1.5rem',
    fontVariantNumeric: 'tabular-nums',
  }

  return (
    <>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem', padding: '0.75rem 1rem', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
        <div style={filterGroupStyle}>
          <label style={filterLabelStyle}>Labour Unit</label>
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            style={{ ...selectStyle, minWidth: '160px' }}
          >
            <option value="">All Units</option>
            {unitOptions.map((u) => (
              <option key={u.serial} value={String(u.serial)}>
                #{u.serial} {u.name}
              </option>
            ))}
          </select>
        </div>

        <div style={filterGroupStyle}>
          <label style={filterLabelStyle}>Assigned from</label>
          <input
            type="date"
            value={assignedFrom}
            onChange={(e) => setAssignedFrom(e.target.value)}
            style={{ ...inputStyle, width: '148px' }}
          />
        </div>

        <div style={filterGroupStyle}>
          <label style={filterLabelStyle}>Due by</label>
          <input
            type="date"
            value={dueBy}
            onChange={(e) => setDueBy(e.target.value)}
            style={{ ...inputStyle, width: '148px' }}
          />
        </div>

        <div style={filterGroupStyle}>
          <label style={filterLabelStyle}>Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ ...selectStyle, minWidth: '190px' }}
          >
            <option value="">All</option>
            {FILTER_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {anyFilter && (
          <button
            onClick={clearAll}
            style={{
              padding: '0.3rem 0.75rem',
              fontSize: 'var(--text-xs)',
              cursor: 'pointer',
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              alignSelf: 'flex-end',
            }}
          >
            Clear filters
          </button>
        )}

        {anyFilter && (
          <span style={{ alignSelf: 'flex-end', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', paddingBottom: '0.35rem' }}>
            {filtered.length} of {jobs.length}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          No jobs match the current filters.
        </p>
      ) : (
        <div className="table-card">
          <table className="stock-table">
            <thead>
              <tr>
                <th style={tableTh}>Job ID</th>
                <th style={tableTh}>Labour Unit</th>
                <th style={tableTh}>Assigned</th>
                <th style={tableTh}>Exp. Return</th>
                <th style={tableTh}>Status</th>
                <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }}>Lines</th>
                <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }}>Sent</th>
                <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }}>Returned</th>
                <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }}>WIP</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((job) => {
                const lu = luFrom(job)
                const lines = job.labour_job_lines ?? []
                const totalSent     = lines.reduce((s, l) => s + Number(l.quantity_sent_gross), 0)
                const totalReturned = lines.reduce((s, l) => s + Number(l.quantity_returned_gross), 0)
                const wip = Math.max(0, totalSent - totalReturned)

                return (
                  <tr key={job.id}>
                    <td style={tableTd}>
                      <Link
                        href={`/operations/labour-jobs/${job.id}`}
                        style={{ color: 'var(--info)', textDecoration: 'none' }}
                      >
                        {job.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td style={tableTd}>{lu ? `#${lu.serial_number} ${lu.name}` : '—'}</td>
                    <td style={tableTd}>{job.date_assigned}</td>
                    <td style={{ ...tableTd, color: job.expected_return_date ? undefined : 'var(--text-secondary)' }}>
                      {job.expected_return_date ?? '—'}
                    </td>
                    <td style={tableTd}>
                      <Badge variant={jobBadgeVariant(job)} label={jobBadgeLabel(job)} size="sm" />
                    </td>
                    <td style={tdNum}>{lines.length}</td>
                    <td style={tdNum}>{fmt(totalSent)}</td>
                    <td style={tdNum}>{fmt(totalReturned)}</td>
                    <td style={{ ...tdNum, fontWeight: wip > 0 ? 'bold' : undefined }}>
                      {fmt(wip)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
