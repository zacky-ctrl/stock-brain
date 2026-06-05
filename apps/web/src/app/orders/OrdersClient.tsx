'use client'

import { useState, useMemo, useActionState, Fragment } from 'react'
import { setOrderPriorityAction, reserveOrderLinesAction } from './actions'
import { tableTh, tableTd, inputStyle, btnPrimary, msgError, msgOk, fieldWrap } from '@/lib/ui'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { ActionState } from '@/lib/masters'
import type { PlanningAllocationRow, PlanningLineStatus } from '@stock-brain/types'

// ── types ──────────────────────────────────────────────────────

export type ReservableLine = {
  line_id: string
  balance_id: string
  qty: number
}

export type OrderPlanningRow = Pick<
  PlanningAllocationRow,
  | 'order_line_id'
  | 'shape_design_id'
  | 'bindi_colour_id'
  | 'size_id'
  | 'dabbi_colour_id'
  | 'open_qty'
  | 'ready_allocated_qty'
  | 'wip_allocated_qty'
  | 'cuttings_allocated_qty'
  | 'cuttings_available_qty'
  | 'shortage_qty'
  | 'planning_status'
>

export type OrderPlanningSum = {
  type1_gross: number  // cuttings_allocated_qty sum — issue to labour
  type2_gross: number  // shortage_qty where cut_on_machine
  type3_gross: number  // shortage_qty where procure_velvet
  ready_gross: number  // ready_allocated_qty sum
}

export type OrderClientRow = {
  id: string
  order_date: string
  reference: string | null
  status: string
  customer_name: string
  customer_id: string
  line_count: number
  total_ordered: number
  total_dispatched: number
  total_extras: number
  open_qty: number
  is_stale: boolean
  dispatch_pct: number
  planning_rows: OrderPlanningRow[]
  planning_sum: OrderPlanningSum
  reservable_lines: ReservableLine[]
}

// ── helpers ────────────────────────────────────────────────────

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

const STATUS_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Open', value: 'open' },
  { label: 'Partially Dispatched', value: 'partially_dispatched' },
  { label: 'Fulfilled', value: 'fulfilled' },
  { label: 'Closed', value: 'closed' },
]

const ACTION_LABEL: Record<PlanningLineStatus, string> = {
  ready_to_dispatch:          'DISPATCH',
  ready_to_dispatch_override: 'DISPATCH',
  covered_by_wip:             'WIP',
  give_to_labour:             'ISSUE',
  give_to_labour_override:    'ISSUE',
  cut_on_machine:             'CUT',
  cut_on_machine_override:    'CUT',
  procure_velvet:             'PROCURE',
  fully_dispatched:           '—',
  closed:                     '—',
}

const ACTION_COLOR: Partial<Record<PlanningLineStatus, CSSProperties>> = {
  ready_to_dispatch:          { color: 'var(--success)', fontWeight: 700 },
  ready_to_dispatch_override: { color: 'var(--success)', fontWeight: 700 },
  covered_by_wip:             { color: 'var(--info)' },
  give_to_labour:             { color: 'var(--warning)', fontWeight: 700 },
  give_to_labour_override:    { color: 'var(--warning)', fontWeight: 700 },
  cut_on_machine:             { color: 'var(--danger)', fontWeight: 700 },
  cut_on_machine_override:    { color: 'var(--danger)', fontWeight: 700 },
  procure_velvet:             { color: 'var(--danger)', fontWeight: 700 },
}

// ── sub-components ─────────────────────────────────────────────

function PriorityForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    setOrderPriorityAction,
    null,
  )

  return (
    <tr>
      <td colSpan={11} style={{ padding: '0.75rem 1rem', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
        <form action={formAction} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <input type="hidden" name="order_id" value={orderId} />
          {state && 'error' in state && (
            <span style={{ ...msgError, marginBottom: 0, fontSize: 'var(--text-xs)' }}>✗ {state.error}</span>
          )}
          {state && 'success' in state && (
            <span style={{ ...msgOk, marginBottom: 0, fontSize: 'var(--text-xs)' }}>✓ {state.success}</span>
          )}
          <div style={{ ...fieldWrap, flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Priority (1–highest):</span>
            <input
              name="priority_value"
              type="number"
              min="1"
              step="1"
              placeholder="1"
              required
              style={{ ...inputStyle, width: '70px', padding: '0.25rem 0.4rem', fontSize: 'var(--text-xs)' }}
            />
          </div>
          <div style={{ ...fieldWrap, flexDirection: 'row', alignItems: 'center', gap: '0.4rem', flex: 1, minWidth: '200px' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Reason:</span>
            <input
              name="reason"
              placeholder="e.g. Urgent customer request"
              required
              style={{ ...inputStyle, padding: '0.25rem 0.4rem', fontSize: 'var(--text-xs)' }}
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            style={{ ...btnPrimary, padding: '0.25rem 0.65rem', fontSize: 'var(--text-xs)', marginTop: 0 }}
          >
            {isPending ? 'Saving…' : 'Apply to all lines'}
          </button>
          <button
            type="button"
            onClick={onDone}
            style={{ padding: '0.25rem 0.5rem', fontSize: 'var(--text-xs)', cursor: 'pointer', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}
          >
            Cancel
          </button>
        </form>
      </td>
    </tr>
  )
}

function ReserveConfirm({
  order,
  onDone,
}: {
  order: OrderClientRow
  onDone: () => void
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    reserveOrderLinesAction,
    null,
  )
  const totalQty = order.reservable_lines.reduce((s, l) => s + l.qty, 0)
  const linesJson = JSON.stringify(
    order.reservable_lines.map((l) => ({ line_id: l.line_id, balance_id: l.balance_id, qty: l.qty })),
  )

  return (
    <tr>
      <td colSpan={11} style={{ padding: '0.75rem 1rem', background: 'rgba(16,185,129,0.05)', borderBottom: '1px solid var(--border)' }}>
        <form action={formAction} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="hidden" name="lines_json" value={linesJson} />
          {state && 'error' in state && (
            <span style={{ ...msgError, marginBottom: 0, fontSize: 'var(--text-xs)' }}>✗ {state.error}</span>
          )}
          {state && 'success' in state && (
            <span style={{ ...msgOk, marginBottom: 0, fontSize: 'var(--text-xs)' }}>✓ {state.success}</span>
          )}
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            Reserve all available stock for <strong>{order.customer_name}</strong>?{' '}
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmt(totalQty)} gross across {order.reservable_lines.length} line(s).
            </span>
          </span>
          <button
            type="submit"
            disabled={isPending}
            style={{ ...btnPrimary, background: 'var(--success)', padding: '0.25rem 0.65rem', fontSize: 'var(--text-xs)', marginTop: 0 }}
          >
            {isPending ? 'Reserving…' : 'Confirm Reserve'}
          </button>
          <button
            type="button"
            onClick={onDone}
            style={{ padding: '0.25rem 0.5rem', fontSize: 'var(--text-xs)', cursor: 'pointer', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}
          >
            Cancel
          </button>
        </form>
      </td>
    </tr>
  )
}

function ShortagePanel({
  order,
  shapeMap,
  bindiMap,
  sizeMap,
  dabbiMap,
}: {
  order: OrderClientRow
  shapeMap: Record<string, string>
  bindiMap: Record<string, string>
  sizeMap: Record<string, string>
  dabbiMap: Record<string, string>
}) {
  const sum = order.planning_sum
  const totalIssueQty = sum.type1_gross
  const totalStillShort = sum.type2_gross + sum.type3_gross

  const headers = ['Shape', 'CLR', 'Size', 'Dabbi', 'Open Qty', 'Ready', 'WIP', 'Cut Avail', 'Issue Qty', 'Still Short', 'Status', 'Action']
  const leftAligned = new Set(['Shape', 'CLR', 'Size', 'Dabbi', 'Status', 'Action'])

  return (
    <tr>
      <td colSpan={11} style={{ padding: 0, background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', minWidth: '900px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {headers.map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '0.4rem 0.75rem',
                      textAlign: leftAligned.has(h) ? 'left' : 'right',
                      color: h === 'Issue Qty' ? 'var(--warning)' : h === 'Still Short' ? 'var(--danger)' : 'var(--text-secondary)',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.planning_rows.map((row) => {
                const shape = shapeMap[row.shape_design_id] ?? '—'
                const clr   = bindiMap[row.bindi_colour_id] ?? '—'
                const size  = sizeMap[row.size_id] ?? '—'
                const dabbi = dabbiMap[row.dabbi_colour_id] ?? '—'
                const actionLabel = ACTION_LABEL[row.planning_status] ?? '—'
                const actionStyle = ACTION_COLOR[row.planning_status] ?? { color: 'var(--text-muted)' }

                return (
                  <tr key={row.order_line_id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.35rem 0.75rem', color: 'var(--text-primary)' }}>{shape}</td>
                    <td style={{ padding: '0.35rem 0.75rem', color: 'var(--text-secondary)' }}>{clr}</td>
                    <td style={{ padding: '0.35rem 0.75rem', color: 'var(--text-secondary)' }}>{size}</td>
                    <td style={{ padding: '0.35rem 0.75rem', fontWeight: 700, color: 'var(--accent)' }}>{dabbi}</td>
                    <td style={{ padding: '0.35rem 0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(row.open_qty)}</td>
                    <td style={{ padding: '0.35rem 0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: row.ready_allocated_qty > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                      {row.ready_allocated_qty > 0 ? fmt(row.ready_allocated_qty) : '—'}
                    </td>
                    <td style={{ padding: '0.35rem 0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: row.wip_allocated_qty > 0 ? 'var(--info)' : 'var(--text-muted)' }}>
                      {row.wip_allocated_qty > 0 ? fmt(row.wip_allocated_qty) : '—'}
                    </td>
                    <td style={{ padding: '0.35rem 0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: row.cuttings_available_qty > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                      {row.cuttings_available_qty > 0 ? fmt(row.cuttings_available_qty) : '—'}
                    </td>
                    <td style={{ padding: '0.35rem 0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {row.cuttings_allocated_qty > 0 ? (
                        <span style={{ fontWeight: 700, color: 'var(--warning)' }}>{fmt(row.cuttings_allocated_qty)}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '0.35rem 0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: row.shortage_qty > 0 ? 700 : undefined, color: row.shortage_qty > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                      {row.shortage_qty > 0 ? fmt(row.shortage_qty) : '—'}
                    </td>
                    <td style={{ padding: '0.35rem 0.75rem' }}>
                      <Badge variant={statusBadgeVariant(row.planning_status)} label={row.planning_status.replace(/_/g, ' ')} size="sm" />
                    </td>
                    <td style={{ padding: '0.35rem 0.75rem', ...actionStyle, fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
                      {actionLabel}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {/* Summary line */}
        <div style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {totalIssueQty > 0 && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', fontWeight: 700 }}>
              Issue to labour: {fmt(totalIssueQty)} gross
            </span>
          )}
          {sum.type2_gross > 0 && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)', fontWeight: 700 }}>
              Cut needed: {fmt(sum.type2_gross)} gross
            </span>
          )}
          {sum.type3_gross > 0 && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)', fontWeight: 700 }}>
              Procure velvet: {fmt(sum.type3_gross)} gross
            </span>
          )}
          {sum.ready_gross > 0 && totalStillShort === 0 && totalIssueQty === 0 && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success)', fontWeight: 700 }}>
              Ready to dispatch: {fmt(sum.ready_gross)} gross
            </span>
          )}
          <Link
            href="/planning/allocation"
            style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', textDecoration: 'underline', marginLeft: 'auto' }}
          >
            View in Plan →
          </Link>
        </div>
      </td>
    </tr>
  )
}

// ── main component ─────────────────────────────────────────────

export function OrdersClient({
  orders,
  shapeMap,
  bindiMap,
  sizeMap,
  dabbiMap,
}: {
  orders: OrderClientRow[]
  shapeMap: Record<string, string>
  bindiMap: Record<string, string>
  sizeMap: Record<string, string>
  dabbiMap: Record<string, string>
}) {
  const [customer, setCustomer] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [shortage, setShortage] = useState('')
  const [expandedShortage, setExpandedShortage] = useState<Set<string>>(new Set())
  const [openPriority, setOpenPriority] = useState<string | null>(null)
  const [openReserve, setOpenReserve] = useState<string | null>(null)

  const isFiltered = customer || status || dateFrom || dateTo || shortage

  const uniqueCustomers = useMemo(() => {
    const seen = new Map<string, string>()
    for (const o of orders) {
      if (!seen.has(o.customer_id)) seen.set(o.customer_id, o.customer_name)
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [orders])

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (customer && o.customer_id !== customer) return false
      if (status && o.status !== status) return false
      if (dateFrom && o.order_date < dateFrom) return false
      if (dateTo && o.order_date > dateTo) return false
      const { type1_gross, type2_gross, type3_gross } = o.planning_sum
      const hasAnyShortage = type1_gross > 0 || type2_gross > 0 || type3_gross > 0
      if (shortage === 'has' && !hasAnyShortage) return false
      if (shortage === 'none' && hasAnyShortage) return false
      return true
    })
  }, [orders, customer, status, dateFrom, dateTo, shortage])

  function clearFilters() {
    setCustomer('')
    setStatus('')
    setDateFrom('')
    setDateTo('')
    setShortage('')
  }

  function toggleShortage(id: string) {
    setExpandedShortage((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filterBar: CSSProperties = {
    display: 'flex',
    gap: '0.6rem',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    padding: '0.75rem 1rem',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    marginBottom: '1.25rem',
  }

  const filterLabel: CSSProperties = {
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    fontWeight: 600,
    marginBottom: '0.2rem',
  }

  const filterSelect: CSSProperties = {
    ...inputStyle,
    padding: '0.3rem 0.5rem',
    fontSize: 'var(--text-xs)',
    cursor: 'pointer',
    width: 'auto',
    minWidth: '130px',
  }

  const filterDate: CSSProperties = {
    ...inputStyle,
    padding: '0.3rem 0.5rem',
    fontSize: 'var(--text-xs)',
    width: '130px',
  }

  const tdNum: CSSProperties = {
    ...tableTd,
    textAlign: 'right',
    paddingRight: '1.25rem',
    fontVariantNumeric: 'tabular-nums',
  }

  return (
    <>
      {/* Filter bar */}
      <div style={filterBar}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <span style={filterLabel}>Customer</span>
          <select value={customer} onChange={(e) => setCustomer(e.target.value)} style={filterSelect}>
            <option value="">All customers</option>
            {uniqueCustomers.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <span style={filterLabel}>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={filterSelect}>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <span style={filterLabel}>Date from</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={filterDate} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <span style={filterLabel}>Date to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={filterDate} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <span style={filterLabel}>Shortage</span>
          <select value={shortage} onChange={(e) => setShortage(e.target.value)} style={filterSelect}>
            <option value="">All</option>
            <option value="has">Has Shortage</option>
            <option value="none">No Shortage</option>
          </select>
        </div>

        {isFiltered && (
          <button
            onClick={clearFilters}
            style={{ padding: '0.3rem 0.7rem', fontSize: 'var(--text-xs)', cursor: 'pointer', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', alignSelf: 'flex-end' }}
          >
            Clear filters
          </button>
        )}

        {isFiltered && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', alignSelf: 'flex-end' }}>
            {filtered.length} / {orders.length} orders
          </span>
        )}
      </div>

      {/* Table */}
      <div className="table-card" style={{ overflowX: 'auto' }}>
        <table className="stock-table" style={{ minWidth: '1100px' }}>
          <thead>
            <tr>
              <th style={tableTh}>Customer</th>
              <th style={tableTh}>Date</th>
              <th style={tableTh}>Reference</th>
              <th style={tableTh}>Status</th>
              <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.25rem' }}>Lines</th>
              <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.25rem' }}>Ordered</th>
              <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.25rem' }}>Dispatched</th>
              <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.25rem' }}>Open</th>
              <th style={tableTh}>Shortage</th>
              <th style={tableTh}>Priority</th>
              <th style={tableTh}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((order) => {
              const isShortageExpanded = expandedShortage.has(order.id)
              const isPriorityOpen = openPriority === order.id
              const isReserveOpen = openReserve === order.id
              const { type1_gross, type2_gross, type3_gross, ready_gross } = order.planning_sum
              const hasLabour = type1_gross > 0
              const hasCut = type2_gross + type3_gross > 0
              const hasAnyShortage = hasLabour || hasCut
              const isCovered = !hasAnyShortage && (ready_gross > 0 || order.open_qty === 0)
              const hasReservable = order.reservable_lines.length > 0
              const hasExpandableRows = order.planning_rows.length > 0

              return (
                <Fragment key={order.id}>
                  <tr>
                    <td style={tableTd}>
                      <Link href={`/orders/${order.id}`} style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {order.customer_name}
                      </Link>
                    </td>
                    <td style={{ ...tableTd, color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
                      {order.order_date}
                    </td>
                    <td style={{ ...tableTd, color: order.reference ? 'var(--text-secondary)' : 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                      {order.reference ?? '—'}
                    </td>
                    <td style={tableTd}>
                      <Badge variant={statusBadgeVariant(order.status)} label={order.status.replace(/_/g, ' ')} size="sm" />
                    </td>
                    <td style={tdNum}>{order.line_count}</td>
                    <td style={tdNum}>
                      <div>{fmt(order.total_ordered)}</div>
                      <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', marginTop: '3px', minWidth: '40px' }}>
                        <div style={{ height: '100%', width: `${order.dispatch_pct * 100}%`, background: 'var(--success)', borderRadius: '2px', transition: 'width 300ms' }} />
                      </div>
                    </td>
                    <td style={tdNum}>
                      <div>{fmt(order.total_dispatched)}</div>
                      {order.total_extras > 0 && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '1px' }}>
                          +{fmt(order.total_extras)} extra
                        </div>
                      )}
                    </td>
                    <td style={{
                      ...tdNum,
                      fontWeight: order.open_qty > 0 ? 700 : undefined,
                      color: order.is_stale ? 'var(--danger)' : order.open_qty === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
                    }}>
                      {fmt(order.open_qty)}
                    </td>
                    <td style={tableTd}>
                      {order.open_qty === 0 ? (
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>—</span>
                      ) : hasExpandableRows ? (
                        <button
                          onClick={() => toggleShortage(order.id)}
                          style={{
                            cursor: 'pointer',
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.2rem',
                            alignItems: 'flex-start',
                          }}
                        >
                          {hasLabour && (
                            <span style={{ display: 'inline-block', padding: '0.1rem 0.4rem', fontSize: 'var(--text-xs)', fontWeight: 700, background: 'rgba(245,158,11,0.12)', color: 'var(--warning)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245,158,11,0.25)', whiteSpace: 'nowrap' }}>
                              ⚠ {fmt(type1_gross)} labour
                            </span>
                          )}
                          {hasCut && (
                            <span style={{ display: 'inline-block', padding: '0.1rem 0.4rem', fontSize: 'var(--text-xs)', fontWeight: 700, background: 'var(--danger-subtle)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239,68,68,0.2)', whiteSpace: 'nowrap' }}>
                              ● {fmt(type2_gross + type3_gross)} cut
                            </span>
                          )}
                          {isCovered && !hasAnyShortage && (
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success)' }}>✓ Covered</span>
                          )}
                          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{isShortageExpanded ? '▲' : '▼'}</span>
                        </button>
                      ) : isCovered ? (
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success)' }}>✓ Covered</span>
                      ) : (
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ ...tableTd, whiteSpace: 'nowrap' }}>
                      {(order.status === 'open' || order.status === 'partially_dispatched') && (
                        <button
                          onClick={() => setOpenPriority(isPriorityOpen ? null : order.id)}
                          style={{
                            cursor: 'pointer',
                            border: '1px solid var(--info)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '0.15rem 0.45rem',
                            fontSize: 'var(--text-xs)',
                            background: isPriorityOpen ? 'var(--info)' : 'transparent',
                            color: isPriorityOpen ? 'white' : 'var(--info)',
                          }}
                        >
                          Set Priority
                        </button>
                      )}
                    </td>
                    <td style={{ ...tableTd, whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <Link
                          href={`/orders/${order.id}`}
                          style={{ padding: '0.2rem 0.55rem', fontSize: 'var(--text-xs)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}
                        >
                          View
                        </Link>
                        {(order.status === 'open' || order.status === 'partially_dispatched') && (
                          <Link
                            href={`/dispatch/new?order_id=${order.id}`}
                            style={{ padding: '0.2rem 0.55rem', fontSize: 'var(--text-xs)', background: 'var(--accent-subtle)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 'var(--radius-sm)', color: 'var(--accent)', fontWeight: 600 }}
                          >
                            Dispatch
                          </Link>
                        )}
                        {hasReservable && (order.status === 'open' || order.status === 'partially_dispatched') && (
                          <button
                            onClick={() => setOpenReserve(isReserveOpen ? null : order.id)}
                            style={{
                              cursor: 'pointer',
                              border: '1px solid var(--success)',
                              borderRadius: 'var(--radius-sm)',
                              padding: '0.2rem 0.55rem',
                              fontSize: 'var(--text-xs)',
                              background: 'transparent',
                              color: 'var(--success)',
                            }}
                          >
                            Reserve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {isShortageExpanded && hasExpandableRows && (
                    <ShortagePanel
                      order={order}
                      shapeMap={shapeMap}
                      bindiMap={bindiMap}
                      sizeMap={sizeMap}
                      dabbiMap={dabbiMap}
                    />
                  )}
                  {isPriorityOpen && (
                    <PriorityForm
                      orderId={order.id}
                      onDone={() => setOpenPriority(null)}
                    />
                  )}
                  {isReserveOpen && (
                    <ReserveConfirm
                      order={order}
                      onDone={() => setOpenReserve(null)}
                    />
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            No orders match the current filters.
          </div>
        )}
      </div>
    </>
  )
}
