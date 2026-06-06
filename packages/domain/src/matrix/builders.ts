import type {
  MatrixGridData,
  MatrixRow,
  SizeColumn,
  MatrixChangeEvent,
  ActiveFilters,
} from '@stock-brain/types'

// ── shared helpers ────────────────────────────────────────────

function rowKey(designId: string, colourId: string): string {
  return `${designId}|${colourId}`
}

/**
 * Produces a sorted, deduplicated SizeColumn[] from a set of size IDs
 * that appear in the data, using the provided master list as source of
 * truth for names and sort_order. Only sizes that appear in the master
 * list are included; unknown IDs are silently dropped.
 *
 * If includeAll is true, all master sizes are returned regardless of
 * whether they appear in the data (consistent column structure).
 */
function resolveSizeColumns(
  sizeMaster: SizeMasterRow[],
  includeAll = true,
  activeSizeIds?: Set<string>,
): SizeColumn[] {
  const source = includeAll
    ? sizeMaster
    : sizeMaster.filter((s) => activeSizeIds?.has(s.id) ?? true)
  return [...source].sort((a, b) => a.sort_order - b.sort_order).map((s) => ({
    size_id: s.id,
    size_name: s.code,
    sort_order: s.sort_order,
  }))
}

// ── input row shapes (callers fetch these from DB) ────────────

export type SizeMasterRow = {
  id: string
  code: string       // '000', '00', '0', '1', ...
  name: string
  sort_order: number
}

export type DesignMasterRow = {
  id: string
  name: string
  sort_order?: number
}

export type ColourMasterRow = {
  id: string
  code: string       // D / M / R / CF / BK / MIX
  name: string
  sort_order?: number
}

export type OrderLineRow = {
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  ordered_qty: number
  closed_qty?: number
  dispatched_qty?: number
  open_qty?: number
}

export type StockBalanceRow = {
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  gross_qty: number
  available_qty: number
  committed_qty: number
}

export type PlanningRowInput = {
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  open_qty: number
  ready_allocated_qty: number
  wip_allocated_qty: number
  shortage_qty: number
  planning_status: string
  recommended_action: string
}

export type OrderLineInsert = {
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  ordered_qty: number
}

// ── buildMatrixFromOrderLines ─────────────────────────────────

/**
 * Converts flat order line records into MatrixGridData.
 *
 * Uses open_qty if supplied (for order detail views where dispatched
 * qty is known), otherwise uses ordered_qty.
 * Rows = Design + Colour, Cols = all active sizes.
 * All active sizes are always shown (consistent column structure).
 */
export function buildMatrixFromOrderLines(
  orderLines: OrderLineRow[],
  sizes: SizeMasterRow[],
  designs: DesignMasterRow[],
  colours: ColourMasterRow[],
  options: { useOpenQty?: boolean; showAllRows?: boolean; context_label?: string; date_label?: string } = {},
): MatrixGridData {
  const sizeColumns = resolveSizeColumns(sizes, true)
  const designMap = new Map(designs.map((d) => [d.id, d]))
  const colourMap = new Map(colours.map((c) => [c.id, c]))

  const rowMap = new Map<string, MatrixRow>()

  // When showAllRows is true, pre-seed every design×colour combination so the
  // grid renders a complete blank sheet even with an empty orderLines array.
  if (options.showAllRows) {
    const sortedDesigns = [...designs].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const sortedColours = [...colours].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    for (const design of sortedDesigns) {
      for (const colour of sortedColours) {
        rowMap.set(rowKey(design.id, colour.id), {
          design_id: design.id,
          design_name: design.name,
          colour_id: colour.id,
          colour_name: colour.name,
          colour_code: colour.code,
          cells: {},
        })
      }
    }
  }

  for (const line of orderLines) {
    const design = designMap.get(line.shape_design_id)
    const colour = colourMap.get(line.bindi_colour_id)
    if (!design || !colour) continue

    const key = rowKey(line.shape_design_id, line.bindi_colour_id)

    if (!rowMap.has(key)) {
      rowMap.set(key, {
        design_id: line.shape_design_id,
        design_name: design.name,
        colour_id: line.bindi_colour_id,
        colour_name: colour.name,
        colour_code: colour.code,
        cells: {},
      })
    }

    const qty = options.useOpenQty && line.open_qty !== undefined
      ? line.open_qty
      : line.ordered_qty

    const row = rowMap.get(key)!
    row.cells[line.size_id] = (row.cells[line.size_id] ?? 0) + qty
  }

  // Sort rows by design sort_order, then colour sort_order
  const rows = [...rowMap.values()].sort((a, b) => {
    const da = designMap.get(a.design_id)?.sort_order ?? 0
    const db = designMap.get(b.design_id)?.sort_order ?? 0
    if (da !== db) return da - db
    const ca = colourMap.get(a.colour_id)?.sort_order ?? 0
    const cb = colourMap.get(b.colour_id)?.sort_order ?? 0
    return ca - cb
  })

  return {
    sizes: sizeColumns,
    rows,
    context_label: options.context_label,
    date_label: options.date_label,
  }
}

// ── buildMatrixFromStockBalances ──────────────────────────────

/**
 * Converts ready_stock_balance rows into MatrixGridData.
 *
 * Shows available_qty by default (gross_qty - committed_qty).
 * Pass showGross: true to show raw gross_qty instead.
 */
export function buildMatrixFromStockBalances(
  balances: StockBalanceRow[],
  sizes: SizeMasterRow[],
  designs: DesignMasterRow[],
  colours: ColourMasterRow[],
  options: { showGross?: boolean; showAllRows?: boolean; context_label?: string; date_label?: string } = {},
): MatrixGridData {
  const sizeColumns = resolveSizeColumns(sizes, true)
  const designMap = new Map(designs.map((d) => [d.id, d]))
  const colourMap = new Map(colours.map((c) => [c.id, c]))

  const rowMap = new Map<string, MatrixRow>()

  for (const bal of balances) {
    const design = designMap.get(bal.shape_design_id)
    const colour = colourMap.get(bal.bindi_colour_id)
    if (!design || !colour) continue

    const key = rowKey(bal.shape_design_id, bal.bindi_colour_id)

    if (!rowMap.has(key)) {
      rowMap.set(key, {
        design_id: bal.shape_design_id,
        design_name: design.name,
        colour_id: bal.bindi_colour_id,
        colour_name: colour.name,
        colour_code: colour.code,
        cells: {},
      })
    }

    const qty = options.showGross ? bal.gross_qty : bal.available_qty
    const row = rowMap.get(key)!
    row.cells[bal.size_id] = (row.cells[bal.size_id] ?? 0) + qty
  }

  const rows = [...rowMap.values()].sort((a, b) => {
    const da = designMap.get(a.design_id)?.sort_order ?? 0
    const db = designMap.get(b.design_id)?.sort_order ?? 0
    if (da !== db) return da - db
    const ca = colourMap.get(a.colour_id)?.sort_order ?? 0
    const cb = colourMap.get(b.colour_id)?.sort_order ?? 0
    return ca - cb
  })

  return {
    sizes: sizeColumns,
    rows,
    context_label: options.context_label,
    date_label: options.date_label,
  }
}

// ── buildMatrixFromPlanningRows ───────────────────────────────

/**
 * Converts PlanningAllocationRow[] into MatrixGridData.
 *
 * Aggregates multiple demand lines for the same (design, colour, size)
 * by summing open_qty. The dominant planning_status (worst case) is
 * stored in metadata for use by the highlightCell callback.
 *
 * Status precedence (worst first): no_coverage > partial_coverage >
 *   partially_ready > covered_by_wip > ready_to_dispatch
 */
export function buildMatrixFromPlanningRows(
  planningRows: PlanningRowInput[],
  sizes: SizeMasterRow[],
  designs: DesignMasterRow[],
  colours: ColourMasterRow[],
  options: { context_label?: string; date_label?: string } = {},
): MatrixGridData {
  const sizeColumns = resolveSizeColumns(sizes, true)
  const designMap = new Map(designs.map((d) => [d.id, d]))
  const colourMap = new Map(colours.map((c) => [c.id, c]))

  const STATUS_RANK: Record<string, number> = {
    ready_to_dispatch: 0,
    ready_to_dispatch_override: 0,
    covered_by_wip: 1,
    give_to_labour: 2,
    give_to_labour_override: 2,
    cut_on_machine: 3,
    cut_on_machine_override: 3,
    procure_velvet: 4,
  }

  // Aggregate per (design, colour) row, per size cell
  const rowMap = new Map<string, MatrixRow>()
  // Track worst planning status per cell: rowKey → sizeId → status
  const cellStatus = new Map<string, Map<string, string>>()

  for (const pr of planningRows) {
    const design = designMap.get(pr.shape_design_id)
    const colour = colourMap.get(pr.bindi_colour_id)
    if (!design || !colour) continue

    const key = rowKey(pr.shape_design_id, pr.bindi_colour_id)

    if (!rowMap.has(key)) {
      rowMap.set(key, {
        design_id: pr.shape_design_id,
        design_name: design.name,
        colour_id: pr.bindi_colour_id,
        colour_name: colour.name,
        colour_code: colour.code,
        cells: {},
        metadata: {},
      })
      cellStatus.set(key, new Map())
    }

    const row = rowMap.get(key)!
    row.cells[pr.size_id] = (row.cells[pr.size_id] ?? 0) + pr.open_qty

    // Track worst status per size cell
    const statusMap = cellStatus.get(key)!
    const existing = statusMap.get(pr.size_id) ?? 'ready_to_dispatch'
    const existingRank = STATUS_RANK[existing] ?? 0
    const newRank = STATUS_RANK[pr.planning_status] ?? 0
    if (newRank > existingRank) {
      statusMap.set(pr.size_id, pr.planning_status)
    }
  }

  // Embed per-cell status into row metadata
  for (const [key, row] of rowMap.entries()) {
    const statusMap = cellStatus.get(key) ?? new Map()
    row.metadata = {
      cell_status: Object.fromEntries(statusMap.entries()),
    }
  }

  const rows = [...rowMap.values()].sort((a, b) => {
    const da = designMap.get(a.design_id)?.sort_order ?? 0
    const db = designMap.get(b.design_id)?.sort_order ?? 0
    if (da !== db) return da - db
    const ca = colourMap.get(a.colour_id)?.sort_order ?? 0
    const cb = colourMap.get(b.colour_id)?.sort_order ?? 0
    return ca - cb
  })

  return {
    sizes: sizeColumns,
    rows,
    context_label: options.context_label,
    date_label: options.date_label,
  }
}

// ── parseMatrixToOrderLines ───────────────────────────────────

/**
 * Converts matrix edit events back into order line insert records.
 * Ignores zero-quantity cells.
 * dabbi_colour_id applies to all lines (selected once above the matrix).
 */
export function parseMatrixToOrderLines(
  changes: MatrixChangeEvent[],
  dabbi_colour_id: string,
): OrderLineInsert[] {
  return changes
    .filter((c) => c.quantity > 0)
    .map((c) => ({
      shape_design_id: c.design_id,
      bindi_colour_id: c.colour_id,
      size_id: c.size_id,
      dabbi_colour_id,
      ordered_qty: c.quantity,
    }))
}

// ── parseMatrixToDispatchLines ────────────────────────────────

export type OrderLineForDispatch = {
  id: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  open_qty: number
  ready_stock_balance_id: string  // best available balance row for this line
  available_stock_qty: number     // available qty on that balance row
}

export type DispatchLineInsert = {
  order_line_id: string | null
  ready_stock_balance_id: string
  quantity_dispatched: number
  line_type: 'ordered' | 'extra'
}

/**
 * Converts matrix change events into dispatch line records.
 *
 * Distributes the entered quantity across matching order lines FIFO.
 * Each cell's quantity fills open_qty first (ordered lines); any excess
 * above open_qty that still has available stock becomes a parcel filler
 * (extra line) on the same balance row.
 */
export function parseMatrixToDispatchLines(
  changes: MatrixChangeEvent[],
  openLines: OrderLineForDispatch[],
): DispatchLineInsert[] {
  const result: DispatchLineInsert[] = []

  for (const change of changes) {
    if (change.quantity <= 0) continue

    const sameSkuLines = openLines.filter(
      (l) =>
        l.shape_design_id === change.design_id &&
        l.bindi_colour_id === change.colour_id &&
        l.size_id === change.size_id &&
        l.ready_stock_balance_id !== '' &&
        l.available_stock_qty > 0,
    )

    const balanceCapacity = new Map<string, number>()
    for (const line of sameSkuLines) {
      balanceCapacity.set(
        line.ready_stock_balance_id,
        Math.max(balanceCapacity.get(line.ready_stock_balance_id) ?? 0, line.available_stock_qty),
      )
    }
    const usedByBalance = new Map<string, number>()

    const matching = sameSkuLines.filter(
      (l) =>
        l.open_qty > 0,
    )

    let remaining = change.quantity

    for (const line of matching) {
      if (remaining <= 0) break
      const balanceId = line.ready_stock_balance_id
      const balanceRemaining = (balanceCapacity.get(balanceId) ?? 0) - (usedByBalance.get(balanceId) ?? 0)
      const qty = Math.min(remaining, line.open_qty, Math.max(0, balanceRemaining))
      if (qty > 0) {
        result.push({
          order_line_id: line.id,
          ready_stock_balance_id: balanceId,
          quantity_dispatched: qty,
          line_type: 'ordered',
        })
        usedByBalance.set(balanceId, (usedByBalance.get(balanceId) ?? 0) + qty)
        remaining -= qty
      }
    }

    // Excess above open_qty becomes parcel filler. Spread it across available
    // ready-stock balances for this SKU so one balance row is not overdrawn.
    if (remaining > 0) {
      for (const line of sameSkuLines) {
        if (remaining <= 0) break
        const balanceId = line.ready_stock_balance_id
        const balanceRemaining = (balanceCapacity.get(balanceId) ?? 0) - (usedByBalance.get(balanceId) ?? 0)
        const qty = Math.min(remaining, Math.max(0, balanceRemaining))
        if (qty <= 0) continue
        result.push({
          order_line_id: null,
          ready_stock_balance_id: balanceId,
          quantity_dispatched: qty,
          line_type: 'extra',
        })
        usedByBalance.set(balanceId, (usedByBalance.get(balanceId) ?? 0) + qty)
        remaining -= qty
      }
    }
  }

  return result
}

// ── filterMatrixData ──────────────────────────────────────────

/**
 * Returns a new MatrixGridData with rows filtered by the active selections.
 *
 * filterKeyMap tells the function which ActiveFilters key corresponds to which
 * dimension:
 *   design     → filter by row.design_id
 *   colour     → filter by row.colour_id
 *   nonZeroOnly → if the filter value includes 'nonzero', drop rows where every
 *                 cell is zero or missing
 *
 * An empty array for any key means "no filter" (show all).
 * Sizes (columns) are never filtered.
 * Pure function — does not mutate the input.
 */
export function filterMatrixData(
  data: MatrixGridData,
  filters: ActiveFilters,
  filterKeyMap: {
    design?: string
    colour?: string
    nonZeroOnly?: string
  } = {},
): MatrixGridData {
  let rows = data.rows

  if (filterKeyMap.design) {
    const selected = filters[filterKeyMap.design] ?? []
    if (selected.length > 0) {
      rows = rows.filter((r) => selected.includes(r.design_id))
    }
  }

  if (filterKeyMap.colour) {
    const selected = filters[filterKeyMap.colour] ?? []
    if (selected.length > 0) {
      rows = rows.filter((r) => selected.includes(r.colour_id))
    }
  }

  if (filterKeyMap.nonZeroOnly) {
    const selected = filters[filterKeyMap.nonZeroOnly] ?? []
    if (selected.includes('nonzero')) {
      rows = rows.filter((r) =>
        data.sizes.some((s) => (r.cells[s.size_id] ?? 0) > 0),
      )
    }
  }

  return { ...data, rows }
}
