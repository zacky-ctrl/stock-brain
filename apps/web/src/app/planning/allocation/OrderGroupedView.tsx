'use client'

import { useState, useActionState, useTransition, useEffect, useRef, Fragment } from 'react'
import {
  setOrderPriorityAction,
  reserveOrderLinesAction,
} from '../../orders/actions'
import { releaseReservationAction, releaseAllOrderReservationsAction } from './actions'
import { tableTd, inputStyle, btnPrimary, msgError, msgOk, fieldWrap } from '@/lib/ui'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { PlanningAllocationRow, PlanningLineStatus } from '@stock-brain/types'
import type { ActionState } from '@/lib/masters'

// ── enriched row type ──────────────────────────────────────────

export type PlanningRowEnriched = PlanningAllocationRow & {
  best_balance_id: string | null
  best_balance_available: number
}

// ── severity (used to pick worst status per order) ─────────────

const STATUS_SEVERITY: Record<PlanningLineStatus, number> = {
  procure_velvet:             10,
  cut_on_machine:             9,
  cut_on_machine_override:    8,
  give_to_labour:             7,
  give_to_labour_override:    6,
  covered_by_wip:             5,
  ready_to_dispatch:          4,
  ready_to_dispatch_override: 3,
  fully_dispatched:           2,
  closed:                     1,
}

// ── helpers ─────────────────────────────────────────────────────

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

function worstStatus(rows: PlanningRowEnriched[]): PlanningLineStatus {
  return rows.reduce((worst, r) =>
    STATUS_SEVERITY[r.planning_status] > STATUS_SEVERITY[worst] ? r.planning_status : worst,
    rows[0]?.planning_status ?? 'closed' as PlanningLineStatus,
  )
}

function daysAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (diff === 0) return 'today'
  if (diff === 1) return '1 day ago'
  return `${diff} days ago`
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function rowBgByWorstStatus(status: PlanningLineStatus): string | undefined {
  if (status === 'ready_to_dispatch' || status === 'ready_to_dispatch_override') return 'rgba(16,185,129,0.04)'
  if (status === 'give_to_labour' || status === 'give_to_labour_override') return 'rgba(245,158,11,0.05)'
  if (status === 'cut_on_machine' || status === 'cut_on_machine_override' || status === 'procure_velvet') return 'rgba(239,68,68,0.04)'
  if (status === 'covered_by_wip') return 'rgba(99,102,241,0.04)'
  return undefined
}

function skuRowBg(row: PlanningRowEnriched): string | undefined {
  if (row.ready_allocated_qty > 0) return 'rgba(16,185,129,0.05)'
  if (row.cuttings_allocated_qty > 0) return 'rgba(245,158,11,0.06)'
  if (row.shortage_qty > 0) return 'rgba(239,68,68,0.05)'
  if (row.wip_allocated_qty > 0) return 'rgba(99,102,241,0.05)'
  return undefined
}

// ── sub-components ──────────────────────────────────────────────

function PriorityBadge({
  label,
  hasOverride,
  onClick,
  canManagePlanning,
}: {
  label: string
  hasOverride: boolean
  onClick: () => void
  canManagePlanning: boolean
}) {
  return (
    <button
      type="button"
      onClick={canManagePlanning ? onClick : undefined}
      style={{
        cursor: canManagePlanning ? 'pointer' : 'default',
        background: 'none',
        fontSize: 'var(--text-xs)',
        padding: '0.15rem 0.45rem',
        border: '1px solid',
        borderRadius: 'var(--radius-sm)',
        borderColor: hasOverride ? 'var(--accent)' : 'var(--border)',
        color: hasOverride ? 'var(--accent)' : 'var(--text-secondary)',
        fontWeight: hasOverride ? 600 : 400,
      }}
      title={canManagePlanning ? 'Click to set priority' : undefined}
    >
      {label}
    </button>
  )
}

function InlinePriorityForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(setOrderPriorityAction, null)
  const formRef = useRef<HTMLFormElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)

  const isConflict = !!(state && 'error' in state && state.error.includes('already assigned to'))

  function handleSetAnyway() {
    if (confirmRef.current) confirmRef.current.value = 'true'
    formRef.current?.requestSubmit()
  }

  return (
    <td colSpan={10} style={{ padding: '0.75rem 1rem', background: 'var(--bg-elevated)', borderBottom: '2px solid var(--border)' }}>
      <form ref={formRef} action={formAction} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <input type="hidden" name="order_id" value={orderId} />
        <input type="hidden" name="confirm" value="" ref={confirmRef} />
        {state && 'error' in state && !isConflict && <span style={{ ...msgError, marginBottom: 0, fontSize: 'var(--text-xs)' }}>✗ {state.error}</span>}
        {state && 'success' in state && <span style={{ ...msgOk, marginBottom: 0, fontSize: 'var(--text-xs)' }}>✓ {state.success}</span>}
        <div style={{ ...fieldWrap, flexDirection: 'row', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Priority (1=highest):</span>
          <input name="priority_value" type="number" min="1" step="1" placeholder="1" required style={{ ...inputStyle, width: '65px', padding: '0.2rem 0.35rem', fontSize: 'var(--text-xs)' }} />
        </div>
        <div style={{ ...fieldWrap, flexDirection: 'row', alignItems: 'center', gap: '0.35rem', flex: 1, minWidth: '180px' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Reason:</span>
          <input name="reason" placeholder="Reason (required)" required style={{ ...inputStyle, padding: '0.2rem 0.35rem', fontSize: 'var(--text-xs)' }} />
        </div>
        {isConflict ? (
          <>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', fontWeight: 600 }}>⚠ {(state as { error: string }).error}</span>
            <button type="button" onClick={onDone} style={{ padding: '0.2rem 0.45rem', fontSize: 'var(--text-xs)', cursor: 'pointer', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>
              Cancel
            </button>
            <button type="button" disabled={isPending} onClick={handleSetAnyway} style={{ ...btnPrimary, background: 'var(--warning)', padding: '0.2rem 0.6rem', fontSize: 'var(--text-xs)', marginTop: 0 }}>
              {isPending ? 'Saving…' : 'Set Anyway'}
            </button>
          </>
        ) : (
          <>
            <button type="submit" disabled={isPending} style={{ ...btnPrimary, padding: '0.2rem 0.6rem', fontSize: 'var(--text-xs)', marginTop: 0 }}>
              {isPending ? 'Saving…' : 'Apply'}
            </button>
            <button type="button" onClick={onDone} style={{ padding: '0.2rem 0.45rem', fontSize: 'var(--text-xs)', cursor: 'pointer', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>
              Cancel
            </button>
          </>
        )}
      </form>
    </td>
  )
}

function InlineReservePanel({
  orderId,
  customerName,
  reservableRows,
  reservationByLineId,
  onDone,
}: {
  orderId: string
  customerName: string
  reservableRows: PlanningRowEnriched[]
  reservationByLineId: Record<string, { id: string; order_line_id: string; ready_stock_balance_id: string; allocated_qty: number }>
  onDone: () => void
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(reserveOrderLinesAction, null)

  // CHANGE 3: auto-close after successful Reserve All
  useEffect(() => {
    if (state && 'success' in state) {
      const t = setTimeout(onDone, 1000)
      return () => clearTimeout(t)
    }
  }, [state, onDone])

  // CHANGE 1: bulk unreserve state
  const [bulkMode, setBulkMode] = useState<'idle' | 'confirm' | 'done'>('idle')
  const [bulkReason, setBulkReason] = useState('')
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [isPendingBulk, startBulkTransition] = useTransition()

  const eligible = reservableRows.filter(
    (r) => !reservationByLineId[r.order_line_id] && r.best_balance_id && r.ready_allocated_qty > 0,
  )
  const totalQty = eligible.reduce((s, r) => s + r.ready_allocated_qty, 0)
  const linesJson = JSON.stringify(
    eligible.map((r) => ({ line_id: r.order_line_id, balance_id: r.best_balance_id, qty: r.ready_allocated_qty })),
  )

  const reserved = reservableRows.filter((r) => reservationByLineId[r.order_line_id])

  // Scope to this order's lines — reservationByLineId is a global map across all orders
  const thisOrderLineIds = new Set(reservableRows.map((r) => r.order_line_id))
  const thisOrderReservations = Object.values(reservationByLineId).filter(
    (r) => thisOrderLineIds.has(r.order_line_id),
  )

  // All active reservations for this order — includes lines no longer visible in the engine
  const allOrderReservations = thisOrderReservations
  const totalReservedQty = allOrderReservations.reduce((s, res) => s + res.allocated_qty, 0)

  function handleUnreserveAll() {
    if (!bulkReason.trim()) return
    setBulkError(null)
    startBulkTransition(async () => {
      const result = await releaseAllOrderReservationsAction({
        allocationIds: allOrderReservations.map((r) => r.id),
        reason: bulkReason.trim(),
      })
      if (result.error) {
        setBulkError(result.error)
        return
      }
      setBulkMode('done')
      setTimeout(onDone, 800)
    })
  }

  // CHANGE 4: position: relative on td so the × button can be absolute
  return (
    <td colSpan={10} style={{ padding: '0.75rem 1rem', background: 'rgba(245,158,11,0.04)', borderBottom: '2px solid var(--border)', position: 'relative' }}>

      {/* CHANGE 4: close button */}
      <button
        type="button"
        onClick={onDone}
        title="Close"
        style={{
          position: 'absolute',
          top: '0.4rem',
          right: '0.5rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontSize: '1.1rem',
          lineHeight: 1,
          padding: '0.1rem 0.25rem',
        }}
      >
        ×
      </button>

      {allOrderReservations.length > 0 && (
        <div style={{ marginBottom: '0.5rem' }}>
          {/* CHANGE 1: Unreserve All header row */}
          {bulkMode === 'done' ? (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success)', fontWeight: 600 }}>✓ All released</span>
          ) : isPendingBulk ? (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Releasing {allOrderReservations.length} reservations…</span>
          ) : bulkMode === 'confirm' ? (
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
              {bulkError && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)' }}>✗ {bulkError}</span>}
              <input
                autoFocus
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                placeholder="Reason for releasing all (required)"
                style={{ ...inputStyle, padding: '0.2rem 0.35rem', fontSize: 'var(--text-xs)', minWidth: '200px', flex: 1 }}
              />
              <button
                type="button"
                disabled={!bulkReason.trim()}
                onClick={handleUnreserveAll}
                style={{ padding: '0.2rem 0.6rem', fontSize: 'var(--text-xs)', cursor: 'pointer', background: 'var(--danger)', border: 'none', borderRadius: 'var(--radius-sm)', color: '#fff', fontWeight: 600 }}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => { setBulkMode('idle'); setBulkReason(''); setBulkError(null) }}
                style={{ padding: '0.2rem 0.45rem', fontSize: 'var(--text-xs)', cursor: 'pointer', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Reserved lines:</span>
              <button
                type="button"
                onClick={() => setBulkMode('confirm')}
                style={{ padding: '0.1rem 0.5rem', fontSize: 'var(--text-xs)', cursor: 'pointer', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontWeight: 600 }}
              >
                Unreserve All ({allOrderReservations.length} lines, {fmt(totalReservedQty)} gross)
              </button>
            </div>
          )}

          {/* CHANGE 2: individual lines — kept exactly as before, hidden only while bulk is running/done */}
          {!isPendingBulk && bulkMode !== 'done' && reserved.map((r) => {
            const res = reservationByLineId[r.order_line_id]!
            return (
              <ReserveReleaseLine
                key={r.order_line_id}
                allocationId={res.id}
                qty={res.allocated_qty}
                lineId={r.order_line_id}
              />
            )
          })}
        </div>
      )}

      {eligible.length > 0 ? (
        <form action={formAction} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="hidden" name="lines_json" value={linesJson} />
          {state && 'error' in state && <span style={{ ...msgError, marginBottom: 0, fontSize: 'var(--text-xs)' }}>✗ {state.error}</span>}
          {state && 'success' in state && <span style={{ ...msgOk, marginBottom: 0, fontSize: 'var(--text-xs)' }}>✓ {state.success}</span>}
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Reserve <strong>{fmt(totalQty)} gross</strong> across {eligible.length} eligible line(s) for {customerName}?
          </span>
          <button type="submit" disabled={isPending} style={{ ...btnPrimary, background: 'var(--success)', padding: '0.2rem 0.6rem', fontSize: 'var(--text-xs)', marginTop: 0 }}>
            {isPending ? 'Reserving…' : 'Confirm Reserve'}
          </button>
          <button type="button" onClick={onDone} style={{ padding: '0.2rem 0.45rem', fontSize: 'var(--text-xs)', cursor: 'pointer', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>
            Close
          </button>
        </form>
      ) : (
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>No additional lines eligible for reservation.</span>
          <button type="button" onClick={onDone} style={{ padding: '0.2rem 0.45rem', fontSize: 'var(--text-xs)', cursor: 'pointer', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>
            Close
          </button>
        </div>
      )}
    </td>
  )
}

function ReserveReleaseLine({ allocationId, qty, lineId }: { allocationId: string; qty: number; lineId: string }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(releaseReservationAction, null)
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.2rem' }}>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', fontWeight: 600 }}>
        🔒 {fmt(qty)} gross reserved
      </span>
      <form action={formAction} style={{ display: 'inline' }}>
        <input type="hidden" name="allocation_id" value={allocationId} />
        <input type="hidden" name="reason" value="Released from planning page" />
        {state && 'error' in state && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)' }}>✗ {state.error}</span>}
        <button type="submit" disabled={isPending} style={{ padding: '0.1rem 0.4rem', fontSize: 'var(--text-xs)', cursor: 'pointer', background: 'none', border: '1px solid var(--danger)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)' }}>
          {isPending ? '…' : 'Release'}
        </button>
      </form>
    </div>
  )
}

function InlineOverridePanel({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  return (
    <td colSpan={10} style={{ padding: '0.75rem 1rem', background: 'var(--bg-elevated)', borderBottom: '2px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          Planning overrides are managed per-line. Open the order to access override controls.
        </span>
        <Link
          href={`/orders/${orderId}`}
          style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', textDecoration: 'underline' }}
        >
          Open Order →
        </Link>
        <Link
          href={`/admin/planning-overrides`}
          style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textDecoration: 'underline' }}
        >
          All Overrides
        </Link>
        <button type="button" onClick={onDone} style={{ padding: '0.2rem 0.45rem', fontSize: 'var(--text-xs)', cursor: 'pointer', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>
          Close
        </button>
      </div>
    </td>
  )
}

function ThreeDotMenu({
  orderId,
  hasReservable,
  hasReservations,
  onSetPriority,
  onReserve,
  canManagePlanning,
}: {
  orderId: string
  hasReservable: boolean
  hasReservations: boolean
  onSetPriority: () => void
  onReserve: () => void
  canManagePlanning: boolean
}) {
  const [open, setOpen] = useState(false)

  const itemStyle: CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '0.4rem 0.75rem',
    fontSize: 'var(--text-xs)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    borderRadius: 0,
  }

  const linkItemStyle: CSSProperties = {
    display: 'block',
    padding: '0.4rem 0.75rem',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-primary)',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  }

  const dividerStyle: CSSProperties = {
    height: '1px',
    background: 'var(--border)',
    margin: '0.25rem 0',
  }

  function handle(action: () => void) {
    setOpen(false)
    action()
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          cursor: 'pointer',
          background: 'none',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.2rem 0.5rem',
          fontSize: '1rem',
          color: 'var(--text-secondary)',
          lineHeight: 1,
        }}
        title="More actions"
      >
        ⋮
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          />
          <div style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            zIndex: 100,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            minWidth: '200px',
            overflow: 'hidden',
          }}>
            <Link href={`/dispatch/new?order_id=${orderId}`} style={linkItemStyle} onClick={() => setOpen(false)}>
              Dispatch
            </Link>
            <Link href={`/orders/${orderId}`} style={linkItemStyle} onClick={() => setOpen(false)}>
              View Order
            </Link>
            {canManagePlanning && (
              <>
                <div style={dividerStyle} />
                <button style={itemStyle} onClick={() => handle(onSetPriority)}>Set Priority</button>
                {(hasReservable || hasReservations) && (
                  <button
                    style={{ ...itemStyle, color: hasReservations ? 'var(--warning)' : 'var(--text-primary)' }}
                    onClick={() => handle(onReserve)}
                  >
                    {hasReservations ? 'Unreserve All' : 'Reserve All'}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function SkuActionButton({ row, orderId }: { row: PlanningRowEnriched; orderId: string }) {
  if (row.ready_allocated_qty > 0) {
    return (
      <Link
        href={`/dispatch/new?order_id=${orderId}`}
        style={{
          display: 'inline-block',
          padding: '0.2rem 0.6rem',
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          background: 'rgba(16,185,129,0.12)',
          color: 'var(--success)',
          border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: 'var(--radius-sm)',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Dispatch
      </Link>
    )
  }
  if (row.cuttings_allocated_qty > 0) {
    return (
      <Link
        href={`/reports/labour-issue?order=${orderId}`}
        style={{
          display: 'inline-block',
          padding: '0.2rem 0.6rem',
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          background: 'rgba(245,158,11,0.12)',
          color: 'var(--warning)',
          border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 'var(--radius-sm)',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Issue
      </Link>
    )
  }
  if (row.shortage_qty > 0) {
    return (
      <Link
        href="/reports/cutting-required"
        style={{
          display: 'inline-block',
          padding: '0.2rem 0.6rem',
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          background: 'rgba(239,68,68,0.12)',
          color: 'var(--danger)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 'var(--radius-sm)',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Cut
      </Link>
    )
  }
  if (row.wip_allocated_qty > 0) {
    return <span style={{ fontSize: 'var(--text-xs)', color: 'var(--info)', fontWeight: 500 }}>Await</span>
  }
  return <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>—</span>
}

// ── props ───────────────────────────────────────────────────────

export type OrderGroupedViewProps = {
  rows: PlanningRowEnriched[]
  shapeMap: Record<string, string>
  bindiMap: Record<string, string>
  sizeMap: Record<string, string>
  dabbiMap: Record<string, string>
  reservationByLineId: Record<string, { id: string; order_line_id: string; ready_stock_balance_id: string; allocated_qty: number }>
  role?: string
}

// ── main component ──────────────────────────────────────────────

export function OrderGroupedView({
  rows,
  shapeMap,
  bindiMap,
  sizeMap,
  dabbiMap,
  reservationByLineId,
  role,
}: OrderGroupedViewProps) {
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())
  // 'priority' | 'reserve' | 'override' | null
  const [openPanel, setOpenPanel] = useState<{ orderId: string; type: 'priority' | 'reserve' | 'override' } | null>(null)

  function openInlinePanel(orderId: string, type: 'priority' | 'reserve' | 'override') {
    setOpenPanel((prev) =>
      prev?.orderId === orderId && prev.type === type ? null : { orderId, type },
    )
  }
  function closePanel() { setOpenPanel(null) }

  const canManagePlanning = role !== 'stock_operator' && role !== 'viewer' && role !== 'accountant'

  // Group rows by order_id
  const orderIds: string[] = []
  const orderGroups = new Map<string, PlanningRowEnriched[]>()
  for (const row of rows) {
    if (!orderGroups.has(row.order_id)) {
      orderIds.push(row.order_id)
      orderGroups.set(row.order_id, [])
    }
    orderGroups.get(row.order_id)!.push(row)
  }

  const tdBase: CSSProperties = {
    ...tableTd,
    padding: '0.75rem 0.85rem',
    verticalAlign: 'middle',
  }

  const tdNum: CSSProperties = {
    ...tdBase,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    paddingRight: '1.25rem',
  }

  const thStyle: CSSProperties = {
    padding: '0.6rem 0.85rem',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    borderBottom: '2px solid var(--border)',
    background: 'var(--bg-elevated)',
    whiteSpace: 'nowrap',
  }

  const thNumStyle: CSSProperties = {
    ...thStyle,
    textAlign: 'right',
    paddingRight: '1.25rem',
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="stock-table" style={{ minWidth: '900px', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: '28px' }}></th>
            <th style={{ ...thStyle, minWidth: '180px' }}>Customer</th>
            <th style={{ ...thStyle, minWidth: '90px' }}>Date</th>
            <th style={{ ...thStyle, minWidth: '70px' }}>Priority</th>
            <th style={{ ...thStyle, width: '60px', textAlign: 'center' }}>Reserved</th>
            <th style={{ ...thNumStyle, minWidth: '80px' }}>Pending</th>
            <th style={{ ...thNumStyle, minWidth: '70px' }}>Ready</th>
            <th style={{ ...thNumStyle, minWidth: '70px' }}>WIP</th>
            <th style={{ ...thNumStyle, minWidth: '70px' }}>Labour</th>
            <th style={{ ...thNumStyle, minWidth: '70px' }}>Cut</th>
            <th style={{ ...thStyle, width: '36px' }}></th>
          </tr>
        </thead>
        <tbody>
          {orderIds.map((orderId) => {
            const group = orderGroups.get(orderId)!
            const first = group[0]
            const isExpanded = expandedOrders.has(orderId)

            const totalPending = group.reduce((s, r) => s + r.open_qty, 0)
            const totalReady   = group.reduce((s, r) => s + r.ready_allocated_qty, 0)
            const totalWip     = group.reduce((s, r) => s + r.wip_allocated_qty, 0)
            const totalLabour  = group.reduce((s, r) => s + r.cuttings_allocated_qty, 0)
            const totalCut     = group.reduce((s, r) =>
              (r.planning_status === 'cut_on_machine' || r.planning_status === 'cut_on_machine_override' || r.planning_status === 'procure_velvet')
                ? s + r.shortage_qty : s, 0)

            const hasOverride      = group.some((r) => r.has_priority_override)
            const bestPriorityRank = Math.min(...group.map((r) => r.priority_rank))
            const priorityLabel    = hasOverride ? `P${bestPriorityRank} ★` : `W${bestPriorityRank}`

            const anyReserved  = group.some((r) => reservationByLineId[r.order_line_id])
            const anyWip       = group.some((r) => r.wip_allocated_qty > 0)
            const canReserveAny = group.some(
              (r) => !reservationByLineId[r.order_line_id] && r.best_balance_id && r.ready_allocated_qty > 0,
            )

            const worst = worstStatus(group)
            const rowBg = anyReserved
              ? 'rgba(245,158,11,0.04)'
              : hasOverride
                ? 'rgba(245,158,11,0.06)'
                : rowBgByWorstStatus(worst)

            const isPriorityOpen = openPanel?.orderId === orderId && openPanel.type === 'priority'
            const isReserveOpen  = openPanel?.orderId === orderId && openPanel.type === 'reserve'
            const isOverrideOpen = openPanel?.orderId === orderId && openPanel.type === 'override'

            return (
              <Fragment key={orderId}>
                {/* Order summary row */}
                <tr
                  style={{ background: rowBg, cursor: 'pointer', minHeight: '64px' }}
                  onClick={() => setExpandedOrders((prev) => {
                    const next = new Set(prev)
                    if (next.has(orderId)) next.delete(orderId)
                    else next.add(orderId)
                    return next
                  })}
                >
                  {/* Expand toggle */}
                  <td style={{ ...tdBase, paddingLeft: '0.6rem', paddingRight: '0.4rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {isExpanded ? '▼' : '▶'}
                  </td>

                  {/* CUSTOMER */}
                  <td style={{ ...tdBase, minHeight: '64px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ fontSize: 'var(--text-base)', fontWeight: 500 }}>
                        {first.customer_name}
                      </span>
                      {anyReserved && <span title="Has reserved stock">🔒</span>}
                      {anyWip && (
                        <span title="Has WIP" style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--info)', display: 'inline-block' }} />
                      )}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                      {daysAgo(first.order_date)}
                    </div>
                  </td>

                  {/* DATE */}
                  <td style={tdBase} onClick={(e) => e.stopPropagation()}>
                    <div style={{ fontSize: 'var(--text-xs)' }}>{fmtDate(first.order_date)}</div>
                    {first.promised_date && (
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                        Due {fmtDate(first.promised_date)}
                      </div>
                    )}
                  </td>

                  {/* PRIORITY */}
                  <td style={tdBase} onClick={(e) => e.stopPropagation()}>
                    <PriorityBadge
                      label={priorityLabel}
                      hasOverride={hasOverride}
                      onClick={() => openInlinePanel(orderId, 'priority')}
                      canManagePlanning={canManagePlanning}
                    />
                  </td>

                  {/* RESERVED */}
                  <td style={{ ...tdBase, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                    {!canManagePlanning ? (
                      anyReserved ? (
                        <span title="Has reserved stock" style={{ fontSize: '1rem', color: 'var(--warning)' }}>🔒</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>—</span>
                      )
                    ) : anyReserved ? (
                      <button
                        onClick={() => openInlinePanel(orderId, 'reserve')}
                        style={{ cursor: 'pointer', background: 'none', border: 'none', fontSize: '1rem', color: 'var(--warning)', padding: '0.1rem' }}
                        title="View / release reservations"
                      >
                        🔒
                      </button>
                    ) : canReserveAny ? (
                      <button
                        onClick={() => openInlinePanel(orderId, 'reserve')}
                        style={{ cursor: 'pointer', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', padding: '0.1rem 0.35rem' }}
                        title="Reserve available stock"
                      >
                        Reserve
                      </button>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>—</span>
                    )}
                  </td>

                  {/* PENDING */}
                  <td style={{ ...tdNum, fontWeight: 700 }}>{fmt(totalPending)}</td>

                  {/* READY */}
                  <td style={{ ...tdNum, fontWeight: totalReady > 0 ? 700 : 400, color: totalReady > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                    {totalReady > 0 ? fmt(totalReady) : '—'}
                  </td>

                  {/* WIP */}
                  <td style={{ ...tdNum, color: totalWip > 0 ? 'var(--info)' : 'var(--text-muted)' }} onClick={(e) => e.stopPropagation()}>
                    {totalWip > 0 ? (
                      <Link
                        href={`/planning/wip?order_id=${orderId}`}
                        style={{ color: 'var(--info)', textDecoration: 'none', fontVariantNumeric: 'tabular-nums' }}
                        title="View WIP for this order"
                      >
                        {fmt(totalWip)}
                      </Link>
                    ) : '—'}
                  </td>

                  {/* LABOUR */}
                  <td style={{ ...tdNum, color: totalLabour > 0 ? 'var(--warning)' : 'var(--text-muted)' }} onClick={(e) => e.stopPropagation()}>
                    {totalLabour > 0 ? (
                      <Link
                        href={`/reports/labour-issue?order=${orderId}`}
                        style={{ color: 'var(--warning)', textDecoration: 'none', fontVariantNumeric: 'tabular-nums' }}
                        title="Open Labour Issue report for this order"
                      >
                        {fmt(totalLabour)}
                      </Link>
                    ) : '—'}
                  </td>

                  {/* CUT */}
                  <td style={{ ...tdNum, color: totalCut > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {totalCut > 0 ? fmt(totalCut) : '—'}
                  </td>

                  {/* THREE-DOT */}
                  <td style={{ ...tdBase, paddingLeft: '0.4rem', paddingRight: '0.75rem' }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Link
                        href="/planning/labour-issue"
                        style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textDecoration: 'none' }}
                      >
                        Labour
                      </Link>
                      <Link
                        href="/planning/cutting-required"
                        style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', textDecoration: 'none' }}
                      >
                        Cutting
                      </Link>
                      <ThreeDotMenu
                        orderId={orderId}
                        hasReservable={canReserveAny}
                        hasReservations={anyReserved}
                        onSetPriority={() => openInlinePanel(orderId, 'priority')}
                        onReserve={() => openInlinePanel(orderId, 'reserve')}
                        canManagePlanning={canManagePlanning}
                      />
                    </div>
                  </td>
                </tr>

                {/* Inline panels */}
                {canManagePlanning && isPriorityOpen && (
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: 0 }} />
                    <InlinePriorityForm orderId={orderId} onDone={closePanel} />
                  </tr>
                )}
                {canManagePlanning && isReserveOpen && (
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: 0 }} />
                    <InlineReservePanel
                      orderId={orderId}
                      customerName={first.customer_name}
                      reservableRows={group}
                      reservationByLineId={reservationByLineId}
                      onDone={closePanel}
                    />
                  </tr>
                )}
                {isOverrideOpen && (
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: 0 }} />
                    <InlineOverridePanel orderId={orderId} onDone={closePanel} />
                  </tr>
                )}

                {/* Expanded SKU rows */}
                {isExpanded && group.map((row) => {
                  const bg = skuRowBg(row)
                  return (
                    <tr key={row.order_line_id} style={{ background: bg, borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ ...tableTd, paddingLeft: '1.5rem', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }} colSpan={2}>
                        <span style={{ marginRight: '0.35rem', color: 'var(--text-muted)' }}>└</span>
                        <span style={{ fontWeight: 500 }}>{shapeMap[row.shape_design_id] ?? '—'}</span>
                        <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>{bindiMap[row.bindi_colour_id] ?? '—'}</span>
                        <span style={{ color: 'var(--text-secondary)', marginLeft: '0.4rem' }}>{sizeMap[row.size_id] ?? '—'}</span>
                        <span style={{ color: 'var(--text-muted)', marginLeft: '0.4rem' }}>{dabbiMap[row.dabbi_colour_id] ?? '—'}</span>
                      </td>
                      <td colSpan={3} />
                      {/* Pending */}
                      <td style={{ ...tdNum, fontSize: 'var(--text-xs)', fontWeight: 600 }}>{fmt(row.open_qty)}</td>
                      {/* Ready */}
                      <td style={{ ...tdNum, fontSize: 'var(--text-xs)', fontWeight: row.ready_allocated_qty > 0 ? 700 : 400, color: row.ready_allocated_qty > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                        {row.ready_allocated_qty > 0 ? fmt(row.ready_allocated_qty) : '—'}
                      </td>
                      {/* WIP */}
                      <td style={{ ...tdNum, fontSize: 'var(--text-xs)', color: row.wip_allocated_qty > 0 ? 'var(--info)' : 'var(--text-muted)' }}>
                        {row.wip_allocated_qty > 0 ? (
                          <Link
                            href={`/planning/wip?order_id=${row.order_id}`}
                            style={{ color: 'var(--info)', textDecoration: 'none' }}
                          >
                            {fmt(row.wip_allocated_qty)}
                          </Link>
                        ) : '—'}
                      </td>
                      {/* Labour */}
                      <td style={{ ...tdNum, fontSize: 'var(--text-xs)', color: row.cuttings_allocated_qty > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                        {row.cuttings_allocated_qty > 0 ? fmt(row.cuttings_allocated_qty) : '—'}
                      </td>
                      {/* Cut */}
                      <td style={{ ...tdNum, fontSize: 'var(--text-xs)', color: row.shortage_qty > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {row.shortage_qty > 0 ? fmt(row.shortage_qty) : '—'}
                      </td>
                      {/* Action */}
                      <td style={{ ...tableTd, padding: '0.5rem 0.75rem', verticalAlign: 'middle' }}>
                        <SkuActionButton row={row} orderId={orderId} />
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
