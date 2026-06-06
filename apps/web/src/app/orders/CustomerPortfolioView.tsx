'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { OrderClientRow } from './OrdersClient'

// ── helpers ────────────────────────────────────────────────────

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

function pct(num: number, den: number): string {
  if (den === 0) return '—'
  return `${Math.round((num / den) * 100)}%`
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

function daysTakenStyle(days: number | null): CSSProperties {
  if (days === null) return { color: 'var(--text-muted)' }
  if (days <= 7) return { color: 'var(--success)', fontWeight: 700 }
  if (days <= 14) return { color: 'var(--warning)', fontWeight: 700 }
  return { color: 'var(--danger)', fontWeight: 700 }
}

// ── types ──────────────────────────────────────────────────────

type CustomerGroup = {
  customer_id: string
  customer_name: string
  orders: OrderClientRow[]
  total_ordered: number
  total_dispatched: number
  total_pending: number
  fulfilment_pct: string
  avg_dispatch_days: number | null
}

// ── table cell styles ──────────────────────────────────────────

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

// ── sub-components ─────────────────────────────────────────────

function DispatchEventRows({ orderId, events }: { orderId: string; events: OrderClientRow['dispatch_events_portfolio'] }) {
  if (events.length === 0) {
    return (
      <tr>
        <td colSpan={6} style={{ ...td, paddingLeft: '5rem', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
          No dispatch events yet
        </td>
      </tr>
    )
  }
  return (
    <>
      {events.map((ev) => (
        <tr key={ev.event_id} style={{ background: 'var(--bg-base)' }}>
          <td colSpan={2} style={{ ...td, paddingLeft: '5rem', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            ↳ {ev.dispatch_date}
          </td>
          <td style={{ ...td, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            {ev.reference ?? '—'}
          </td>
          <td style={{ ...tdNum, fontSize: 'var(--text-xs)' }}>{fmt(ev.gross)}</td>
          <td style={{ ...tdNum, fontSize: 'var(--text-xs)' }}>—</td>
          <td style={{ ...td, fontSize: 'var(--text-xs)' }}>
            <Badge
              variant={ev.status === 'confirmed' ? 'success' : ev.status === 'voided' ? 'danger' : 'neutral'}
              label={ev.status}
              size="sm"
            />
          </td>
        </tr>
      ))}
    </>
  )
}

function OrderRows({
  orders,
  expandedOrders,
  onToggleOrder,
}: {
  orders: OrderClientRow[]
  expandedOrders: Set<string>
  onToggleOrder: (id: string) => void
}) {
  return (
    <>
      {orders.map((order) => {
        const daysTaken = order.first_dispatch_date
          ? daysBetween(order.order_date, order.first_dispatch_date)
          : null
        const pending = order.open_qty
        const isExpanded = expandedOrders.has(order.id)

        return (
          <>
            <tr
              key={order.id}
              style={{ cursor: 'pointer', background: isExpanded ? 'rgba(99,102,241,0.04)' : undefined }}
              onClick={() => onToggleOrder(order.id)}
            >
              <td style={{ ...td, paddingLeft: '2.5rem' }}>
                {isExpanded ? <ChevronDown size={13} style={{ verticalAlign: 'middle', marginRight: '0.35rem', color: 'var(--text-muted)' }} /> : <ChevronRight size={13} style={{ verticalAlign: 'middle', marginRight: '0.35rem', color: 'var(--text-muted)' }} />}
                <Link
                  href={`/orders/${order.id}`}
                  onClick={(e) => e.stopPropagation()}
                  style={{ color: 'var(--info)', textDecoration: 'none', fontSize: 'var(--text-sm)' }}
                >
                  {order.order_date}{order.reference ? ` / ${order.reference}` : ''}
                </Link>
              </td>
              <td style={{ ...td, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                {order.first_dispatch_date ?? '—'}
              </td>
              <td style={{ ...td, ...daysTakenStyle(daysTaken) }}>
                {daysTaken !== null ? `${daysTaken}d` : '—'}
              </td>
              <td style={tdNum}>{fmt(order.total_ordered)}</td>
              <td style={tdNum}>{fmt(order.total_dispatched)}</td>
              <td style={{ ...tdNum, color: pending > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                {fmt(pending)}
              </td>
              <td style={td}>
                <Badge variant={statusBadgeVariant(order.status)} label={order.status.replace(/_/g, ' ')} size="sm" />
              </td>
            </tr>
            {isExpanded && (
              <DispatchEventRows orderId={order.id} events={order.dispatch_events_portfolio} />
            )}
          </>
        )
      })}
    </>
  )
}

function SummaryRow({ group }: { group: CustomerGroup }) {
  return (
    <tr style={{ background: 'var(--bg-elevated)', fontWeight: 700 }}>
      <td colSpan={3} style={{ ...td, paddingLeft: '2.5rem', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
        Total — {group.orders.length} order{group.orders.length !== 1 ? 's' : ''}
      </td>
      <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(group.total_ordered)}</td>
      <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(group.total_dispatched)}</td>
      <td style={{ ...tdNum, fontWeight: 700, color: group.total_pending > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
        {fmt(group.total_pending)}
      </td>
      <td style={td} />
    </tr>
  )
}

// ── main component ─────────────────────────────────────────────

export function CustomerPortfolioView({ orders }: { orders: OrderClientRow[] }) {
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set())
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())

  const groups = useMemo<CustomerGroup[]>(() => {
    const map = new Map<string, OrderClientRow[]>()
    for (const o of orders) {
      const list = map.get(o.customer_id) ?? []
      list.push(o)
      map.set(o.customer_id, list)
    }

    return [...map.entries()]
      .map(([customer_id, customerOrders]) => {
        const total_ordered = customerOrders.reduce((s, o) => s + o.total_ordered, 0)
        const total_dispatched = customerOrders.reduce((s, o) => s + o.total_dispatched, 0)
        const total_pending = customerOrders.reduce((s, o) => s + o.open_qty, 0)

        const ordersWithDispatch = customerOrders.filter((o) => o.first_dispatch_date !== null)
        const avg_dispatch_days =
          ordersWithDispatch.length > 0
            ? Math.round(
                ordersWithDispatch.reduce((s, o) => s + daysBetween(o.order_date, o.first_dispatch_date!), 0) /
                  ordersWithDispatch.length,
              )
            : null

        return {
          customer_id,
          customer_name: customerOrders[0].customer_name,
          orders: customerOrders,
          total_ordered,
          total_dispatched,
          total_pending,
          fulfilment_pct: pct(total_dispatched, total_ordered),
          avg_dispatch_days,
        }
      })
      .sort((a, b) => b.total_pending - a.total_pending)
  }, [orders])

  function toggleCustomer(id: string) {
    setExpandedCustomers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleOrder(id: string) {
    setExpandedOrders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (groups.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
        No orders to display.
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
        <thead>
          <tr>
            <th style={th}>Customer / Order</th>
            <th style={th}>First Dispatch</th>
            <th style={thNum}>Days Taken</th>
            <th style={thNum}>Ordered</th>
            <th style={thNum}>Dispatched</th>
            <th style={thNum}>Pending</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => {
            const isExpanded = expandedCustomers.has(group.customer_id)
            return (
              <>
                {/* Customer header row */}
                <tr
                  key={group.customer_id}
                  style={{ cursor: 'pointer', background: 'var(--bg-elevated)' }}
                  onClick={() => toggleCustomer(group.customer_id)}
                >
                  <td style={{ ...td, fontWeight: 700 }}>
                    {isExpanded
                      ? <ChevronDown size={14} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                      : <ChevronRight size={14} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
                    }
                    {group.customer_name}
                    <span style={{ marginLeft: '0.5rem', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 400 }}>
                      {group.orders.length} order{group.orders.length !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td style={{ ...td, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    {group.avg_dispatch_days !== null ? `Avg ${group.avg_dispatch_days}d` : '—'}
                  </td>
                  <td style={{ ...tdNum, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    {group.fulfilment_pct} filled
                  </td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(group.total_ordered)}</td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(group.total_dispatched)}</td>
                  <td style={{ ...tdNum, fontWeight: 700, color: group.total_pending > 0 ? 'var(--warning)' : 'var(--success)' }}>
                    {fmt(group.total_pending)}
                  </td>
                  <td style={td} />
                </tr>

                {/* Order rows */}
                {isExpanded && (
                  <>
                    <OrderRows
                      orders={group.orders}
                      expandedOrders={expandedOrders}
                      onToggleOrder={toggleOrder}
                    />
                    <SummaryRow group={group} />
                  </>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
