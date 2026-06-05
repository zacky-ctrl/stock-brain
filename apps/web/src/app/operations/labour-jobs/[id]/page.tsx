import { createServerSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { tableTh, tableTd } from '@/lib/ui'
import { ReturnForm } from './ReturnForm'
import { recordLabourReturn } from './actions'
import { EditJobForm, ForceCloseForm } from './JobEditForms'
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { SectionHeader } from '@/components/ui/SectionHeader'
import type { JobLineForReturn } from './ReturnForm'
import type { CSSProperties } from 'react'

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

type JobRow = {
  id: string
  date_assigned: string
  expected_return_date: string | null
  actual_return_date: string | null
  status: string
  notes: string | null
  labour_units: { name: string; serial_number: number } | null
}

type JobLineRow = {
  id: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  brand_id: string
  quantity_sent_gross: string | number
  quantity_returned_gross: string | number
  order_line_id: string | null
  shape_designs: { code: string; name: string | null } | null
  bindi_colours: { code: string } | null
  sizes: { code: string } | null
  dabbi_colours: { code: string } | null
  brands: { code: string; name: string | null } | null
}

type StatusHistoryRow = {
  id: string
  from_status: string | null
  to_status: string
  changed_at: string
  reason: string | null
}

type ReturnEventRow = {
  id: string
  return_date: string
  notes: string | null
  created_at: string
  labour_job_return_lines: {
    labour_job_line_id: string
    quantity_returned_gross: string | number
    variance_gross: string | number
    variance_type: string
  }[]
}

function resolveRef<T>(raw: T | T[] | null): T | null {
  if (!raw) return null
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw
}

export default async function LabourJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServerSupabaseClient()

  const { data: jobRaw, error: jobErr } = await supabase
    .from('labour_jobs')
    .select(`
      id, date_assigned, expected_return_date, actual_return_date, status, notes,
      labour_units(name, serial_number)
    `)
    .eq('id', id)
    .single()

  if (jobErr || !jobRaw) notFound()

  const job = jobRaw as unknown as JobRow
  const lu = resolveRef(job.labour_units)

  const [
    { data: linesRaw },
    { data: historyRaw },
    { data: returnsRaw },
    { data: dabbiColoursRaw },
  ] = await Promise.all([
    supabase.from('labour_job_lines').select(`
      id, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id, brand_id,
      quantity_sent_gross, quantity_returned_gross, order_line_id,
      shape_designs(code, name),
      bindi_colours(code),
      sizes(code),
      dabbi_colours(code),
      brands(code, name)
    `).eq('labour_job_id', id).order('created_at'),
    supabase.from('labour_job_status_history').select('id, from_status, to_status, changed_at, reason')
      .eq('labour_job_id', id).order('changed_at'),
    supabase.from('labour_job_return_events').select(`
      id, return_date, notes, created_at,
      labour_job_return_lines(labour_job_line_id, quantity_returned_gross, variance_gross, variance_type)
    `).eq('labour_job_id', id).order('return_date'),
    supabase.from('dabbi_colours').select('id, code').order('code'),
  ])

  const lines = (linesRaw ?? []) as unknown as JobLineRow[]
  const history = (historyRaw ?? []) as unknown as StatusHistoryRow[]
  const returns = (returnsRaw ?? []) as unknown as ReturnEventRow[]
  const dabbiColours = (dabbiColoursRaw ?? []) as { id: string; code: string }[]

  const totalSent = lines.reduce((s, l) => s + Number(l.quantity_sent_gross), 0)
  const totalReturned = lines.reduce((s, l) => s + Number(l.quantity_returned_gross), 0)

  const jobLinesForReturn: JobLineForReturn[] = lines.map((l) => {
    const shape = resolveRef(l.shape_designs)
    const bindi = resolveRef(l.bindi_colours)
    const size = resolveRef(l.sizes)
    const dabbi = resolveRef(l.dabbi_colours)
    const brand = resolveRef(l.brands)
    return {
      id: l.id,
      shape: shape?.name ?? shape?.code ?? '—',
      bindi_colour: bindi?.code ?? '—',
      size: size?.code ?? '—',
      dabbi_colour: dabbi?.code ?? '—',
      dabbi_colour_id: l.dabbi_colour_id,
      brand: brand?.name ?? brand?.code ?? '—',
      quantity_sent_gross: Number(l.quantity_sent_gross),
      quantity_returned_gross: Number(l.quantity_returned_gross),
      available_dabbi_colours: dabbiColours,
    }
  })

  const isTerminal = ['returned_complete', 'cancelled_recalled'].includes(job.status)

  const metaLabel: CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', width: '140px', flexShrink: 0 }
  const metaValue: CSSProperties = { fontSize: 'var(--text-sm)' }
  const metaRow: CSSProperties = { display: 'flex', gap: '0.5rem', marginBottom: '0.3rem' }

  const tdNum: CSSProperties = { ...tableTd, textAlign: 'right', paddingRight: '1.5rem', fontVariantNumeric: 'tabular-nums' }
  const thNum: CSSProperties = { ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }

  const boundAction = recordLabourReturn.bind(null, id)

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1200px' }}>
      <PageHeader
        title={`Labour Job — ${lu ? `#${lu.serial_number} ${lu.name}` : '—'}`}
        backHref="/operations/labour-jobs"
        badge={<Badge variant={statusBadgeVariant(job.status)} label={job.status.replace(/_/g, ' ')} />}
        subtitle={job.id}
      />

      <Card style={{ marginBottom: '1.5rem' }}>
        <div style={metaRow}>
          <span style={metaLabel}>Assigned</span>
          <span style={metaValue}>{job.date_assigned}</span>
        </div>
        <div style={metaRow}>
          <span style={metaLabel}>Exp. Return</span>
          <span style={{ ...metaValue, color: job.expected_return_date ? undefined : 'var(--text-muted)' }}>
            {job.expected_return_date ?? '—'}
          </span>
        </div>
        <div style={metaRow}>
          <span style={metaLabel}>Actual Return</span>
          <span style={{ ...metaValue, color: job.actual_return_date ? undefined : 'var(--text-muted)' }}>
            {job.actual_return_date ?? '—'}
          </span>
        </div>
        <div style={metaRow}>
          <span style={metaLabel}>Total Sent</span>
          <span style={metaValue}>{fmt(totalSent)} gross</span>
        </div>
        <div style={metaRow}>
          <span style={metaLabel}>Total Returned</span>
          <span style={metaValue}>{fmt(totalReturned)} gross</span>
        </div>
        <div style={metaRow}>
          <span style={metaLabel}>WIP Remaining</span>
          <span style={{ ...metaValue, fontWeight: 'bold' }}>{fmt(Math.max(0, totalSent - totalReturned))} gross</span>
        </div>
        {job.notes && (
          <div style={metaRow}>
            <span style={metaLabel}>Notes</span>
            <span style={metaValue}>{job.notes}</span>
          </div>
        )}
      </Card>

      <SectionHeader title="Job Lines (Issued)" count={lines.length} />
      <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '750px' }}>
          <thead>
            <tr>
              <th style={tableTh}>Shape</th>
              <th style={tableTh}>Colour</th>
              <th style={tableTh}>Size</th>
              <th style={tableTh}>Dabbi</th>
              <th style={tableTh}>Brand</th>
              <th style={thNum}>Sent</th>
              <th style={thNum}>Returned</th>
              <th style={thNum}>WIP</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const shape = resolveRef(l.shape_designs)
              const bindi = resolveRef(l.bindi_colours)
              const size = resolveRef(l.sizes)
              const dabbi = resolveRef(l.dabbi_colours)
              const brand = resolveRef(l.brands)
              const sent = Number(l.quantity_sent_gross)
              const returned = Number(l.quantity_returned_gross)
              const wip = Math.max(0, sent - returned)
              return (
                <tr key={l.id}>
                  <td style={tableTd}>{shape?.name ?? shape?.code ?? '—'}</td>
                  <td style={tableTd}>{bindi?.code ?? '—'}</td>
                  <td style={tableTd}>{size?.code ?? '—'}</td>
                  <td style={tableTd}>{dabbi?.code ?? '—'}</td>
                  <td style={tableTd}>{brand?.name ?? brand?.code ?? '—'}</td>
                  <td style={tdNum}>{fmt(sent)}</td>
                  <td style={{ ...tdNum, color: 'var(--text-secondary)' }}>{fmt(returned)}</td>
                  <td style={{ ...tdNum, fontWeight: wip > 0 ? 'bold' : undefined }}>{fmt(wip)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {returns.length > 0 && (
        <>
          <SectionHeader title="Return History" count={returns.length} />
          <div style={{ marginBottom: '2rem' }}>
            {returns.map((ev) => {
              const evLines = Array.isArray(ev.labour_job_return_lines) ? ev.labour_job_return_lines : []
              const evTotal = evLines.reduce((s, l) => s + Number(l.quantity_returned_gross), 0)
              return (
                <div key={ev.id} style={{ borderLeft: '2px solid var(--border)', paddingLeft: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: 'var(--text-sm)', marginBottom: '0.2rem' }}>
                    <strong>{ev.return_date}</strong>
                    {' — '}
                    {fmt(evTotal)} gross returned across {evLines.length} line{evLines.length !== 1 ? 's' : ''}
                  </div>
                  {ev.notes && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{ev.notes}</div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {!isTerminal && (
        <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <EditJobForm jobId={id} currentExpectedReturn={job.expected_return_date} currentNotes={job.notes} />
          <ForceCloseForm jobId={id} wipQty={Math.max(0, totalSent - totalReturned)} />
        </div>
      )}

      {!isTerminal && lines.some((l) => Number(l.quantity_returned_gross) < Number(l.quantity_sent_gross)) && (
        <>
          <SectionHeader title="Record Return" />
          <ReturnForm jobId={id} jobLines={jobLinesForReturn} dabbiColours={dabbiColours} action={boundAction} />
        </>
      )}

      {isTerminal && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          This job is {job.status.replace(/_/g, ' ')} — no further returns can be recorded.
        </p>
      )}

      <SectionHeader title="Status History" />
      <table style={{ borderCollapse: 'collapse', maxWidth: '600px' }}>
        <thead>
          <tr>
            <th style={tableTh}>Timestamp</th>
            <th style={tableTh}>From</th>
            <th style={tableTh}>To</th>
            <th style={tableTh}>Reason</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.id}>
              <td style={{ ...tableTd, color: 'var(--text-secondary)' }}>{new Date(h.changed_at).toLocaleString()}</td>
              <td style={{ ...tableTd, color: 'var(--text-muted)' }}>{h.from_status ?? '—'}</td>
              <td style={tableTd}>{h.to_status}</td>
              <td style={{ ...tableTd, color: 'var(--text-secondary)' }}>{h.reason ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
