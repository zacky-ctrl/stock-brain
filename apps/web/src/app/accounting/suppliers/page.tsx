import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AccountingTabs } from '../AccountingTabs'
import { SupplierCreateForm, SupplierList } from './SupplierForms'

type SupplierRow = {
  id: string
  name: string
  entity_name: string | null
  address: string | null
  phone_number: string | null
  payment_terms_days: number
  notes: string | null
  is_active: boolean
}

export default async function SuppliersPage() {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, name, entity_name, address, phone_number, payment_terms_days, notes, is_active')
    .order('name')

  const suppliers = (data ?? []) as unknown as SupplierRow[]

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1280px' }}>
      <PageHeader
        title="Suppliers"
        subtitle="Master data for purchase bills and supplier payments."
      />
      <AccountingTabs active="suppliers" />

      {error && (
        <p style={{ color: 'var(--danger)', fontWeight: 800 }}>{error.message}</p>
      )}

      <Card style={{ marginBottom: '1rem' }}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: 'var(--text-lg)' }}>Add Supplier</h2>
        <SupplierCreateForm />
      </Card>

      <Card>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: 'var(--text-lg)' }}>Supplier List</h2>
        <SupplierList suppliers={suppliers} />
      </Card>
    </main>
  )
}
