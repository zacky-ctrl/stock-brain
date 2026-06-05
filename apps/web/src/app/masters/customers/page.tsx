import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AddCustomerForm } from './Form'
import { CustomerCards } from './CustomerCards'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import type { CustomerRow, DabbiOption } from './CustomerCards'

export default async function CustomersPage() {
  const supabase = createServerSupabaseClient()
  const [customersResult, dabbiResult] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, entity_name, address, phone_number, transport_name, default_dabbi_colour_id, yellow_rate_per_gross, white_rate_per_gross, brand_rule, payment_risk_flag, notes, is_active, created_at')
      .order('name'),
    supabase
      .from('dabbi_colours')
      .select('id, code, name')
      .eq('is_active', true)
      .order('code'),
  ])

  const customers = (customersResult.data ?? []) as unknown as CustomerRow[]
  const dabbiColours: DabbiOption[] = (dabbiResult.data ?? []).map((dabbi) => ({
    id: dabbi.id as string,
    label: `${dabbi.code} — ${dabbi.name}`,
  }))

  return (
    <div>
      <PageHeader title="Customers" />
      {customersResult.error && (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>Error: {customersResult.error.message}</p>
      )}
      {dabbiResult.error && (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>Dabbi error: {dabbiResult.error.message}</p>
      )}
      {customers.length > 0 && (
        <CustomerCards customers={customers} dabbiColours={dabbiColours} />
      )}
      <SectionHeader title="Add Customer" />
      <AddCustomerForm dabbiColours={dabbiColours} />
    </div>
  )
}
