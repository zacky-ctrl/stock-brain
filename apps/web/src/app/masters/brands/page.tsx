import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AddBrandForm } from './Form'
import { EditableTable } from '../EditableTable'
import { updateBrand } from '../editActions'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'

export default async function BrandsPage() {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('brands')
    .select('id, code, name, is_active, created_at')
    .order('code')

  return (
    <div>
      <PageHeader title="Brands" />
      {error && <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>Error: {error.message}</p>}
      {data && data.length > 0 && (
        <EditableTable
          rows={data as unknown as Record<string, unknown>[]}
          cols={[
            { key: 'code', label: 'Code' },
            { key: 'name', label: 'Name' },
            { key: 'is_active', label: 'Active' },
            { key: 'created_at', label: 'Created', type: 'date' as const },
          ]}
          editFields={[
            { name: 'code', label: 'Code', type: 'text', valueKey: 'code' },
            { name: 'name', label: 'Name', type: 'text', valueKey: 'name' },
            { name: 'is_active', label: 'Active', type: 'boolean', valueKey: 'is_active' },
          ]}
          action={updateBrand}
        />
      )}
      <SectionHeader title="Add Brand" />
      <AddBrandForm />
    </div>
  )
}
