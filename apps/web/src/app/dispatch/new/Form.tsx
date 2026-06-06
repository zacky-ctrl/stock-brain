'use client'

import { useActionState, useState, useCallback, useMemo, useEffect } from 'react'
import { createDispatchAction, releaseRemainingReservationsAction } from './actions'
import type { ActionState } from '@/lib/masters'
import type { DispatchActionState } from './actions'
import { fieldWrap, inputStyle, selectStyle, btnPrimary, msgError } from '@/lib/ui'
import type { CSSProperties } from 'react'
import { MatrixViewToggle } from '@/components/matrix/MatrixViewToggle'
import { MatrixGrid } from '@/components/matrix/MatrixGrid'
import { MatrixFilterBar } from '@/components/matrix/MatrixFilterBar'
import {
  buildMatrixFromOrderLines,
  buildMatrixFromStockBalances,
  parseMatrixToDispatchLines,
  filterMatrixData,
} from '@stock-brain/domain'
import type {
  SizeMasterRow,
  DesignMasterRow,
  ColourMasterRow,
  OrderLineForDispatch,
} from '@stock-brain/domain'
import type { MatrixChangeEvent, FilterConfig, ActiveFilters } from '@stock-brain/types'

// ── Parcel target ────────────────────────────────────────────
const PARCEL_TARGET_MIN = 50
const PARCEL_TARGET_MAX = 53

export type StockOption = {
  id: string           // ready_stock_balance_id
  brand: string
  available_qty: number
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  reserved_for_this_order?: boolean
}

export type ExtraStockOption = {
  id: string
  label: string
  available_qty: number
  gross_qty: number
  committed_qty: number
}

export type OpenOrderLine = {
  id: string
  order_id: string
  order_date: string
  order_reference: string | null
  shape: string
  bindi_colour: string
  size: string
  dabbi_colour: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  ordered_qty: number
  open_qty: number
  stock_options: StockOption[]
}

export type DispatchFormProps = {
  customerId: string
  customerName: string
  openLines: OpenOrderLine[]
  sizeMaster?: SizeMasterRow[]
  designMaster?: DesignMasterRow[]
  colourMaster?: ColourMasterRow[]
  extraStockOptions?: ExtraStockOption[]
}

type OrderedLineState = {
  order_id: string
  order_line_id: string
  ready_stock_balance_id: string
  quantity_dispatched: string
  skipped: boolean           // remove this line from parcel
  is_substitute: boolean     // send a different SKU instead
  sub_ready_stock_balance_id: string  // substitute SKU balance id
  override_reason: string    // reason if going above available stock
}

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

function matrixCellKey(change: MatrixChangeEvent): string {
  return `${change.design_id}|${change.colour_id}|${change.size_id}`
}

function buildInitialMatrixChanges(openLines: OpenOrderLine[]): MatrixChangeEvent[] {
  const changesByCell = new Map<string, MatrixChangeEvent>()

  for (const ol of openLines) {
    if (ol.open_qty <= 0) continue
    const key = `${ol.shape_design_id}|${ol.bindi_colour_id}|${ol.size_id}`
    const existing = changesByCell.get(key)
    changesByCell.set(key, {
      design_id: ol.shape_design_id,
      colour_id: ol.bindi_colour_id,
      size_id: ol.size_id,
      quantity: (existing?.quantity ?? 0) + ol.open_qty,
    })
  }

  return [...changesByCell.values()]
}

export function DispatchForm({
  customerId,
  customerName,
  openLines,
  sizeMaster = [],
  designMaster = [],
  colourMaster = [],
  extraStockOptions = [],
}: DispatchFormProps) {
  const [state, formAction, isPending] = useActionState<DispatchActionState, FormData>(createDispatchAction, null)
  const [releaseState, releaseAction, isReleasePending] = useActionState<ActionState, FormData>(releaseRemainingReservationsAction, null)
  const today = new Date().toISOString().split('T')[0]
  const [view, setView] = useState<'list' | 'matrix'>('matrix')
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({})
  const dispatchResult = state && 'dispatch_id' in state ? state : null

  const [entries, setEntries] = useState<OrderedLineState[]>(
    openLines.map((ol) => ({
      order_id: ol.order_id,
      order_line_id: ol.id,
      ready_stock_balance_id: ol.stock_options[0]?.id ?? '',
      quantity_dispatched: ol.open_qty > 0 ? String(ol.open_qty) : '',
      skipped: false,
      is_substitute: false,
      sub_ready_stock_balance_id: extraStockOptions[0]?.id ?? '',
      override_reason: '',
    })),
  )

  const updateEntry = (i: number, field: keyof OrderedLineState, value: string | boolean) =>
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)))

  const [matrixChanges, setMatrixChanges] = useState<MatrixChangeEvent[]>(() => buildInitialMatrixChanges(openLines))

  const handleMatrixCellChange = useCallback((change: MatrixChangeEvent) => {
    setMatrixChanges((prev) => {
      const idx = prev.findIndex(
        (c) => c.design_id === change.design_id && c.colour_id === change.colour_id && c.size_id === change.size_id,
      )
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = change
        return next
      }
      return [...prev, change]
    })
  }, [])

  // Build availability map: (design|colour|size) → total available qty
  const availableByCell = useMemo(() => {
    const map = new Map<string, number>()
    for (const ol of openLines) {
      const key = `${ol.shape_design_id}|${ol.bindi_colour_id}|${ol.size_id}`
      const avail = ol.stock_options.reduce((s, o) => s + o.available_qty, 0)
      map.set(key, (map.get(key) ?? 0) + avail)
    }
    return map
  }, [openLines])

  // Build open qty map: (design|colour|size) → total open qty across lines
  const openQtyByCell = useMemo(() => {
    const map = new Map<string, number>()
    for (const ol of openLines) {
      const key = `${ol.shape_design_id}|${ol.bindi_colour_id}|${ol.size_id}`
      map.set(key, (map.get(key) ?? 0) + ol.open_qty)
    }
    return map
  }, [openLines])

  const stockBalanceRows = openLines
    .filter((ol) => ol.stock_options.length > 0)
    .map((ol) => ({
      shape_design_id: ol.shape_design_id,
      bindi_colour_id: ol.bindi_colour_id,
      size_id:         ol.size_id,
      gross_qty:       ol.stock_options.reduce((s, o) => s + o.available_qty, 0),
      available_qty:   ol.stock_options.reduce((s, o) => s + o.available_qty, 0),
      committed_qty:   0,
    }))

  const canShowMatrix = sizeMaster.length > 0 && designMaster.length > 0 && colourMaster.length > 0
  const effectiveView = canShowMatrix ? view : 'list'

  const fullOpenQtyMatrix = useMemo(() =>
    canShowMatrix
      ? buildMatrixFromOrderLines(
          openLines.map((ol) => ({
            shape_design_id: ol.shape_design_id,
            bindi_colour_id: ol.bindi_colour_id,
            size_id: ol.size_id,
            ordered_qty: ol.open_qty,
          })),
          sizeMaster,
          designMaster,
          colourMaster,
          { context_label: `Open demand — ${customerName}` },
        )
      : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canShowMatrix, customerName],
  )

  const fullAvailStockMatrix = useMemo(() =>
    canShowMatrix
      ? buildMatrixFromStockBalances(stockBalanceRows, sizeMaster, designMaster, colourMaster, {
          context_label: 'Available ready stock',
        })
      : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canShowMatrix],
  )

  const filterConfig: FilterConfig = useMemo(() => {
    if (!fullOpenQtyMatrix) return { fields: [] }
    const designsSeen = new Map<string, string>()
    const coloursSeen = new Map<string, string>()
    for (const row of fullOpenQtyMatrix.rows) {
      designsSeen.set(row.design_id, row.design_name)
      coloursSeen.set(row.colour_id, row.colour_code)
    }
    return {
      fields: [
        { key: 'design', label: 'Design', options: [...designsSeen.entries()].map(([id, label]) => ({ id, label })) },
        { key: 'colour', label: 'CLR', options: [...coloursSeen.entries()].map(([id, label]) => ({ id, label })) },
      ],
    }
  }, [fullOpenQtyMatrix])

  const openQtyMatrixData = useMemo(
    () => fullOpenQtyMatrix ? filterMatrixData(fullOpenQtyMatrix, activeFilters, { design: 'design', colour: 'colour' }) : null,
    [fullOpenQtyMatrix, activeFilters],
  )
  const availStockMatrixData = useMemo(
    () => fullAvailStockMatrix ? filterMatrixData(fullAvailStockMatrix, activeFilters, { design: 'design', colour: 'colour' }) : null,
    [fullAvailStockMatrix, activeFilters],
  )

  const [dispatchState, setDispatchState] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    for (const change of buildInitialMatrixChanges(openLines)) {
      initial[matrixCellKey(change)] = change.quantity
    }
    return initial
  })

  const highlightDispatchCell = useCallback(
    (row: { design_id: string; colour_id: string }, sizeId: string) => {
      const key = `${row.design_id}|${row.colour_id}|${sizeId}`
      const entered = dispatchState[key] ?? 0
      const avail = availableByCell.get(key) ?? 0
      const openQty = openQtyByCell.get(key) ?? 0
      if (openQty <= 0 && entered <= 0) return 'normal' as const
      if (openQty > 0 && avail === 0) return 'shortage' as const
      if (entered > avail) return 'shortage' as const       // red — cannot dispatch entered qty from ready stock
      if (entered > openQty) return 'excess' as const       // amber — excess over order, becomes extra
      if (openQty > 0 && avail < openQty) return 'partial' as const
      if (entered > 0) return 'covered' as const            // green — full ordered qty can be dispatched
      return 'normal' as const
    },
    [dispatchState, availableByCell, openQtyByCell],
  )

  const handleDispatchCellChange = useCallback((change: MatrixChangeEvent) => {
    handleMatrixCellChange(change)
    setDispatchState((prev) => ({
      ...prev,
      [`${change.design_id}|${change.colour_id}|${change.size_id}`]: change.quantity,
    }))
  }, [handleMatrixCellChange])

  // Matrix dispatch lines — computed once, shared between payload and auto-extras display
  const matrixDispatchLines = useMemo(() => {
    const linesForDispatch: OrderLineForDispatch[] = openLines.map((ol) => ({
      id: ol.id,
      shape_design_id: ol.shape_design_id,
      bindi_colour_id: ol.bindi_colour_id,
      size_id: ol.size_id,
      open_qty: ol.open_qty,
      ready_stock_balance_id: ol.stock_options[0]?.id ?? '',
      available_stock_qty: ol.stock_options[0]?.available_qty ?? 0,
    }))
    return parseMatrixToDispatchLines(
      matrixChanges.filter((c) => c.quantity > 0),
      linesForDispatch,
    )
  }, [matrixChanges, openLines])

  // Matrix payload — memoised so the hidden input value is always in sync with matrixChanges state
  const matrixPayload = useMemo(() => {
    const lineById = new Map(openLines.map((ol) => [ol.id, ol]))

    const orderedLines = matrixDispatchLines
      .filter((dl) => dl.line_type === 'ordered' && dl.ready_stock_balance_id !== '' && dl.quantity_dispatched > 0)
      .map((dl) => ({
        order_id: dl.order_line_id ? (lineById.get(dl.order_line_id)?.order_id ?? '') : '',
        order_line_id: dl.order_line_id,
        ready_stock_balance_id: dl.ready_stock_balance_id,
        quantity_dispatched: dl.quantity_dispatched,
        line_type: 'ordered' as const,
      }))

    const autoExtraLines = matrixDispatchLines
      .filter((dl) => dl.line_type === 'extra')
      .filter((dl) => dl.ready_stock_balance_id !== '' && dl.quantity_dispatched > 0)
      .map((dl) => ({
        order_id: null,
        order_line_id: null,
        ready_stock_balance_id: dl.ready_stock_balance_id,
        quantity_dispatched: dl.quantity_dispatched,
        line_type: 'extra' as const,
      }))

    return JSON.stringify([...orderedLines, ...autoExtraLines])
  }, [matrixDispatchLines, openLines])

  // List payload — overflow is split into extra by the server action.
  const listPayload = useMemo(() => {
    return JSON.stringify([
      ...entries
        .filter((e) => !e.skipped && parseFloat(e.quantity_dispatched) > 0)
        .map((e) => {
          if (e.is_substitute) {
            return {
              order_id: e.order_id,
              order_line_id: null,
              original_order_line_id: e.order_line_id,
              ready_stock_balance_id: e.sub_ready_stock_balance_id,
              quantity_dispatched: parseFloat(e.quantity_dispatched) || 0,
              line_type: 'substitute',
              override_reason: e.override_reason || undefined,
            }
          }
          return {
            order_id: e.order_id,
            order_line_id: e.order_line_id,
            ready_stock_balance_id: e.ready_stock_balance_id,
            quantity_dispatched: parseFloat(e.quantity_dispatched) || 0,
            line_type: 'ordered',
            override_reason: e.override_reason || undefined,
          }
        }),
    ])
  }, [entries])

  const payload = effectiveView === 'matrix' ? matrixPayload : listPayload

  // ── Parcel total ─────────────────────────────────────────────
  const { parcelTotal, matrixOrderedTotal, matrixExtraTotal } = useMemo(() => {
    if (effectiveView === 'matrix') {
      let orderedSum = 0
      let excessSum = 0
      for (const c of matrixChanges) {
        if (c.quantity <= 0) continue
        const key = `${c.design_id}|${c.colour_id}|${c.size_id}`
        if ((availableByCell.get(key) ?? 0) <= 0) continue
        const openQty = openQtyByCell.get(key) ?? 0
        orderedSum += Math.min(c.quantity, openQty)
        excessSum  += Math.max(0, c.quantity - openQty)
      }
      return {
        parcelTotal: orderedSum + excessSum,
        matrixOrderedTotal: orderedSum,
        matrixExtraTotal: excessSum,
      }
    }
    const listTotal = entries
      .filter((e) => !e.skipped)
      .reduce((s, e) => s + (parseFloat(e.quantity_dispatched) || 0), 0)
    return { parcelTotal: listTotal, matrixOrderedTotal: 0, matrixExtraTotal: 0 }
  }, [effectiveView, matrixChanges, entries, availableByCell, openQtyByCell])

  const demandCoverage = useMemo(() => {
    let noStockCellCount = 0
    let partialStockCellCount = 0
    let shortageQty = 0

    for (const [key, openQty] of openQtyByCell.entries()) {
      if (openQty <= 0) continue
      const avail = availableByCell.get(key) ?? 0
      if (avail <= 0) {
        noStockCellCount += 1
        shortageQty += openQty
      } else if (avail < openQty) {
        partialStockCellCount += 1
        shortageQty += openQty - avail
      }
    }

    return { noStockCellCount, partialStockCellCount, shortageQty }
  }, [openQtyByCell, availableByCell])

  const overStockCellCount = useMemo(() =>
    matrixChanges.filter((c) => {
      const key = `${c.design_id}|${c.colour_id}|${c.size_id}`
      const avail = availableByCell.get(key) ?? 0
      return c.quantity > avail && avail > 0
    }).length,
    [matrixChanges, availableByCell],
  )

  const parcelInRange = parcelTotal >= PARCEL_TARGET_MIN && parcelTotal <= PARCEL_TARGET_MAX
  const parcelColor = parcelTotal === 0 ? 'var(--text-secondary)' : parcelInRange ? 'var(--success)' : 'var(--warning)'

  const hasAnyStock = openLines.some((l) => l.stock_options.length > 0)

  useEffect(() => {
    if (!dispatchResult) return
    localStorage.removeItem('matrix-draft-dispatch-new')
    if (dispatchResult.remaining_reserved_qty > 0) return
    window.location.href = `/dispatch/${dispatchResult.dispatch_id}`
  }, [dispatchResult])

  useEffect(() => {
    if (releaseState && 'success' in releaseState && dispatchResult) {
      window.location.href = `/dispatch/${dispatchResult.dispatch_id}`
    }
  }, [releaseState, dispatchResult])

  const tdStyle: CSSProperties = {
    padding: '0.5rem 0.75rem 0.5rem 0',
    fontSize: '0.85rem',
    verticalAlign: 'top',
  }

  const thStyle: CSSProperties = {
    ...tdStyle,
    fontSize: '0.78rem',
    color: 'var(--text-secondary)',
    borderBottom: `2px solid var(--border)`,
    whiteSpace: 'nowrap',
  }

  return (
    <form action={formAction} className="dispatch-new-form">
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="dispatch_lines" value={payload} />

      {state && 'error' in state && (
        <p style={{ ...msgError, marginBottom: '0.75rem' }}>✗ {state.error}</p>
      )}

      {dispatchResult && dispatchResult.remaining_reserved_qty > 0 && (
        <div className="dispatch-reservation-prompt">
          <div>
            <strong>Keep remaining qty reserved?</strong>
            <p>
              {fmt(dispatchResult.remaining_reserved_qty)} gross is still reserved for this order after the partial dispatch.
            </p>
          </div>
          <div className="dispatch-reservation-actions">
            <button
              type="button"
              onClick={() => { window.location.href = `/dispatch/${dispatchResult.dispatch_id}` }}
              className="dispatch-secondary-button"
            >
              Yes, keep reserved
            </button>
            <input type="hidden" name="order_id" value={dispatchResult.order_id ?? ''} />
            <button
              type="submit"
              formAction={releaseAction}
              disabled={isReleasePending || !dispatchResult.order_id}
              className="dispatch-release-button"
            >
              {isReleasePending ? 'Releasing...' : 'No, release all'}
            </button>
          </div>
          {releaseState && 'error' in releaseState && (
            <p className="dispatch-prompt-error">✗ {releaseState.error}</p>
          )}
        </div>
      )}

      <div className="dispatch-new-meta-grid">
        <div style={fieldWrap}>
          <label>Dispatch Date</label>
          <input name="dispatch_date" type="date" defaultValue={today} style={inputStyle} required />
        </div>
        <div style={fieldWrap}>
          <label>Reference (optional)</label>
          <input name="reference" style={inputStyle} placeholder="Delivery note / challan" />
        </div>
        <div style={fieldWrap}>
          <label>Notes (optional)</label>
          <input name="notes" style={inputStyle} placeholder="Any dispatch-level notes" />
        </div>
        <div style={fieldWrap}>
          <label>Next parcel date (optional)</label>
          <input name="next_parcel_date" type="date" style={inputStyle} />
        </div>
      </div>

      {/* View toggle */}
      {canShowMatrix && (
        <div style={{ marginBottom: '1rem' }} className="no-print">
          <MatrixViewToggle view={view} onViewChange={setView} />
        </div>
      )}

      {!hasAnyStock && (
        <p style={{ fontSize: '0.88rem', color: 'var(--warning)', marginBottom: '1rem' }}>
          No ready stock available for any open line. Record labour returns to build ready stock before dispatching.
        </p>
      )}

      {/* ── Matrix mode ─────────────────────────────────────── */}
      {effectiveView === 'matrix' && fullOpenQtyMatrix && (
        <div style={{ marginBottom: '1.5rem' }}>
          <MatrixFilterBar
            filterConfig={filterConfig}
            activeFilters={activeFilters}
            onFilterChange={setActiveFilters}
          />
          <p style={{ fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '0.35rem' }}>
            Available ready stock (reference)
          </p>
          <div className="dispatch-matrix-wrap">
            {availStockMatrixData && <MatrixGrid data={availStockMatrixData} mode="view" compactMobile />}
          </div>

          <p style={{ fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '0.35rem' }}>
            Enter dispatch quantities
          </p>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem' }}>
            Green cells — full order qty ready. Amber cells — partial stock or excess over order qty. Red cells — entered qty cannot be dispatched from ready stock.
            Quantities distributed FIFO across open order lines.
          </p>
          <div className="dispatch-matrix-wrap dispatch-matrix-edit-wrap">
            {openQtyMatrixData && (
              <MatrixGrid
                data={openQtyMatrixData}
                mode="edit"
                onCellChange={handleDispatchCellChange}
                highlightCell={highlightDispatchCell}
                draftKey="dispatch-new"
                compactMobile
              />
            )}
          </div>
          {demandCoverage.shortageQty > 0 && (
            <p style={{ fontSize: '0.82rem', color: 'var(--warning)', margin: '0.6rem 0 0', padding: '0.4rem 0.6rem', background: 'var(--warning-subtle)', border: '1px solid var(--warning)', borderRadius: '3px' }}>
              Ready stock shortage: {fmt(demandCoverage.shortageQty)} gross across{' '}
              {demandCoverage.noStockCellCount + demandCoverage.partialStockCellCount} cells
              {demandCoverage.noStockCellCount > 0 ? ` (${demandCoverage.noStockCellCount} with no ready stock)` : ''}
              {demandCoverage.partialStockCellCount > 0 ? ` (${demandCoverage.partialStockCellCount} partially covered)` : ''}.
            </p>
          )}
          {overStockCellCount > 0 && (
            <p style={{ fontSize: '0.82rem', color: 'var(--danger)', margin: '0.6rem 0 0', padding: '0.4rem 0.6rem', background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: '3px' }}>
              {overStockCellCount} {overStockCellCount === 1 ? 'cell exceeds' : 'cells exceed'} ready stock. Reduce those quantities before confirming.
            </p>
          )}
        </div>
      )}

      {/* ── List mode ────────────────────────────────────────── */}
      {effectiveView === 'list' && openLines.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ fontSize: '0.9rem', margin: '0 0 0.5rem' }}>
            Section 1 — Order Lines
          </h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem' }}>
            Qty can exceed ordered — amber warning appears. Qty above available stock requires an override reason.
            After dispatch, all included lines close (Option A).
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1100px' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Skip</th>
                  <th style={thStyle}>Order</th>
                  <th style={thStyle}>Shape</th>
                  <th style={thStyle}>CLR</th>
                  <th style={thStyle}>Size</th>
                  <th style={thStyle}>Dabbi</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Open Qty</th>
                  <th style={thStyle}>Stock / Substitute</th>
                  <th style={thStyle}>Dispatch Qty</th>
                </tr>
              </thead>
              <tbody>
                {openLines.map((ol, i) => {
                  const entry = entries[i]
                  if (!entry) return null
                  const hasStock = ol.stock_options.length > 0
                  const selectedStockId = entry.ready_stock_balance_id
                  const selectedStock = ol.stock_options.find((o) => o.id === selectedStockId)
                  const availableQty = selectedStock?.available_qty ?? ol.stock_options.reduce((s, o) => s + o.available_qty, 0)
                  const dispatchedQty = parseFloat(entry.quantity_dispatched) || 0
                  const isAboveOpenQty = dispatchedQty > ol.open_qty
                  const isAboveAvailable = dispatchedQty > availableQty
                  const isSkipped = entry.skipped
                  const isSubstitute = entry.is_substitute

                  return (
                    <tr key={ol.id} style={{ background: isSkipped ? 'var(--bg-elevated)' : undefined, opacity: isSkipped ? 0.5 : 1 }}>
                      <td style={tdStyle}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={entry.skipped}
                            onChange={(e) => updateEntry(i, 'skipped', e.target.checked)}
                          />
                          Skip
                        </label>
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>
                        <a href={`/orders/${ol.order_id}`} style={{ color: 'var(--info)', textDecoration: 'none' }}>
                          {ol.order_id.slice(0, 8)}
                        </a>
                        {ol.order_reference && (
                          <span style={{ color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>{ol.order_reference}</span>
                        )}
                      </td>
                      <td style={tdStyle}>{ol.shape}</td>
                      <td style={tdStyle}>{ol.bindi_colour}</td>
                      <td style={tdStyle}>{ol.size}</td>
                      <td style={tdStyle}>{ol.dabbi_colour}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(ol.open_qty)}
                      </td>
                      <td style={tdStyle}>
                        {!hasStock ? (
                          <span style={{ color: 'var(--danger)', fontSize: '0.78rem' }}>no ready stock</span>
                        ) : (
                          <div>
                            {!isSubstitute ? (
                              <>
                                <select
                                  value={entry.ready_stock_balance_id}
                                  onChange={(e) => updateEntry(i, 'ready_stock_balance_id', e.target.value)}
                                  style={{ ...selectStyle, minWidth: '180px' }}
                                  disabled={isSkipped}
                                >
                                  {ol.stock_options.map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                      {opt.brand} — {fmt(opt.available_qty)} avail{opt.reserved_for_this_order ? ' (your reservation)' : ''}
                                    </option>
                                  ))}
                                </select>
                                <div style={{ marginTop: '0.2rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  Open: {fmt(ol.open_qty)} · Avail: {fmt(availableQty)}
                                </div>
                              </>
                            ) : (
                              <>
                                <select
                                  value={entry.sub_ready_stock_balance_id}
                                  onChange={(e) => updateEntry(i, 'sub_ready_stock_balance_id', e.target.value)}
                                  style={{ ...selectStyle, minWidth: '280px', border: '1px solid var(--warning)' }}
                                  disabled={isSkipped}
                                >
                                  {extraStockOptions.map((o) => (
                                    <option key={o.id} value={o.id}>
                                      {o.label} — {fmt(o.available_qty)} avail.
                                    </option>
                                  ))}
                                </select>
                                <div style={{ marginTop: '0.2rem', fontSize: '0.75rem', color: 'var(--warning)' }}>
                                  SUB — sends different SKU; original line closes
                                </div>
                              </>
                            )}
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.3rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={entry.is_substitute}
                                onChange={(e) => updateEntry(i, 'is_substitute', e.target.checked)}
                                disabled={isSkipped}
                              />
                              Send substitute SKU
                            </label>
                          </div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {!isSkipped && (hasStock || isSubstitute) && (
                          <div>
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              value={entry.quantity_dispatched}
                              onChange={(e) => updateEntry(i, 'quantity_dispatched', e.target.value)}
                              style={{
                                ...inputStyle,
                                width: '100px',
                                border: isAboveAvailable
                                  ? '1px solid var(--danger)'
                                  : isAboveOpenQty
                                  ? '1px solid var(--warning)'
                                  : '1px solid var(--border)',
                              }}
                              placeholder="0"
                            />
                            {isAboveOpenQty && !isAboveAvailable && (
                              <div style={{ marginTop: '0.2rem', fontSize: '0.72rem', color: 'var(--warning)' }}>
                                ⚠ Above open qty ({fmt(ol.open_qty)})
                              </div>
                            )}
                            {isAboveAvailable && (
                              <div style={{ marginTop: '0.2rem', fontSize: '0.72rem', color: 'var(--danger)' }}>
                                ✗ Exceeds stock ({fmt(availableQty)} avail)
                              </div>
                            )}
                            {isAboveAvailable && (
                              <input
                                type="text"
                                value={entry.override_reason}
                                onChange={(e) => updateEntry(i, 'override_reason', e.target.value)}
                                placeholder="Override reason (required)"
                                style={{ ...inputStyle, marginTop: '0.3rem', width: '220px', fontSize: '0.75rem', border: '1px solid var(--danger)' }}
                              />
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {effectiveView === 'list' && (
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '-0.5rem 0 1.5rem' }}>
          Check Skip to exclude a line from this parcel. Leave qty blank or zero to also skip.
        </p>
      )}

      {/* ── Parcel summary ───────────────────────────────────── */}
      <div className="dispatch-parcel-summary" style={{ borderColor: parcelColor }}>
        <span style={{ fontWeight: 'bold', color: parcelColor }}>
          Parcel total: {fmt(parcelTotal)} gross
        </span>
        {parcelTotal > 0 && (
          <span style={{ marginLeft: '1rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
            Target: {PARCEL_TARGET_MIN}–{PARCEL_TARGET_MAX} gross
            {parcelInRange ? ' ✓' : parcelTotal < PARCEL_TARGET_MIN ? ' ⚠ below target' : ' ⚠ above target'}
          </span>
        )}
        {effectiveView === 'list' && (
          <span style={{ marginLeft: '1rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
            ({entries.filter((e) => !e.skipped && parseFloat(e.quantity_dispatched) > 0).length} lines)
          </span>
        )}
        {effectiveView === 'matrix' && matrixExtraTotal > 0 && (
          <div style={{ marginTop: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
            {fmt(matrixOrderedTotal)} against order lines + {fmt(matrixExtraTotal)} parcel fillers
          </div>
        )}
      </div>

      <div className="dispatch-submit-bar">
        <button
          type="submit"
          disabled={isPending || !hasAnyStock || overStockCellCount > 0 || !!dispatchResult}
          style={{ ...btnPrimary, fontWeight: 'bold', marginTop: 0 }}
        >
          {isPending ? 'Saving…' : `Confirm Dispatch — ${customerName}`}
        </button>
        <a href="/dispatch" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Cancel
        </a>
      </div>
    </form>
  )
}
