import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AddLabourUnitForm } from './Form'
import { EditableTable } from '../EditableTable'
import { updateLabourUnit } from '../editActions'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'

export default async function LabourUnitsPage() {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('labour_units')
    .select('id, serial_number, name, notes, phone, is_active, created_at')
    .order('serial_number')

  return (
    <div>
      <PageHeader title="Labour Units" />
      {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>Error: {error.message}</p>}
      {data && data.length > 0 && (
        <EditableTable
          rows={data as unknown as Record<string, unknown>[]}
          cols={[
            { key: 'serial_number', label: 'Serial #' },
            { key: 'name', label: 'Name' },
            { key: 'phone', label: 'Phone' },
            { key: 'is_active', label: 'Active' },
            { key: 'created_at', label: 'Created', type: 'date' as const },
          ]}
          editFields={[
            { name: 'serial_number', label: 'Serial #', type: 'number', valueKey: 'serial_number' },
            { name: 'name', label: 'Name', type: 'text', valueKey: 'name' },
            { name: 'notes', label: 'Notes', type: 'text', valueKey: 'notes' },
            { name: 'is_active', label: 'Active', type: 'boolean', valueKey: 'is_active' },
          ]}
          action={updateLabourUnit}
        />
      )}
      <SectionHeader title="Add Labour Unit" />
      <AddLabourUnitForm />
    </div>
  )
}
