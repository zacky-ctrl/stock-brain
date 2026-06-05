import { createServerSupabaseClient } from '@/lib/supabase/server'
import { VelvetReceiptForm } from './Form'
import { PageHeader } from '@/components/ui/PageHeader'

export default async function NewVelvetReceiptPage() {
  const supabase = createServerSupabaseClient()
  const { data: coloursRaw } = await supabase
    .from('bindi_colours')
    .select('id, code, name')
    .order('code')

  const bindiColours = (coloursRaw ?? []).map((c) => ({
    id: c.id as string,
    code: c.code as string,
    name: c.name as string | null,
  }))

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '760px' }}>
      <PageHeader
        title="Record Velvet Receipt"
        backHref="/operations/velvet-receipts"
      />
      <VelvetReceiptForm bindiColours={bindiColours} />
    </main>
  )
}
