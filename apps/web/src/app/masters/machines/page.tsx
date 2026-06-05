import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AddMachineForm } from './Form'
import { EditableTable } from '../EditableTable'
import { updateMachine } from '../editActions'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'

export default async function MachinesPage() {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('machines')
    .select('id, code, name, machine_number, operator_name, location, notes, is_active, created_at')
    .order('code')

  return (
    <div>
      <PageHeader title="Machines" />
      {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>Error: {error.message}</p>}
      {data && data.length > 0 && (
        <EditableTable
          rows={data as unknown as Record<string, unknown>[]}
          cols={[
            { key: 'code', label: 'Code' },
            { key: 'name', label: 'Name' },
            { key: 'machine_number', label: 'Machine #' },
            { key: 'operator_name', label: 'Operator' },
            { key: 'is_active', label: 'Active' },
            { key: 'created_at', label: 'Created', type: 'date' as const },
          ]}
          editFields={[
            { name: 'code', label: 'Code', type: 'text', valueKey: 'code' },
            { name: 'name', label: 'Name', type: 'text', valueKey: 'name' },
            { name: 'machine_number', label: 'Machine #', type: 'text', valueKey: 'machine_number' },
            { name: 'operator_name', label: 'Operator', type: 'text', valueKey: 'operator_name' },
            { name: 'location', label: 'Location', type: 'text', valueKey: 'location' },
            { name: 'notes', label: 'Notes', type: 'text', valueKey: 'notes' },
            { name: 'is_active', label: 'Active', type: 'boolean', valueKey: 'is_active' },
          ]}
          action={updateMachine}
        />
      )}
      <SectionHeader title="Add Machine" />
      <AddMachineForm />
    </div>
  )
}
