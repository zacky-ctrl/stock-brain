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
import type {
  MatrixChangeEvent,
  FilterConfig,
  ActiveFilters,
  MatrixGridData,
  MatrixRow,
  MatrixCellHighlight,
} from '@stock-brain/types'

// ── Parcel target ─────────────────────────────────────────────
const PARCEL_TARGET_MIN = 50
const PARCEL_TARGET_MAX = 53

// ── Exported types ────────────────────────────────────────────

export type DabbiMasterRow = {
  id: string
  code: string
  sort_order: number
}

export type BrandMasterRow = {
  id: string
  code: string
  name: string
}

export type StockOption = {
  id: string
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
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  brand_id: string
  brand_name: string
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
  dabbiMaster?: DabbiMasterRow[]
  brandMaster?: BrandMasterRow[]
}

// ── Internal types ────────────────────────────────────────────

type OrderedLineState = {
  order_id: string
  order_line_id: string
  ready_stock_balance_id: string
  quantity_dispatched: string
  skipped: boolean
  is_substitute: boolean
  sub_ready_stock_balance_id: string
  override_reason: string
}

type AddLineState = {
  designId: string
  colourId: string
  sizeId: string
  dabbiColourId: string
  brandId: string
  quantity: string
}

type DispatchSection = {
  dabbi_colour_id: string
  dabbi_colour_code: string
  brand_label: string | null
  sort_order: number
}

// ── Pure helpers (module-level, no React deps) ────────────────

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

/**
 * 4-part dispatch state key — encodes all 5 dimensions of finished-stock identity
 * (design + bindi_colour + size + dabbi_colour). Brand is on the balance row, not the
 * order line, so it is NOT part of this key.
 */
function dispatchKey(designId: string, colourId: string, sizeId: string, dabbiColourId: string): string {
  return `${designId}|${colourId}|${sizeId}|${dabbiColourId}`
}

function buildInitialDispatchState(openLines: OpenOrderLine[]): Record<string, number> {
  const state: Record<string, number> = {}
  for (const ol of openLines) {
    if (ol.open_qty <= 0) continue
    const key = dispatchKey(ol.shape_design_id, ol.bindi_colour_id, ol.size_id, ol.dabbi_colour_id)
    state[key] = (state[key] ?? 0) + ol.open_qty
  }
  return state
}

/** Returns MatrixChangeEvent[] for one dabbi section from the flat dispatch state. */
function getSectionChanges(dispatchState: Record<string, number>, dabbiColourId: string): MatrixChangeEvent[] {
  const changes: MatrixChangeEvent[] = []
  for (const [key, qty] of Object.entries(dispatchState)) {
    if (qty <= 0) continue
    const parts = key.split('|')
    if (parts.length !== 4 || parts[3] !== dabbiColourId) continue
    changes.push({ design_id: parts[0], colour_id: parts[1], size_id: parts[2], quantity: qty })
  }
  return changes
}

/**
 * Builds MatrixGridData for one dabbi section.
 *
 * Rows are seeded from open order lines in this section + any extra cells added
 * via "Add Line". metadata.dabbi_colour_id is embedded so the single
 * highlightDispatchCell callback can extract it per row.
 */
function buildSectionMatrixData(
  dispatchState: Record<string, number>,
  section: DispatchSection,
  openLines: OpenOrderLine[],
  sizeMaster: SizeMasterRow[],
  designMaster: DesignMasterRow[],
  colourMaster: ColourMasterRow[],
): MatrixGridData {
  const designMap = new Map(designMaster.map((d) => [d.id, d]))
  const colourMap = new Map(colourMaster.map((c) => [c.id, c]))
  const { dabbi_colour_id } = section
  const rowsByKey = new Map<string, MatrixRow>()

  const ensureRow = (design_id: string, colour_id: string) => {
    const rk = `${design_id}|${colour_id}`
    if (rowsByKey.has(rk)) return
    const design = designMap.get(design_id)
    const colour = colourMap.get(colour_id)
    if (!design || !colour) return
    rowsByKey.set(rk, {
      design_id,
      design_name: design.name,
      colour_id,
      colour_name: colour.name,
      colour_code: colour.code,
      cells: {},
      metadata: { dabbi_colour_id },
    })
  }

  for (const ol of openLines) {
    if (ol.dabbi_colour_id !== dabbi_colour_id) continue
    ensureRow(ol.shape_design_id, ol.bindi_colour_id)
  }

  for (const key of Object.keys(dispatchState)) {
    const parts = key.split('|')
    if (parts.length !== 4 || parts[3] !== dabbi_colour_id) continue
    ensureRow(parts[0], parts[1])
  }

  // Fill cells from dispatch state
  for (const row of rowsByKey.values()) {
    for (const size of sizeMaster) {
      const key = dispatchKey(row.design_id, row.colour_id, size.id, dabbi_colour_id)
      const qty = dispatchState[key] ?? 0
      if (qty > 0) row.cells[size.id] = qty
    }
  }

  const rows = [...rowsByKey.values()].sort((a, b) => {
    const da = designMap.get(a.design_id)?.sort_order ?? 0
    const db = designMap.get(b.design_id)?.sort_order ?? 0
    if (da !== db) return da - db
    const ca = colourMap.get(a.colour_id)?.sort_order ?? 0
    const cb = colourMap.get(b.colour_id)?.sort_order ?? 0
    return ca - cb
  })

  return {
    sizes: [...sizeMaster]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({ size_id: s.id, size_name: s.code, sort_order: s.sort_order })),
    rows,
  }
}

/** Derives a single brand label for the section header if all available stock is one brand. */
function getSectionBrandLabel(
  dabbiColourId: string,
  openLines: OpenOrderLine[],
  extraStockOptions: ExtraStockOption[],
): string | null {
  const brands = new Set<string>()
  for (const ol of openLines) {
    if (ol.dabbi_colour_id !== dabbiColourId) continue
    for (const opt of ol.stock_options) {
      if (opt.brand && opt.brand !== '—') brands.add(opt.brand)
    }
  }
  for (const opt of extraStockOptions) {
    if (opt.dabbi_colour_id === dabbiColourId && opt.brand_name && opt.brand_name !== '—') {
      brands.add(opt.brand_name)
    }
  }
  return brands.size === 1 ? ([...brands][0] ?? null) : null
}

// ── Component ─────────────────────────────────────────────────

export function DispatchForm({
  customerId,
  customerName,
  openLines,
  sizeMaster = [],
  designMaster = [],
  colourMaster = [],
  extraStockOptions = [],
  dabbiMaster = [],
  brandMaster = [],
}: DispatchFormProps) {
  const [state, formAction, isPending] = useActionState<DispatchActionState, FormData>(createDispatchAction, null)
  const [releaseState, releaseAction, isReleasePending] = useActionState<ActionState, FormData>(releaseRemainingReservationsAction, null)
  const today = new Date().toISOString().split('T')[0]
  const [view, setView] = useState<'list' | 'matrix'>('matrix')
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({})
  const [showAvailableStock, setShowAvailableStock] = useState(false)
  const dispatchResult = state && 'dispatch_id' in state ? state : null

  // dabbi sections added via Add Line that don't exist in openLines
  const [extraDabbiIds, setExtraDabbiIds] = useState<string[]>([])

  const firstOpenLineDabbi = openLines[0]?.dabbi_colour_id ?? dabbiMaster[0]?.id ?? ''

  const [addLine, setAddLine] = useState<AddLineState>(() => ({
    designId: designMaster[0]?.id ?? '',
    colourId: colourMaster[0]?.id ?? '',
    sizeId: sizeMaster[0]?.id ?? '',
    dabbiColourId: firstOpenLineDabbi,
    brandId: brandMaster[0]?.id ?? '',
    quantity: '',
  }))

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

  // ── 4-part dispatch state ────────────────────────────────────
  const [dispatchState, setDispatchState] = useState<Record<string, number>>(
    () => buildInitialDispatchState(openLines),
  )

  const upsertDispatchCell = useCallback((
    change: MatrixChangeEvent,
    dabbiColourId: string,
  ) => {
    const key = dispatchKey(change.design_id, change.colour_id, change.size_id, dabbiColourId)
    setDispatchState((prev) => {
      const next = { ...prev }
      if (change.quantity > 0) {
        next[key] = change.quantity
      } else {
        delete next[key]
      }
      return next
    })
  }, [])

  // ── Sections ─────────────────────────────────────────────────
  const sections = useMemo((): DispatchSection[] => {
    const seen = new Map<string, { code: string; sort_order: number }>()
    for (const ol of openLines) {
      if (!seen.has(ol.dabbi_colour_id)) {
        const master = dabbiMaster.find((d) => d.id === ol.dabbi_colour_id)
        seen.set(ol.dabbi_colour_id, {
          code: ol.dabbi_colour,
          sort_order: master?.sort_order ?? 999,
        })
      }
    }
    for (const id of extraDabbiIds) {
      if (!seen.has(id)) {
        const master = dabbiMaster.find((d) => d.id === id)
        seen.set(id, { code: master?.code ?? id, sort_order: master?.sort_order ?? 999 })
      }
    }
    return [...seen.entries()]
      .map(([id, { code, sort_order }]) => ({
        dabbi_colour_id: id,
        dabbi_colour_code: code,
        sort_order,
        brand_label: getSectionBrandLabel(id, openLines, extraStockOptions),
      }))
      .sort((a, b) => a.sort_order - b.sort_order)
  }, [openLines, extraDabbiIds, dabbiMaster, extraStockOptions])

  // ── Available stock (dabbi-aware) ────────────────────────────
  const availableStockRows = useMemo(() => {
    const byBalance = new Map<string, {
      shape_design_id: string
      bindi_colour_id: string
      size_id: string
      dabbi_colour_id: string
      gross_qty: number
      available_qty: number
      committed_qty: number
    }>()

    for (const option of extraStockOptions) {
      byBalance.set(option.id, {
        shape_design_id: option.shape_design_id,
        bindi_colour_id: option.bindi_colour_id,
        size_id: option.size_id,
        dabbi_colour_id: option.dabbi_colour_id,
        gross_qty: option.available_qty,
        available_qty: option.available_qty,
        committed_qty: 0,
      })
    }

    for (const ol of openLines) {
      for (const option of ol.stock_options) {
        const existing = byBalance.get(option.id)
        byBalance.set(option.id, {
          shape_design_id: option.shape_design_id,
          bindi_colour_id: option.bindi_colour_id,
          size_id: option.size_id,
          dabbi_colour_id: option.dabbi_colour_id,
          gross_qty: Math.max(existing?.gross_qty ?? 0, option.available_qty),
          available_qty: Math.max(existing?.available_qty ?? 0, option.available_qty),
          committed_qty: existing?.committed_qty ?? 0,
        })
      }
    }

    return [...byBalance.values()].filter((row) => row.available_qty > 0)
  }, [extraStockOptions, openLines])

  // 4-part key: design|colour|size|dabbi_colour_id
  const availableByCell = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of availableStockRows) {
      const key = dispatchKey(row.shape_design_id, row.bindi_colour_id, row.size_id, row.dabbi_colour_id)
      map.set(key, (map.get(key) ?? 0) + row.available_qty)
    }
    return map
  }, [availableStockRows])

  // 4-part key
  const openQtyByCell = useMemo(() => {
    const map = new Map<string, number>()
    for (const ol of openLines) {
      const key = dispatchKey(ol.shape_design_id, ol.bindi_colour_id, ol.size_id, ol.dabbi_colour_id)
      map.set(key, (map.get(key) ?? 0) + ol.open_qty)
    }
    return map
  }, [openLines])

  const canShowMatrix = sizeMaster.length > 0 && designMaster.length > 0 && colourMaster.length > 0
  const effectiveView = canShowMatrix ? view : 'list'

  // Reference matrices (dabbi-agnostic — for the "show available stock" panel)
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
  [canShowMatrix, openLines, sizeMaster, designMaster, colourMaster, customerName])

  const fullAvailStockMatrix = useMemo(() =>
    canShowMatrix
      ? buildMatrixFromStockBalances(availableStockRows, sizeMaster, designMaster, colourMaster, {
          context_label: 'Available ready stock',
        })
      : null,
  [canShowMatrix, availableStockRows, sizeMaster, designMaster, colourMaster])

  // Filter config — built from open lines design+colour combos
  const filterConfig: FilterConfig = useMemo(() => {
    const designsSeen = new Map<string, string>()
    const coloursSeen = new Map<string, string>()
    for (const ol of openLines) {
      designsSeen.set(ol.shape_design_id, ol.shape)
      coloursSeen.set(ol.bindi_colour_id, ol.bindi_colour)
    }
    return {
      fields: [
        { key: 'design', label: 'Design', options: [...designsSeen.entries()].map(([id, label]) => ({ id, label })) },
        { key: 'colour', label: 'CLR', options: [...coloursSeen.entries()].map(([id, label]) => ({ id, label })) },
      ],
    }
  }, [openLines])

  const availStockMatrixData = useMemo(
    () => fullAvailStockMatrix
      ? filterMatrixData(fullAvailStockMatrix, activeFilters, { design: 'design', colour: 'colour' })
      : null,
    [fullAvailStockMatrix, activeFilters],
  )

  // ── Highlight callback — reads dabbi_colour_id from row.metadata ──
  const highlightDispatchCell = useCallback(
    (row: MatrixRow, sizeId: string): MatrixCellHighlight => {
      const dabbiColourId = row.metadata?.dabbi_colour_id as string ?? ''
      const key = dispatchKey(row.design_id, row.colour_id, sizeId, dabbiColourId)
      const entered = dispatchState[key] ?? 0
      const avail = availableByCell.get(key) ?? 0
      const openQty = openQtyByCell.get(key) ?? 0
      if (openQty <= 0 && entered <= 0) return 'normal'
      if (entered > avail) return 'shortage'
      if (entered > openQty) return 'excess'
      if (entered > 0 && entered < openQty) return 'partial'
      if (entered > 0) return 'covered'
      return 'normal'
    },
    [dispatchState, availableByCell, openQtyByCell],
  )

  const handleDispatchCellChange = useCallback(
    (change: MatrixChangeEvent, dabbiColourId: string) => {
      upsertDispatchCell(change, dabbiColourId)
    },
    [upsertDispatchCell],
  )

  const handleAddLine = useCallback(() => {
    const quantity = parseFloat(addLine.quantity) || 0
    if (!addLine.designId || !addLine.colourId || !addLine.sizeId || !addLine.dabbiColourId || quantity <= 0) return

    const key = dispatchKey(addLine.designId, addLine.colourId, addLine.sizeId, addLine.dabbiColourId)
    setDispatchState((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + quantity }))

    // If this dabbi doesn't exist in any existing order-line section, create a new section
    const alreadyInSections = openLines.some((ol) => ol.dabbi_colour_id === addLine.dabbiColourId)
    if (!alreadyInSections) {
      setExtraDabbiIds((prev) =>
        prev.includes(addLine.dabbiColourId) ? prev : [...prev, addLine.dabbiColourId],
      )
    }

    setAddLine((prev) => ({ ...prev, quantity: '' }))
  }, [addLine, openLines])

  // ── Matrix dispatch lines (per section → merged) ─────────────
  const matrixDispatchLines = useMemo(() => {
    const allResults: ReturnType<typeof parseMatrixToDispatchLines> = []

    for (const section of sections) {
      const changes = getSectionChanges(dispatchState, section.dabbi_colour_id).filter((c) => c.quantity > 0)
      if (changes.length === 0) continue

      const sectionOpenLines = openLines.filter((ol) => ol.dabbi_colour_id === section.dabbi_colour_id)
      const sectionExtraOptions = extraStockOptions.filter((opt) => opt.dabbi_colour_id === section.dabbi_colour_id)

      const linesForDispatch: OrderLineForDispatch[] = [
        ...sectionOpenLines.map((ol) => ({
          id: ol.id,
          shape_design_id: ol.shape_design_id,
          bindi_colour_id: ol.bindi_colour_id,
          size_id: ol.size_id,
          open_qty: ol.open_qty,
          ready_stock_balance_id: ol.stock_options[0]?.id ?? '',
          available_stock_qty: ol.stock_options[0]?.available_qty ?? 0,
        })),
        ...sectionExtraOptions.map((opt) => ({
          id: `extra:${opt.id}`,
          shape_design_id: opt.shape_design_id,
          bindi_colour_id: opt.bindi_colour_id,
          size_id: opt.size_id,
          open_qty: 0,
          ready_stock_balance_id: opt.id,
          available_stock_qty: opt.available_qty,
        })),
      ]

      allResults.push(...parseMatrixToDispatchLines(changes, linesForDispatch))
    }

    return allResults
  }, [sections, dispatchState, openLines, extraStockOptions])

  // ── Payloads ─────────────────────────────────────────────────
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
      .filter((dl) => dl.line_type === 'extra' && dl.ready_stock_balance_id !== '' && dl.quantity_dispatched > 0)
      .map((dl) => ({
        order_id: null,
        order_line_id: null,
        ready_stock_balance_id: dl.ready_stock_balance_id,
        quantity_dispatched: dl.quantity_dispatched,
        line_type: 'extra' as const,
      }))

    return JSON.stringify([...orderedLines, ...autoExtraLines])
  }, [matrixDispatchLines, openLines])

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

  // ── Parcel summary ────────────────────────────────────────────
  const { parcelTotal, matrixOrderedTotal, matrixExtraTotal } = useMemo(() => {
    if (effectiveView !== 'matrix') {
      const listTotal = entries
        .filter((e) => !e.skipped)
        .reduce((s, e) => s + (parseFloat(e.quantity_dispatched) || 0), 0)
      return { parcelTotal: listTotal, matrixOrderedTotal: 0, matrixExtraTotal: 0 }
    }
    let orderedSum = 0
    let excessSum = 0
    for (const [key, qty] of Object.entries(dispatchState)) {
      if (qty <= 0) continue
      const avail = availableByCell.get(key) ?? 0
      if (avail <= 0) continue
      const openQty = openQtyByCell.get(key) ?? 0
      orderedSum += Math.min(qty, openQty)
      excessSum += Math.max(0, qty - openQty)
    }
    return { parcelTotal: orderedSum + excessSum, matrixOrderedTotal: orderedSum, matrixExtraTotal: excessSum }
  }, [effectiveView, dispatchState, entries, availableByCell, openQtyByCell])

  const blockingStock = useMemo(() => {
    let cellCount = 0
    let excessQty = 0
    for (const [key, qty] of Object.entries(dispatchState)) {
      if (qty <= 0) continue
      const avail = availableByCell.get(key) ?? 0
      if (qty <= avail) continue
      cellCount += 1
      excessQty += qty - avail
    }
    return { cellCount, excessQty }
  }, [dispatchState, availableByCell])

  const fillerSummary = useMemo(() => {
    let cellCount = 0
    let extraSkuCellCount = 0
    let fillerQty = 0
    for (const [key, qty] of Object.entries(dispatchState)) {
      if (qty <= 0) continue
      const openQty = openQtyByCell.get(key) ?? 0
      const excess = Math.max(0, qty - openQty)
      if (excess <= 0) continue
      cellCount += 1
      fillerQty += excess
      if (openQty <= 0) extraSkuCellCount += 1
    }
    return { cellCount, extraSkuCellCount, fillerQty }
  }, [dispatchState, openQtyByCell])

  const parcelInRange = parcelTotal >= PARCEL_TARGET_MIN && parcelTotal <= PARCEL_TARGET_MAX
  const parcelColor = parcelTotal === 0 ? 'var(--text-secondary)' : parcelInRange ? 'var(--success)' : 'var(--warning)'

  const hasAnyStock = availableStockRows.length > 0
  const availableStockTotal = availableStockRows.reduce((sum, row) => sum + row.available_qty, 0)

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

  // ── Render ────────────────────────────────────────────────────

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

          {/* Available stock reference panel */}
          <div className="dispatch-stock-reference">
            <button
              type="button"
              className="dispatch-stock-reference-toggle"
              onClick={() => setShowAvailableStock((prev) => !prev)}
              aria-expanded={showAvailableStock}
            >
              <span>{showAvailableStock ? 'Hide' : 'Show'} available ready stock</span>
              <span className="dispatch-stock-reference-meta">
                {availableStockRows.length} SKUs / {fmt(availableStockTotal)} gross
              </span>
            </button>
            {showAvailableStock && (
              <div className="dispatch-stock-reference-panel">
                <p style={{ fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '0.35rem' }}>
                  Available ready stock
                </p>
                <div className="dispatch-matrix-wrap">
                  {availStockMatrixData && <MatrixGrid data={availStockMatrixData} mode="view" compactMobile />}
                </div>
              </div>
            )}
          </div>

          <p style={{ fontSize: '0.82rem', fontWeight: 'bold', marginBottom: '0.35rem' }}>
            Enter dispatch quantities
          </p>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem' }}>
            Green cells — ordered qty ready. Orange cells — filler or extra SKU added. Amber cells — partial dispatch. Red cells — cannot dispatch from ready stock.
            Quantities distribute FIFO across open order lines first.
          </p>

          {/* Add line panel */}
          <div className="dispatch-add-line">
            <div className="dispatch-add-line-fields">
              <label>
                <span>Design</span>
                <select
                  value={addLine.designId}
                  onChange={(e) => setAddLine((prev) => ({ ...prev, designId: e.target.value }))}
                >
                  {designMaster.map((design) => (
                    <option key={design.id} value={design.id}>{design.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>CLR</span>
                <select
                  value={addLine.colourId}
                  onChange={(e) => setAddLine((prev) => ({ ...prev, colourId: e.target.value }))}
                >
                  {colourMaster.map((colour) => (
                    <option key={colour.id} value={colour.id}>{colour.code}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Size</span>
                <select
                  value={addLine.sizeId}
                  onChange={(e) => setAddLine((prev) => ({ ...prev, sizeId: e.target.value }))}
                >
                  {sizeMaster.map((size) => (
                    <option key={size.id} value={size.id}>{size.code}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Dabbi Colour</span>
                <select
                  value={addLine.dabbiColourId}
                  onChange={(e) => setAddLine((prev) => ({ ...prev, dabbiColourId: e.target.value }))}
                >
                  {dabbiMaster.map((d) => (
                    <option key={d.id} value={d.id}>{d.code}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Brand</span>
                <select
                  value={addLine.brandId}
                  onChange={(e) => setAddLine((prev) => ({ ...prev, brandId: e.target.value }))}
                >
                  {brandMaster.map((b) => (
                    <option key={b.id} value={b.id}>{b.name || b.code}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Qty</span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={addLine.quantity}
                  onChange={(e) => setAddLine((prev) => ({ ...prev, quantity: e.target.value }))}
                  placeholder="gross"
                />
              </label>
            </div>
            <button type="button" onClick={handleAddLine} className="dispatch-add-line-button">
              Add line
            </button>
          </div>

          {/* Per-dabbi-section matrices */}
          {sections.map((section) => {
            const sectionData = buildSectionMatrixData(
              dispatchState, section, openLines, sizeMaster, designMaster, colourMaster,
            )
            const filteredData = filterMatrixData(sectionData, activeFilters, { design: 'design', colour: 'colour' })
            const sectionTitle = section.brand_label
              ? `${section.dabbi_colour_code} / ${section.brand_label}`
              : section.dabbi_colour_code

            return (
              <div key={section.dabbi_colour_id} className="dispatch-dabbi-section">
                {sections.length > 1 && (
                  <div className="dispatch-section-header">{sectionTitle}</div>
                )}
                <div className="dispatch-matrix-wrap dispatch-matrix-edit-wrap">
                  <MatrixGrid
                    data={filteredData}
                    mode="edit"
                    onCellChange={(change) => handleDispatchCellChange(change, section.dabbi_colour_id)}
                    highlightCell={highlightDispatchCell}
                    compactMobile
                  />
                </div>
              </div>
            )
          })}

          {fillerSummary.fillerQty > 0 && (
            <p className="dispatch-message dispatch-message-extra">
              Extra fillers added: {fmt(fillerSummary.fillerQty)} gross across {fillerSummary.cellCount}{' '}
              {fillerSummary.cellCount === 1 ? 'cell' : 'cells'}
              {fillerSummary.extraSkuCellCount > 0
                ? `, including ${fillerSummary.extraSkuCellCount} extra SKU ${fillerSummary.extraSkuCellCount === 1 ? 'cell' : 'cells'} not in the order`
                : ''}
              .
            </p>
          )}
          {blockingStock.cellCount > 0 && (
            <p className="dispatch-message dispatch-message-danger">
              {blockingStock.cellCount} {blockingStock.cellCount === 1 ? 'cell exceeds' : 'cells exceed'} ready stock by {fmt(blockingStock.excessQty)} gross. Reduce those quantities before confirming.
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
          disabled={isPending || !hasAnyStock || blockingStock.cellCount > 0 || !!dispatchResult}
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
