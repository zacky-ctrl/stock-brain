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

type DispatchRow = {
  id: string
  dispatch_date: string
  reference: string | null
  customer_id: string
  customer_name: string
  total_gross: number
  ordered_gross: number
  extra_gross: number
  line_count: number
  sub_count: number
  extra_count: number
  short_count: number
}

export default async function DispatchHistoryReportPage({ searchParams }: PageProps) {
  const params = await searchParams

  const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!
  const defaultTo   = new Date().toISOString().split('T')[0]!

  const dateFrom    = typeof params.dateFrom    === 'string' ? params.dateFrom    : defaultFrom
  const dateTo      = typeof params.dateTo      === 'string' ? params.dateTo      : defaultTo
  const customerIds = typeof params.customer    === 'string' ? params.customer.split(',').filter(Boolean) : []
  const refSearch   = typeof params.reference   === 'string' ? params.reference.toLowerCase() : ''

  const supabase = createServerSupabaseClient()

  const [customersResult, dispatchResult] = await Promise.allSettled([
    supabase.from('customers').select('id, name').order('name'),
    supabase
      .from('dispatch_events')
      .select(`
        id, dispatch_date, reference, status, customer_id,
        customers(name),
        dispatch_lines(id, quantity_dispatched, line_type)
      `)
      .eq('status', 'confirmed')
      .gte('dispatch_date', dateFrom)
      .lte('dispatch_date', dateTo)
      .order('dispatch_date', { ascending: false }),
  ])

  const customers = customersResult.status === 'fulfilled' ? (customersResult.value.data ?? []) : []

  type RawDispatchLine = { id: string; quantity_dispatched: number | string; line_type: string }
  type RawDispatch = {
    id: string
    dispatch_date: string
    reference: string | null
    status: string
    customer_id: string
    customers: { name: string } | { name: string }[] | null
    dispatch_lines: RawDispatchLine[] | null
  }

  const dispatchRaw = dispatchResult.status === 'fulfilled'
    ? (dispatchResult.value.data ?? []) as unknown as RawDispatch[]
    : []

  const dispatchRows: DispatchRow[] = []
  for (const d of dispatchRaw) {
    const custRaw = Array.isArray(d.customers) ? d.customers[0] : d.customers
    if (!custRaw) continue
    const lines        = d.dispatch_lines ?? []
    const orderedGross = lines.filter((l) => l.line_type !== 'extra').reduce((s, l) => s + Number(l.quantity_dispatched), 0)
    const extraGross   = lines.filter((l) => l.line_type === 'extra').reduce((s, l) => s + Number(l.quantity_dispatched), 0)
    const totalGross   = orderedGross + extraGross
    const subCount     = lines.filter((l) => l.line_type === 'substitute').length
    const extraCount   = lines.filter((l) => l.line_type === 'extra').length
    const shortCount   = lines.filter((l) => l.line_type === 'short').length
    dispatchRows.push({
      id:            d.id,
      dispatch_date: d.dispatch_date,
      reference:     d.reference,
      customer_id:   d.customer_id,
      customer_name: custRaw.name,
      total_gross:   totalGross,
      ordered_gross: orderedGross,
      extra_gross:   extraGross,
      line_count:    lines.length,
      sub_count:     subCount,
      extra_count:   extraCount,
      short_count:   shortCount,
    })
  }

  let filtered = dispatchRows
  if (customerIds.length > 0) filtered = filtered.filter((d) => customerIds.includes(d.customer_id))
  if (refSearch) filtered = filtered.filter((d) => (d.reference ?? '').toLowerCase().includes(refSearch) || d.customer_name.toLowerCase().includes(refSearch))

  const totalDispatches  = filtered.length
  const totalGrossAll    = filtered.reduce((s, d) => s + d.total_gross, 0)
  const uniqueCustomers  = new Set(filtered.map((d) => d.customer_id)).size
  const avgParcelSize    = totalDispatches > 0 ? totalGrossAll / totalDispatches : 0

  const customerMap = new Map(customers.map((c) => [c.id as string, c.name as string]))
  const todayStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  const filters: FilterField[] = [
    { key: 'dateFrom',   label: 'From',      options: [], inputType: 'date' },
    { key: 'dateTo',     label: 'To',        options: [], inputType: 'date' },
    {
      key: 'customer',
      label: 'Customer',
      options: customers.map((c) => ({ id: c.id as string, label: c.name as string })),
      multiSelect: true,
    },
  ]

  const activeFilters: ActiveFilters = {
    dateFrom:  [dateFrom],
    dateTo:    [dateTo],
    customer:  customerIds,
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

  return (
    <main className="print-portrait" style={{ padding: '1.5rem 2rem', maxWidth: '1400px' }}>
      <ReportHeader reportName="DISPATCH HISTORY" filters={reportFilters} />
      <ReportFilterBar filters={filters} activeFilters={activeFilters} printLabel="Print Summary" />

      {/* Reference search — screen only */}
      <div className="no-print" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <label style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>Search reference:</label>
        <form style={{ display: 'inline' }}>
          <input
            name="reference"
            type="text"
            defaultValue={typeof params.reference === 'string' ? params.reference : ''}
            placeholder="Reference or customer name…"
            style={{ fontSize: 'var(--text-sm)', padding: '0.3rem 0.6rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-hover)', color: 'var(--text-primary)', minWidth: '220px' }}
          />
        </form>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
        {[
          { label: 'Total Dispatches',   value: String(totalDispatches)        },
          { label: 'Total Gross',        value: `${fmt(totalGrossAll)} gross`  },
          { label: 'Unique Customers',   value: String(uniqueCustomers)        },
          { label: 'Avg Parcel Size',    value: `${fmt(avgParcelSize, 1)} gross` },
        ].map((card) => (
          <div key={card.label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderLeft: '3px solid var(--border-strong)', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', minWidth: '180px' }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.25rem' }}>{card.label}</div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{card.value}</div>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>No dispatches match the current filters.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '900px' }}>
            <thead>
              <tr>
                <th style={tableTh}>Date</th>
                <th style={tableTh}>Customer</th>
                <th style={tableTh}>Reference</th>
                <th style={thNum}>Total Gross</th>
                <th style={thNum}>Lines</th>
                <th style={thNum}>SUB</th>
                <th style={thNum}>EXTRA</th>
                <th style={thNum}>SHORT</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id}>
                  <td style={tableTd}>
                    {new Date(d.dispatch_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={tableTd}>{d.customer_name}</td>
                  <td style={{ ...tableTd, color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>{d.reference ?? '—'}</td>
                  <td style={{ ...tdNum, fontWeight: 600 }}>
                    {fmt(d.total_gross)}
                    {d.extra_gross > 0 && (
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 400 }}>
                        {fmt(d.ordered_gross)} + {fmt(d.extra_gross)} extra
                      </div>
                    )}
                  </td>
                  <td style={tdNum}>{d.line_count}</td>
                  <td style={{ ...tdNum, color: d.sub_count > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>{d.sub_count || '—'}</td>
                  <td style={{ ...tdNum, color: d.extra_count > 0 ? 'var(--info)' : 'var(--text-muted)' }}>{d.extra_count || '—'}</td>
                  <td style={{ ...tdNum, color: d.short_count > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{d.short_count || '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                <td colSpan={3} style={{ ...tableTd, fontWeight: 700 }}>GRAND TOTAL — {totalDispatches} dispatches</td>
                <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(totalGrossAll)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
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
