import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ReportHeader } from '@/components/reports/ReportHeader'
import { ReportFilterBar } from '@/components/reports/ReportFilterBar'
import { Badge } from '@/components/ui/Badge'
import type { FilterField, ActiveFilters } from '@stock-brain/types'
import { tableTh, tableTd } from '@/lib/ui'
import type { CSSProperties } from 'react'

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals)
}

function pct(n: number): string {
  return `${fmt(n)}%`
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

type FulfilmentRow = {
  id: string
  dispatch_event_id: string
  order_id: string
  order_line_id: string | null
  ordered_qty: number | string
  actual_qty: number | string
  line_type: string
  colour_match: boolean
  qty_match: boolean
  fulfilment_pct: number | string
  ordered_sku: Record<string, string>
  actual_sku: Record<string, string>
  created_at: string
}

export default async function FulfilmentDashboardPage({ searchParams }: PageProps) {
  const params = await searchParams

  const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!
  const defaultTo   = new Date().toISOString().split('T')[0]!

  const dateFrom      = typeof params.dateFrom    === 'string' ? params.dateFrom    : defaultFrom
  const dateTo        = typeof params.dateTo      === 'string' ? params.dateTo      : defaultTo
  const customerIds   = typeof params.customer    === 'string' ? params.customer.split(',').filter(Boolean) : []
  const lineTypeIds   = typeof params.lineType    === 'string' ? params.lineType.split(',').filter(Boolean) : []
  const thresholdStr  = typeof params.threshold   === 'string' ? params.threshold   : ''
  const threshold     = thresholdStr ? Number(thresholdStr) : null

  const supabase = createServerSupabaseClient()

  const [recordsResult, customersResult, shapesResult, coloursResult, sizesResult] = await Promise.all([
    supabase
      .from('fulfilment_records')
      .select(`
        id, dispatch_event_id, order_id, order_line_id,
        ordered_qty, actual_qty, line_type, colour_match, qty_match,
        fulfilment_pct, ordered_sku, actual_sku, created_at,
        orders(customer_id, customers(name))
      `)
      .gte('created_at', `${dateFrom}T00:00:00`)
      .lte('created_at', `${dateTo}T23:59:59`)
      .order('created_at', { ascending: false }),

    supabase.from('customers').select('id, name').order('name'),
    supabase.from('shape_designs').select('id, code, name').order('sort_order'),
    supabase.from('bindi_colours').select('id, code').order('sort_order'),
    supabase.from('sizes').select('id, code').order('sort_order'),
  ])

  const allRecords = (recordsResult.data ?? []) as unknown as (FulfilmentRow & {
    orders: { customer_id: string; customers: { name: string } | null } | null
  })[]

  const shapeMap    = new Map((shapesResult.data ?? []).map((r) => [r.id as string, (r.name ?? r.code) as string]))
  const colourMap   = new Map((coloursResult.data ?? []).map((r) => [r.id as string, r.code as string]))
  const sizeMap     = new Map((sizesResult.data ?? []).map((r) => [r.id as string, r.code as string]))
  const customerMap = new Map((customersResult.data ?? []).map((r) => [r.id as string, r.name as string]))
  const customers   = customersResult.data ?? []

  function skuLabel(sku: Record<string, string>): string {
    if (!sku) return '?'
    return [shapeMap.get(sku.shape_design_id), colourMap.get(sku.bindi_colour_id), sizeMap.get(sku.size_id)].filter(Boolean).join(' ')
  }

  // Apply customer + line type filters
  let records = allRecords
  if (customerIds.length > 0) {
    records = records.filter((r) => {
      const cid = r.orders?.customer_id
      return cid ? customerIds.includes(cid) : false
    })
  }
  if (lineTypeIds.length > 0) {
    records = records.filter((r) => lineTypeIds.includes(r.line_type))
  }

  // ── Section 1: Executive summary ──────────────────────────────
  const orderedRecords   = records.filter((r) => r.line_type !== 'extra')
  const totalOrdered     = orderedRecords.reduce((s, r) => s + Number(r.ordered_qty), 0)
  const totalActual      = orderedRecords.reduce((s, r) => s + Number(r.actual_qty), 0)
  const overallPct       = totalOrdered > 0 ? Math.min(totalActual / totalOrdered * 100, 100) : 100
  const colourMatchPct   = orderedRecords.length > 0 ? orderedRecords.filter((r) => r.colour_match).length / orderedRecords.length * 100 : 100
  const qtyMatchPct      = orderedRecords.length > 0 ? orderedRecords.filter((r) => r.qty_match).length / orderedRecords.length * 100 : 100
  const substitutionCount = records.filter((r) => r.line_type === 'substitute').length
  const shortCount        = records.filter((r) => r.line_type === 'short').length

  const statColor = (pctVal: number, good = 95, warn = 80) =>
    pctVal >= good ? 'var(--success)' : pctVal >= warn ? 'var(--warning)' : 'var(--danger)'

  // ── Section 2: Customer scorecard ──────────────────────────────
  type CustomerScorecard = {
    id: string
    name: string
    dispatchLines: number
    orderedQty: number
    actualQty: number
    fulfilmentPct: number
    colourMatchPct: number
    subCount: number
    shortCount: number
  }
  const scorecardMap = new Map<string, CustomerScorecard>()
  for (const r of records) {
    const cid  = r.orders?.customer_id
    if (!cid) continue
    const name = customerMap.get(cid) ?? '?'
    const prev = scorecardMap.get(cid) ?? { id: cid, name, dispatchLines: 0, orderedQty: 0, actualQty: 0, fulfilmentPct: 0, colourMatchPct: 0, subCount: 0, shortCount: 0 }
    prev.dispatchLines++
    if (r.line_type !== 'extra') {
      prev.orderedQty += Number(r.ordered_qty)
      prev.actualQty  += Number(r.actual_qty)
    }
    if (!r.colour_match) prev.subCount++
    if (r.line_type === 'short') prev.shortCount++
    scorecardMap.set(cid, prev)
  }
  let customerScorecard = [...scorecardMap.values()].map((s) => ({
    ...s,
    fulfilmentPct:  s.orderedQty > 0 ? Math.min(s.actualQty / s.orderedQty * 100, 100) : 100,
    colourMatchPct: s.dispatchLines > 0 ? (s.dispatchLines - s.subCount) / s.dispatchLines * 100 : 100,
  })).sort((a, b) => a.fulfilmentPct - b.fulfilmentPct)

  if (threshold !== null) {
    customerScorecard = customerScorecard.filter((c) => c.fulfilmentPct < threshold)
  }

  // ── Section 3: SKU Analysis ────────────────────────────────────
  type SkuStat = { key: string; label: string; timesOrdered: number; timesShort: number; timesSub: number; totalOrdered: number; totalActual: number }
  const skuMap = new Map<string, SkuStat>()
  for (const r of records.filter((x) => x.line_type !== 'extra')) {
    const sku = r.ordered_sku
    if (!sku) continue
    const key   = `${sku.shape_design_id}|${sku.bindi_colour_id}|${sku.size_id}`
    const label = skuLabel(sku)
    const prev  = skuMap.get(key) ?? { key, label, timesOrdered: 0, timesShort: 0, timesSub: 0, totalOrdered: 0, totalActual: 0 }
    prev.timesOrdered++
    prev.totalOrdered += Number(r.ordered_qty)
    prev.totalActual  += Number(r.actual_qty)
    if (r.line_type === 'short')      prev.timesShort++
    if (r.line_type === 'substitute') prev.timesSub++
    skuMap.set(key, prev)
  }
  const skuStats = [...skuMap.values()]
    .map((s) => ({ ...s, avgFulfilmentPct: s.totalOrdered > 0 ? Math.min(s.totalActual / s.totalOrdered * 100, 100) : 100 }))
    .sort((a, b) => b.timesSub - a.timesSub)

  // ── Section 4: Substitution log ───────────────────────────────
  const subLog = records.filter((r) => r.line_type === 'substitute')

  const todayStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  const filters: FilterField[] = [
    { key: 'dateFrom',  label: 'From', options: [], inputType: 'date' },
    { key: 'dateTo',    label: 'To',   options: [], inputType: 'date' },
    {
      key: 'customer',
      label: 'Customer',
      options: customers.map((c) => ({ id: c.id as string, label: c.name as string })),
      multiSelect: true,
    },
    {
      key: 'lineType',
      label: 'Line Type',
      options: [
        { id: 'ordered',    label: 'Ordered' },
        { id: 'substitute', label: 'Substitute' },
        { id: 'extra',      label: 'Extra' },
        { id: 'short',      label: 'Short' },
      ],
      multiSelect: true,
    },
  ]

  const activeFilters: ActiveFilters = {
    dateFrom:  [dateFrom],
    dateTo:    [dateTo],
    customer:  customerIds,
    lineType:  lineTypeIds,
  }

  const customerLabel = customerIds.length > 0
    ? customerIds.map((id) => customerMap.get(id) ?? id).join(', ')
    : 'All Customers'

  const reportFilters = [
    { label: 'From',     value: dateFrom },
    { label: 'To',       value: dateTo },
    { label: 'Customer', value: customerLabel },
    { label: 'Date',     value: todayStr },
  ]

  const tdNum: CSSProperties = { ...tableTd, textAlign: 'right', paddingRight: '1rem', fontVariantNumeric: 'tabular-nums' }
  const thNum: CSSProperties = { ...tableTh, textAlign: 'right', paddingRight: '1rem' }

  function scorecardRowColor(pct: number): string | undefined {
    if (pct < 90) return 'rgba(255,71,87,0.05)'
    if (pct < 95) return 'rgba(255,184,0,0.05)'
    return undefined
  }

  return (
    <main className="print-portrait" style={{ padding: '1.5rem 2rem', maxWidth: '1400px' }}>
      <ReportHeader reportName="FULFILMENT DEEP DIVE" filters={reportFilters} />
      <ReportFilterBar filters={filters} activeFilters={activeFilters} printLabel="Print" />

      {/* ── Section 1: Executive Summary ───────────────────── */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
          Executive Summary
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
          {[
            { label: 'Overall Fulfilment', value: pct(overallPct),       color: statColor(overallPct) },
            { label: 'Colour Match',       value: pct(colourMatchPct),    color: statColor(colourMatchPct, 90, 75) },
            { label: 'Qty Match',          value: pct(qtyMatchPct),       color: statColor(qtyMatchPct, 90, 75) },
            { label: 'Substitutions',      value: String(substitutionCount), color: substitutionCount > 0 ? 'var(--warning)' : 'var(--success)' },
            { label: 'Short Shipments',    value: String(shortCount),     color: shortCount > 0 ? 'var(--danger)' : 'var(--success)' },
            { label: 'Total Records',      value: String(records.length), color: 'var(--text-primary)' },
          ].map((card) => (
            <div key={card.label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', padding: '0.9rem 1rem' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>{card.label}</div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: card.color }}>{card.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Section 2: Customer Scorecard ──────────────────── */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
            Customer Scorecard
          </h2>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>sorted: worst first</span>
        </div>
        {customerScorecard.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>No customer data in this period.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '800px' }}>
              <thead>
                <tr>
                  <th style={tableTh}>Customer</th>
                  <th style={thNum}>Lines</th>
                  <th style={thNum}>Ordered</th>
                  <th style={thNum}>Sent</th>
                  <th style={thNum}>Fulfilment %</th>
                  <th style={thNum}>Colour Match %</th>
                  <th style={thNum}>Subs</th>
                  <th style={thNum}>Shorts</th>
                </tr>
              </thead>
              <tbody>
                {customerScorecard.map((row) => (
                  <tr key={row.id} style={{ background: scorecardRowColor(row.fulfilmentPct) }}>
                    <td style={tableTd}>{row.name}</td>
                    <td style={tdNum}>{row.dispatchLines}</td>
                    <td style={tdNum}>{fmt(row.orderedQty, 0)}</td>
                    <td style={tdNum}>{fmt(row.actualQty, 0)}</td>
                    <td style={{ ...tdNum, fontWeight: 700, color: statColor(row.fulfilmentPct) }}>{pct(row.fulfilmentPct)}</td>
                    <td style={{ ...tdNum, color: statColor(row.colourMatchPct, 90, 75) }}>{pct(row.colourMatchPct)}</td>
                    <td style={{ ...tdNum, color: row.subCount > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>{row.subCount || '—'}</td>
                    <td style={{ ...tdNum, color: row.shortCount > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{row.shortCount || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 3: SKU Analysis ─────────────────────────── */}
      <div style={{ marginBottom: '2rem', pageBreakBefore: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
            SKU Analysis
          </h2>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>sorted: most substituted first</span>
        </div>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '0 0 0.75rem' }}>
          Chronic = substituted ≥5 times
        </p>
        {skuStats.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>No SKU data in this period.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '900px' }}>
              <thead>
                <tr>
                  <th style={tableTh}>SKU</th>
                  <th style={thNum}>Times Ordered</th>
                  <th style={thNum}>Times Short</th>
                  <th style={thNum}>Times Sub</th>
                  <th style={thNum}>Avg Fulfil %</th>
                  <th style={tableTh}>Flag</th>
                </tr>
              </thead>
              <tbody>
                {skuStats.slice(0, 30).map((s) => {
                  const isChronic = s.timesSub >= 5
                  return (
                    <tr key={s.key}>
                      <td style={tableTd}>{s.label}</td>
                      <td style={tdNum}>{s.timesOrdered}</td>
                      <td style={{ ...tdNum, color: s.timesShort > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{s.timesShort || '—'}</td>
                      <td style={{ ...tdNum, fontWeight: isChronic ? 700 : 400, color: s.timesSub > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>{s.timesSub || '—'}</td>
                      <td style={{ ...tdNum, color: statColor(s.avgFulfilmentPct) }}>{pct(s.avgFulfilmentPct)}</td>
                      <td style={tableTd}>
                        {isChronic && <Badge variant="danger" label="Chronic" size="sm" />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 4: Substitution Log ─────────────────────── */}
      <div style={{ marginBottom: '2rem', pageBreakBefore: 'auto' }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
          Substitution Log
        </h2>
        {subLog.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>No substitutions in this period.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '900px' }}>
              <thead>
                <tr>
                  <th style={tableTh}>Date</th>
                  <th style={tableTh}>Customer</th>
                  <th style={tableTh}>Ordered SKU</th>
                  <th style={tableTh}>Sent SKU</th>
                  <th style={thNum}>Qty</th>
                </tr>
              </thead>
              <tbody>
                {subLog.slice(0, 50).map((r) => {
                  const cid  = r.orders?.customer_id
                  const name = cid ? customerMap.get(cid) ?? '?' : '?'
                  return (
                    <tr key={r.id}>
                      <td style={tableTd}>{new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                      <td style={tableTd}>{name}</td>
                      <td style={tableTd}>{skuLabel(r.ordered_sku ?? {})}</td>
                      <td style={{ ...tableTd, color: 'var(--warning)' }}>{skuLabel(r.actual_sku ?? {})}</td>
                      <td style={tdNum}>{fmt(Number(r.actual_qty), 0)}</td>
                    </tr>
                  )
                })}
              </tbody>
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
