import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CreateLabourJobForm } from './Form'
import { PageHeader } from '@/components/ui/PageHeader'
import type { MasterOption } from './Form'

export default async function NewLabourJobPage() {
  const supabase = createServerSupabaseClient()

  const [
    { data: labourUnits },
    { data: shapes },
    { data: bindiColours },
    { data: sizes },
    { data: dabbiColours },
    { data: brands },
  ] = await Promise.all([
    supabase.from('labour_units').select('id, serial_number, name').eq('is_active', true).order('serial_number'),
    supabase.from('shape_designs').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('bindi_colours').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('sizes').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('dabbi_colours').select('id, code').eq('is_active', true).order('code'),
    supabase.from('brands').select('id, code, name').eq('is_active', true).order('code'),
  ])

  const toOption = (rows: { id: string; code?: string; name?: string | null; serial_number?: number }[] | null): MasterOption[] =>
    (rows ?? []).map((r) => ({
      id: r.id,
      label: r.serial_number !== undefined
        ? `#${r.serial_number} ${r.name ?? ''}`
        : (r.name ?? r.code ?? r.id),
    }))

  const labourUnitOptions = (labourUnits ?? []).map((u) => ({
    id: u.id,
    label: `#${u.serial_number} ${u.name}`,
  }))

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
    <main className="labour-job-new-page" style={{ padding: '1.5rem 2rem', maxWidth: '900px' }}>
      <PageHeader
        title="Issue Labour Job"
        backHref="/operations/labour-jobs"
      />
      <CreateLabourJobForm
        labourUnits={labourUnitOptions}
        shapes={(shapes ?? []).map((s) => ({ id: s.id, label: s.name ?? s.code }))}
        bindiColours={(bindiColours ?? []).map((c) => ({ id: c.id, label: c.code }))}
        sizes={(sizes ?? []).map((s) => ({ id: s.id, label: s.code }))}
        dabbiColours={(dabbiColours ?? []).map((c) => ({ id: c.id, label: c.code }))}
        brands={(brands ?? []).map((b) => ({ id: b.id, label: b.name ?? b.code }))}
        sizeMaster={sizeMaster}
        designMaster={designMaster}
        colourMaster={colourMaster}
      />
    </main>
  )
}
