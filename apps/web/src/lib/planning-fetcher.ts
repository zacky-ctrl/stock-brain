import { createServerSupabaseClient } from '@/lib/supabase/server'
import type {
  DemandLineRaw,
  ReadyStockForPlanning,
  WipStockForPlanning,
  CuttingsStockForPlanning,
  VelvetBalanceForPlanning,
  VelvetConversionRate,
  PlanningOverride,
} from '@stock-brain/types'
import type { AllocationEngineInput } from '@stock-brain/domain'

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>

/**
 * Assembles all DB data required by computePlanningAllocation.
 * Returns raw AllocationEngineInput — does NOT run the engine.
 * Every page calls this once, then calls computePlanningAllocation(inputs).
 */
export async function fetchPlanningInputs(
  supabase: SupabaseClient,
  options?: {
    orderIds?: string[]
    customerId?: string
  },
): Promise<AllocationEngineInput> {
  const today = new Date().toISOString().split('T')[0]

  let orderLinesQuery = supabase
    .from('order_lines')
    .select(`
      id, order_id, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id,
      ordered_qty, closed_qty, promised_date, has_priority_override,
      brand_id_override, customer_brand_rule_snapshot,
      orders(order_date, customer_id, customers(name, priority_weight, brand_rule))
    `)
    .in('status', ['open', 'partially_dispatched'])

  if (options?.orderIds && options.orderIds.length > 0) {
    orderLinesQuery = orderLinesQuery.in('order_id', options.orderIds)
  }

  const [
    orderLinesResult,
    readyStockResult,
    activeJobsResult,
    brandsResult,
    confirmedEventsResult,
    cuttingsResult,
    velvetBalancesResult,
    conversionRatesResult,
    planningOverridesResult,
  ] = await Promise.all([
    orderLinesQuery,
    supabase
      .from('ready_stock_balance')
      .select('id, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id, brand_id, gross_qty, available_qty'),
    supabase
      .from('labour_jobs')
      .select('id')
      .not('status', 'in', '("returned_complete","cancelled_recalled")'),
    supabase.from('brands').select('id, code'),
    supabase.from('dispatch_events').select('id').eq('status', 'confirmed'),
    supabase
      .from('cuttings_stock_balance')
      .select('shape_design_id, bindi_colour_id, size_id, gross_qty, committed_qty, available_qty')
      .gt('gross_qty', 0),
    supabase
      .from('velvet_stock_balance')
      .select('velvet_type, bindi_colour_id, metres_on_hand'),
    supabase
      .from('velvet_conversion_rates')
      .select('shape_design_id, size_id, gross_per_metre, metres_per_bundle, buffer_gross')
      .eq('is_active', true),
    supabase
      .from('planning_overrides')
      .select('id, order_line_id, override_type, reason, created_by, created_at, resolved_at')
      .eq('is_active', true),
  ])

  // ── Brand master ──────────────────────────────────────────────
  const brandByCode = new Map<string, string>()
  for (const b of brandsResult.data ?? []) {
    brandByCode.set(b.code as string, b.id as string)
  }
  const nirankariId = brandByCode.get('NIRANKARI') ?? null
  const suhelaId = brandByCode.get('SUHELA') ?? null

  // ── WIP stock ─────────────────────────────────────────────────
  const activeJobIds = (activeJobsResult.data ?? []).map((j) => j.id as string)
  let wipStock: WipStockForPlanning[] = []

  if (activeJobIds.length > 0) {
    const { data: wipLines } = await supabase
      .from('labour_job_lines')
      .select(`
        id, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id, brand_id,
        quantity_sent_gross, quantity_returned_gross
      `)
      .in('labour_job_id', activeJobIds)

    wipStock = (wipLines ?? [])
      .map((l) => ({
        labour_job_line_id: l.id as string,
        shape_design_id: l.shape_design_id as string,
        bindi_colour_id: l.bindi_colour_id as string,
        size_id: l.size_id as string,
        dabbi_colour_id: l.dabbi_colour_id as string,
        brand_id: l.brand_id as string,
        wip_qty: Math.max(0, Number(l.quantity_sent_gross) - Number(l.quantity_returned_gross)),
      }))
      .filter((w) => w.wip_qty > 0)
  }

  // ── Dispatched qty per open order line ────────────────────────
  const openLineIds = (orderLinesResult.data ?? []).map((l) => l.id as string)
  const dispatchedByLineId = new Map<string, number>()
  const confirmedEventIds = (confirmedEventsResult.data ?? []).map((e) => e.id as string)

  if (openLineIds.length > 0 && confirmedEventIds.length > 0) {
    const { data: dispatchLines } = await supabase
      .from('dispatch_lines')
      .select('order_line_id, quantity_dispatched')
      .in('order_line_id', openLineIds)
      .in('dispatch_event_id', confirmedEventIds)

    for (const dl of dispatchLines ?? []) {
      const lineId = dl.order_line_id as string
      dispatchedByLineId.set(lineId, (dispatchedByLineId.get(lineId) ?? 0) + Number(dl.quantity_dispatched))
    }
  }

  // ── Active priority overrides ─────────────────────────────────
  const overrideByLineId = new Map<string, number>()
  const overriddenLineIds = (orderLinesResult.data ?? [])
    .filter((l) => l.has_priority_override)
    .map((l) => l.id as string)

  if (overriddenLineIds.length > 0) {
    const { data: overrides } = await supabase
      .from('priority_overrides')
      .select('order_line_id, priority_value')
      .in('order_line_id', overriddenLineIds)
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gte.${today}`)
      .order('overridden_at', { ascending: false })

    const seen = new Set<string>()
    for (const ov of overrides ?? []) {
      const lineId = ov.order_line_id as string
      if (!seen.has(lineId)) {
        seen.add(lineId)
        overrideByLineId.set(lineId, ov.priority_value as number)
      }
    }
  }

  // ── Assemble demand lines ─────────────────────────────────────
  const allDemands: DemandLineRaw[] = []

  for (const ol of orderLinesResult.data ?? []) {
    const orderRaw = Array.isArray(ol.orders) ? ol.orders[0] : (ol.orders as Record<string, unknown> | null)
    if (!orderRaw) continue

    const customerRaw = Array.isArray(orderRaw['customers'])
      ? (orderRaw['customers'] as Record<string, unknown>[])[0]
      : (orderRaw['customers'] as Record<string, unknown> | null)
    if (!customerRaw) continue

    const lineId = ol.id as string
    const brandRule = (ol.customer_brand_rule_snapshot as string)
    const brandIdOverride = ol.brand_id_override as string | null
    const hasPriorityOverride = ol.has_priority_override as boolean
    const overrideValue = hasPriorityOverride ? (overrideByLineId.get(lineId) ?? null) : null

    let eligibleBrandIds: string[] | null = null
    if (brandIdOverride) {
      eligibleBrandIds = [brandIdOverride]
    } else if (brandRule === 'strict_nirankari' && nirankariId) {
      eligibleBrandIds = [nirankariId]
    } else if (brandRule === 'strict_suhela' && suhelaId) {
      eligibleBrandIds = [suhelaId]
    }

    allDemands.push({
      order_line_id: lineId,
      order_id: ol.order_id as string,
      order_date: orderRaw['order_date'] as string,
      customer_id: orderRaw['customer_id'] as string,
      customer_name: customerRaw['name'] as string,
      customer_priority_weight: customerRaw['priority_weight'] as number,
      has_priority_override: hasPriorityOverride,
      priority_override_value: overrideValue,
      shape_design_id: ol.shape_design_id as string,
      bindi_colour_id: ol.bindi_colour_id as string,
      size_id: ol.size_id as string,
      dabbi_colour_id: ol.dabbi_colour_id as string,
      brand_rule: brandRule,
      brand_id_override: brandIdOverride,
      eligible_brand_ids: eligibleBrandIds,
      ordered_qty: Number(ol.ordered_qty),
      closed_qty: Number(ol.closed_qty),
      dispatched_qty: dispatchedByLineId.get(lineId) ?? 0,
      promised_date: ol.promised_date as string | null,
    })
  }

  const demands = options?.customerId
    ? allDemands.filter((d) => d.customer_id === options.customerId)
    : allDemands

  // ── Ready stock ───────────────────────────────────────────────
  const readyStock: ReadyStockForPlanning[] = (readyStockResult.data ?? []).map((rs) => ({
    id: rs.id as string,
    shape_design_id: rs.shape_design_id as string,
    bindi_colour_id: rs.bindi_colour_id as string,
    size_id: rs.size_id as string,
    dabbi_colour_id: rs.dabbi_colour_id as string,
    brand_id: rs.brand_id as string,
    gross_qty: Number(rs.gross_qty),
    available_qty: Number(rs.available_qty),
  }))

  // ── Cuttings stock ────────────────────────────────────────────
  const cuttingsStock: CuttingsStockForPlanning[] = (cuttingsResult.data ?? []).map((cs) => ({
    shape_design_id: cs.shape_design_id as string,
    bindi_colour_id: cs.bindi_colour_id as string,
    size_id: cs.size_id as string,
    gross_qty: Number(cs.gross_qty),
    committed_qty: Number(cs.committed_qty),
    available_qty: Number(cs.available_qty),
  }))

  // ── Velvet balances (per colour) ──────────────────────────────
  const velvetBalances: VelvetBalanceForPlanning[] = (velvetBalancesResult.data ?? []).map((vb) => ({
    velvet_type: vb.velvet_type as string,
    bindi_colour_id: vb.bindi_colour_id as string | null,
    bundles_on_hand: Number(vb.metres_on_hand),
  }))

  // ── Conversion rates ──────────────────────────────────────────
  const conversionRates: VelvetConversionRate[] = (conversionRatesResult.data ?? []).map((r) => ({
    shape_design_id: r.shape_design_id as string,
    size_id: r.size_id as string,
    gross_per_bundle: Number(r.gross_per_metre),
    metres_per_bundle: Number(r.metres_per_bundle),
    buffer_gross: Number(r.buffer_gross ?? 10),
  }))

  // ── Planning overrides ────────────────────────────────────────
  const activeOverrides: PlanningOverride[] = (planningOverridesResult.data ?? []).map((ov) => ({
    id: ov.id as string,
    order_line_id: ov.order_line_id as string,
    override_type: ov.override_type as string,
    reason: ov.reason as string,
    created_by: ov.created_by as string,
    created_at: ov.created_at as string,
    resolved_at: ov.resolved_at as string | null,
  }))

  return {
    demands,
    readyStock,
    wipStock,
    cuttingsStock,
    velvetBalances,
    conversionRates,
    activeOverrides,
  }
}
