import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CuttingsStockClient } from './StockClient'
import type { CuttingsHistoryRow } from './StockClient'
import { PageHeader } from '@/components/ui/PageHeader'

type BalanceRow = {
  id: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  gross_qty: string | number
  committed_qty: string | number
  available_qty: string | number
}

export default async function CuttingsStockPage() {
  const supabase = createServerSupabaseClient()

  const [
    { data: balancesRaw },
    { data: shapes },
    { data: bindiColours },
    { data: sizes },
    { data: corrections },
  ] = await Promise.all([
    supabase
      .from('cuttings_stock_balance')
      .select('id, shape_design_id, bindi_colour_id, size_id, gross_qty, committed_qty, available_qty')
      .order('shape_design_id'),
    supabase.from('shape_designs').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('bindi_colours').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('sizes').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase
      .from('stock_corrections')
      .select('id, corrected_at, entity_id, delta_value, reason')
      .eq('stock_stage', 'cuttings')
      .order('corrected_at', { ascending: false })
      .limit(100),
  ])

  const balances = ((balancesRaw ?? []) as unknown as BalanceRow[]).map((b) => ({
    id: b.id,
    shape_design_id: b.shape_design_id,
    bindi_colour_id: b.bindi_colour_id,
    size_id: b.size_id,
    gross_qty: Number(b.gross_qty),
    committed_qty: Number(b.committed_qty),
    available_qty: Number(b.available_qty),
  }))

  // Build lookup maps for history stitching
  const balanceById = new Map(balances.map((b) => [b.id, b]))
  const shapeNameMap = new Map(
    (shapes ?? []).map((s) => [s.id as string, ((s as { name?: string | null }).name ?? s.code) as string]),
  )
  const colourCodeMap = new Map((bindiColours ?? []).map((c) => [c.id as string, c.code as string]))
  const sizeCodeMap = new Map((sizes ?? []).map((s) => [s.id as string, s.code as string]))

  const historyRows: CuttingsHistoryRow[] = (corrections ?? []).flatMap((c) => {
    const bal = balanceById.get(c.entity_id as string)
    if (!bal) return []
    const reason = c.reason as string
    return [
      {
        id: c.id as string,
        corrected_at: c.corrected_at as string,
        source: reason.startsWith('OPENING_BALANCE')
          ? 'Opening Balance'
          : reason.startsWith('PURCHASED:')
          ? 'Purchased'
          : 'Stock Correction',
        shape_name: shapeNameMap.get(bal.shape_design_id) ?? bal.shape_design_id.slice(0, 8),
        colour_code: colourCodeMap.get(bal.bindi_colour_id) ?? bal.bindi_colour_id.slice(0, 8),
        size_code: sizeCodeMap.get(bal.size_id) ?? bal.size_id.slice(0, 8),
        delta_qty: Number(c.delta_value),
        reason,
      },
    ]
  })

  const sizeMaster = (sizes ?? []).map((s) => ({
    id: s.id as string,
    code: s.code as string,
    name: ((s as { name?: string | null }).name ?? s.code) as string,
    sort_order: Number((s as { sort_order?: number | null }).sort_order ?? 0),
  }))
  const designMaster = (shapes ?? []).map((s) => ({
    id: s.id as string,
    name: ((s as { name?: string | null }).name ?? s.code) as string,
    sort_order: Number((s as { sort_order?: number | null }).sort_order ?? 0),
  }))
  const colourMaster = (bindiColours ?? []).map((c) => ({
    id: c.id as string,
    code: c.code as string,
    name: ((c as { name?: string | null }).name ?? c.code) as string,
    sort_order: Number((c as { sort_order?: number | null }).sort_order ?? 0),
  }))

  const reportDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1400px' }}>
      <PageHeader
        title="Cuttings Stock Position"
        backHref="/operations/cutting-sessions"
        subtitle="Available = gross cut minus committed (earmarked for labour). Read-only — corrections go through Admin → Stock Correction."
      />

      <CuttingsStockClient
        balances={balances}
        sizeMaster={sizeMaster}
        designMaster={designMaster}
        colourMaster={colourMaster}
        reportDate={reportDate}
        historyRows={historyRows}
      />
    </main>
  )
}
