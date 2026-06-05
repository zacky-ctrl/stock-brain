import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AddCustomerForm } from './Form'
import { EditableTable } from '../EditableTable'
import { updateCustomer } from '../editActions'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'

export default async function CustomersPage() {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, entity_name, address, phone_number, transport_name, rate_group, yellow_rate_per_gross, white_rate_per_gross, brand_rule, priority_weight, payment_risk_flag, notes, is_active, created_at')
    .order('name')

  return (
    <div>
      <PageHeader title="Customers" />
      {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>Error: {error.message}</p>}
      {data && data.length > 0 && (
        <EditableTable
          rows={data as unknown as Record<string, unknown>[]}
          cols={[
            { key: 'name', label: 'Name' },
            { key: 'entity_name', label: 'Entity' },
            { key: 'phone_number', label: 'Phone' },
            { key: 'transport_name', label: 'Transport' },
            { key: 'rate_group', label: 'Rate Group' },
            { key: 'yellow_rate_per_gross', label: 'Yellow Rate' },
            { key: 'white_rate_per_gross', label: 'White Rate' },
            { key: 'brand_rule', label: 'Brand Rule' },
            { key: 'priority_weight', label: 'Priority' },
            { key: 'payment_risk_flag', label: 'Risk' },
            { key: 'is_active', label: 'Active' },
            { key: 'created_at', label: 'Created', type: 'date' as const },
          ]}
          editFields={[
            { name: 'name', label: 'Name', type: 'text', valueKey: 'name' },
            { name: 'entity_name', label: 'Entity', type: 'text', valueKey: 'entity_name' },
            { name: 'address', label: 'Address', type: 'text', valueKey: 'address' },
            { name: 'phone_number', label: 'Phone', type: 'text', valueKey: 'phone_number' },
            { name: 'transport_name', label: 'Transport', type: 'text', valueKey: 'transport_name' },
            { name: 'rate_group', label: 'Rate Group', type: 'text', valueKey: 'rate_group' },
            { name: 'yellow_rate_per_gross', label: 'Yellow Rate', type: 'number', valueKey: 'yellow_rate_per_gross' },
            { name: 'white_rate_per_gross', label: 'White Rate', type: 'number', valueKey: 'white_rate_per_gross' },
            { name: 'priority_weight', label: 'Priority Wt', type: 'number', valueKey: 'priority_weight' },
            { name: 'notes', label: 'Notes', type: 'text', valueKey: 'notes' },
            { name: 'is_active', label: 'Active', type: 'boolean', valueKey: 'is_active' },
          ]}
          action={updateCustomer}
        />
      )}
      <SectionHeader title="Add Customer" />
      <AddCustomerForm />
    </div>
  )
}
