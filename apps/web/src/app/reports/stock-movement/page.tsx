import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ReportHeader } from '@/components/reports/ReportHeader'
import { ReportFilterBar } from '@/components/reports/ReportFilterBar'
import type { FilterField, ActiveFilters } from '@stock-brain/types'
import { tableTh, tableTd } from '@/lib/ui'
import type { CSSProperties } from 'react'

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

type Stage = 'velvet' | 'cuttings' | 'wip' | 'ready'
type Direction = 'in' | 'out' | 'correction'

type MovementEntry = {
  id: string
  date: string
  stage: Stage
  direction: Direction
  sku: string
  qty: number
  qty_unit: string
  source: string
  reference: string | null
  notes: string | null
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function StockMovementReportPage({ searchParams }: PageProps) {
  const params = await searchParams

  // Default date range: last 7 days
  const defaultFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!
  const defaultTo   = new Date().toISOString().split('T')[0]!

  const dateFrom    = typeof params.dateFrom === 'string' ? params.dateFrom : defaultFrom
  const dateTo      = typeof params.dateTo   === 'string' ? params.dateTo   : defaultTo
  const stageIds    = typeof params.stage    === 'string' ? params.stage.split(',').filter(Boolean)  : []
  const designIds   = typeof params.design   === 'string' ? params.design.split(',').filter(Boolean) : []
  const clrIds      = typeof params.clr      === 'string' ? params.clr.split(',').filter(Boolean)    : []
  const movTypeFilter = typeof params.movType === 'string' ? params.movType : ''

  const supabase = createServerSupabaseClient()

  type LookupRow = { id: string; code: string; name?: string | null }

  const [shapesResult, bindisResult, sizesResult,
         velvetResult, cuttingResult, labourResult, dispatchResult] = await Promise.allSettled([
    supabase.from('shape_designs').select('id, code, name').order('sort_order'),
    supabase.from('bindi_colours').select('id, code').order('sort_order'),
    supabase.from('sizes').select('id, code').order('sort_order'),

    // Velvet receipts
    supabase
      .from('velvet_receipts')
      .select('id, receipt_date, metres_received, bundles_received, supplier, reference, notes')
      .gte('receipt_date', dateFrom)
      .lte('receipt_date', dateTo)
      .order('receipt_date', { ascending: false }),

    // Cutting sessions (confirmed) with lines
    supabase
      .from('cutting_sessions')
      .select(`
        id, session_date,
        machines(name),
        cutting_session_lines(id, shape_design_id, bindi_colour_id, size_id, quantity_gross)
      `)
      .eq('status', 'confirmed')
      .gte('session_date', dateFrom)
      .lte('session_date', dateTo)
      .order('session_date', { ascending: false }),

    // Labour jobs with lines
    supabase
      .from('labour_jobs')
      .select(`
        id, date_assigned,
        labour_units(name),
        labour_job_lines(id, shape_design_id, bindi_colour_id, size_id, quantity_sent_gross, quantity_returned_gross)
      `)
      .gte('date_assigned', dateFrom)
      .lte('date_assigned', dateTo)
      .order('date_assigned', { ascending: false }),

    // Dispatch events (confirmed) with lines
    supabase
      .from('dispatch_events')
      .select(`
        id, dispatch_date, reference,
        customers(name),
        dispatch_lines(id, quantity_dispatched, line_type)
      `)
      .eq('status', 'confirmed')
      .gte('dispatch_date', dateFrom)
      .lte('dispatch_date', dateTo)
      .order('dispatch_date', { ascending: false }),
  ])

  const shapes = shapesResult.status === 'fulfilled' ? (shapesResult.value.data ?? []) as LookupRow[] : []
  const bindis = bindisResult.status === 'fulfilled' ? (bindisResult.value.data ?? []) as LookupRow[] : []
  const sizes  = sizesResult.status === 'fulfilled'  ? (sizesResult.value.data ?? []) as LookupRow[]  : []

  const shapeMap = new Map(shapes.map((s) => [s.id, s.name ?? s.code]))
  const bindiMap = new Map(bindis.map((c) => [c.id, c.code]))
  const sizeMap  = new Map(sizes.map((s)  => [s.id, s.code]))

  function skuLabel(designId: string, clrId: string, sizeId: string): string {
    return [shapeMap.get(designId) ?? '?', bindiMap.get(clrId) ?? '?', sizeMap.get(sizeId) ?? '?'].join(' ')
  }

  const movements: MovementEntry[] = []

  // Velvet receipts → IN to velvet
  type VelvetReceipt = { id: string; receipt_date: string; metres_received: number | string | null; bundles_received: number | string | null; supplier: string | null; reference: string | null; notes: string | null }
  const velvetRows = velvetResult.status === 'fulfilled' ? (velvetResult.value.data ?? []) as unknown as VelvetReceipt[] : []
  for (const r of velvetRows) {
    movements.push({
      id:        `vr-${r.id}`,
      date:      r.receipt_date,
      stage:     'velvet',
      direction: 'in',
      sku:       'Standard Velvet',
      qty:       Number(r.metres_received ?? r.bundles_received ?? 0),
      qty_unit:  'metres',
      source:    'Velvet Receipt',
      reference: r.reference ?? r.supplier,
      notes:     r.notes,
    })
  }

  // Cutting sessions → IN to cuttings (one row per line)
  type CuttingLine = { id: string; shape_design_id: string; bindi_colour_id: string; size_id: string; quantity_gross: number | string }
  type CuttingSession = { id: string; session_date: string; machines: { name: string } | { name: string }[] | null; cutting_session_lines: CuttingLine[] | null }
  const cuttingSessions = cuttingResult.status === 'fulfilled' ? (cuttingResult.value.data ?? []) as unknown as CuttingSession[] : []
  for (const session of cuttingSessions) {
    const machineRaw = Array.isArray(session.machines) ? session.machines[0] : session.machines
    const machineName = machineRaw?.name ?? 'Machine'
    for (const line of session.cutting_session_lines ?? []) {
      const sku = skuLabel(line.shape_design_id, line.bindi_colour_id, line.size_id)
      if (designIds.length > 0 && !designIds.includes(line.shape_design_id)) continue
      if (clrIds.length > 0    && !clrIds.includes(line.bindi_colour_id))    continue
      movements.push({
        id:        `cl-${line.id}`,
        date:      session.session_date,
        stage:     'cuttings',
        direction: 'in',
        sku,
        qty:       Number(line.quantity_gross),
        qty_unit:  'gross',
        source:    'Cutting Session',
        reference: machineName,
        notes:     null,
      })
    }
  }

  // Labour job lines → OUT from cuttings + IN to WIP (issued), OUT from WIP (returned → ready)
  type LabourLine = { id: string; shape_design_id: string; bindi_colour_id: string; size_id: string; quantity_sent_gross: number | string; quantity_returned_gross: number | string }
  type LabourJob = { id: string; date_assigned: string; labour_units: { name: string } | { name: string }[] | null; labour_job_lines: LabourLine[] | null }
  const labourJobs = labourResult.status === 'fulfilled' ? (labourResult.value.data ?? []) as unknown as LabourJob[] : []
  for (const job of labourJobs) {
    const unitRaw  = Array.isArray(job.labour_units) ? job.labour_units[0] : job.labour_units
    const unitName = unitRaw?.name ?? 'Labour'
    for (const line of job.labour_job_lines ?? []) {
      const sku     = skuLabel(line.shape_design_id, line.bindi_colour_id, line.size_id)
      const issued  = Number(line.quantity_sent_gross)
      const returned = Number(line.quantity_returned_gross)
      if (designIds.length > 0 && !designIds.includes(line.shape_design_id)) continue
      if (clrIds.length > 0    && !clrIds.includes(line.bindi_colour_id))    continue
      if (issued > 0) {
        movements.push({
          id:        `lj-out-${line.id}`,
          date:      job.date_assigned,
          stage:     'cuttings',
          direction: 'out',
          sku,
          qty:       issued,
          qty_unit:  'gross',
          source:    'Labour Issue',
          reference: unitName,
          notes:     null,
        })
        movements.push({
          id:        `lj-in-${line.id}`,
          date:      job.date_assigned,
          stage:     'wip',
          direction: 'in',
          sku,
          qty:       issued,
          qty_unit:  'gross',
          source:    'Labour Issue',
          reference: unitName,
          notes:     null,
        })
      }
      if (returned > 0) {
        movements.push({
          id:        `lj-ret-${line.id}`,
          date:      job.date_assigned,
          stage:     'wip',
          direction: 'out',
          sku,
          qty:       returned,
          qty_unit:  'gross',
          source:    'Labour Return',
          reference: unitName,
          notes:     null,
        })
      }
    }
  }

  // Dispatch events → OUT from ready
  type DispatchLine = { id: string; quantity_dispatched: number | string; line_type: string }
  type DispatchEvent = { id: string; dispatch_date: string; reference: string | null; customers: { name: string } | { name: string }[] | null; dispatch_lines: DispatchLine[] | null }
  const dispatchEvents = dispatchResult.status === 'fulfilled' ? (dispatchResult.value.data ?? []) as unknown as DispatchEvent[] : []
  for (const event of dispatchEvents) {
    const custRaw   = Array.isArray(event.customers) ? event.customers[0] : event.customers
    const custName  = custRaw?.name ?? 'Customer'
    const totalQty  = (event.dispatch_lines ?? []).reduce((s, l) => s + Number(l.quantity_dispatched), 0)
    if (totalQty > 0) {
      movements.push({
        id:        `de-${event.id}`,
        date:      event.dispatch_date,
        stage:     'ready',
        direction: 'out',
        sku:       `(${(event.dispatch_lines ?? []).length} SKUs)`,
        qty:       totalQty,
        qty_unit:  'gross',
        source:    'Dispatch',
        reference: event.reference ?? custName,
        notes:     null,
      })
    }
  }

  // Sort: newest first
  movements.sort((a, b) => b.date.localeCompare(a.date))

  // Apply stage / direction filters
  let filtered = movements
  if (stageIds.length > 0)  filtered = filtered.filter((m) => stageIds.includes(m.stage))
  if (movTypeFilter === 'in')          filtered = filtered.filter((m) => m.direction === 'in')
  if (movTypeFilter === 'out')         filtered = filtered.filter((m) => m.direction === 'out')
  if (movTypeFilter === 'corrections') filtered = filtered.filter((m) => m.direction === 'correction')

  // Stage summaries
  type StageSummary = { in: number; out: number; unit: string }
  const stageSums: Record<string, StageSummary> = {
    velvet:   { in: 0, out: 0, unit: 'metres' },
    cuttings: { in: 0, out: 0, unit: 'gross' },
    wip:      { in: 0, out: 0, unit: 'gross' },
    ready:    { in: 0, out: 0, unit: 'gross' },
  }
  for (const m of movements) {
    if (m.direction === 'in')  stageSums[m.stage]!.in  += m.qty
    if (m.direction === 'out') stageSums[m.stage]!.out += m.qty
  }

  const todayStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  const filters: FilterField[] = [
    { key: 'dateFrom', label: 'From', options: [], inputType: 'date' },
    { key: 'dateTo',   label: 'To',   options: [], inputType: 'date' },
    {
      key: 'stage',
      label: 'Stage',
      options: [
        { id: 'velvet',   label: 'Velvet' },
        { id: 'cuttings', label: 'Cuttings' },
        { id: 'wip',      label: 'WIP' },
        { id: 'ready',    label: 'Ready' },
      ],
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
      key: 'movType',
      label: 'Movement',
      options: [
        { id: 'in',          label: 'IN only' },
        { id: 'out',         label: 'OUT only' },
        { id: 'corrections', label: 'Corrections' },
      ],
    },
  ]

  const activeFilters: ActiveFilters = {
    dateFrom: [dateFrom],
    dateTo:   [dateTo],
    stage:    stageIds,
    design:   designIds,
    clr:      clrIds,
    movType:  movTypeFilter ? [movTypeFilter] : [],
  }

  const reportFilters = [
    { label: 'From',  value: dateFrom },
    { label: 'To',    value: dateTo },
    { label: 'Stage', value: stageIds.length > 0 ? stageIds.join(', ') : 'All' },
    { label: 'Date',  value: todayStr },
  ]

  const tdNum: CSSProperties = { ...tableTd, textAlign: 'right', paddingRight: '1rem', fontVariantNumeric: 'tabular-nums' }
  const thNum: CSSProperties = { ...tableTh, textAlign: 'right', paddingRight: '1rem' }

  const stageLabels: Record<Stage, string> = {
    velvet: 'Velvet', cuttings: 'Cuttings', wip: 'WIP (With Labour)', ready: 'Ready Stock',
  }
  const stageColors: Record<Stage, string> = {
    velvet: 'var(--warning)', cuttings: 'var(--info)', wip: 'var(--warning)', ready: 'var(--success)',
  }

  return (
    <main className="print-portrait" style={{ padding: '1.5rem 2rem', maxWidth: '1400px' }}>
      <ReportHeader reportName="STOCK MOVEMENT REPORT" filters={reportFilters} />
      <ReportFilterBar filters={filters} activeFilters={activeFilters} printLabel="Print" />

      {/* Stage summary cards */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        {(['velvet', 'cuttings', 'wip', 'ready'] as Stage[]).map((stage) => {
          const s    = stageSums[stage]!
          const net  = s.in - s.out
          const col  = stageColors[stage]
          return (
            <div key={stage} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderLeft: `3px solid ${col}`, borderRadius: 'var(--radius-md)', padding: '0.9rem 1.1rem', minWidth: '200px', flex: '1 0 200px' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: col, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>{stageLabels[stage]}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.3rem', fontSize: 'var(--text-sm)' }}>
                <div style={{ color: 'var(--success)' }}>+{fmt(s.in)}</div>
                <div style={{ color: 'var(--danger)' }}>-{fmt(s.out)}</div>
                <div style={{ color: net >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{net >= 0 ? `+${fmt(net)}` : fmt(net)}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>IN</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>OUT</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>NET</div>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>{s.unit}</div>
            </div>
          )
        })}
      </div>

      {/* Movement log */}
      <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Movement Log — {dateFrom} to {dateTo}
      </h2>

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>No movements in this date range.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '900px' }}>
            <thead>
              <tr>
                <th style={tableTh}>Date</th>
                <th style={tableTh}>Stage</th>
                <th style={tableTh}>IN/OUT</th>
                <th style={tableTh}>SKU</th>
                <th style={thNum}>Qty</th>
                <th style={tableTh}>Unit</th>
                <th style={tableTh}>Source</th>
                <th style={tableTh}>Reference</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const isIn  = m.direction === 'in'
                const isOut = m.direction === 'out'
                const rowBg = m.direction === 'correction' ? 'rgba(255,184,0,0.05)' : undefined
                return (
                  <tr
                    key={m.id}
                    style={{
                      background: rowBg,
                      borderLeft: `3px solid ${isIn ? 'var(--success)' : isOut ? 'var(--danger)' : 'var(--warning)'}`,
                    }}
                  >
                    <td style={tableTd}>{new Date(m.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                    <td style={{ ...tableTd, color: stageColors[m.stage], fontWeight: 600 }}>{stageLabels[m.stage]}</td>
                    <td style={tableTd}>
                      <span style={{ fontSize: 'var(--text-xs)', padding: '0.1rem 0.4rem', borderRadius: 'var(--radius-sm)', background: isIn ? 'var(--success-subtle)' : isOut ? 'var(--danger-subtle)' : 'var(--warning-subtle)', color: isIn ? 'var(--success)' : isOut ? 'var(--danger)' : 'var(--warning)', fontWeight: 700 }}>
                        {m.direction === 'correction' ? 'CORR' : m.direction.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ ...tableTd, maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.sku}</td>
                    <td style={{ ...tdNum, color: isIn ? 'var(--success)' : isOut ? 'var(--danger)' : 'var(--text-primary)', fontWeight: 600 }}>
                      {isIn ? `+${fmt(m.qty)}` : isOut ? `-${fmt(m.qty)}` : fmt(m.qty)}
                    </td>
                    <td style={{ ...tableTd, color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{m.qty_unit}</td>
                    <td style={{ ...tableTd, color: 'var(--text-secondary)' }}>{m.source}</td>
                    <td style={{ ...tableTd, color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{m.reference ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
