'use client'

import { useActionState, useState, useCallback, useMemo } from 'react'
import { createDispatchAction } from './actions'
import type { ActionState } from '@/lib/masters'
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

type ExtraLineState = {
  ready_stock_balance_id: string
  quantity_dispatched: string
  line_type: 'substitute' | 'extra'
}

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
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
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(createDispatchAction, null)
  const today = new Date().toISOString().split('T')[0]
  const [view, setView] = useState<'list' | 'matrix'>('list')
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({})

  const [entries, setEntries] = useState<OrderedLineState[]>(
    openLines.map((ol) => ({
      order_id: ol.order_id,
      order_line_id: ol.id,
      ready_stock_balance_id: ol.stock_options[0]?.id ?? '',
      quantity_dispatched: '',
      skipped: false,
      is_substitute: false,
      sub_ready_stock_balance_id: extraStockOptions[0]?.id ?? '',
      override_reason: '',
    })),
  )

  const [extraLines, setExtraLines] = useState<ExtraLineState[]>([])
  const [suppressedExtraKeys, setSuppressedExtraKeys] = useState<Set<string>>(new Set())

  const addExtraLine = () =>
    setExtraLines((prev) => [
      ...prev,
      { ready_stock_balance_id: extraStockOptions[0]?.id ?? '', quantity_dispatched: '', line_type: 'extra' },
    ])

  const removeExtraLine = (i: number) =>
    setExtraLines((prev) => prev.filter((_, idx) => idx !== i))

  const updateExtraLine = (i: number, field: keyof ExtraLineState, value: string) =>
    setExtraLines((prev) => prev.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)))

  const updateEntry = (i: number, field: keyof OrderedLineState, value: string | boolean) =>
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)))

  const [matrixChanges, setMatrixChanges] = useState<MatrixChangeEvent[]>(() =>
    openLines.flatMap((ol) => {
      const avail = ol.stock_options.reduce((s, o) => s + o.available_qty, 0)
      if (avail <= 0) return []
      return [{
        design_id: ol.shape_design_id,
        colour_id: ol.bindi_colour_id,
        size_id: ol.size_id,
        quantity: Math.min(avail, ol.open_qty),
      }]
    })
  )

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

  const [dispatchState, setDispatchState] = useState<Record<string, number>>({})

  const highlightDispatchCell = useCallback(
    (row: { design_id: string; colour_id: string }, sizeId: string) => {
      const key = `${row.design_id}|${row.colour_id}|${sizeId}`
      const entered = dispatchState[key] ?? 0
      const avail = availableByCell.get(key) ?? 0
      const openQty = openQtyByCell.get(key) ?? 0
      if (avail === 0) return 'shortage' as const
      if (entered > avail) return 'shortage' as const        // red — exceeds available stock
      if (entered > openQty) return 'excess' as const       // amber — excess over order, becomes extra
      if (entered > 0) return 'covered' as const            // green — within ordered qty
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

  // Auto-extras derived from domain output — extra lines not suppressed by the user
  const autoExtras = useMemo(
    () => matrixDispatchLines.filter((dl) => dl.line_type === 'extra' && !suppressedExtraKeys.has(dl.ready_stock_balance_id)),
    [matrixDispatchLines, suppressedExtraKeys],
  )

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

    const autoExtraLines = autoExtras
      .filter((dl) => dl.ready_stock_balance_id !== '' && dl.quantity_dispatched > 0)
      .map((dl) => ({
        order_id: null,
        order_line_id: null,
        ready_stock_balance_id: dl.ready_stock_balance_id,
        quantity_dispatched: dl.quantity_dispatched,
        line_type: 'extra' as const,
      }))

    const manualExtraLines = extraLines
      .filter((e) => e.ready_stock_balance_id && parseFloat(e.quantity_dispatched) > 0)
      .map((e) => ({
        order_id: null,
        order_line_id: null,
        ready_stock_balance_id: e.ready_stock_balance_id,
        quantity_dispatched: parseFloat(e.quantity_dispatched) || 0,
        line_type: e.line_type,
      }))

    return JSON.stringify([...orderedLines, ...autoExtraLines, ...manualExtraLines])
  }, [matrixDispatchLines, autoExtras, extraLines, openLines])

  // List payload — includes ordered/substitute lines and extra SKUs
  const listPayload = useMemo(() => {
    const extra = extraLines
      .filter((e) => e.ready_stock_balance_id && parseFloat(e.quantity_dispatched) > 0)
      .map((e) => ({
        order_id: null,
        order_line_id: null,
        ready_stock_balance_id: e.ready_stock_balance_id,
        quantity_dispatched: parseFloat(e.quantity_dispatched) || 0,
        line_type: e.line_type,
      }))
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
      ...extra,
    ])
  }, [entries, extraLines])

  const payload = view === 'matrix' ? matrixPayload : listPayload

  // ── Parcel total ─────────────────────────────────────────────
  const { parcelTotal, matrixOrderedTotal, matrixExtraTotal } = useMemo(() => {
    const manualExtraTotal = extraLines
      .reduce((s, e) => s + (parseFloat(e.quantity_dispatched) || 0), 0)
    if (view === 'matrix') {
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
      // Subtract suppressed auto-extras from excess displayed
      const suppressedQty = matrixDispatchLines
        .filter((dl) => dl.line_type === 'extra' && suppressedExtraKeys.has(dl.ready_stock_balance_id))
        .reduce((s, dl) => s + dl.quantity_dispatched, 0)
      const effectiveExcess = excessSum - suppressedQty
      return {
        parcelTotal: orderedSum + effectiveExcess + manualExtraTotal,
        matrixOrderedTotal: orderedSum,
        matrixExtraTotal: effectiveExcess + manualExtraTotal,
      }
    }
    const listTotal = entries
      .filter((e) => !e.skipped)
      .reduce((s, e) => s + (parseFloat(e.quantity_dispatched) || 0), 0)
      + manualExtraTotal
    return { parcelTotal: listTotal, matrixOrderedTotal: 0, matrixExtraTotal: 0 }
  }, [view, matrixChanges, entries, extraLines, availableByCell, openQtyByCell, matrixDispatchLines, suppressedExtraKeys])

  // Matrix cells with qty entered but no stock — these will be silently skipped
  const skippedCellCount = useMemo(() =>
    matrixChanges.filter((c) => {
      const key = `${c.design_id}|${c.colour_id}|${c.size_id}`
      return c.quantity > 0 && (availableByCell.get(key) ?? 0) === 0
    }).length,
    [matrixChanges, availableByCell],
  )

  const parcelInRange = parcelTotal >= PARCEL_TARGET_MIN && parcelTotal <= PARCEL_TARGET_MAX
  const parcelColor = parcelTotal === 0 ? 'var(--text-secondary)' : parcelInRange ? 'var(--success)' : 'var(--warning)'

  const hasAnyStock = openLines.some((l) => l.stock_options.length > 0)

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
    <form action={formAction}>
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="dispatch_lines" value={payload} />

      {state && 'error' in state && (
        <p style={{ ...msgError, marginBottom: '0.75rem' }}>✗ {state.error}</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
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
      {view === 'matrix' && fullOpenQtyMatrix && (
        <div style={{ marginBottom: '1.5rem' }}>
          <MatrixFilterBar
            filterConfig={filterConfig}
            activeFilters={activeFilters}
            onFilterChange={setActiveFilters}
          />
          <p style={{ fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '0.35rem' }}>
            Available ready stock (reference)
          </p>
          <div style={{ overflowX: 'auto', marginBottom: '1.25rem' }}>
            {availStockMatrixData && <MatrixGrid data={availStockMatrixData} mode="view" />}
          </div>

          <p style={{ fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '0.35rem' }}>
            Enter dispatch quantities
          </p>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem' }}>
            Green cells — within ordered qty. Amber cells — excess over order qty; excess auto-becomes parcel filler. Red cells — no ready stock; will be skipped.
            Quantities distributed FIFO across open order lines.
          </p>
          <div style={{ overflowX: 'auto' }}>
            {openQtyMatrixData && (
              <MatrixGrid
                data={openQtyMatrixData}
                mode="edit"
                onCellChange={handleDispatchCellChange}
                highlightCell={highlightDispatchCell}
                draftKey="dispatch-new"
              />
            )}
          </div>
          {skippedCellCount > 0 && (
            <p style={{ fontSize: '0.82rem', color: 'var(--warning)', margin: '0.6rem 0 0', padding: '0.4rem 0.6rem', background: 'var(--warning-subtle)', border: '1px solid var(--warning)', borderRadius: '3px' }}>
              ⚠ {skippedCellCount} {skippedCellCount === 1 ? 'cell has' : 'cells have'} no ready stock and will be skipped.
              Only {fmt(parcelTotal)} gross will be dispatched.
            </p>
          )}
        </div>
      )}

      {/* ── List mode ────────────────────────────────────────── */}
      {view === 'list' && openLines.length > 0 && (
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

      {view === 'list' && (
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '-0.5rem 0 1.5rem' }}>
          Check Skip to exclude a line from this parcel. Leave qty blank or zero to also skip.
        </p>
      )}


      {/* ── Section 2: Extra SKUs ─────────────────────────── */}
      {extraStockOptions.length > 0 && (
        <div style={{ marginBottom: '1.5rem', borderTop: `1px solid var(--border)`, paddingTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
            <h4 style={{ margin: 0, fontSize: '0.9rem' }}>
              Section 2 — Extra SKUs
            </h4>
            <button
              type="button"
              onClick={addExtraLine}
              style={{ fontSize: '0.78rem', padding: '0.2rem 0.65rem', border: `1px solid var(--info)`, color: 'var(--info)', background: 'var(--info-subtle)', cursor: 'pointer', borderRadius: '2px' }}
            >
              + Add to Parcel
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem' }}>
            Add SKUs not in the order — parcel fillers or stock push. Not linked to any order line.
          </p>

          {/* Auto-extras from matrix excess */}
          {view === 'matrix' && autoExtras.length > 0 && (
            <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '3px' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--warning)', marginBottom: '0.35rem' }}>
                Auto-added from matrix excess:
              </div>
              {autoExtras.map((dl, i) => {
                const opt = extraStockOptions.find((o) => o.id === dl.ready_stock_balance_id)
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{opt?.label ?? dl.ready_stock_balance_id}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--warning)' }}>{fmt(dl.quantity_dispatched)} gross</span>
                    <span style={{ fontSize: '0.68rem', padding: '0.05rem 0.3rem', background: 'rgba(245,158,11,0.12)', color: 'var(--warning)', borderRadius: '2px', border: '1px solid rgba(245,158,11,0.25)' }}>auto</span>
                    <button
                      type="button"
                      onClick={() => setSuppressedExtraKeys((prev) => { const next = new Set(prev); next.add(dl.ready_stock_balance_id); return next })}
                      style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', border: `1px solid var(--border)`, color: 'var(--text-secondary)', background: 'white', cursor: 'pointer', borderRadius: '2px' }}
                    >
                      Remove
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Restore suppressed button */}
          {view === 'matrix' && suppressedExtraKeys.size > 0 && (
            <button
              type="button"
              onClick={() => setSuppressedExtraKeys(new Set())}
              style={{ fontSize: '0.72rem', marginBottom: '0.5rem', padding: '0.15rem 0.5rem', border: `1px solid var(--border)`, color: 'var(--text-secondary)', background: 'none', cursor: 'pointer', borderRadius: '2px' }}
            >
              Restore removed auto-extras
            </button>
          )}

          {extraLines.length === 0 && autoExtras.length === 0 && (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              No extra lines. Click &quot;+ Add to Parcel&quot; to add.
            </p>
          )}

          {extraLines.map((el, i) => {
            const selected = extraStockOptions.find((o) => o.id === el.ready_stock_balance_id)
            return (
              <div key={i} style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <select
                    value={el.ready_stock_balance_id}
                    onChange={(e) => updateExtraLine(i, 'ready_stock_balance_id', e.target.value)}
                    style={{ ...selectStyle, minWidth: '320px', flex: '1' }}
                  >
                    {extraStockOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: '0.75rem', padding: '0.35rem 0.5rem', background: 'var(--info-subtle)', border: `1px solid var(--info)`, borderRadius: '2px', color: 'var(--info)' }}>
                    EXTRA
                  </span>
                  <div>
                    <input
                      type="number"
                      min="0.001"
                      step="1"
                      value={el.quantity_dispatched}
                      onChange={(e) => updateExtraLine(i, 'quantity_dispatched', e.target.value)}
                      style={{ ...inputStyle, width: '90px' }}
                      placeholder="Qty"
                    />
                    {selected && parseFloat(el.quantity_dispatched) > selected.gross_qty && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '0.15rem' }}>
                        ✗ {fmt(selected.gross_qty)} gross max
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeExtraLine(i)}
                    style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem', border: `1px solid var(--danger)`, color: 'var(--danger)', background: 'white', cursor: 'pointer', borderRadius: '2px' }}
                  >
                    ✕
                  </button>
                </div>
                {selected && selected.committed_qty > 0 && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--warning)', marginTop: '0.3rem', padding: '0.3rem 0.5rem', background: 'var(--warning-subtle)', border: '1px solid var(--warning)', borderRadius: '3px' }}>
                    ⚠ {fmt(selected.committed_qty)} gross of this SKU is allocated to other orders. Dispatching will make those orders short — they will need fresh production.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Parcel summary ───────────────────────────────────── */}
      <div style={{
        marginBottom: '1.25rem',
        padding: '0.75rem 1rem',
        background: 'var(--bg-elevated)',
        border: `1px solid ${parcelColor}`,
        borderRadius: '4px',
        fontSize: '0.88rem',
      }}>
        <span style={{ fontWeight: 'bold', color: parcelColor }}>
          Parcel total: {fmt(parcelTotal)} gross
        </span>
        {parcelTotal > 0 && (
          <span style={{ marginLeft: '1rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
            Target: {PARCEL_TARGET_MIN}–{PARCEL_TARGET_MAX} gross
            {parcelInRange ? ' ✓' : parcelTotal < PARCEL_TARGET_MIN ? ' ⚠ below target' : ' ⚠ above target'}
          </span>
        )}
        {view === 'list' && (
          <span style={{ marginLeft: '1rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
            ({entries.filter((e) => !e.skipped && parseFloat(e.quantity_dispatched) > 0).length + extraLines.filter((e) => parseFloat(e.quantity_dispatched) > 0).length} lines)
          </span>
        )}
        {view === 'matrix' && matrixExtraTotal > 0 && (
          <div style={{ marginTop: '0.3rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
            {fmt(matrixOrderedTotal)} against order lines + {fmt(matrixExtraTotal)} parcel fillers
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button
          type="submit"
          disabled={isPending || (!hasAnyStock && extraLines.length === 0)}
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
