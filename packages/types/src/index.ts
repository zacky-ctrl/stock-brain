/**
 * @stock-brain/types
 *
 * Shared TypeScript types for Stock Brain.
 * Types only — no business logic, no runtime code.
 */

// ============================================================
// Matrix grid types
// ============================================================
//
// The business operates using a Design × CLR × Size matrix grid as
// its native language. These types are the contract between all matrix
// consumers. No screen should define its own matrix shape.
//
// Rows  = Design + Colour (bindi_colour / CLR) combination
// Cols  = Sizes in sort_order
// Cells = Quantity in gross (zero = empty cell)

/** One size column in the matrix header. */
export type SizeColumn = {
  size_id: string
  size_name: string    // display code: '000', '00', '0', '1', ...
  sort_order: number
}

/**
 * One row in the matrix — a specific Design + CLR combination.
 *
 * cells: size_id → quantity (in gross). Missing keys = 0.
 * metadata: optional per-row data (planning_status, shortage_qty, etc.)
 * used by highlightCell callbacks on planning screens.
 */
export type MatrixRow = {
  design_id: string
  design_name: string
  colour_id: string
  colour_name: string
  colour_code: string              // D / M / R / MIX / BK / CF
  cells: Record<string, number>    // size_id → quantity
  metadata?: Record<string, unknown>
}

/**
 * One individual cell's identity and quantity.
 * Used when you need per-cell granularity rather than per-row.
 */
export type MatrixCell = {
  design_id: string
  design_name: string
  colour_id: string
  colour_name: string
  colour_code: string
  size_id: string
  size_name: string
  size_sort_order: number
  quantity: number
  metadata?: Record<string, unknown>
}

/**
 * Complete data for rendering a MatrixGrid component.
 * sizes defines the column structure (always shown even if all zero).
 * rows defines the row+cell structure.
 */
export type MatrixGridData = {
  sizes: SizeColumn[]
  rows: MatrixRow[]
  context_label?: string       // e.g. customer name, report title
  date_label?: string
}

/**
 * Emitted by MatrixGrid in edit mode when a cell value changes.
 * quantity = 0 means the cell was cleared.
 */
export type MatrixChangeEvent = {
  design_id: string
  colour_id: string
  size_id: string
  quantity: number
}

/** Highlight state for a matrix cell — used by planning screens. */
export type MatrixCellHighlight = 'normal' | 'shortage' | 'covered' | 'partial' | 'reserved' | 'excess'

// ============================================================
// Planning allocation engine types
// ============================================================

/**
 * One open demand line, pre-assembled by the fetcher.
 * The fetcher resolves customer data, dispatched qty, and brand eligibility
 * so the domain function stays free of DB concerns.
 */
export type DemandLineRaw = {
  order_line_id: string
  order_id: string
  order_date: string
  customer_id: string
  customer_name: string
  customer_priority_weight: number   // 1–10; higher = higher priority
  has_priority_override: boolean
  priority_override_value: number | null  // lower = higher priority; NULL if no override
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  brand_rule: string                 // customer's brand_rule (snapshot at order time is on line)
  brand_id_override: string | null   // line-level brand override (NULL = use brand_rule)
  /**
   * Brand IDs eligible for this line's allocation.
   * Resolved by fetcher from brand_rule + brand_id_override.
   * null = all brands eligible (no_preference / prefer_*)
   * string[] = only these brand IDs are eligible
   */
  eligible_brand_ids: string[] | null
  ordered_qty: number
  closed_qty: number
  dispatched_qty: number             // sum of confirmed dispatch_lines for this line
  promised_date: string | null
}

/** One ready_stock_balance row, available for planning allocation. */
export type ReadyStockForPlanning = {
  id: string                          // ready_stock_balance.id
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  brand_id: string
  gross_qty: number
  available_qty: number               // gross_qty - committed_qty (GENERATED column)
}

/** WIP stock from an active labour job line. */
export type WipStockForPlanning = {
  labour_job_line_id: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  brand_id: string
  wip_qty: number                     // quantity_sent_gross - quantity_returned_gross
}

/**
 * Per-demand-line planning status after sequential priority allocation.
 *
 * ready_to_dispatch      — open_qty fully covered by available ready stock; dispatch now
 * covered_by_wip         — ready + WIP covers open_qty; WIP not yet dispatchable
 * give_to_labour         — cuttings exist for this SKU; issue to labour, lead ~1 day
 * cut_on_machine         — no cuttings; machine cut needed first, lead ~2 days
 * procure_velvet         — no velvet either; must procure before cutting
 * ready_to_dispatch_override — ready_to_dispatch with active admin override flag
 * give_to_labour_override    — give_to_labour with active admin override flag
 * cut_on_machine_override    — cut_on_machine with active admin override flag
 * fully_dispatched       — all quantity dispatched (terminal)
 * closed                 — line formally closed (terminal)
 */
export type PlanningLineStatus =
  | 'ready_to_dispatch'
  | 'covered_by_wip'
  | 'give_to_labour'
  | 'cut_on_machine'
  | 'procure_velvet'
  | 'ready_to_dispatch_override'
  | 'give_to_labour_override'
  | 'cut_on_machine_override'
  | 'fully_dispatched'
  | 'closed'

export type RecommendedAction =
  | 'dispatch_now'
  | 'await_labour_return'
  | 'production_needed'

// ============================================================
// Reservation lifecycle types
// ============================================================

/** Input to reserveStock domain function. */
export type ReserveStockInput = {
  order_line_id: string
  ready_stock_balance_id: string
  qty: number
  allocated_by: string     // actor UUID (DEV_ACTOR_ID in pre-auth)
}

/** Output from reserveStock. */
export type ReserveStockResult =
  | { ok: true; allocation_id: string }
  | { ok: false; error: string }

/** Input to releaseReservation domain function. */
export type ReleaseReservationInput = {
  allocation_id: string
  reason: string
  released_by: string      // actor UUID
}

/** Output from releaseReservation. */
export type ReleaseResult =
  | { ok: true; released_qty: number; balance_id: string }
  | { ok: false; error: string }

/** Input to reassignReservation domain function. */
export type ReassignReservationInput = {
  allocation_id: string
  new_order_line_id: string
  reason: string
  reassigned_by: string    // actor UUID
}

/** Output from reassignReservation. */
export type ReassignResult =
  | { ok: true; new_allocation_id: string }
  | { ok: false; error: string }

/**
 * A stored stock_allocations row as read from the DB.
 * Used by the ReservationStore interface.
 */
export type StoredAllocation = {
  id: string
  order_line_id: string
  ready_stock_balance_id: string | null
  labour_job_line_id: string | null
  cuttings_stock_balance_id: string | null
  stock_stage: 'ready' | 'wip' | 'cuttings'
  allocated_qty: number
  is_active: boolean
  status: 'active' | 'released' | 'reassigned'
  allocated_by: string
  allocated_at: string
}

/**
 * A ready_stock_balance row as read for reservation operations.
 */
export type BalanceRowForReservation = {
  id: string
  gross_qty: number
  committed_qty: number
  available_qty: number    // = gross_qty - committed_qty (GENERATED)
}

/**
 * An active reservation with enriched context, for the admin
 * reservations management page.
 */
export type ActiveReservationRow = {
  id: string
  order_line_id: string
  order_id: string
  customer_name: string
  ready_stock_balance_id: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  brand_id: string
  allocated_qty: number
  allocated_at: string
}

/** Output row from the planning allocation engine. One row per open demand line. */
export type PlanningAllocationRow = {
  // Demand identity
  order_line_id: string
  order_id: string
  customer_id: string
  customer_name: string

  // Priority
  priority_rank: number               // lower = higher priority; sort key for display
  sort_tier: 0 | 1                    // 0 = has override, 1 = customer weight only
  has_priority_override: boolean

  // Demand facts
  ordered_qty: number
  dispatched_qty: number
  closed_qty: number
  open_qty: number
  promised_date: string | null
  order_date: string

  // SKU identity
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  brand_rule: string

  // Supply allocation (advisory — in-memory, not written to stock_allocations)
  ready_allocated_qty: number         // portion of open_qty covered by ready stock
  wip_allocated_qty: number           // portion of open_qty covered by WIP
  cuttings_allocated_qty: number      // portion of open_qty covered by cuttings
  shortage_qty: number                // remaining after ready + wip + cuttings

  // Cuttings snapshot (pre-allocation values for this SKU at engine run time)
  cuttings_gross_qty: number
  cuttings_reserved_qty: number
  cuttings_available_qty: number

  // Velvet snapshot
  velvet_bundles_on_hand: number
  velvet_can_cover_gross: number      // gross producible from velvet via conversion rate
  conversion_rate_missing: boolean    // velvet exists but no conversion rate for this shape+size

  // Machine cut recommendation (only meaningful when status = cut_on_machine)
  recommended_cut_qty: number         // shortage + buffer, rounded up to nearest 5

  // Lead time
  lead_time_days: number              // 0 = now, 1 = labour, 2 = machine, 3 = procure

  // Buffer warning: cuttings for this SKU below MINIMUM_CUTTINGS_BUFFER_GROSS
  buffer_warning: boolean

  // Planning override (admin override to allow action despite system block)
  override_active: boolean
  override_type: string | null
  override_reason: string | null
  override_by: string | null
  override_at: string | null

  // Status
  planning_status: PlanningLineStatus
  recommended_action: RecommendedAction
}

// ============================================================
// Planning engine input types — new stock stages
// ============================================================

/** One cuttings_stock_balance row, available for planning allocation. */
export type CuttingsStockForPlanning = {
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  gross_qty: number
  committed_qty: number
  available_qty: number
}

/** Current velvet stock balance for a velvet type, optionally by bindi colour. */
export type VelvetBalanceForPlanning = {
  velvet_type: string
  bindi_colour_id: string | null    // null = generic pool (not colour-specific)
  bundles_on_hand: number
}

/** Active conversion rate: how many gross bindi per velvet metre for a shape+size. */
export type VelvetConversionRate = {
  shape_design_id: string
  size_id: string
  gross_per_bundle: number
  metres_per_bundle: number
  buffer_gross: number
}

/** An active planning override row — allows an action despite a system block. */
export type PlanningOverride = {
  id: string
  order_line_id: string
  override_type: string
  reason: string
  created_by: string
  created_at: string
  resolved_at: string | null
}

// ============================================================
// Order line amendment types
// ============================================================

/** Input to amendOrderLine domain function. */
export type AmendOrderLineInput = {
  order_line_id: string
  /** New ordered qty. Omit to leave unchanged. */
  new_ordered_qty?: number
  /** New closed qty. Omit to leave unchanged. */
  new_closed_qty?: number
  /** Mandatory. Must not be empty. */
  reason: string
  /** Actor UUID. */
  amended_by: string
}

/** One amendment record as stored in order_line_amendments. */
export type OrderLineAmendmentRecord = {
  id: string
  amended_at: string
  amended_by: string
  field_amended: string
  old_value: string
  new_value: string
  reason: string
}

/** Output from amendOrderLine. */
export type AmendOrderLineResult =
  | {
      ok: true
      /** One entry per field that was actually changed. */
      amendments: Array<{ field: string; old_value: string; new_value: string }>
      new_line_status: string
      new_order_status: string
    }
  | { ok: false; error: string }

// ============================================================
// Raw DB row shapes
// These are the minimal column sets each planning fetcher returns.
// Supabase returns NUMERIC columns as strings; callers must coerce
// to number before passing these to domain functions.
// ============================================================

export type RawReadyStockRow = {
  id: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  brand_id: string
  gross_qty: number
  committed_qty: number
  available_qty: number
}

export type RawOpenOrderLineRow = {
  id: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  ordered_qty: number
  closed_qty: number
}

export type RawConfirmedDispatchRow = {
  order_line_id: string
  quantity_dispatched: number
}

// ============================================================
// Planning output types
// ============================================================

/**
 * One row per ready_stock_balance entry.
 *
 * open_order_qty reflects total open demand for the base 4-part SKU
 * (shape + bindi_colour + size + dabbi_colour) across all open/partially-
 * dispatched order lines, regardless of brand. Brand attribution is a
 * Phase 4+ recommendation-layer concern — not encoded here.
 */
export type ReadyStockPlanningRow = {
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  brand_id: string
  ready_stock_balance_id: string
  ready_qty: number
  committed_ready_qty: number
  available_ready_qty: number
  open_order_qty: number
}

// ============================================================
// Matrix filter types
// ============================================================

export type FilterOption = {
  id: string
  label: string
}

export type FilterField = {
  key: string
  label: string
  options: FilterOption[]
  multiSelect?: boolean
  inputType?: 'select' | 'date'   // default 'select'; 'date' renders an <input type="date">
}

export type FilterConfig = {
  fields: FilterField[]
}

/** key = field.key, value = selected option ids. Empty array = no filter (show all). */
export type ActiveFilters = Record<string, string[]>

// ============================================================
// Cutting session types
// ============================================================

export type CuttingSessionStatus = 'draft' | 'confirmed' | 'voided'

export type CuttingSessionLineInput = {
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  quantity_gross: number
}

export type CreateCuttingSessionInput = {
  session_date: string
  machine_id: string
  velvet_bundles_consumed: number
  skip_velvet_deduction?: boolean
  notes?: string | null
  actor: string
  lines: CuttingSessionLineInput[]
}

export type CreateCuttingSessionResult =
  | { ok: true; session_id: string }
  | { ok: false; error: string }

export type ConfirmCuttingSessionResult =
  | { ok: true }
  | { ok: false; error: string }

export type VoidCuttingSessionResult =
  | { ok: true }
  | { ok: false; error: string }

/** A cutting_sessions row as read from the DB. */
export type StoredCuttingSession = {
  id: string
  session_date: string
  machine_id: string
  velvet_bundles_consumed: number
  status: CuttingSessionStatus
  notes: string | null
  created_by: string
  confirmed_by: string | null
  confirmed_at: string | null
  created_at: string
  updated_at: string
}

/** A cutting_session_lines row as read from the DB. */
export type StoredCuttingSessionLine = {
  id: string
  cutting_session_id: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  quantity_gross: number
  notes: string | null
  created_at: string
}

/** A cuttings_stock_balance row as read from the DB (with computed available_qty). */
export type StoredCuttingsBalance = {
  id: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  gross_qty: number
  committed_qty: number
  available_qty: number
  last_updated_at: string
}

// ── Store interface for cutting sessions (implemented by web app via Supabase) ──

/** Data needed to insert a new cutting_sessions row. */
export type NewCuttingSessionRow = {
  session_date: string
  machine_id: string
  velvet_bundles_consumed: number | null
  status: CuttingSessionStatus
  notes: string | null
  created_by: string
}

/** Data needed to insert a cutting_session_lines row. */
export type NewCuttingSessionLineRow = {
  cutting_session_id: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  quantity_gross: number
}

// ============================================================
// Dispatch types
// ============================================================

export type DispatchLineInput = {
  order_line_id?: string | null          // null for substitute/extra lines
  ready_stock_balance_id: string
  dispatched_qty: number
  line_type?: 'ordered' | 'substitute' | 'extra' | 'short'
  original_order_line_id?: string | null // substitute: which order line is being substituted
  override_reason?: string               // required when bypassing stock availability check
}

export type CreateDispatchInput = {
  order_id: string         // required for ordered lines; can be '' for extra-only dispatch
  customer_id?: string     // override: used when order_id is empty (extra-only dispatch)
  dispatch_date: string
  reference?: string | null
  notes?: string | null
  actor: string
  lines: DispatchLineInput[]
}

export type CreateDispatchResult =
  | { success: true; dispatch_id: string; order_status: string }
  | { success: false; error: string }

// ============================================================
// Velvet receipt types
// ============================================================

export type RecordVelvetReceiptInput = {
  receipt_date: string
  /** Primary unit — always in metres. */
  metres_received: number
  /** Optional reference — bundles received as noted on delivery docket. */
  bundles_received?: number | null
  supplier?: string | null
  reference?: string | null
  notes?: string | null
  /** UUID — colour-specific velvet (required). */
  bindi_colour_id: string
  actor: string
}

export type RecordVelvetReceiptResult =
  | { success: true; new_balance_bundles: number }
  | { success: false; error: string }

export type VelvetBalanceRow = {
  bundles_on_hand: number
  last_updated_at: string
}

export type NewVelvetReceiptRow = {
  receipt_date: string
  metres_received: number
  bundles_received: number | null
  supplier: string | null
  reference: string | null
  notes: string | null
  bindi_colour_id: string
  created_by: string
}

// ── Labour issue cuttings validation ────────────────────────────────────────

export type LabourJobLineForCuttingsCheck = {
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  quantity_sent_gross: number
  /** Display name of the design, used in error messages. */
  design_name?: string
  /** Display code of the size, used in error messages. */
  size_code?: string
}

export type CuttingsValidationResult =
  | { ok: true }
  | { ok: false; error: string }

// ============================================================
// Partial release types
// ============================================================

export type PartialReleaseInput = {
  allocation_id: string
  release_qty: number
  reason: string
  released_by: string
}

export type PartialReleaseResult =
  | { ok: true; released_qty: number; remaining_qty: number; new_allocation_id: string }
  | { ok: false; error: string }

// ============================================================
// Fulfilment record types
// ============================================================

export type FulfilmentRecordInput = {
  dispatch_event_id: string
  order_id: string
  order_line_id: string | null
  ordered_qty: number
  actual_qty: number
  line_type: 'ordered' | 'substitute' | 'extra' | 'short'
  colour_match: boolean
  qty_match: boolean
  ordered_sku: {
    shape_design_id: string
    bindi_colour_id: string
    size_id: string
    dabbi_colour_id: string
    brand_id: string | null
  }
  actual_sku: {
    shape_design_id: string
    bindi_colour_id: string
    size_id: string
    dabbi_colour_id: string
    brand_id: string
  }
}

// ============================================================
// AI report types
// ============================================================

export type AiReport = {
  id: string
  generated_at: string
  report_text: string
  data_snapshot: Record<string, unknown>
}
