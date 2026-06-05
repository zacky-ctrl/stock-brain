import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CreateCuttingSessionForm } from './Form'
import { PageHeader } from '@/components/ui/PageHeader'

export default async function NewCuttingSessionPage() {
  const supabase = createServerSupabaseClient()

  const [
    { data: machines },
    { data: shapes },
    { data: bindiColours },
    { data: sizes },
    { count: ratesCount },
  ] = await Promise.all([
    supabase.from('machines').select('id, code, name').eq('is_active', true).order('code'),
    supabase.from('shape_designs').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('bindi_colours').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('sizes').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('velvet_conversion_rates').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ])

  const machineOptions = (machines ?? []).map((m) => ({
    id: m.id as string,
    label: `${(m as { code: string }).code} — ${(m as { name: string }).name}`,
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
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1100px' }}>
      <PageHeader
        title="New Cutting Session"
        backHref="/operations/cutting-sessions"
      />
      <CreateCuttingSessionForm
        machines={machineOptions}
        sizeMaster={sizeMaster}
        designMaster={designMaster}
        colourMaster={colourMaster}
        velvetRatesExist={(ratesCount ?? 0) > 0}
      />
    </main>
  )
}
