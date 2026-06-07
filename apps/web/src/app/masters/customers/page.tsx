import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AddCustomerForm } from './Form'
import { CustomerCards } from './CustomerCards'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Button } from '@/components/ui/Button'
import type { CustomerRow, DabbiOption } from './CustomerCards'

const CUSTOMER_SELECT =
  'id, name, entity_name, address, phone_number, transport_name, default_dabbi_colour_id, yellow_rate_per_gross, white_rate_per_gross, brand_rule, payment_risk_flag, notes, is_active, created_at'

const CUSTOMER_SELECT_LEGACY =
  'id, name, entity_name, address, phone_number, transport_name, yellow_rate_per_gross, white_rate_per_gross, brand_rule, payment_risk_flag, notes, is_active, created_at'

type CustomerQueryRow = Omit<CustomerRow, 'default_dabbi_colour_id'> & {
  default_dabbi_colour_id?: string | null
}

function isMissingDefaultDabbiColumn(message: string): boolean {
  return message.includes('default_dabbi_colour_id')
}

export default async function CustomersPage() {
  const supabase = createServerSupabaseClient()
  const [customersResultInitial, dabbiResult] = await Promise.all([
    supabase
      .from('customers')
      .select(CUSTOMER_SELECT)
      .order('name'),
    supabase
      .from('dabbi_colours')
      .select('id, code, name')
      .eq('is_active', true)
      .order('code'),
  ])

  const customersResult = customersResultInitial.error && isMissingDefaultDabbiColumn(customersResultInitial.error.message)
    ? await supabase.from('customers').select(CUSTOMER_SELECT_LEGACY).order('name')
    : customersResultInitial

  const customers = ((customersResult.data ?? []) as unknown as CustomerQueryRow[]).map((customer) => ({
    ...customer,
    default_dabbi_colour_id: customer.default_dabbi_colour_id ?? null,
  }))
  const dabbiColours: DabbiOption[] = (dabbiResult.data ?? []).map((dabbi) => ({
    id: dabbi.id as string,
    label: `${dabbi.code} — ${dabbi.name}`,
  }))

  return (
    <div>
      <PageHeader
        title="Customers"
        actions={
          <a href="#add-customer">
            <Button variant="primary">+ Add Customer</Button>
          </a>
        }
      />
      {customersResult.error && (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>Error: {customersResult.error.message}</p>
      )}
      {dabbiResult.error && (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>Dabbi error: {dabbiResult.error.message}</p>
      )}
      {customers.length > 0 && (
        <CustomerCards customers={customers} dabbiColours={dabbiColours} />
      )}
      <div id="add-customer">
        <SectionHeader title="Add Customer" />
        <AddCustomerForm dabbiColours={dabbiColours} />
      </div>
    </div>
  )
}
