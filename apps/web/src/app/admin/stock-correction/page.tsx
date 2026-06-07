import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { StockCorrectionForm } from './Form'
import type {
  BalanceOption,
  CuttingsBalanceOption,
  VelvetBalance,
  WipLineOption,
  DimOption,
  CorrectionHistoryRow,
} from './Form'
import { PageHeader } from '@/components/ui/PageHeader'

export default async function StockCorrectionPage() {
  const supabase = createServerSupabaseClient()

  const [
    { data: readyRaw },
    { data: cuttingsRaw },
    { data: velvetRaw },
    { data: wipJobsRaw },
    { data: shapes },
    { data: bindis },
    { data: sizes },
    { data: dabbis },
    { data: brands },
    { data: historyRaw },
  ] = await Promise.all([
    supabase
      .from('ready_stock_balance')
      .select('id, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id, brand_id, gross_qty, committed_qty, available_qty')
      .order('shape_design_id'),
    supabase
      .from('cuttings_stock_balance')
      .select('id, shape_design_id, bindi_colour_id, size_id, gross_qty, committed_qty, available_qty')
      .order('shape_design_id'),
    supabase
      .from('velvet_stock_balance')
      .select('id, bindi_colour_id, metres_on_hand, last_updated_at, bindi_colours(code, name)')
      .eq('velvet_type', 'standard')
      .order('bindi_colour_id', { ascending: true, nullsFirst: true }),
    supabase
      .from('labour_jobs')
      .select(`
        id, date_assigned, status,
        labour_units(name),
        labour_job_lines(id, shape_design_id, bindi_colour_id, size_id, quantity_sent_gross, quantity_returned_gross)
      `)
      .in('status', ['assigned', 'in_packaging', 'partially_returned', 'delayed', 'short_variance']),
    supabase.from('shape_designs').select('id, code, name').order('sort_order'),
    supabase.from('bindi_colours').select('id, code').order('sort_order'),
    supabase.from('sizes').select('id, code').order('sort_order'),
    supabase.from('dabbi_colours').select('id, code').order('code'),
    supabase.from('brands').select('id, code, name').order('code'),
    supabase
      .from('stock_corrections')
      .select('id, corrected_at, stock_stage, entity_id, old_value, new_value, delta_value, reason')
      .not('reason', 'ilike', 'OPENING_BALANCE%')
      .order('corrected_at', { ascending: false })
      .limit(50),
  ])

  const shapeMap = new Map((shapes ?? []).map((r) => [r.id as string, (r.name ?? r.code) as string]))
  const bindiMap = new Map((bindis ?? []).map((r) => [r.id as string, r.code as string]))
  const sizeMap  = new Map((sizes ?? []).map((r) => [r.id as string, r.code as string]))
  const dabbiMap = new Map((dabbis ?? []).map((r) => [r.id as string, r.code as string]))
  const brandMap = new Map((brands ?? []).map((r) => [r.id as string, (r.name ?? r.code) as string]))

  const readyBalances: BalanceOption[] = (readyRaw ?? []).map((b) => ({
    id: b.id as string,
    label: [
      shapeMap.get(b.shape_design_id as string) ?? '?',
      bindiMap.get(b.bindi_colour_id as string) ?? '?',
      sizeMap.get(b.size_id as string) ?? '?',
      dabbiMap.get(b.dabbi_colour_id as string) ?? '?',
      brandMap.get(b.brand_id as string) ?? '?',
    ].join(' / '),
    shape_design_id: b.shape_design_id as string,
    bindi_colour_id: b.bindi_colour_id as string,
    size_id: b.size_id as string,
    dabbi_colour_id: b.dabbi_colour_id as string,
    brand_id: b.brand_id as string,
    shape_code: shapeMap.get(b.shape_design_id as string) ?? '?',
    bindi_code: bindiMap.get(b.bindi_colour_id as string) ?? '?',
    size_code: sizeMap.get(b.size_id as string) ?? '?',
    dabbi_code: dabbiMap.get(b.dabbi_colour_id as string) ?? '?',
    brand_code: brandMap.get(b.brand_id as string) ?? '?',
    current_gross_qty: Number(b.gross_qty),
    committed_qty: Number(b.committed_qty),
    available_qty: Number(b.available_qty),
  }))

  const cuttingsBalances: CuttingsBalanceOption[] = (cuttingsRaw ?? []).map((b) => ({
    id: b.id as string,
    label: [
      shapeMap.get(b.shape_design_id as string) ?? '?',
      bindiMap.get(b.bindi_colour_id as string) ?? '?',
      sizeMap.get(b.size_id as string) ?? '?',
    ].join(' / '),
    shape_design_id: b.shape_design_id as string,
    bindi_colour_id: b.bindi_colour_id as string,
    size_id: b.size_id as string,
    shape_code: shapeMap.get(b.shape_design_id as string) ?? '?',
    bindi_code: bindiMap.get(b.bindi_colour_id as string) ?? '?',
    size_code: sizeMap.get(b.size_id as string) ?? '?',
    current_gross_qty: Number(b.gross_qty),
    committed_qty: Number(b.committed_qty),
    available_qty: Number(b.available_qty),
  }))

  type VelvetRaw = {
    id: string
    bindi_colour_id: string | null
    metres_on_hand: number | string
    last_updated_at: string
    bindi_colours: { code: string; name: string | null } | { code: string; name: string | null }[] | null
  }

  const velvetBalances: VelvetBalance[] = ((velvetRaw ?? []) as unknown as VelvetRaw[]).map((row) => {
    const colour = Array.isArray(row.bindi_colours) ? row.bindi_colours[0] ?? null : row.bindi_colours
    const colourLabel = row.bindi_colour_id
      ? (colour?.name ?? colour?.code ?? row.bindi_colour_id)
      : 'Generic (legacy/no colour)'
    return {
      id: row.id,
      bindi_colour_id: row.bindi_colour_id,
      colour_label: colourLabel,
      metres_on_hand: Number(row.metres_on_hand),
      last_updated_at: row.last_updated_at,
    }
  })

  type JobRaw = {
    id: string
    date_assigned: string
    status: string
    labour_units: { name: string } | { name: string }[] | null
    labour_job_lines: Array<{
      id: string
      shape_design_id: string
      bindi_colour_id: string
      size_id: string
      quantity_sent_gross: number | string
      quantity_returned_gross: number | string
    }>
  }

  const wipLines: WipLineOption[] = []
  for (const job of (wipJobsRaw ?? []) as unknown as JobRaw[]) {
    const unitName = Array.isArray(job.labour_units)
      ? job.labour_units[0]?.name ?? '?'
      : (job.labour_units as { name: string } | null)?.name ?? '?'
    const jobLabel = `${job.date_assigned} — ${unitName}`

    for (const line of job.labour_job_lines ?? []) {
      const sent = Number(line.quantity_sent_gross)
      const returned = Number(line.quantity_returned_gross)
      const wip = sent - returned
      if (wip <= 0) continue

      const lineLabel = [
        shapeMap.get(line.shape_design_id) ?? '?',
        bindiMap.get(line.bindi_colour_id) ?? '?',
        sizeMap.get(line.size_id) ?? '?',
      ].join(' / ')

      wipLines.push({ id: line.id, job_label: jobLabel, line_label: lineLabel, wip_qty: wip })
    }
  }

  // Entity label map for history display
  const entityLabelMap = new Map<string, string>()
  for (const b of readyBalances) entityLabelMap.set(b.id, b.label)
  for (const b of cuttingsBalances) entityLabelMap.set(b.id, b.label)
  for (const b of velvetBalances) entityLabelMap.set(b.id, `Velvet / ${b.colour_label}`)
  for (const l of wipLines) entityLabelMap.set(l.id, l.line_label)

  const history: CorrectionHistoryRow[] = (historyRaw ?? []).map((h) => ({
    id: h.id as string,
    corrected_at: h.corrected_at as string,
    stock_stage: h.stock_stage as string,
    sku_label: entityLabelMap.get(h.entity_id as string) ?? '—',
    old_value: Number(h.old_value),
    new_value: Number(h.new_value),
    delta_value: Number(h.delta_value),
    reason: h.reason as string,
  }))

  const shapeDims: DimOption[] = (shapes ?? []).map((s) => ({ id: s.id as string, code: (s.name ?? s.code) as string }))
  const bindiDims: DimOption[] = (bindis ?? []).map((b) => ({ id: b.id as string, code: b.code as string }))
  const sizeDims: DimOption[]  = (sizes ?? []).map((s) => ({ id: s.id as string, code: s.code as string }))
  const dabbiDims: DimOption[] = (dabbis ?? []).map((d) => ({ id: d.id as string, code: d.code as string }))
  const brandDims: DimOption[] = (brands ?? []).map((b) => ({ id: b.id as string, code: (b.name ?? b.code) as string }))

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '960px' }}>
      <PageHeader
        title="Stock Correction"
        backHref="/planning/allocation"
        subtitle="Formally adjust a stock balance across any stage. All corrections are permanent audit records."
      />
      <div
        style={{
          marginBottom: '1.5rem',
          padding: '0.85rem 1rem',
          background: 'var(--surface-raised)',
          border: '1px solid var(--border-subtle)',
          borderLeft: '3px solid var(--accent)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Stock Correction</strong> adjusts an existing balance to a new value.
          To add new stock that was not entered through production (opening balance, found stock), use{' '}
          <strong style={{ color: 'var(--text-primary)' }}>Admin → Opening Stock</strong>.
        </p>
        <Link
          href="/admin/opening-stock"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.35rem 0.75rem',
            background: 'var(--accent-subtle)',
            color: 'var(--accent)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            textDecoration: 'none',
          }}
        >
          → Go to Opening Stock Entry
        </Link>
      </div>
      <StockCorrectionForm
        readyBalances={readyBalances}
        cuttingsBalances={cuttingsBalances}
        velvetBalances={velvetBalances}
        wipLines={wipLines}
        shapes={shapeDims}
        bindis={bindiDims}
        sizes={sizeDims}
        dabbis={dabbiDims}
        brands={brandDims}
        history={history}
      />
    </main>
  )
}
