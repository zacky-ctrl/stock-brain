'use client'

import { useState, useMemo, useActionState } from 'react'
import { setOrderPriorityAction, reserveOrderLinesAction } from './actions'
import { inputStyle, btnPrimary, msgError, msgOk, fieldWrap } from '@/lib/ui'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { Filter, MoreHorizontal, X } from 'lucide-react'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { ActionState } from '@/lib/masters'
import type { PlanningAllocationRow } from '@stock-brain/types'

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

// ── sub-components ─────────────────────────────────────────────

function PriorityFormFields({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    setOrderPriorityAction,
    null,
  )

  return (
    <form action={formAction} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <input type="hidden" name="order_id" value={orderId} />
      {state && 'error' in state && (
        <span style={{ ...msgError, marginBottom: 0, fontSize: 'var(--text-xs)' }}>✗ {state.error}</span>
      )}
      {state && 'success' in state && (
        <span style={{ ...msgOk, marginBottom: 0, fontSize: 'var(--text-xs)' }}>✓ {state.success}</span>
      )}
      <div style={{ ...fieldWrap, flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Priority (1-highest):</span>
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
        {isPending ? 'Saving...' : 'Apply to all lines'}
      </button>
      <button
        type="button"
        onClick={onDone}
        style={{ padding: '0.25rem 0.5rem', fontSize: 'var(--text-xs)', cursor: 'pointer', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}
      >
        Cancel
      </button>
    </form>
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
        {isPending ? 'Reserving...' : 'Confirm Reserve'}
      </button>
      <button
        type="button"
        onClick={onDone}
        style={{ padding: '0.25rem 0.5rem', fontSize: 'var(--text-xs)', cursor: 'pointer', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}
      >
        Cancel
      </button>
    </form>
  )
}

function ShortageChips({
  order,
  expanded,
  onToggle,
}: {
  order: OrderClientRow
  expanded: boolean
  onToggle: () => void
}) {
  const { type1_gross, type2_gross, type3_gross, ready_gross } = order.planning_sum
  const hasLabour = type1_gross > 0
  const hasCut = type2_gross + type3_gross > 0
  const hasAnyShortage = hasLabour || hasCut
  const isCovered = !hasAnyShortage && (ready_gross > 0 || order.open_qty === 0)

  if (order.open_qty === 0) {
    return <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>-</span>
  }

  if (!order.planning_rows.length && !isCovered) {
    return <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>-</span>
  }

  return (
    <button
      onClick={onToggle}
      style={{
        cursor: order.planning_rows.length ? 'pointer' : 'default',
        background: 'none',
        border: 'none',
        padding: 0,
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.25rem',
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}
    >
      {hasLabour && (
        <span style={{ display: 'inline-block', padding: '0.1rem 0.4rem', fontSize: 'var(--text-xs)', fontWeight: 700, background: 'rgba(245,158,11,0.12)', color: 'var(--warning)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245,158,11,0.25)', whiteSpace: 'nowrap' }}>
          {fmt(type1_gross)} labour
        </span>
      )}
      {hasCut && (
        <span style={{ display: 'inline-block', padding: '0.1rem 0.4rem', fontSize: 'var(--text-xs)', fontWeight: 700, background: 'var(--danger-subtle)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(239,68,68,0.2)', whiteSpace: 'nowrap' }}>
          {fmt(type2_gross + type3_gross)} cut
        </span>
      )}
      {isCovered && !hasAnyShortage && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success)' }}>Covered</span>
      )}
      {order.planning_rows.length > 0 && (
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{expanded ? 'Hide' : 'Details'}</span>
      )}
    </button>
  )
}

function MobileShortageDetails({
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
  return (
    <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem', display: 'grid', gap: '0.5rem' }}>
      {order.planning_rows.map((row) => (
        <div key={row.order_line_id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0.65rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 700 }}>
                {shapeMap[row.shape_design_id] ?? '-'} / {bindiMap[row.bindi_colour_id] ?? '-'} / {sizeMap[row.size_id] ?? '-'}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-bright)', fontWeight: 700 }}>
                Dabbi: {dabbiMap[row.dabbi_colour_id] ?? '-'}
              </div>
            </div>
            <Badge variant={statusBadgeVariant(row.planning_status)} label={row.planning_status.replace(/_/g, ' ')} size="sm" />
          </div>
          <div className="mobile-card-grid">
            <div><span className="mobile-card-label">Open</span><strong className="mobile-card-value">{fmt(row.open_qty)}</strong></div>
            <div><span className="mobile-card-label">Ready</span><strong className="mobile-card-value">{row.ready_allocated_qty > 0 ? fmt(row.ready_allocated_qty) : '-'}</strong></div>
            <div><span className="mobile-card-label">WIP</span><strong className="mobile-card-value">{row.wip_allocated_qty > 0 ? fmt(row.wip_allocated_qty) : '-'}</strong></div>
            <div><span className="mobile-card-label">Cut Avail</span><strong className="mobile-card-value">{row.cuttings_available_qty > 0 ? fmt(row.cuttings_available_qty) : '-'}</strong></div>
            <div><span className="mobile-card-label">Issue</span><strong className="mobile-card-value" style={{ color: row.cuttings_allocated_qty > 0 ? 'var(--warning)' : undefined }}>{row.cuttings_allocated_qty > 0 ? fmt(row.cuttings_allocated_qty) : '-'}</strong></div>
            <div><span className="mobile-card-label">Short</span><strong className="mobile-card-value" style={{ color: row.shortage_qty > 0 ? 'var(--danger)' : undefined }}>{row.shortage_qty > 0 ? fmt(row.shortage_qty) : '-'}</strong></div>
          </div>
        </div>
      ))}
    </div>
  )
}

function OrderCard({
  order,
  expanded,
  priorityOpen,
  reserveOpen,
  menuOpen,
  onToggleShortage,
  onTogglePriority,
  onToggleReserve,
  onToggleMenu,
  onCloseMenu,
  shapeMap,
  bindiMap,
  sizeMap,
  dabbiMap,
}: {
  order: OrderClientRow
  expanded: boolean
  priorityOpen: boolean
  reserveOpen: boolean
  menuOpen: boolean
  onToggleShortage: () => void
  onTogglePriority: () => void
  onToggleReserve: () => void
  onToggleMenu: () => void
  onCloseMenu: () => void
  shapeMap: Record<string, string>
  bindiMap: Record<string, string>
  sizeMap: Record<string, string>
  dabbiMap: Record<string, string>
}) {
  const canAct = order.status === 'open' || order.status === 'partially_dispatched'
  const canReserve = canAct && order.reservable_lines.length > 0

  return (
    <article className="order-card">
      <div className="order-card-top">
        <div style={{ minWidth: 0 }}>
          <Link href={`/orders/${order.id}`} className="mobile-card-title">
            {order.customer_name}
          </Link>
          <div className="mobile-card-meta">
            {order.order_date} {order.reference ? ` / ${order.reference}` : ''}
          </div>
        </div>
        <div className="order-card-head-actions">
          <Badge variant={statusBadgeVariant(order.status)} label={order.status.replace(/_/g, ' ')} size="sm" />
          <div className="order-card-menu-wrap">
            <button
              type="button"
              className="order-card-menu-button"
              aria-label={`Actions for ${order.customer_name}`}
              aria-expanded={menuOpen}
              onClick={onToggleMenu}
            >
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              <div className="order-card-menu-panel">
                <Link href={`/orders/${order.id}`} onClick={onCloseMenu}>
                  View order
                </Link>
                {canAct && (
                  <Link href={`/dispatch/new?order_id=${order.id}`} onClick={onCloseMenu}>
                    Dispatch
                  </Link>
                )}
                {canAct && (
                  <button
                    type="button"
                    onClick={() => {
                      onTogglePriority()
                      onCloseMenu()
                    }}
                  >
                    {priorityOpen ? 'Close priority' : 'Set priority'}
                  </button>
                )}
                {canReserve && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleReserve()
                      onCloseMenu()
                    }}
                  >
                    {reserveOpen ? 'Close reserve' : 'Reserve stock'}
                  </button>
                )}
                {order.planning_rows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleShortage()
                      onCloseMenu()
                    }}
                  >
                    {expanded ? 'Hide plan details' : 'Plan details'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mobile-card-grid">
        <div><span className="mobile-card-label">Lines</span><strong className="mobile-card-value">{order.line_count}</strong></div>
        <div><span className="mobile-card-label">Ordered</span><strong className="mobile-card-value">{fmt(order.total_ordered)}</strong></div>
        <div><span className="mobile-card-label">Dispatched</span><strong className="mobile-card-value">{fmt(order.total_dispatched)}</strong></div>
        <div><span className="mobile-card-label">Open</span><strong className="mobile-card-value" style={{ color: order.is_stale ? 'var(--danger)' : undefined }}>{fmt(order.open_qty)}</strong></div>
      </div>

      <div className="mobile-card-row" style={{ marginTop: '0.65rem' }}>
        <span className="mobile-card-label">Shortage</span>
        <ShortageChips order={order} expanded={expanded} onToggle={onToggleShortage} />
      </div>

      <div className="order-card-progress" aria-label={`${Math.round(order.dispatch_pct * 100)} percent dispatched`}>
        <div style={{ width: `${order.dispatch_pct * 100}%` }} />
      </div>

      {expanded && (
        <MobileShortageDetails
          order={order}
          shapeMap={shapeMap}
          bindiMap={bindiMap}
          sizeMap={sizeMap}
          dabbiMap={dabbiMap}
        />
      )}

      {priorityOpen && (
        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
          <PriorityFormFields orderId={order.id} onDone={onTogglePriority} />
        </div>
      )}

      {reserveOpen && (
        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(16,185,129,0.05)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
          <ReserveConfirm order={order} onDone={onToggleReserve} />
        </div>
      )}
    </article>
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
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const isFiltered = customer || status || dateFrom || dateTo || shortage
  const activeFilterCount = [customer, status, dateFrom, dateTo, shortage].filter(Boolean).length

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

  return (
    <>
      <section className="orders-filter-shell">
        <div className="orders-filter-summary">
          <button
            type="button"
            className="orders-filter-toggle"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <Filter size={16} />
            <span>Filters</span>
            {activeFilterCount > 0 && <strong>{activeFilterCount}</strong>}
          </button>
          <span className="orders-filter-count">
            Showing {filtered.length} of {orders.length} orders
          </span>
          {isFiltered && (
            <button type="button" className="orders-clear-button" onClick={clearFilters}>
              <X size={14} />
              Clear
            </button>
          )}
        </div>

        {filtersOpen && (
          <div className="responsive-filter-bar orders-filter-grid">
            <div className="responsive-filter-field responsive-filter-wide">
              <span style={filterLabel}>Customer</span>
              <select value={customer} onChange={(e) => setCustomer(e.target.value)} style={filterSelect}>
                <option value="">All customers</option>
                {uniqueCustomers.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>

            <div className="responsive-filter-field">
              <span style={filterLabel}>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={filterSelect}>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="responsive-filter-field">
              <span style={filterLabel}>Date from</span>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={filterDate} />
            </div>

            <div className="responsive-filter-field">
              <span style={filterLabel}>Date to</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={filterDate} />
            </div>

            <div className="responsive-filter-field">
              <span style={filterLabel}>Shortage</span>
              <select value={shortage} onChange={(e) => setShortage(e.target.value)} style={filterSelect}>
                <option value="">All</option>
                <option value="has">Has Shortage</option>
                <option value="none">No Shortage</option>
              </select>
            </div>
          </div>
        )}
      </section>

      <div className="orders-card-list">
        {filtered.map((order) => {
          const isShortageExpanded = expandedShortage.has(order.id)
          const isPriorityOpen = openPriority === order.id
          const isReserveOpen = openReserve === order.id

          return (
            <OrderCard
              key={order.id}
              order={order}
              expanded={isShortageExpanded}
              priorityOpen={isPriorityOpen}
              reserveOpen={isReserveOpen}
              menuOpen={openMenu === order.id}
              onToggleShortage={() => toggleShortage(order.id)}
              onTogglePriority={() => setOpenPriority(isPriorityOpen ? null : order.id)}
              onToggleReserve={() => setOpenReserve(isReserveOpen ? null : order.id)}
              onToggleMenu={() => setOpenMenu(openMenu === order.id ? null : order.id)}
              onCloseMenu={() => setOpenMenu(null)}
              shapeMap={shapeMap}
              bindiMap={bindiMap}
              sizeMap={sizeMap}
              dabbiMap={dabbiMap}
            />
          )
        })}

        {filtered.length === 0 && (
          <div className="order-card order-card-empty">
            No orders match the current filters.
          </div>
        )}
      </div>
    </>
  )
}
