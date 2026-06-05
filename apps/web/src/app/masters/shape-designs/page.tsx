import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AddShapeDesignForm } from './Form'
import { EditableTable } from '../EditableTable'
import { updateShapeDesign } from '../editActions'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'

export default async function ShapeDesignsPage() {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('shape_designs')
    .select('id, code, name, is_standard, is_active, sort_order, created_at')
    .order('sort_order')
    .order('code')

  return (
    <div>
      <PageHeader title="Shape Designs" />
      {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>Error: {error.message}</p>}

      {data && data.length > 0 && (
        <EditableTable
          rows={data as unknown as Record<string, unknown>[]}
          cols={[
            { key: 'code', label: 'Code' },
            { key: 'name', label: 'Name' },
            { key: 'is_standard', label: 'Standard' },
            { key: 'is_active', label: 'Active' },
            { key: 'sort_order', label: 'Sort' },
            { key: 'created_at', label: 'Created', type: 'date' as const },
          ]}
          editFields={[
            { name: 'code', label: 'Code', type: 'text', valueKey: 'code' },
            { name: 'name', label: 'Name', type: 'text', valueKey: 'name' },
            { name: 'sort_order', label: 'Sort', type: 'number', valueKey: 'sort_order' },
            { name: 'is_active', label: 'Active', type: 'boolean', valueKey: 'is_active' },
          ]}
          action={updateShapeDesign}
        />
      )}

      <SectionHeader title="Add Shape Design" />
      <AddShapeDesignForm />
    </div>
  )
}
