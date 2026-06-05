import { createServerSupabaseClient } from '@/lib/supabase/server'
import { SetOverrideForm, ClearOverrideForm } from './Form'
import type { OrderLineOption } from './Form'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'

export default async function PriorityOverridePage() {
  const supabase = createServerSupabaseClient()

  // Fetch open order lines with customer + order info + active override
  const [
    { data: openLinesRaw },
    { data: shapes },
    { data: bindis },
    { data: sizes },
    { data: dabbis },
  ] = await Promise.all([
    supabase
      .from('order_lines')
      .select(`
        id, has_priority_override,
        orders(order_id:id, order_date, customers(name, priority_weight)),
        shape_designs(code, name),
        bindi_colours(code),
        sizes(code),
        dabbi_colours(code)
      `)
      .in('status', ['open', 'partially_dispatched'])
      .order('created_at'),
    supabase.from('shape_designs').select('id, code, name'),
    supabase.from('bindi_colours').select('id, code'),
    supabase.from('sizes').select('id, code'),
    supabase.from('dabbi_colours').select('id, code'),
  ])

  // Fetch active overrides for flagged lines
  const flaggedLineIds = (openLinesRaw ?? [])
    .filter((l) => l.has_priority_override)
    .map((l) => l.id as string)

  const today = new Date().toISOString().split('T')[0]
  const overrideMap = new Map<string, number>()

  if (flaggedLineIds.length > 0) {
    const { data: overrides } = await supabase
      .from('priority_overrides')
      .select('order_line_id, priority_value')
      .in('order_line_id', flaggedLineIds)
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gte.${today}`)
      .order('overridden_at', { ascending: false })

    const seen = new Set<string>()
    for (const ov of overrides ?? []) {
      const lineId = ov.order_line_id as string
      if (!seen.has(lineId)) {
        seen.add(lineId)
        overrideMap.set(lineId, ov.priority_value as number)
      }
    }
  }

  // Build display options
  const openLines: OrderLineOption[] = (openLinesRaw ?? []).map((ol) => {
    const orderRaw = Array.isArray(ol.orders) ? ol.orders[0] : (ol.orders as Record<string, unknown> | null)
    const customerRaw = orderRaw
      ? (Array.isArray(orderRaw['customers']) ? (orderRaw['customers'] as Record<string, unknown>[])[0] : orderRaw['customers'] as Record<string, unknown> | null)
      : null

    const shapeRaw = Array.isArray(ol.shape_designs) ? ol.shape_designs[0] : ol.shape_designs as { code: string; name: string | null } | null
    const bindiRaw = Array.isArray(ol.bindi_colours) ? ol.bindi_colours[0] : ol.bindi_colours as { code: string } | null
    const sizeRaw  = Array.isArray(ol.sizes) ? ol.sizes[0] : ol.sizes as { code: string } | null
    const dabbiRaw = Array.isArray(ol.dabbi_colours) ? ol.dabbi_colours[0] : ol.dabbi_colours as { code: string } | null

    const customerName = (customerRaw?.['name'] as string | undefined) ?? '?'
    const priorityWeight = (customerRaw?.['priority_weight'] as number | undefined) ?? 5
    const shape = (shapeRaw as { code: string; name: string | null } | null)?.name ?? (shapeRaw as { code: string } | null)?.code ?? '?'
    const bindi = (bindiRaw as { code: string } | null)?.code ?? '?'
    const size  = (sizeRaw as { code: string } | null)?.code ?? '?'
    const dabbi = (dabbiRaw as { code: string } | null)?.code ?? '?'

    const lineId = ol.id as string
    const hasOverride = ol.has_priority_override as boolean

    return {
      id: lineId,
      label: `${customerName} · ${shape} ${bindi} ${size} ${dabbi}`,
      has_priority_override: hasOverride,
      current_override_value: hasOverride ? (overrideMap.get(lineId) ?? null) : null,
      customer_priority_weight: priorityWeight,
    }
  })

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '900px' }}>
      <PageHeader
        title="Priority Overrides"
        backHref="/planning/allocation"
        subtitle="Override the planning allocation priority for a specific order line. Overridden lines always rank above customer-weight lines in the engine. All overrides are recorded with reason and actor."
      />

      <div style={{ marginBottom: '1.5rem' }}>
        <SectionHeader title="Set / Update Priority Override" />
        <SetOverrideForm openLines={openLines} />
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1.5rem 0' }} />

      <div>
        <SectionHeader title="Clear Override" />
        <ClearOverrideForm openLines={openLines} />
      </div>
    </main>
  )
}
