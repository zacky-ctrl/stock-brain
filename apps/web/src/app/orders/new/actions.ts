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
