import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CreateOrderForm } from './Form'
import type { MasterOption } from './Form'

type CustomerOptionRow = {
  id: string
  name: string
  default_dabbi_colour_id?: string | null
}

function isMissingDefaultDabbiColumn(message: string): boolean {
  return message.includes('default_dabbi_colour_id')
}

export default async function NewOrderPage() {
  const supabase = createServerSupabaseClient()

  // Fetch all master dropdowns in parallel.
  const [customersInitial, shapes, bindiColours, sizes, dabbiColours] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, default_dabbi_colour_id')
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('shape_designs')
      .select('id, name, sort_order')
      .eq('is_active', true)
      .order('sort_order')
      .order('name'),
    supabase
      .from('bindi_colours')
      .select('id, code, name, sort_order')
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('sizes')
      .select('id, code, name, sort_order')
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('dabbi_colours')
      .select('id, code, name')
      .eq('is_active', true)
      .order('code'),
  ])

  const customers = customersInitial.error && isMissingDefaultDabbiColumn(customersInitial.error.message)
    ? await supabase
        .from('customers')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
    : customersInitial

  const toOption = (row: { id: string; label: string; defaultDabbiColourId?: string | null }): MasterOption => ({
    id: row.id,
    label: row.label,
    defaultDabbiColourId: row.defaultDabbiColourId ?? null,
  })

  const customerOptions: MasterOption[] = ((customers.data ?? []) as unknown as CustomerOptionRow[]).map((c) =>
    toOption({ id: c.id, label: c.name, defaultDabbiColourId: c.default_dabbi_colour_id }),
  )
  const shapeOptions: MasterOption[] = (shapes.data ?? []).map((s) =>
    toOption({ id: s.id, label: s.name }),
  )
  const bindiColourOptions: MasterOption[] = (bindiColours.data ?? []).map((c) =>
    toOption({ id: c.id, label: `${c.code} — ${c.name}` }),
  )
  const sizeOptions: MasterOption[] = (sizes.data ?? []).map((s) =>
    toOption({ id: s.id, label: s.code }),
  )
  const dabbiColourOptions: MasterOption[] = (dabbiColours.data ?? []).map((c) =>
    toOption({ id: c.id, label: c.name }),
  )

  // Raw master rows for matrix builder
  const sizeMaster = (sizes.data ?? []).map((s) => ({
    id: s.id as string, code: s.code as string, name: s.name as string, sort_order: Number(s.sort_order ?? 0),
  }))
  const designMaster = (shapes.data ?? []).map((s) => ({
    id: s.id as string, name: s.name as string, sort_order: Number(s.sort_order ?? 0),
  }))
  const colourMaster = (bindiColours.data ?? []).map((c) => ({
    id: c.id as string, code: c.code as string, name: c.name as string, sort_order: Number(c.sort_order ?? 0),
  }))

  const hasCustomers = customerOptions.length > 0

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '960px' }}>
      <div style={{ marginBottom: '1rem' }}>
        <a href="/orders" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          ← Orders
        </a>
      </div>
      <h2 style={{ marginTop: 0, fontSize: 'var(--text-lg)' }}>New Order</h2>

      {!hasCustomers && (
        <p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)' }}>
          No active customers found. Add a customer in{' '}
          <a href="/masters/customers">Masters → Customers</a> before creating an order.
        </p>
      )}

      {hasCustomers && (
        <CreateOrderForm
          customers={customerOptions}
          shapes={shapeOptions}
          bindiColours={bindiColourOptions}
          sizes={sizeOptions}
          dabbiColours={dabbiColourOptions}
          sizeMaster={sizeMaster}
          designMaster={designMaster}
          colourMaster={colourMaster}
        />
      )}
    </main>
  )
}
