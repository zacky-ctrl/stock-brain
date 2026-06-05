'use client'

import { useState, useMemo } from 'react'
import { MatrixViewToggle } from '@/components/matrix/MatrixViewToggle'
import { MatrixGrid } from '@/components/matrix/MatrixGrid'
import { MatrixFilterBar } from '@/components/matrix/MatrixFilterBar'
import { buildMatrixFromStockBalances, filterMatrixData } from '@stock-brain/domain'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import type { SizeMasterRow, DesignMasterRow, ColourMasterRow, StockBalanceRow } from '@stock-brain/domain'
import type { FilterConfig, ActiveFilters } from '@stock-brain/types'
import { tableTh, tableTd } from '@/lib/ui'
import type { CSSProperties } from 'react'

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

type JobLine = {
  id: string
  quantity_sent_gross: number
  quantity_returned_gross: number
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  brand_id: string
  shape_name: string | null
  bindi_code: string | null
  size_code: string | null
  dabbi_code: string | null
  brand_name: string | null
}

type Job = {
  id: string
  date_assigned: string
  expected_return_date: string | null
  status: string
  labour_unit_id: string
  labour_unit_name: string
  lines: JobLine[]
}

type Props = {
  jobs: Job[]
  sizeMaster: SizeMasterRow[]
  designMaster: DesignMasterRow[]
  colourMaster: ColourMasterRow[]
  totalWipGross: number
  filteredOrderId?: string
}

export function WipClient({ jobs, sizeMaster, designMaster, colourMaster, totalWipGross, filteredOrderId }: Props) {
  const [view, setView] = useState<'list' | 'matrix'>('list')
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({})
  const [selectedLabourUnit, setSelectedLabourUnit] = useState<string>('')

  const labourUnitOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const job of jobs) {
      if (job.labour_unit_id && !seen.has(job.labour_unit_id)) {
        seen.set(job.labour_unit_id, job.labour_unit_name)
      }
    }
    return [...seen.entries()].map(([id, label]) => ({ id, label }))
  }, [jobs])

  const filteredJobs = useMemo(
    () =>
      selectedLabourUnit
        ? jobs.filter((j) => j.labour_unit_id === selectedLabourUnit)
        : jobs,
    [jobs, selectedLabourUnit],
  )

  const wipStockRows: StockBalanceRow[] = useMemo(() => {
    const agg = new Map<string, { shape_design_id: string; bindi_colour_id: string; size_id: string; wip: number }>()
    for (const job of filteredJobs) {
      for (const l of job.lines) {
        const wip = Math.max(0, l.quantity_sent_gross - l.quantity_returned_gross)
        if (wip === 0) continue
        const key = `${l.shape_design_id}|${l.bindi_colour_id}|${l.size_id}`
        const existing = agg.get(key)
        if (existing) {
          existing.wip += wip
        } else {
          agg.set(key, { shape_design_id: l.shape_design_id, bindi_colour_id: l.bindi_colour_id, size_id: l.size_id, wip })
        }
      }
    }
    return [...agg.values()].map((e) => ({
      shape_design_id: e.shape_design_id,
      bindi_colour_id: e.bindi_colour_id,
      size_id: e.size_id,
      gross_qty: e.wip,
      available_qty: e.wip,
      committed_qty: 0,
    }))
  }, [filteredJobs])

  const fullMatrix = useMemo(
    () =>
      buildMatrixFromStockBalances(wipStockRows, sizeMaster, designMaster, colourMaster, { showAllRows: false }),
    [wipStockRows, sizeMaster, designMaster, colourMaster],
  )

  const matrixFilterConfig: FilterConfig = useMemo(() => {
    const designsSeen = new Map<string, string>()
    const coloursSeen = new Map<string, string>()
    for (const row of fullMatrix.rows) {
      designsSeen.set(row.design_id, row.design_name)
      coloursSeen.set(row.colour_id, row.colour_code)
    }
    return {
      fields: [
        { key: 'design', label: 'Design', options: [...designsSeen.entries()].map(([id, label]) => ({ id, label })) },
        { key: 'colour', label: 'CLR', options: [...coloursSeen.entries()].map(([id, label]) => ({ id, label })) },
      ],
    }
  }, [fullMatrix])

  const filteredMatrix = useMemo(
    () => filterMatrixData(fullMatrix, activeFilters, { design: 'design', colour: 'colour' }),
    [fullMatrix, activeFilters],
  )

  const tdStyle: CSSProperties = { ...tableTd, verticalAlign: 'top' }
  const tdNum: CSSProperties = { ...tdStyle, textAlign: 'right', paddingRight: '1.5rem', fontVariantNumeric: 'tabular-nums' }

  return (
    <div>
      {filteredOrderId && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '0.6rem 1rem',
          marginBottom: '1rem',
          background: 'var(--info-subtle)',
          border: '1px solid rgba(0,180,216,0.3)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--text-sm)',
          color: 'var(--info)',
        }}>
          <span>
            Filtered to order <strong>{filteredOrderId.slice(0, 8)}</strong>
            {jobs.length === 0 && ' — no active WIP jobs found for this order'}
          </span>
          <a
            href="/planning/wip"
            style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--info)', textDecoration: 'underline' }}
          >
            Clear filter
          </a>
        </div>
      )}
      <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', alignItems: 'center' }}>
        <span>
          <strong style={{ color: 'var(--text-primary)' }}>{jobs.length}</strong> active job{jobs.length !== 1 ? 's' : ''}
        </span>
        <span>
          <strong style={{ color: 'var(--text-primary)' }}>{fmt(totalWipGross)}</strong> gross in WIP
        </span>
        <div style={{ marginLeft: 'auto' }}>
          <MatrixViewToggle view={view} onViewChange={setView} />
        </div>
      </div>

      {jobs.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          No active labour jobs.{' '}
          <a href="/operations/labour-jobs/new" style={{ color: 'var(--info)', textDecoration: 'none' }}>Issue a new job.</a>
        </p>
      )}

      {/* ── Matrix mode ──────────────────────────────────────── */}
      {view === 'matrix' && (
        <div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.75rem' }}>
            {labourUnitOptions.length > 1 && (
              <select
                value={selectedLabourUnit}
                onChange={(e) => setSelectedLabourUnit(e.target.value)}
                style={{ fontSize: 'var(--text-sm)', padding: '0.3rem 0.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
              >
                <option value="">All labour units</option>
                {labourUnitOptions.map((u) => (
                  <option key={u.id} value={u.id}>{u.label}</option>
                ))}
              </select>
            )}
            <MatrixFilterBar
              filterConfig={matrixFilterConfig}
              activeFilters={activeFilters}
              onFilterChange={setActiveFilters}
            />
          </div>
          {wipStockRows.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>No WIP stock to display.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <MatrixGrid data={filteredMatrix} mode="view" />
            </div>
          )}
        </div>
      )}

      {/* ── List mode ─────────────────────────────────────────── */}
      {view === 'list' && jobs.map((job) => {
        const lines = job.lines
        const totalSent = lines.reduce((s, l) => s + l.quantity_sent_gross, 0)
        const totalReturned = lines.reduce((s, l) => s + l.quantity_returned_gross, 0)
        const wipRemaining = Math.max(0, totalSent - totalReturned)

        return (
          <div key={job.id} style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem' }}>
              <a
                href={`/operations/labour-jobs/${job.id}`}
                style={{ fontSize: 'var(--text-sm)', color: 'var(--accent)', textDecoration: 'none', fontWeight: 'bold' }}
              >
                {job.labour_unit_name || '—'} · {job.id.slice(0, 8)}
              </a>
              <Badge variant={statusBadgeVariant(job.status)} label={job.status.replace(/_/g, ' ')} size="sm" />
              <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                assigned {job.date_assigned}
                {job.expected_return_date && ` · exp. return ${job.expected_return_date}`}
              </span>
              <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', fontSize: 'var(--text-sm)' }}>
                <strong>{fmt(wipRemaining)}</strong> gross WIP
              </span>
            </div>

            <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: '900px' }}>
              <thead>
                <tr>
                  <th style={tableTh}>Shape</th>
                  <th style={tableTh}>Colour</th>
                  <th style={tableTh}>Size</th>
                  <th style={tableTh}>Dabbi</th>
                  <th style={tableTh}>Brand</th>
                  <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }}>Sent</th>
                  <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }}>Returned</th>
                  <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }}>WIP</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const sent = l.quantity_sent_gross
                  const returned = l.quantity_returned_gross
                  const wip = Math.max(0, sent - returned)
                  return (
                    <tr key={l.id}>
                      <td style={tdStyle}>{l.shape_name ?? '—'}</td>
                      <td style={tdStyle}>{l.bindi_code ?? '—'}</td>
                      <td style={tdStyle}>{l.size_code ?? '—'}</td>
                      <td style={tdStyle}>{l.dabbi_code ?? '—'}</td>
                      <td style={tdStyle}>{l.brand_name ?? '—'}</td>
                      <td style={tdNum}>{fmt(sent)}</td>
                      <td style={{ ...tdNum, color: 'var(--text-secondary)' }}>{fmt(returned)}</td>
                      <td style={{ ...tdNum, fontWeight: wip > 0 ? 'bold' : undefined, color: wip === 0 ? 'var(--text-secondary)' : undefined }}>
                        {fmt(wip)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
