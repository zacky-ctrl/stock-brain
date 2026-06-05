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
    .select('id, name, brand_rule, priority_weight, payment_risk_flag, notes, is_active, created_at')
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
            { key: 'brand_rule', label: 'Brand Rule' },
            { key: 'priority_weight', label: 'Priority' },
            { key: 'payment_risk_flag', label: 'Risk' },
            { key: 'is_active', label: 'Active' },
            { key: 'created_at', label: 'Created', type: 'date' as const },
          ]}
          editFields={[
            { name: 'name', label: 'Name', type: 'text', valueKey: 'name' },
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
