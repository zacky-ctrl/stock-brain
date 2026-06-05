'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { fetchPlanningAllocation } from '@/app/planning/allocation/fetchers'

export type GenerateReportResult =
  | { ok: true; reportId: string; reportText: string; generatedAt: string }
  | { ok: false; error: string }

export async function generateAiStrategyReport(): Promise<GenerateReportResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'ANTHROPIC_API_KEY is not configured. Add it to .env.local.' }
  }

  const supabase = createServerSupabaseClient()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const sixtyDaysAgo  = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
  const today         = new Date().toISOString().split('T')[0]!

  const [
    allocationResult,
    fulfilmentResult,
    readyStockResult,
    openOrdersResult,
    shapesResult,
    coloursResult,
    sizesResult,
    labourOverdueResult,
    velvetBalanceResult,
    velvetConsumptionResult,
  ] = await Promise.all([
    fetchPlanningAllocation(supabase),

    supabase
      .from('fulfilment_records')
      .select('ordered_qty, actual_qty, line_type, colour_match, qty_match, ordered_sku, created_at, orders(customers(name))')
      .gte('created_at', sixtyDaysAgo),

    supabase
      .from('ready_stock_balance')
      .select('shape_design_id, bindi_colour_id, size_id, gross_qty, available_qty')
      .gt('gross_qty', 0),

    supabase
      .from('order_lines')
      .select('shape_design_id, bindi_colour_id, size_id, ordered_qty, closed_qty, orders(customers(name))')
      .in('status', ['open', 'partially_dispatched']),

    supabase.from('shape_designs').select('id, code, name').order('sort_order'),
    supabase.from('bindi_colours').select('id, code').order('sort_order'),
    supabase.from('sizes').select('id, code').order('sort_order'),

    // Overdue labour jobs
    supabase
      .from('labour_jobs')
      .select('id, expected_return_date')
      .not('status', 'in', '("returned_complete","cancelled_recalled")')
      .lt('expected_return_date', today),

    // Velvet current stock
    supabase
      .from('velvet_stock_balance')
      .select('bundles_on_hand')
      .eq('velvet_type', 'standard')
      .single(),

    // Velvet consumption in last 30 days (cutting sessions confirmed)
    supabase
      .from('cutting_sessions')
      .select('velvet_bundles_consumed')
      .eq('status', 'confirmed')
      .gte('session_date', thirtyDaysAgo.split('T')[0]!),

  ])

  const shapeMap  = new Map((shapesResult.data ?? []).map((r) => [r.id as string, (r.name ?? r.code) as string]))
  const colourMap = new Map((coloursResult.data ?? []).map((r) => [r.id as string, r.code as string]))
  const sizeMap   = new Map((sizesResult.data ?? []).map((r) => [r.id as string, r.code as string]))

  function skuLabel(s: Record<string, string> | null): string {
    if (!s) return '?'
    return [shapeMap.get(s.shape_design_id), colourMap.get(s.bindi_colour_id), sizeMap.get(s.size_id)].filter(Boolean).join(' ')
  }

  // ── Planning allocation: shortage SKUs ──────────────────────────
  const allocationRows = Array.isArray(allocationResult) ? allocationResult : []
  const top10Shortages = allocationRows
    .filter((r) => r.shortage_qty > 0)
    .sort((a, b) => b.shortage_qty - a.shortage_qty)
    .slice(0, 10)
    .map((r) => `${shapeMap.get(r.shape_design_id) ?? '?'} ${colourMap.get(r.bindi_colour_id) ?? '?'} ${sizeMap.get(r.size_id) ?? '?'}: ${r.shortage_qty.toFixed(0)} gross short (${r.customer_name})`)

  // ── Fulfilment analysis ─────────────────────────────────────────
  const fulfilmentData   = fulfilmentResult.data ?? []
  const orderedRecords   = fulfilmentData.filter((r) => r.line_type !== 'extra')
  const totalOrdered     = orderedRecords.reduce((s, r) => s + Number(r.ordered_qty), 0)
  const totalActual      = orderedRecords.reduce((s, r) => s + Number(r.actual_qty), 0)
  const overallPct       = totalOrdered > 0 ? (totalActual / totalOrdered * 100).toFixed(1) : '100'
  const subCount         = orderedRecords.filter((r) => r.line_type === 'substitute').length
  const shortCount2      = orderedRecords.filter((r) => r.line_type === 'short').length

  // Top 5 worst customer fulfilment
  const custFulMap = new Map<string, { name: string; ordered: number; actual: number }>()
  for (const r of fulfilmentData) {
    const orderRaw = r.orders as unknown as { customers: { name: string } | { name: string }[] | null } | null
    const custRaw  = Array.isArray(orderRaw?.customers) ? orderRaw?.customers[0] : orderRaw?.customers
    const name = (custRaw as { name?: string } | null)?.name ?? 'Unknown'
    const ex   = custFulMap.get(name) ?? { name, ordered: 0, actual: 0 }
    if (r.line_type !== 'extra') { ex.ordered += Number(r.ordered_qty); ex.actual += Number(r.actual_qty) }
    custFulMap.set(name, ex)
  }
  const worstCustomers = [...custFulMap.values()]
    .map((c) => ({ ...c, pct: c.ordered > 0 ? (c.actual / c.ordered * 100).toFixed(1) : '100' }))
    .sort((a, b) => Number(a.pct) - Number(b.pct))
    .slice(0, 5)

  // ── Labour overdue ──────────────────────────────────────────────
  const overdueLabourCount = (labourOverdueResult.data ?? []).length

  // ── Velvet stock vs consumption rate ───────────────────────────
  const velvetOnHand = Number((velvetBalanceResult.data as { bundles_on_hand?: number } | null)?.bundles_on_hand ?? 0)
  const velvetConsumed30d = (velvetConsumptionResult.data ?? []).reduce((s, r) => s + Number(r.velvet_bundles_consumed), 0)
  const velvetDailyRate = velvetConsumed30d / 30
  const daysOfVelvetLeft = velvetDailyRate > 0 ? Math.floor(velvetOnHand / velvetDailyRate) : null

  // ── Open demand ─────────────────────────────────────────────────
  const openOrders = openOrdersResult.data ?? []
  const demandBySku = new Map<string, { label: string; qty: number }>()
  for (const ol of openOrders) {
    const key   = `${ol.shape_design_id}|${ol.bindi_colour_id}|${ol.size_id}`
    const label = [shapeMap.get(ol.shape_design_id as string) ?? '?', colourMap.get(ol.bindi_colour_id as string) ?? '?', sizeMap.get(ol.size_id as string) ?? '?'].join(' ')
    const ex = demandBySku.get(key) ?? { label, qty: 0 }
    ex.qty += Number(ol.ordered_qty) - Number(ol.closed_qty)
    demandBySku.set(key, ex)
  }
  const topDemand = [...demandBySku.values()].sort((a, b) => b.qty - a.qty).slice(0, 15)

  // ── Ready stock ─────────────────────────────────────────────────
  const readyStock = (readyStockResult.data ?? [])
    .sort((a, b) => Number(b.available_qty) - Number(a.available_qty))
    .slice(0, 15)
    .map((r) => `${shapeMap.get(r.shape_design_id as string) ?? '?'} ${colourMap.get(r.bindi_colour_id as string) ?? '?'} ${sizeMap.get(r.size_id as string) ?? '?'}: ${Number(r.available_qty).toFixed(0)} gross`)

  const dataSnapshot = {
    generated_at: new Date().toISOString(),
    overall_fulfilment_pct: overallPct,
    substitution_count_60d: subCount,
    short_count_60d: shortCount2,
    top10_shortage_skus: top10Shortages,
    worst_5_customers: worstCustomers.map((c) => `${c.name}: ${c.pct}%`),
    overdue_labour_jobs: overdueLabourCount,
    velvet_on_hand_bundles: velvetOnHand,
    velvet_consumed_30d: velvetConsumed30d,
    velvet_days_remaining: daysOfVelvetLeft,
    open_demand_top15: topDemand.map((d) => `${d.label}: ${d.qty.toFixed(0)} gross`),
    ready_stock_top15: readyStock,
  }

  const userPrompt = `Business data as of ${new Date().toLocaleDateString('en-IN')}:

FULFILMENT (60 days):
- Overall rate: ${overallPct}%
- Substitutions: ${subCount}, Short shipments: ${shortCount2}

TOP 10 SHORTAGE SKUs:
${top10Shortages.length > 0 ? top10Shortages.join('\n') : '- None'}

WORST 5 CUSTOMERS (fulfilment):
${worstCustomers.map((c) => `- ${c.name}: ${c.pct}%`).join('\n') || '- None'}

LABOUR: ${overdueLabourCount} overdue job${overdueLabourCount !== 1 ? 's' : ''}

VELVET: ${velvetOnHand} bundles on hand | consumed ${velvetConsumed30d.toFixed(0)} bundles in 30 days${daysOfVelvetLeft !== null ? ` | ~${daysOfVelvetLeft} days remaining` : ''}

OPEN DEMAND (top 15):
${topDemand.map((d) => `- ${d.label}: ${d.qty.toFixed(0)} gross`).join('\n') || '- None'}

READY STOCK (top 15):
${readyStock.join('\n') || '- None'}

Respond in EXACTLY this format (use these exact section headers):

## BUSINESS HEALTH SCORE
[number 0-100] — [one sentence explanation]

## URGENT ACTIONS THIS WEEK
1. [specific action with SKU/quantity]
2. [specific action with SKU/quantity]
3. [specific action with SKU/quantity]

## MINIMUM STOCK LEVELS
For each top 10 shortage SKU, state minimum gross to hold for 95% fulfilment:
[SKU]: [min gross]

## CUSTOMER ALERTS
[list customers needing attention and why]

## PRODUCTION RECOMMENDATION (NEXT 7 DAYS)
[specific cutting and labour issue plan]

## RISK FLAG
[one key risk — what could go wrong this week]`

  const client = new Anthropic({ apiKey })

  let reportText: string
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      system: [
        {
          type: 'text',
          text: 'You are a production planning strategist for NIRANKARI BINDI, a bindi manufacturing business. Analyse provided operational data and generate specific, actionable recommendations. Be direct — name exact SKUs, quantities, and customers. Use the exact section format requested.',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cache_control: { type: 'ephemeral' } as any,
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    })

    const textBlock = message.content.find((b) => b.type === 'text')
    reportText = textBlock && 'text' in textBlock ? textBlock.text : 'No response generated.'
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Claude API call failed'
    return { ok: false, error: `AI generation failed: ${msg}` }
  }

  const generatedAt = new Date().toISOString()
  const { data: savedReport, error: saveErr } = await supabase
    .from('ai_reports')
    .insert({ report_text: reportText, data_snapshot: dataSnapshot })
    .select('id')
    .single()

  if (saveErr || !savedReport) {
    return { ok: true, reportId: '', reportText, generatedAt }
  }

  return { ok: true, reportId: savedReport.id as string, reportText, generatedAt }
}

export type ReportHistoryItem = {
  id: string
  generated_at: string
  report_text: string
}

export async function getReportHistory(): Promise<ReportHistoryItem[]> {
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('ai_reports')
    .select('id, generated_at, report_text')
    .order('generated_at', { ascending: false })
    .limit(5)

  return (data ?? []).map((r) => ({
    id:           r.id as string,
    generated_at: r.generated_at as string,
    report_text:  r.report_text as string,
  }))
}
