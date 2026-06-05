import { createServerSupabaseClient } from '@/lib/supabase/server'
import { fetchPlanningAllocation } from './fetchers'
import { ReserveButton } from './ReserveButton'
import { PlanningViewToggle } from './PlanningViewToggle'
import type { PlanningAllocationRow, PlanningLineStatus, RecommendedAction } from '@stock-brain/types'
import type { PlanningRowEnriched } from './OrderGroupedView'
import { tableTh, tableTd } from '@/lib/ui'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import type { CSSProperties } from 'react'
import Link from 'next/link'

// ── formatting ────────────────────────────────────────────────

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

// ── status / action labels ────────────────────────────────────

const STATUS_LABEL: Record<PlanningLineStatus, string> = {
  ready_to_dispatch:          'Ready',
  covered_by_wip:             'Covered by WIP',
  give_to_labour:             'Give to Labour',
  cut_on_machine:             'Cut on Machine',
  procure_velvet:             'Procure Velvet',
  ready_to_dispatch_override: '⚠ Ready (Override)',
  give_to_labour_override:    '⚠ Labour (Override)',
  cut_on_machine_override:    '⚠ Cut (Override)',
  fully_dispatched:           'Dispatched',
  closed:                     'Closed',
}

const ACTION_LABEL: Record<RecommendedAction, string> = {
  dispatch_now:        'DISPATCH NOW',
  await_labour_return: 'AWAIT RETURN',
  production_needed:   'NEEDS PRODUCTION',
}

const ACTION_COLOR: Record<RecommendedAction, CSSProperties> = {
  dispatch_now:        { color: 'var(--success)', fontWeight: 'bold' },
  await_labour_return: { color: 'var(--info)' },
  production_needed:   { color: 'var(--danger)' },
}

// ── master lookup ─────────────────────────────────────────────

type LookupRow = { id: string; code: string; name?: string | null }

function buildLookup(rows: LookupRow[] | null, preferName = false): Map<string, string> {
  return new Map((rows ?? []).map((r) => [r.id, preferName && r.name ? r.name : r.code]))
}

// ── reservation lookup ────────────────────────────────────────

type ActiveAlloc = {
  id: string
  order_line_id: string
  ready_stock_balance_id: string
  allocated_qty: number
}

// ── page ──────────────────────────────────────────────────────

export default async function PlanningAllocationPage() {
  const supabase = createServerSupabaseClient()

  let rows: PlanningAllocationRow[] = []
  let fetchError: string | null = null

  const [
    allocationResult,
    shapesResult,
    bindiResult,
    sizesResult,
    dabbiResult,
    reservationsResult,
  ] = await Promise.allSettled([
    fetchPlanningAllocation(supabase),
    supabase.from('shape_designs').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('bindi_colours').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('sizes').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('dabbi_colours').select('id, code').order('code'),
    supabase
      .from('stock_allocations')
      .select('id, order_line_id, ready_stock_balance_id, allocated_qty')
      .eq('status', 'active')
      .eq('stock_stage', 'ready'),
  ])

  if (allocationResult.status === 'rejected') {
    fetchError = allocationResult.reason instanceof Error
      ? allocationResult.reason.message
      : String(allocationResult.reason)
  } else {
    rows = allocationResult.value
  }

  const shapeMap = buildLookup(shapesResult.status === 'fulfilled' ? shapesResult.value.data as LookupRow[] : null, true)
  const bindiMap = buildLookup(bindiResult.status === 'fulfilled' ? bindiResult.value.data as LookupRow[] : null)
  const sizeMap  = buildLookup(sizesResult.status === 'fulfilled' ? sizesResult.value.data as LookupRow[] : null)
  const dabbiMap = buildLookup(dabbiResult.status === 'fulfilled' ? dabbiResult.value.data as LookupRow[] : null)

  const reservationByLineId = new Map<string, ActiveAlloc>()
  if (reservationsResult.status === 'fulfilled') {
    for (const r of reservationsResult.value.data ?? []) {
      const lineId = r.order_line_id as string
      if (!reservationByLineId.has(lineId)) {
        reservationByLineId.set(lineId, {
          id: r.id as string,
          order_line_id: lineId,
          ready_stock_balance_id: r.ready_stock_balance_id as string,
          allocated_qty: Number(r.allocated_qty),
        })
      }
    }
  }

  const allReadyStockResult = await supabase
    .from('ready_stock_balance')
    .select('id, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id, brand_id, available_qty, gross_qty')
    .gt('gross_qty', 0)

  const bestBalanceByBase4 = new Map<string, { id: string; available_qty: number }>()
  for (const rs of allReadyStockResult.data ?? []) {
    const key = `${rs.shape_design_id}|${rs.bindi_colour_id}|${rs.size_id}|${rs.dabbi_colour_id}|${rs.brand_id}`
    const existing = bestBalanceByBase4.get(key)
    const avail = Number(rs.available_qty)
    if (!existing || avail > existing.available_qty) {
      bestBalanceByBase4.set(key, { id: rs.id as string, available_qty: avail })
    }
  }

  const sizeMaster = (sizesResult.status === 'fulfilled' ? sizesResult.value.data ?? [] : []).map((s) => ({
    id: s.id as string,
    code: s.code as string,
    name: (s as { name?: string | null }).name as string ?? s.code as string,
    sort_order: Number((s as { sort_order?: number | null }).sort_order ?? 0),
  }))
  const designMaster = (shapesResult.status === 'fulfilled' ? shapesResult.value.data ?? [] : []).map((s) => ({
    id: s.id as string,
    name: ((s as { name?: string | null }).name ?? s.code) as string,
    sort_order: Number((s as { sort_order?: number | null }).sort_order ?? 0),
  }))
  const colourMaster = (bindiResult.status === 'fulfilled' ? bindiResult.value.data ?? [] : []).map((c) => ({
    id: c.id as string,
    code: c.code as string,
    name: ((c as { name?: string | null }).name ?? c.code) as string,
    sort_order: Number((c as { sort_order?: number | null }).sort_order ?? 0),
  }))

  const printTitle = `Shortage / Planning Report — ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`

  // ── stat card totals ──────────────────────────────────────────
  const totalPending = rows.reduce((s, r) => s + r.open_qty, 0)
  const totalReady   = rows.reduce((s, r) => s + r.ready_allocated_qty, 0)
  const totalWip     = rows.reduce((s, r) => s + r.wip_allocated_qty, 0)
  const totalLabour  = rows.reduce((s, r) => s + r.cuttings_allocated_qty, 0)
  const totalCut     = rows.reduce((s, r) =>
    (r.planning_status === 'cut_on_machine' || r.planning_status === 'cut_on_machine_override' || r.planning_status === 'procure_velvet')
      ? s + r.shortage_qty : s, 0)

  // ── enriched rows ─────────────────────────────────────────────
  const enrichedRows: PlanningRowEnriched[] = rows.map((row) => {
    const base4Prefix = `${row.shape_design_id}|${row.bindi_colour_id}|${row.size_id}|${row.dabbi_colour_id}|`
    let bestBalanceId: string | null = null
    let bestAvailable = 0
    for (const [key, val] of bestBalanceByBase4.entries()) {
      if (key.startsWith(base4Prefix) && val.available_qty > bestAvailable) {
        bestAvailable = val.available_qty
        bestBalanceId = val.id
      }
    }
    return { ...row, best_balance_id: bestBalanceId, best_balance_available: bestAvailable }
  })

  // ── serialise Maps ────────────────────────────────────────────
  const shapeRecord = Object.fromEntries(shapeMap)
  const bindiRecord = Object.fromEntries(bindiMap)
  const sizeRecord  = Object.fromEntries(sizeMap)
  const dabbiRecord = Object.fromEntries(dabbiMap)
  const reservationRecord = Object.fromEntries(
    [...reservationByLineId.entries()].map(([k, v]) => [k, v]),
  )

  // ── unique filter lists ───────────────────────────────────────
  const customerMap = new Map<string, string>()
  for (const r of rows) customerMap.set(r.customer_id, r.customer_name)
  const customerList = [...customerMap.entries()].map(([id, name]) => ({ id, name }))

  const designList = [...new Set(rows.map((r) => r.shape_design_id))]
    .map((id) => ({ id, name: shapeMap.get(id) ?? id }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const colourList = [...new Set(rows.map((r) => r.bindi_colour_id))]
    .map((id) => ({ id, code: bindiMap.get(id) ?? id }))
    .sort((a, b) => a.code.localeCompare(b.code))

  const dabbiList = [...new Set(rows.map((r) => r.dabbi_colour_id ?? ''))]
    .filter(Boolean)
    .map((id) => ({ id, code: dabbiMap.get(id) ?? id }))
    .sort((a, b) => a.code.localeCompare(b.code))

  // ── SKU view table rendering ──────────────────────────────────

  const tdNum: CSSProperties = {
    ...tableTd,
    textAlign: 'right',
    paddingRight: '1rem',
    fontVariantNumeric: 'tabular-nums',
  }
  const thNum: CSSProperties = {
    ...tableTh,
    textAlign: 'right',
    paddingRight: '1rem',
  }

  const reservedBadge: CSSProperties = {
    display: 'inline-block',
    padding: '0.1rem 0.4rem',
    fontSize: 'var(--text-xs)',
    fontWeight: 'bold',
    color: 'var(--warning)',
    background: 'var(--warning-subtle)',
    border: '1px solid rgba(245, 158, 11, 0.25)',
    borderRadius: 'var(--radius-sm)',
    whiteSpace: 'nowrap',
  }

  function isTodayAction(row: PlanningAllocationRow): boolean {
    return row.planning_status === 'ready_to_dispatch'
      || row.planning_status === 'ready_to_dispatch_override'
      || row.planning_status === 'give_to_labour'
      || row.planning_status === 'give_to_labour_override'
  }

  function leadTimeLabel(days: number): string {
    if (days === 0) return 'Now'
    if (days === 1) return '1d'
    if (days === 2) return '2d'
    return `${days}d+`
  }

  function renderSkuRows(section: PlanningAllocationRow[]) {
    return section.map((row) => {
      const existingReservation = reservationByLineId.get(row.order_line_id)
      const hasOverride = row.override_active
      const hasAnyShortageSig = row.cuttings_allocated_qty > 0 || row.shortage_qty > 0

      const rowBg = hasOverride
        ? 'rgba(245, 158, 11, 0.06)'
        : existingReservation
          ? 'rgba(99, 102, 241, 0.06)'
          : hasAnyShortageSig
            ? (row.shortage_qty >= row.open_qty ? 'var(--danger-subtle)' : 'rgba(245, 158, 11, 0.04)')
            : (row.planning_status === 'ready_to_dispatch' ? 'rgba(16, 185, 129, 0.05)' : undefined)

      const priorityLabel = row.sort_tier === 0
        ? `P${row.priority_rank} ★`
        : `W${11 - row.priority_rank}`

      const base4Prefix = `${row.shape_design_id}|${row.bindi_colour_id}|${row.size_id}|${row.dabbi_colour_id}|`
      let bestBalanceId: string | null = null
      let bestAvailable = 0
      for (const [key, val] of bestBalanceByBase4.entries()) {
        if (key.startsWith(base4Prefix) && val.available_qty > bestAvailable) {
          bestAvailable = val.available_qty
          bestBalanceId = val.id
        }
      }

      const canReserve = !existingReservation
        && (row.planning_status === 'ready_to_dispatch' || row.planning_status === 'ready_to_dispatch_override')
        && row.ready_allocated_qty > 0
        && bestBalanceId !== null

      const overrideTooltip = hasOverride
        ? `Override: ${row.override_type} — ${row.override_reason}`
        : undefined

      return (
        <tr key={row.order_line_id} style={{ background: rowBg }}>
          <td style={{ ...tableTd, whiteSpace: 'nowrap' }}>
            <span style={{
              fontSize: 'var(--text-xs)',
              padding: '0.1rem 0.35rem',
              border: '1px solid',
              borderRadius: 'var(--radius-sm)',
              borderColor: row.sort_tier === 0 ? 'var(--accent)' : 'var(--border)',
              color: row.sort_tier === 0 ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: row.sort_tier === 0 ? 600 : 400,
            }}>
              {priorityLabel}
            </span>
          </td>
          <td style={tableTd}>{row.customer_name}</td>
          <td style={tableTd}>
            <Link href={`/orders/${row.order_id}`} style={{ color: 'var(--accent)', fontSize: 'var(--text-xs)', textDecoration: 'none' }}>
              {row.order_id.slice(0, 8)}
            </Link>
          </td>
          <td style={tableTd}>{shapeMap.get(row.shape_design_id) ?? '—'}</td>
          <td style={tableTd}>{bindiMap.get(row.bindi_colour_id) ?? '—'}</td>
          <td style={tableTd}>{sizeMap.get(row.size_id) ?? '—'}</td>
          <td style={tableTd}>{dabbiMap.get(row.dabbi_colour_id) ?? '—'}</td>
          <td style={{ ...tdNum, fontWeight: 'bold' }}>{fmt(row.open_qty)}</td>
          <td style={{ ...tdNum, color: row.ready_allocated_qty > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
            {fmt(row.ready_allocated_qty)}
          </td>
          <td style={{ ...tdNum, color: row.wip_allocated_qty > 0 ? 'var(--info)' : 'var(--text-muted)' }}>
            {row.wip_allocated_qty > 0 ? (
              <a
                href={`/planning/wip?order_id=${row.order_id}`}
                style={{ color: 'var(--info)', textDecoration: 'none' }}
              >
                {fmt(row.wip_allocated_qty)}
              </a>
            ) : fmt(row.wip_allocated_qty)}
          </td>
          <td style={{ ...tdNum, color: row.cuttings_allocated_qty > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
            {fmt(row.cuttings_allocated_qty)}
          </td>
          <td style={{ ...tdNum, color: row.cuttings_available_qty > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
            {fmt(row.cuttings_available_qty)}
          </td>
          <td style={{ ...tableTd, textAlign: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'center' }}>
              {row.cuttings_allocated_qty > 0 && (
                <span style={{ display: 'inline-block', padding: '0.1rem 0.4rem', fontSize: 'var(--text-xs)', fontWeight: 700, background: 'rgba(245,158,11,0.12)', color: 'var(--warning)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245,158,11,0.25)', whiteSpace: 'nowrap' }}>
                  ⚠ {fmt(row.cuttings_allocated_qty)} labour
                </span>
              )}
              {row.shortage_qty > 0 && (row.planning_status === 'cut_on_machine' || row.planning_status === 'cut_on_machine_override') && (
                <span style={{ display: 'inline-block', padding: '0.1rem 0.4rem', fontSize: 'var(--text-xs)', fontWeight: 700, background: 'var(--danger-subtle)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239,68,68,0.2)', whiteSpace: 'nowrap' }}>
                  ● {fmt(row.shortage_qty)} cut
                </span>
              )}
              {row.shortage_qty > 0 && row.planning_status === 'procure_velvet' && (
                <span style={{ display: 'inline-block', padding: '0.1rem 0.4rem', fontSize: 'var(--text-xs)', fontWeight: 700, background: 'var(--danger-subtle)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239,68,68,0.2)', whiteSpace: 'nowrap' }}>
                  ● {fmt(row.shortage_qty)} procure
                </span>
              )}
              {row.cuttings_allocated_qty === 0 && row.shortage_qty === 0 && (
                <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>—</span>
              )}
            </div>
          </td>
          <td style={{ ...tableTd, color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', textAlign: 'center' }}>
            {leadTimeLabel(row.lead_time_days)}
          </td>
          <td style={{ ...tdNum, color: row.recommended_cut_qty > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: row.recommended_cut_qty > 0 ? 'bold' : undefined }}>
            {row.recommended_cut_qty > 0 ? fmt(row.recommended_cut_qty) : '—'}
          </td>
          <td style={{ ...tableTd, textAlign: 'center' }}>
            {row.buffer_warning ? <span title="Cuttings below minimum buffer (25 gross)" style={{ color: 'var(--warning)' }}>⚠</span> : null}
          </td>
          <td style={{ ...tableTd, whiteSpace: 'nowrap' }} title={overrideTooltip}>
            <Badge variant={statusBadgeVariant(row.planning_status)} label={STATUS_LABEL[row.planning_status]} size="sm" />
            {row.conversion_rate_missing && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', marginTop: '0.2rem' }}>
                ⚠ Add conversion rate in Masters → Velvet Rates
              </div>
            )}
          </td>
          <td style={{ ...tableTd, whiteSpace: 'nowrap' }}>
            {existingReservation ? (
              <span style={reservedBadge}>
                RESERVED {fmt(existingReservation.allocated_qty)}
              </span>
            ) : (
              <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ ...ACTION_COLOR[row.recommended_action] }}>
                  {ACTION_LABEL[row.recommended_action]}
                </span>
                {(row.planning_status === 'ready_to_dispatch' || row.planning_status === 'ready_to_dispatch_override') && (
                  <Link
                    href={`/dispatch/new?customer_id=${row.customer_id}`}
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--success)', textDecoration: 'underline' }}
                  >
                    →
                  </Link>
                )}
                {canReserve && bestBalanceId && (
                  <ReserveButton
                    orderLineId={row.order_line_id}
                    qty={row.ready_allocated_qty}
                    balanceId={bestBalanceId}
                  />
                )}
              </span>
            )}
          </td>
          <td style={{ ...tableTd, whiteSpace: 'nowrap' }}>
            <Link
              href={`/admin/planning-overrides/new?order_line_id=${row.order_line_id}`}
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                padding: '0.1rem 0.4rem',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              Override
            </Link>
          </td>
          <td style={{ ...tableTd, color: row.promised_date ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
            {row.promised_date ?? '—'}
          </td>
        </tr>
      )
    })
  }

  const skuTableHeader = (
    <thead>
      <tr>
        <th style={tableTh}>Priority</th>
        <th style={{ ...tableTh, minWidth: '140px' }}>Customer</th>
        <th style={tableTh}>Order</th>
        <th style={{ ...tableTh, minWidth: '120px' }}>Shape</th>
        <th style={{ ...tableTh, minWidth: '80px' }}>Colour</th>
        <th style={{ ...tableTh, minWidth: '60px' }}>Size</th>
        <th style={{ ...tableTh, minWidth: '60px' }}>Dabbi</th>
        <th style={{ ...thNum, minWidth: '80px' }}>Pending</th>
        <th style={{ ...thNum, minWidth: '70px' }}>Ready</th>
        <th style={{ ...thNum, minWidth: '60px' }}>WIP</th>
        <th style={{ ...thNum, minWidth: '70px' }}>Cuttings</th>
        <th style={{ ...thNum, minWidth: '70px' }}>Cut Avail</th>
        <th style={{ ...tableTh, textAlign: 'center', minWidth: '110px' }}>Shortage</th>
        <th style={{ ...tableTh, textAlign: 'center', minWidth: '50px' }}>Lead</th>
        <th style={{ ...thNum, minWidth: '70px' }}>Cut Qty</th>
        <th style={{ ...tableTh, textAlign: 'center', minWidth: '40px' }}>Buf</th>
        <th style={{ ...tableTh, minWidth: '160px' }}>Status</th>
        <th style={{ ...tableTh, minWidth: '140px' }}>Action / Reserve</th>
        <th style={{ ...tableTh, minWidth: '80px' }}>Override</th>
        <th style={{ ...tableTh, minWidth: '90px' }}>Promised</th>
      </tr>
    </thead>
  )

  const todayRows  = rows.filter(isTodayAction)
  const forwardRows = rows.filter((r) => !isTodayAction(r))

  const skuTableContent = (
    <div style={{ overflowX: 'auto' }}>
      {todayRows.length > 0 && (
        <>
          <SectionHeader title="Today's Actions" count={todayRows.length} color="var(--success)" />
          <div className="table-card" style={{ marginBottom: '1.5rem', overflow: 'visible' }}>
            <table className="stock-table" style={{ minWidth: '1600px' }}>
              {skuTableHeader}
              <tbody>{renderSkuRows(todayRows)}</tbody>
            </table>
          </div>
        </>
      )}
      {forwardRows.length > 0 && (
        <>
          <SectionHeader title="Forward Planning — 2+ Days" count={forwardRows.length} />
          <div className="table-card" style={{ overflow: 'visible' }}>
            <table className="stock-table" style={{ minWidth: '1600px' }}>
              {skuTableHeader}
              <tbody>{renderSkuRows(forwardRows)}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )

  // ── stat card style helper ────────────────────────────────────
  const statCardBase: CSSProperties = {
    background: 'var(--bg-elevated)',
    borderRadius: 'var(--radius-lg)',
    padding: '1.25rem 1.5rem',
    border: '1px solid var(--border)',
    flex: '1 1 160px',
    minWidth: '140px',
  }

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1900px' }}>
      <PageHeader
        title="Planning"
        subtitle="Open demand allocated sequentially by priority across ready stock → WIP → cuttings → velvet."
      />

      {fetchError && (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>✗ {fetchError}</p>
      )}

      {/* 4 stat cards */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {/* PENDING */}
        <div style={statCardBase}>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {fmt(totalPending)}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Pending
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '0.15rem' }}>gross open</div>
        </div>

        {/* READY NOW */}
        <Link
          href="#ready-rows"
          style={{ ...statCardBase, textDecoration: 'none', display: 'block', cursor: 'pointer' }}
        >
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>
            {fmt(totalReady)}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--success)', marginTop: '0.25rem' }}>
            Ready Now
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '0.15rem' }}>dispatch today</div>
        </Link>

        {/* WIP */}
        <div style={statCardBase}>
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--info)', fontVariantNumeric: 'tabular-nums' }}>
            {fmt(totalWip)}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--info)', marginTop: '0.25rem' }}>
            WIP
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '0.15rem' }}>with labour now</div>
        </div>

        {/* GIVE TO LABOUR */}
        <Link
          href="/reports/labour-issue"
          style={{ ...statCardBase, textDecoration: 'none', display: 'block', cursor: 'pointer' }}
        >
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--warning)', fontVariantNumeric: 'tabular-nums' }}>
            {fmt(totalLabour)}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--warning)', marginTop: '0.25rem' }}>
            Give to Labour
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '0.15rem' }}>cuttings available</div>
        </Link>

        {/* CUT NEEDED */}
        <Link
          href="/reports/cutting-required"
          style={{ ...statCardBase, textDecoration: 'none', display: 'block', cursor: 'pointer' }}
        >
          <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>
            {fmt(totalCut)}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--danger)', marginTop: '0.25rem' }}>
            Cut Needed
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '0.15rem' }}>cutting sessions needed</div>
        </Link>
      </div>

      {rows.length === 0 && !fetchError && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          No open demand lines. Create orders to see planning data here.
        </p>
      )}

      {rows.length > 0 && (
        <PlanningViewToggle
          rows={enrichedRows}
          shapeMap={shapeRecord}
          bindiMap={bindiRecord}
          sizeMap={sizeRecord}
          dabbiMap={dabbiRecord}
          reservationByLineId={reservationRecord}
          customers={customerList}
          designs={designList}
          colours={colourList}
          dabbis={dabbiList}
          sizeMaster={sizeMaster}
          designMaster={designMaster}
          colourMaster={colourMaster}
          printTitle={printTitle}
        >
          {skuTableContent}
        </PlanningViewToggle>
      )}

      <p style={{ marginTop: '1.5rem', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.6 }}>
        <span
          title="Priority: P1★ = explicit override (accent), W10 = customer weight (W = 11 − weight). Cuttings Avail = pre-allocation available. Lead: 0=now, 1d=labour, 2d=machine, 3d+=procure. Cut Qty = shortage + 25 gross buffer, rounded to 5. Buf ⚠ = below minimum buffer."
          style={{ cursor: 'help', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}
        >
          ⓘ
        </span>
      </p>
    </main>
  )
}
