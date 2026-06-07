'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getActorId } from '@/lib/get-actor'
import type { ActionState } from '@/lib/masters'

type LineInput = {
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  ordered_qty: number
  promised_date?: string | null
  notes?: string | null
}

export type QuickCustomerState =
  | {
      error: string
    }
  | {
      customer: {
        id: string
        label: string
        defaultDabbiColourId: string | null
      }
    }

type CustomerDuplicateRow = {
  id: string
  name: string
  entity_name: string | null
  address: string | null
  phone_number: string | null
}

function digitCount(value: string | null): number {
  return value?.replace(/\D/g, '').length ?? 0
}

function normalizeCustomerText(value: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

async function findDuplicateCustomer({
  supabase,
  name,
  entityName,
  address,
  phoneNumber,
}: {
  supabase: ReturnType<typeof createServerSupabaseClient>
  name: string
  entityName: string | null
  address: string | null
  phoneNumber: string | null
}): Promise<CustomerDuplicateRow | null> {
  const { data } = await supabase
    .from('customers')
    .select('id, name, entity_name, address, phone_number')
    .limit(1000)

  const normalizedName = normalizeCustomerText(name)
  const normalizedEntity = normalizeCustomerText(entityName)
  const normalizedAddress = normalizeCustomerText(address)
  const normalizedPhone = phoneNumber?.replace(/\D/g, '') ?? ''

  return ((data ?? []) as unknown as CustomerDuplicateRow[]).find((customer) => {
    const samePhone = normalizedPhone.length >= 10 && customer.phone_number?.replace(/\D/g, '') === normalizedPhone
    const sameIdentity = normalizeCustomerText(customer.name) === normalizedName
      && normalizeCustomerText(customer.entity_name) === normalizedEntity
      && normalizeCustomerText(customer.address) === normalizedAddress

    return samePhone || sameIdentity
  }) ?? null
}

export async function quickAddCustomer(formData: FormData): Promise<QuickCustomerState> {
  const name = (formData.get('name') as string ?? '').trim()
  const entityName = (formData.get('entity_name') as string ?? '').trim() || null
  const address = (formData.get('address') as string ?? '').trim() || null
  const phoneNumber = (formData.get('phone_number') as string ?? '').trim() || null
  const transportName = (formData.get('transport_name') as string ?? '').trim() || null
  const defaultDabbiColourId = (formData.get('default_dabbi_colour_id') as string ?? '').trim() || null

  if (!name) return { error: 'Customer name is required' }
  if (phoneNumber && digitCount(phoneNumber) < 10) return { error: 'Phone number must have at least 10 digits' }

  const supabase = createServerSupabaseClient()
  const duplicate = await findDuplicateCustomer({ supabase, name, entityName, address, phoneNumber })
  if (duplicate) return { error: `Customer already exists: ${duplicate.name}` }

  const { data, error } = await supabase
    .from('customers')
    .insert({
      name,
      entity_name: entityName,
      address,
      phone_number: phoneNumber,
      transport_name: transportName,
      default_dabbi_colour_id: defaultDabbiColourId,
      brand_rule: 'no_preference',
      priority_weight: 5,
      payment_risk_flag: false,
      is_active: true,
    })
    .select('id, name, default_dabbi_colour_id')
    .single()

  if (error || !data) return { error: error?.message ?? 'Failed to add customer' }

  revalidatePath('/masters/customers')
  revalidatePath('/orders/new')

  return {
    customer: {
      id: data.id as string,
      label: data.name as string,
      defaultDabbiColourId: (data.default_dabbi_colour_id as string | null) ?? null,
    },
  }
}

export async function createOrder(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const customerId = (formData.get('customer_id') as string ?? '').trim()
  const orderDate = (formData.get('order_date') as string ?? '').trim()
  const reference = (formData.get('reference') as string ?? '').trim() || null
  const orderNotes = (formData.get('notes') as string ?? '').trim() || null
  const promisedDate = (formData.get('promised_date') as string ?? '').trim() || null
  const linesRaw = (formData.get('lines') as string ?? '').trim()

  if (!customerId) return { error: 'Customer is required' }
  if (!orderDate) return { error: 'Order date is required' }
  if (!linesRaw) return { error: 'At least one order line is required' }

  let lines: LineInput[]
  try {
    lines = JSON.parse(linesRaw) as LineInput[]
  } catch {
    return { error: 'Order lines data is malformed — please try again' }
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    return { error: 'At least one order line is required' }
  }

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const n = i + 1
    if (!l.shape_design_id) return { error: `Line ${n}: shape is required` }
    if (!l.bindi_colour_id) return { error: `Line ${n}: bindi colour is required` }
    if (!l.size_id) return { error: `Line ${n}: size is required` }
    if (!l.dabbi_colour_id) return { error: `Line ${n}: dabbi colour is required` }
    if (!Number.isFinite(l.ordered_qty) || l.ordered_qty <= 0) {
      return { error: `Line ${n}: quantity must be greater than zero` }
    }
  }

  const supabase = createServerSupabaseClient()

  const createdBy = await getActorId()

  // Snapshot the customer's current brand_rule onto every order line.
  // This preserves historical correctness if the rule changes later.
  const { data: customer, error: customerErr } = await supabase
    .from('customers')
    .select('brand_rule')
    .eq('id', customerId)
    .single()

  if (customerErr || !customer) {
    return { error: 'Customer not found — please refresh and try again' }
  }

  // Insert the order header.
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      customer_id: customerId,
      order_date: orderDate,
      reference,
      notes: orderNotes,
      status: 'open',
      created_by: createdBy,
    })
    .select('id')
    .single()

  if (orderErr || !order) {
    return { error: orderErr?.message ?? 'Failed to create order header' }
  }

  // Bulk-insert all order lines in one Supabase call.
  const lineInserts = lines.map((l) => ({
    order_id: order.id,
    shape_design_id: l.shape_design_id,
    bindi_colour_id: l.bindi_colour_id,
    size_id: l.size_id,
    dabbi_colour_id: l.dabbi_colour_id,
    // brand_id_override intentionally absent — customer brand_rule governs at dispatch time
    customer_brand_rule_snapshot: customer.brand_rule,
    ordered_qty: l.ordered_qty,
    promised_date: promisedDate,
    status: 'open',
    notes: l.notes || null,
    created_by: createdBy,
  }))

  const { error: linesErr } = await supabase.from('order_lines').insert(lineInserts)

  if (linesErr) {
    // Best-effort rollback: remove the orphaned order header.
    await supabase.from('orders').delete().eq('id', order.id)

    // Surface duplicate-SKU violations clearly — they come from the UNIQUE constraint.
    if (linesErr.code === '23505') {
      return {
        error:
          'Duplicate SKU: an order cannot have two lines for the same shape / colour / size / dabbi combination',
      }
    }
    return { error: linesErr.message }
  }

  revalidatePath('/orders')
  redirect('/orders')
}
