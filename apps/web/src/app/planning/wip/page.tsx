import { createServerSupabaseClient } from '@/lib/supabase/server'
import { WipClient } from './WipClient'
import { PageHeader } from '@/components/ui/PageHeader'

type RawLine = {
  id: string
  order_line_id: string | null
  quantity_sent_gross: string | number
  quantity_returned_gross: string | number
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  brand_id: string
  shape_designs: { code: string; name: string | null } | { code: string; name: string | null }[] | null
  bindi_colours: { code: string } | { code: string }[] | null
  sizes: { code: string } | { code: string }[] | null
  dabbi_colours: { code: string } | { code: string }[] | null
  brands: { code: string; name: string | null } | { code: string; name: string | null }[] | null
}

type RawJob = {
  id: string
  date_assigned: string
  expected_return_date: string | null
  status: string
  notes: string | null
  labour_units: { id: string; name: string; serial_number: number } | { id: string; name: string; serial_number: number }[] | null
  labour_job_lines: RawLine[]
}

function resolveRef<T>(raw: T | T[] | null): T | null {
  if (!raw) return null
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw
}

export default async function PlanningWipPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>
}) {
  const supabase = createServerSupabaseClient()
  const { order_id: filteredOrderId } = await searchParams

  // If filtering by order, resolve the order's line IDs first
  let orderLineIdSet: Set<string> | null = null
  if (filteredOrderId) {
    const { data: orderLines } = await supabase
      .from('order_lines')
      .select('id')
      .eq('order_id', filteredOrderId)
    if (orderLines && orderLines.length > 0) {
      orderLineIdSet = new Set(orderLines.map((l) => l.id as string))
    }
  }

  const [
    { data, error },
    { data: shapes },
    { data: bindiColours },
    { data: sizes },
  ] = await Promise.all([
    supabase
      .from('labour_jobs')
      .select(`
        id, date_assigned, expected_return_date, status, notes,
        labour_units(id, name, serial_number),
        labour_job_lines(
          id, order_line_id, quantity_sent_gross, quantity_returned_gross,
          shape_design_id, bindi_colour_id, size_id, dabbi_colour_id, brand_id,
          shape_designs(code, name),
          bindi_colours(code),
          sizes(code),
          dabbi_colours(code),
          brands(code, name)
        )
      `)
      .not('status', 'in', '("returned_complete","cancelled_recalled")')
      .order('date_assigned', { ascending: false }),
    supabase.from('shape_designs').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('bindi_colours').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('sizes').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
  ])

  const rawJobs = (data ?? []) as unknown as RawJob[]

  const allJobs = rawJobs.map((job) => {
    const lu = resolveRef(job.labour_units)
    const lines = (job.labour_job_lines ?? []).map((l) => {
      const shape = resolveRef(l.shape_designs)
      const bindi = resolveRef(l.bindi_colours)
      const size = resolveRef(l.sizes)
      const dabbi = resolveRef(l.dabbi_colours)
      const brand = resolveRef(l.brands)
      return {
        id: l.id,
        quantity_sent_gross: Number(l.quantity_sent_gross),
        quantity_returned_gross: Number(l.quantity_returned_gross),
        shape_design_id: l.shape_design_id,
        bindi_colour_id: l.bindi_colour_id,
        size_id: l.size_id,
        dabbi_colour_id: l.dabbi_colour_id,
        brand_id: l.brand_id,
        shape_name: shape?.name ?? shape?.code ?? null,
        bindi_code: bindi?.code ?? null,
        size_code: size?.code ?? null,
        dabbi_code: dabbi?.code ?? null,
        brand_name: brand?.name ?? brand?.code ?? null,
      }
    })
    return {
      id: job.id,
      date_assigned: job.date_assigned,
      expected_return_date: job.expected_return_date,
      status: job.status,
      labour_unit_id: lu?.id ?? '',
      labour_unit_name: lu ? `#${lu.serial_number} ${lu.name}` : '',
      lines,
    }
  })

  // Apply order filter: keep only jobs that have at least one line for this order
  const jobs = orderLineIdSet !== null
    ? allJobs.filter((job) =>
        (rawJobs.find((rj) => rj.id === job.id)?.labour_job_lines ?? []).some(
          (l) => l.order_line_id !== null && orderLineIdSet!.has(l.order_line_id as string),
        ),
      )
    : allJobs

  const totalWipGross = jobs.reduce((total, job) => {
    const jobWip = job.lines.reduce(
      (s, l) => s + Math.max(0, l.quantity_sent_gross - l.quantity_returned_gross),
      0,
    )
    return total + jobWip
  }, 0)

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

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1400px' }}>
      <PageHeader
        title="WIP — In Labour"
        subtitle="Active labour jobs with goods currently in packaging. Returned goods appear in Ready Stock."
      />

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>Error: {error.message}</p>
      )}

      <WipClient
        jobs={jobs}
        sizeMaster={sizeMaster}
        designMaster={designMaster}
        colourMaster={colourMaster}
        totalWipGross={totalWipGross}
        filteredOrderId={filteredOrderId}
      />
    </main>
  )
}
