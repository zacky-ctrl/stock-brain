import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ReconcileForm } from './ReconcileForm'
import type { CuttingsRow, ReadyRow, VelvetState } from './ReconcileForm'
import { PageHeader } from '@/components/ui/PageHeader'

export default async function PhysicalCountPage() {
  const supabase = createServerSupabaseClient()

  const [
    { data: cuttingsRaw },
    { data: readyRaw },
    { data: velvetRaw },
    { data: shapes },
    { data: bindis },
    { data: sizes },
    { data: dabbis },
    { data: brands },
  ] = await Promise.all([
    supabase.from('cuttings_stock_balance').select('id, shape_design_id, bindi_colour_id, size_id, gross_qty, committed_qty, available_qty').order('shape_design_id'),
    supabase.from('ready_stock_balance').select('id, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id, brand_id, gross_qty, committed_qty, available_qty').order('shape_design_id'),
    supabase.from('velvet_stock_balance').select('bundles_on_hand').eq('velvet_type', 'standard').single(),
    supabase.from('shape_designs').select('id, code, name').order('sort_order'),
    supabase.from('bindi_colours').select('id, code').order('sort_order'),
    supabase.from('sizes').select('id, code').order('sort_order'),
    supabase.from('dabbi_colours').select('id, code').order('code'),
    supabase.from('brands').select('id, code, name').order('code'),
  ])

  const shapeMap = new Map((shapes ?? []).map((r) => [r.id as string, (r.name ?? r.code) as string]))
  const bindiMap = new Map((bindis ?? []).map((r) => [r.id as string, r.code as string]))
  const sizeMap  = new Map((sizes ?? []).map((r) => [r.id as string, r.code as string]))
  const dabbiMap = new Map((dabbis ?? []).map((r) => [r.id as string, r.code as string]))
  const brandMap = new Map((brands ?? []).map((r) => [r.id as string, (r.name ?? r.code) as string]))

  const cuttingsRows: CuttingsRow[] = (cuttingsRaw ?? []).map((b) => ({
    id: b.id as string,
    label: [
      shapeMap.get(b.shape_design_id as string) ?? '?',
      bindiMap.get(b.bindi_colour_id as string) ?? '?',
      sizeMap.get(b.size_id as string) ?? '?',
    ].join(' / '),
    system_qty: Number(b.gross_qty),
    committed_qty: Number(b.committed_qty),
    available_qty: Number(b.available_qty),
  }))

  const readyRows: ReadyRow[] = (readyRaw ?? []).map((b) => ({
    id: b.id as string,
    label: [
      shapeMap.get(b.shape_design_id as string) ?? '?',
      bindiMap.get(b.bindi_colour_id as string) ?? '?',
      sizeMap.get(b.size_id as string) ?? '?',
      dabbiMap.get(b.dabbi_colour_id as string) ?? '?',
      brandMap.get(b.brand_id as string) ?? '?',
    ].join(' / '),
    system_qty: Number(b.gross_qty),
    committed_qty: Number(b.committed_qty),
    available_qty: Number(b.available_qty),
  }))

  const velvet: VelvetState | null = velvetRaw
    ? { bundles_on_hand: Number(velvetRaw.bundles_on_hand) }
    : null

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1100px' }}>
      <PageHeader
        title="Physical Count Reconciliation"
        backHref="/planning/allocation"
        subtitle="Enter physical counts to identify variances and apply corrections with audit trail."
      />
      <ReconcileForm
        cuttingsRows={cuttingsRows}
        readyRows={readyRows}
        velvet={velvet}
      />
    </main>
  )
}
