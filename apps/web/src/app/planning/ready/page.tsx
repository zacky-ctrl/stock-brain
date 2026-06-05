import { createServerSupabaseClient } from '@/lib/supabase/server'
import { computePlanningAllocation } from '@stock-brain/domain'
import { fetchPlanningInputs } from '@/lib/planning-fetcher'
import { PageHeader } from '@/components/ui/PageHeader'
import { ReadyStockPageClient } from './ReadyStockPageClient'
import type { DisplayRow, SizeEntry, DabbiEntry, BrandEntry } from './ReadyStockPageClient'
import type { HistoryRow } from './ReadyStockPageClient'

// ── Status priority for aggregation ─────────────────────────

const STATUS_PRIORITY: Record<string, number> = {
  in_stock: 0,
  ready_to_dispatch: 1,
  ready_to_dispatch_override: 1,
  covered_by_wip: 2,
  give_to_labour: 3,
  give_to_labour_override: 3,
  cut_on_machine: 4,
  cut_on_machine_override: 4,
  procure_velvet: 5,
}

function worstStatus(a: string, b: string): string {
  return (STATUS_PRIORITY[b] ?? 0) > (STATUS_PRIORITY[a] ?? 0) ? b : a
}

function deriveSource(reason: string): string {
  if (reason.startsWith('OPENING_BALANCE')) return 'Opening Balance'
  if (reason.startsWith('LABOUR_RETURN')) return 'Labour Return'
  if (reason.startsWith('CUTTING')) return 'Cutting Session'
  if (reason.startsWith('DISPATCH')) return 'Dispatch'
  return 'Stock Correction'
}

export default async function PlanningReadyPage() {
  const supabase = createServerSupabaseClient()
  let fetchError: string | null = null

  const [
    balanceResult,
    shapesResult,
    bindiColoursResult,
    sizesResult,
    dabbiColoursResult,
    brandsResult,
    correctionsResult,
    planningInputsResult,
  ] = await Promise.allSettled([
    supabase
      .from('ready_stock_balance')
      .select('id, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id, brand_id, gross_qty, committed_qty, available_qty'),
    supabase.from('shape_designs').select('id, code, name, sort_order').order('sort_order').order('code'),
    supabase.from('bindi_colours').select('id, code, name, sort_order').order('sort_order').order('code'),
    supabase.from('sizes').select('id, code, name, sort_order').order('sort_order').order('code'),
    supabase.from('dabbi_colours').select('id, code, name').order('code'),
    supabase.from('brands').select('id, code, name').order('code'),
    supabase
      .from('stock_corrections')
      .select('id, corrected_at, entity_id, delta_value, reason')
      .eq('stock_stage', 'ready')
      .order('corrected_at', { ascending: false })
      .limit(200),
    fetchPlanningInputs(supabase),
  ])

  if (balanceResult.status === 'rejected') {
    fetchError = balanceResult.reason instanceof Error
      ? balanceResult.reason.message
      : String(balanceResult.reason)
  }

  // ── Lookup maps ──────────────────────────────────────────

  const balanceRows = balanceResult.status === 'fulfilled' ? (balanceResult.value.data ?? []) : []
  const shapes = shapesResult.status === 'fulfilled' ? (shapesResult.value.data ?? []) : []
  const bindiColours = bindiColoursResult.status === 'fulfilled' ? (bindiColoursResult.value.data ?? []) : []
  const sizesRaw = sizesResult.status === 'fulfilled' ? (sizesResult.value.data ?? []) : []
  const dabbiColoursRaw = dabbiColoursResult.status === 'fulfilled' ? (dabbiColoursResult.value.data ?? []) : []
  const brandsRaw = brandsResult.status === 'fulfilled' ? (brandsResult.value.data ?? []) : []

  const shapeMap = new Map(shapes.map((s) => [s.id as string, { name: ((s as { name?: string | null }).name ?? s.code) as string, sort: Number((s as { sort_order?: number | null }).sort_order ?? 0) }]))
  const colourMap = new Map(bindiColours.map((c) => [c.id as string, { code: c.code as string, sort: Number((c as { sort_order?: number | null }).sort_order ?? 0) }]))
  const sizeMap = new Map(sizesRaw.map((s) => [s.id as string, { code: s.code as string, sort: Number((s as { sort_order?: number | null }).sort_order ?? 0) }]))
  const dabbiMap = new Map(dabbiColoursRaw.map((d) => [d.id as string, { code: d.code as string, name: ((d as { name?: string | null }).name ?? d.code) as string }]))
  const brandMap = new Map(brandsRaw.map((b) => [b.id as string, ((b as { name?: string | null }).name ?? b.code) as string]))

  // ── Engine aggregation by base4 key ──────────────────────

  type EngineAgg = { open_qty: number; ready_allocated_qty: number; shortage_qty: number; worst_status: string }
  const engineByBase4 = new Map<string, EngineAgg>()

  if (planningInputsResult.status === 'fulfilled') {
    const engineRows = computePlanningAllocation(planningInputsResult.value)
    for (const row of engineRows) {
      const key = `${row.shape_design_id}|${row.bindi_colour_id}|${row.size_id}|${row.dabbi_colour_id}`
      const existing = engineByBase4.get(key)
      if (existing) {
        engineByBase4.set(key, {
          open_qty: existing.open_qty + row.open_qty,
          ready_allocated_qty: existing.ready_allocated_qty + row.ready_allocated_qty,
          shortage_qty: existing.shortage_qty + row.shortage_qty,
          worst_status: worstStatus(existing.worst_status, row.planning_status),
        })
      } else {
        engineByBase4.set(key, {
          open_qty: row.open_qty,
          ready_allocated_qty: row.ready_allocated_qty,
          shortage_qty: row.shortage_qty,
          worst_status: row.planning_status,
        })
      }
    }
  }

  // ── Build display rows ───────────────────────────────────

  const displayRows: DisplayRow[] = []
  for (const r of balanceRows) {
    const shapeId = r.shape_design_id as string
    const colourId = r.bindi_colour_id as string
    const sizeId = r.size_id as string
    const dabbiId = r.dabbi_colour_id as string
    const brandId = r.brand_id as string

    const shape = shapeMap.get(shapeId)
    const colour = colourMap.get(colourId)
    const size = sizeMap.get(sizeId)
    const dabbi = dabbiMap.get(dabbiId)

    const base4 = `${shapeId}|${colourId}|${sizeId}|${dabbiId}`
    const eng = engineByBase4.get(base4)

    displayRows.push({
      id: r.id as string,
      shape_design_id: shapeId,
      bindi_colour_id: colourId,
      size_id: sizeId,
      dabbi_colour_id: dabbiId,
      brand_id: brandId,
      shape_name: shape?.name ?? shapeId.slice(0, 8),
      shape_sort: shape?.sort ?? 0,
      colour_code: colour?.code ?? colourId.slice(0, 8),
      colour_sort: colour?.sort ?? 0,
      size_code: size?.code ?? sizeId.slice(0, 8),
      size_sort: size?.sort ?? 0,
      dabbi_code: dabbi?.code ?? dabbiId.slice(0, 8),
      dabbi_name: dabbi?.name ?? dabbi?.code ?? dabbiId.slice(0, 8),
      brand_name: brandMap.get(brandId) ?? brandId.slice(0, 8),
      gross_qty: Number(r.gross_qty),
      committed_qty: Number(r.committed_qty),
      available_qty: Number(r.available_qty),
      open_qty: eng?.open_qty ?? 0,
      ready_allocated_qty: eng?.ready_allocated_qty ?? 0,
      shortage_qty: eng?.shortage_qty ?? 0,
      planning_status: eng?.worst_status ?? 'in_stock',
    })
  }

  // ── Balance lookup for history ───────────────────────────

  const balanceById = new Map(balanceRows.map((r) => [r.id as string, r]))

  // ── Build stock history rows ─────────────────────────────

  const stockHistory: HistoryRow[] = (
    correctionsResult.status === 'fulfilled' ? correctionsResult.value.data ?? [] : []
  ).flatMap((c) => {
    const bal = balanceById.get(c.entity_id as string)
    if (!bal) return []

    const shapeId = bal.shape_design_id as string
    const colourId = bal.bindi_colour_id as string
    const sizeId = bal.size_id as string
    const dabbiId = bal.dabbi_colour_id as string

    const reason = c.reason as string
    const shape = shapeMap.get(shapeId)
    const colour = colourMap.get(colourId)
    const size = sizeMap.get(sizeId)
    const dabbi = dabbiMap.get(dabbiId)

    const shapeName = shape?.name ?? shapeId.slice(0, 8)
    const colourCode = colour?.code ?? colourId.slice(0, 8)
    const sizeCode = size?.code ?? sizeId.slice(0, 8)
    const dabbiName = dabbi?.name ?? dabbi?.code ?? dabbiId.slice(0, 8)

    return [{
      id: c.id as string,
      corrected_at: c.corrected_at as string,
      source: deriveSource(reason),
      shape_design_id: shapeId,
      bindi_colour_id: colourId,
      size_id: sizeId,
      dabbi_colour_id: dabbiId,
      sku: `${shapeName} / ${colourCode} / ${sizeCode} / ${dabbiName}`,
      shape_name: shapeName,
      colour_code: colourCode,
      size_code: sizeCode,
      dabbi_name: dabbiName,
      delta_qty: Number(c.delta_value),
      reason,
    }]
  })

  // ── Master lists for client ──────────────────────────────

  const sizes: SizeEntry[] = sizesRaw.map((s) => ({
    id: s.id as string,
    code: s.code as string,
    sort_order: Number((s as { sort_order?: number | null }).sort_order ?? 0),
  }))

  const dabbiColours: DabbiEntry[] = dabbiColoursRaw.map((d) => ({
    id: d.id as string,
    code: d.code as string,
    name: ((d as { name?: string | null }).name ?? d.code) as string,
  }))

  const brands: BrandEntry[] = brandsRaw.map((b) => ({
    id: b.id as string,
    name: ((b as { name?: string | null }).name ?? (b as { code: string }).code) as string,
  }))

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1400px' }}>
      <PageHeader
        title="Ready Stock"
        subtitle="Finished goods available by SKU"
      />
      <ReadyStockPageClient
        rows={displayRows}
        sizes={sizes}
        dabbi_colours={dabbiColours}
        brands={brands}
        stockHistory={stockHistory}
        fetchError={fetchError}
      />
    </main>
  )
}
