import {
  MACHINE_CUTTING_LEAD_TIME_DAYS,
  LABOUR_ISSUE_LEAD_TIME_DAYS,
} from './constants'
import type {
  DemandLineRaw,
  ReadyStockForPlanning,
  WipStockForPlanning,
  CuttingsStockForPlanning,
  VelvetBalanceForPlanning,
  VelvetConversionRate,
  PlanningOverride,
  PlanningAllocationRow,
  PlanningLineStatus,
  RecommendedAction,
} from '@stock-brain/types'

// ── priority ──────────────────────────────────────────────────

/**
 * Sort tier: demand lines with an active priority override come before
 * all customer-weight-only lines, regardless of the override value.
 */
function sortTier(demand: DemandLineRaw): 0 | 1 {
  return demand.has_priority_override && demand.priority_override_value !== null ? 0 : 1
}

/**
 * Within-tier sort value (lower = higher priority):
 *   Tier 0 (override): use priority_override_value directly (1 = top)
 *   Tier 1 (weight):   11 - customer_priority_weight (weight 10 → rank 1, weight 1 → rank 10)
 */
function tierValue(demand: DemandLineRaw): number {
  if (demand.has_priority_override && demand.priority_override_value !== null) {
    return demand.priority_override_value
  }
  return 11 - demand.customer_priority_weight
}

/**
 * Stable comparator for demand lines.
 * Primary: sort_tier ASC (overrides first)
 * Secondary: tier_value ASC (lower = higher priority)
 * Tertiary: promised_date ASC (earlier promise = higher priority)
 * Quaternary: order_date ASC (older order = higher priority)
 */
export function compareDemandByPriority(a: DemandLineRaw, b: DemandLineRaw): number {
  const tierDiff = sortTier(a) - sortTier(b)
  if (tierDiff !== 0) return tierDiff

  const valDiff = tierValue(a) - tierValue(b)
  if (valDiff !== 0) return valDiff

  if (a.promised_date !== b.promised_date) {
    if (a.promised_date === null) return 1
    if (b.promised_date === null) return -1
    return a.promised_date < b.promised_date ? -1 : 1
  }

  return a.order_date < b.order_date ? -1 : 1
}

// ── stock pool keys ───────────────────────────────────────────

/**
 * Five-part composite key for finished-goods identity.
 * Matches ready_stock_balance and labour_job_lines uniqueness.
 */
function sku5Key(
  shape_design_id: string,
  bindi_colour_id: string,
  size_id: string,
  dabbi_colour_id: string,
  brand_id: string,
): string {
  return `${shape_design_id}|${bindi_colour_id}|${size_id}|${dabbi_colour_id}|${brand_id}`
}

/**
 * Three-part composite key for cuttings-stage identity.
 * Cuttings carry no dabbi_colour or brand — those are packaging-stage concepts.
 */
function sku3Key(
  shape_design_id: string,
  bindi_colour_id: string,
  size_id: string,
): string {
  return `${shape_design_id}|${bindi_colour_id}|${size_id}`
}

/** Two-part key for velvet conversion rate lookup (shape + size). */
function convRateKey(shape_design_id: string, size_id: string): string {
  return `${shape_design_id}|${size_id}`
}

// ── pool builders ─────────────────────────────────────────────

function buildReadyPool(readyStock: ReadyStockForPlanning[]): Map<string, number> {
  const pool = new Map<string, number>()
  for (const rs of readyStock) {
    const key = sku5Key(
      rs.shape_design_id, rs.bindi_colour_id, rs.size_id,
      rs.dabbi_colour_id, rs.brand_id,
    )
    pool.set(key, (pool.get(key) ?? 0) + Math.max(0, rs.gross_qty))
  }
  return pool
}

function buildWipPool(wipStock: WipStockForPlanning[]): Map<string, number> {
  const pool = new Map<string, number>()
  for (const wip of wipStock) {
    const key = sku5Key(
      wip.shape_design_id, wip.bindi_colour_id, wip.size_id,
      wip.dabbi_colour_id, wip.brand_id,
    )
    pool.set(key, (pool.get(key) ?? 0) + Math.max(0, wip.wip_qty))
  }
  return pool
}

function buildCuttingsPool(cuttingsStock: CuttingsStockForPlanning[]): Map<string, number> {
  const pool = new Map<string, number>()
  for (const cs of cuttingsStock) {
    const key = sku3Key(cs.shape_design_id, cs.bindi_colour_id, cs.size_id)
    pool.set(key, (pool.get(key) ?? 0) + Math.max(0, cs.available_qty))
  }
  return pool
}

/**
 * Build a snapshot of cuttings values before pool mutation.
 * Keyed by 3-part SKU. Used to populate per-line cuttings_gross/reserved/available_qty.
 */
function buildCuttingsSnapshot(cuttingsStock: CuttingsStockForPlanning[]): Map<string, {
  gross_qty: number
  committed_qty: number
  available_qty: number
}> {
  const snap = new Map<string, { gross_qty: number; committed_qty: number; available_qty: number }>()
  for (const cs of cuttingsStock) {
    const key = sku3Key(cs.shape_design_id, cs.bindi_colour_id, cs.size_id)
    const existing = snap.get(key)
    if (existing) {
      snap.set(key, {
        gross_qty: existing.gross_qty + cs.gross_qty,
        committed_qty: existing.committed_qty + cs.committed_qty,
        available_qty: existing.available_qty + cs.available_qty,
      })
    } else {
      snap.set(key, {
        gross_qty: cs.gross_qty,
        committed_qty: cs.committed_qty,
        available_qty: cs.available_qty,
      })
    }
  }
  return snap
}

function buildConversionRateMap(rates: VelvetConversionRate[]): Map<string, VelvetConversionRate> {
  const map = new Map<string, VelvetConversionRate>()
  for (const r of rates) {
    map.set(convRateKey(r.shape_design_id, r.size_id), r)
  }
  return map
}

// ── pool allocation ───────────────────────────────────────────

/**
 * Allocate up to `needed` from the pool across eligible keys.
 * Mutates the pool in place. Returns total allocated.
 *
 * WHY mutate: sequential priority allocation requires each demand line sees a
 * pool already reduced by higher-priority lines. Pure snapshots would show the
 * same stock as available to every line simultaneously — the false-availability
 * bug this function exists to prevent.
 */
function allocateFromPool(
  pool: Map<string, number>,
  needed: number,
  eligibleKeys: string[],
): number {
  let remaining = needed
  let totalAllocated = 0

  for (const key of eligibleKeys) {
    if (remaining <= 0) break
    const available = pool.get(key) ?? 0
    if (available <= 0) continue
    const take = Math.min(remaining, available)
    pool.set(key, available - take)
    totalAllocated += take
    remaining -= take
  }

  return totalAllocated
}

// ── status derivation ─────────────────────────────────────────

function derivePlanningStatus(
  open_qty: number,
  ready_allocated: number,
  wip_allocated: number,
  cuttings_allocated: number,
  remaining: number,
  velvet_can_cover: number,
  override_active: boolean,
): PlanningLineStatus {
  let base: PlanningLineStatus

  if (remaining <= 0) {
    if (ready_allocated >= open_qty) {
      base = 'ready_to_dispatch'
    } else if (cuttings_allocated > 0) {
      // Cuttings issued to labour will cover the remaining demand
      base = 'give_to_labour'
    } else {
      base = 'covered_by_wip'
    }
  } else {
    if (cuttings_allocated > 0) {
      // Partial cuttings coverage — issue what exists, rest needs machine
      base = 'give_to_labour'
    } else if (velvet_can_cover >= remaining) {
      base = 'cut_on_machine'
    } else {
      base = 'procure_velvet'
    }
  }

  if (override_active) {
    if (base === 'ready_to_dispatch') return 'ready_to_dispatch_override'
    if (base === 'give_to_labour') return 'give_to_labour_override'
    if (base === 'cut_on_machine') return 'cut_on_machine_override'
    // covered_by_wip and procure_velvet keep base status; override is visible via override_active flag
  }

  return base
}

function deriveRecommendedAction(status: PlanningLineStatus): RecommendedAction {
  switch (status) {
    case 'ready_to_dispatch':
    case 'ready_to_dispatch_override':
      return 'dispatch_now'
    case 'covered_by_wip':
      return 'await_labour_return'
    default:
      return 'production_needed'
  }
}

function deriveLeadTimeDays(status: PlanningLineStatus): number {
  switch (status) {
    case 'ready_to_dispatch':
    case 'ready_to_dispatch_override':
      return 0
    case 'covered_by_wip':
    case 'give_to_labour':
    case 'give_to_labour_override':
      return LABOUR_ISSUE_LEAD_TIME_DAYS
    case 'cut_on_machine':
    case 'cut_on_machine_override':
      return MACHINE_CUTTING_LEAD_TIME_DAYS
    default:
      return 3
  }
}

/** Round up to nearest 5. */
function roundUpToNearest5(n: number): number {
  return Math.ceil(n / 5) * 5
}

// ── engine entry point ────────────────────────────────────────

export type AllocationEngineInput = {
  demands: DemandLineRaw[]
  readyStock: ReadyStockForPlanning[]
  wipStock: WipStockForPlanning[]
  cuttingsStock: CuttingsStockForPlanning[]
  velvetBalances: VelvetBalanceForPlanning[]
  conversionRates: VelvetConversionRate[]
  activeOverrides: PlanningOverride[]
}

/**
 * Core planning allocation engine.
 *
 * Allocates stock sequentially by priority across four stages:
 * ready → WIP → cuttings → velvet (advisory only).
 *
 * Higher-priority demand gets first claim. The same stock cannot appear
 * as available to two demand lines simultaneously.
 *
 * PURE: no DB access, no side effects, no mutations to input data.
 * Stock pools are local to this call.
 *
 * Returns one PlanningAllocationRow per open demand line, sorted by
 * priority (highest priority first).
 *
 * Advisory only: results are NOT written to stock_allocations.
 */
export function computePlanningAllocation(
  input: AllocationEngineInput,
): PlanningAllocationRow[] {
  const { demands, readyStock, wipStock, cuttingsStock, velvetBalances, conversionRates, activeOverrides } = input

  const sorted = [...demands].sort(compareDemandByPriority)

  // Mutable pools — mutations are local to this function call
  const readyPool = buildReadyPool(readyStock)
  const wipPool = buildWipPool(wipStock)
  const cuttingsPool = buildCuttingsPool(cuttingsStock)

  // Immutable snapshots for per-line reporting
  const cuttingsSnapshot = buildCuttingsSnapshot(cuttingsStock)
  const conversionRateMap = buildConversionRateMap(conversionRates)

  // Per-colour velvet map: bindi_colour_id (or null = generic pool) → bundles on hand
  const velvetByColour = new Map<string | null, number>()
  for (const vb of velvetBalances) {
    velvetByColour.set(vb.bindi_colour_id, (velvetByColour.get(vb.bindi_colour_id) ?? 0) + vb.bundles_on_hand)
  }

  // Build override lookup: order_line_id → active override
  const overrideByLineId = new Map<string, PlanningOverride>()
  for (const ov of activeOverrides) {
    if (!overrideByLineId.has(ov.order_line_id)) {
      overrideByLineId.set(ov.order_line_id, ov)
    }
  }

  const result: PlanningAllocationRow[] = []

  for (const demand of sorted) {
    const open_qty = Math.max(
      0,
      demand.ordered_qty - demand.closed_qty - demand.dispatched_qty,
    )

    if (open_qty <= 0) continue

    // Eligible 5-part keys for ready/WIP pools (brand-aware)
    const base4 = `${demand.shape_design_id}|${demand.bindi_colour_id}|${demand.size_id}|${demand.dabbi_colour_id}`

    let eligibleKeys5: string[]
    if (demand.eligible_brand_ids !== null) {
      eligibleKeys5 = demand.eligible_brand_ids.map((bId) => `${base4}|${bId}`)
    } else {
      const allReadyKeys = [...readyPool.keys()].filter((k) => k.startsWith(`${base4}|`))
      const allWipKeys = [...wipPool.keys()].filter((k) => k.startsWith(`${base4}|`))
      eligibleKeys5 = [...new Set([...allReadyKeys, ...allWipKeys])]
    }

    // Cuttings pool key (3-part — no dabbi/brand at cuttings stage)
    const cuttingsKey = sku3Key(demand.shape_design_id, demand.bindi_colour_id, demand.size_id)
    const eligibleKeys3 = [cuttingsKey]

    // 1. Allocate from ready stock
    const ready_allocated = allocateFromPool(readyPool, open_qty, eligibleKeys5)

    // 2. Allocate remaining from WIP
    const remaining_after_ready = open_qty - ready_allocated
    const wip_allocated = remaining_after_ready > 0
      ? allocateFromPool(wipPool, remaining_after_ready, eligibleKeys5)
      : 0

    // 3. Allocate remaining from cuttings
    const remaining_after_wip = remaining_after_ready - wip_allocated
    const cuttings_allocated = remaining_after_wip > 0
      ? allocateFromPool(cuttingsPool, remaining_after_wip, eligibleKeys3)
      : 0

    // 4. Check velvet capacity for remaining shortage (informational — no pool deduction)
    const remaining = remaining_after_wip - cuttings_allocated
    // Colour-specific balance first; fall back to generic (null) pool if no colour row exists
    const velvetBundles =
      velvetByColour.get(demand.bindi_colour_id) ??
      velvetByColour.get(null) ??
      0
    const convRate = conversionRateMap.get(convRateKey(demand.shape_design_id, demand.size_id))
    const grossPerMetre = convRate?.gross_per_bundle ?? 0
    let velvet_can_cover = 0
    let conversion_rate_missing = false
    if (remaining > 0) {
      if (velvetBundles > 0 && convRate) {
        velvet_can_cover = velvetBundles * grossPerMetre
      } else if (velvetBundles > 0 && !convRate) {
        // Velvet exists but no rate — assume cuttable so status doesn't falsely degrade to procure_velvet
        velvet_can_cover = remaining
        conversion_rate_missing = true
      }
      // velvetBundles === 0: velvet_can_cover stays 0, genuine procure situation
    }

    const shortage_qty = Math.max(0, remaining)

    // 5. Cuttings snapshot for this SKU
    const cuttingsSnap = cuttingsSnapshot.get(cuttingsKey) ?? { gross_qty: 0, committed_qty: 0, available_qty: 0 }

    // 6. Override check
    const activeOverride = overrideByLineId.get(demand.order_line_id) ?? null
    const override_active = activeOverride !== null

    // 7. Derive status
    const planning_status = derivePlanningStatus(
      open_qty,
      ready_allocated,
      wip_allocated,
      cuttings_allocated,
      remaining,
      velvet_can_cover,
      override_active,
    )

    // 8. Recommended cut qty (only for cut_on_machine)
    let recommended_cut_qty = 0
    if (planning_status === 'cut_on_machine' || planning_status === 'cut_on_machine_override') {
      const skuBuffer = convRate?.buffer_gross ?? 10
      recommended_cut_qty = roundUpToNearest5(shortage_qty + skuBuffer)
    }

    // 9. Lead time
    const lead_time_days = deriveLeadTimeDays(planning_status)

    // 10. Buffer warning: cuttings for this SKU below per-SKU buffer threshold
    // Warning applies when cuttings exist but are running low (not when procure_velvet — already empty)
    const buffer_warning =
      planning_status !== 'procure_velvet' &&
      cuttingsSnap.available_qty < (convRate?.buffer_gross ?? 10)

    const recommended_action = deriveRecommendedAction(planning_status)

    result.push({
      order_line_id: demand.order_line_id,
      order_id: demand.order_id,
      customer_id: demand.customer_id,
      customer_name: demand.customer_name,
      priority_rank: tierValue(demand),
      sort_tier: sortTier(demand),
      has_priority_override: demand.has_priority_override,
      ordered_qty: demand.ordered_qty,
      dispatched_qty: demand.dispatched_qty,
      closed_qty: demand.closed_qty,
      open_qty,
      promised_date: demand.promised_date,
      order_date: demand.order_date,
      shape_design_id: demand.shape_design_id,
      bindi_colour_id: demand.bindi_colour_id,
      size_id: demand.size_id,
      dabbi_colour_id: demand.dabbi_colour_id,
      brand_rule: demand.brand_rule,
      ready_allocated_qty: ready_allocated,
      wip_allocated_qty: wip_allocated,
      cuttings_allocated_qty: cuttings_allocated,
      shortage_qty,
      cuttings_gross_qty: cuttingsSnap.gross_qty,
      cuttings_reserved_qty: cuttingsSnap.committed_qty,
      cuttings_available_qty: cuttingsSnap.available_qty,
      velvet_bundles_on_hand: velvetBundles,
      velvet_can_cover_gross: velvet_can_cover,
      conversion_rate_missing,
      recommended_cut_qty,
      lead_time_days,
      buffer_warning,
      override_active,
      override_type: activeOverride?.override_type ?? null,
      override_reason: activeOverride?.reason ?? null,
      override_by: activeOverride?.created_by ?? null,
      override_at: activeOverride?.created_at ?? null,
      planning_status,
      recommended_action,
    })
  }

  return result
}
