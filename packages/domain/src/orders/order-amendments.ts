export type AmendOrderHeaderInput = {
  order_id: string
  new_customer_id?: string
  new_order_date?: string
  new_reference?: string | null
  new_notes?: string | null
  reason: string
  amended_by: string
}

export type StoredOrder = {
  id: string
  customer_id: string
  order_date: string
  reference: string | null
  notes: string | null
}

export type OrderAmendmentRecord = {
  order_id: string
  field_amended: string
  old_value: string
  new_value: string
  reason: string
  amended_by: string
}

export type OrderHeaderAmendmentStore = {
  getOrder: (id: string) => Promise<StoredOrder | null>
  insertAmendments: (rows: OrderAmendmentRecord[]) => Promise<string | undefined>
  updateOrder: (id: string, fields: Partial<Pick<StoredOrder, 'customer_id' | 'order_date' | 'reference' | 'notes'>>) => Promise<string | undefined>
}

export type AmendOrderHeaderResult =
  | { ok: true; amendments: Array<{ field: string; old_value: string; new_value: string }> }
  | { ok: false; error: string }

export async function amendOrderHeader(
  input: AmendOrderHeaderInput,
  store: OrderHeaderAmendmentStore,
): Promise<AmendOrderHeaderResult> {
  const reason = input.reason.trim()
  if (reason.length < 3) {
    return { ok: false, error: 'Reason must be at least 3 characters.' }
  }

  const current = await store.getOrder(input.order_id)
  if (!current) {
    return { ok: false, error: 'Order not found.' }
  }

  const amendments: OrderAmendmentRecord[] = []
  const updates: Partial<Pick<StoredOrder, 'customer_id' | 'order_date' | 'reference' | 'notes'>> = {}

  if (input.new_customer_id !== undefined && input.new_customer_id !== current.customer_id) {
    amendments.push({
      order_id: input.order_id,
      field_amended: 'customer_id',
      old_value: current.customer_id,
      new_value: input.new_customer_id,
      reason,
      amended_by: input.amended_by,
    })
    updates.customer_id = input.new_customer_id
  }

  if (input.new_order_date !== undefined && input.new_order_date !== current.order_date) {
    amendments.push({
      order_id: input.order_id,
      field_amended: 'order_date',
      old_value: current.order_date,
      new_value: input.new_order_date,
      reason,
      amended_by: input.amended_by,
    })
    updates.order_date = input.new_order_date
  }

  const newRef = input.new_reference ?? null
  const oldRef = current.reference ?? ''
  const newRefStr = newRef ?? ''
  if (input.new_reference !== undefined && newRefStr !== oldRef) {
    amendments.push({
      order_id: input.order_id,
      field_amended: 'reference',
      old_value: oldRef,
      new_value: newRefStr,
      reason,
      amended_by: input.amended_by,
    })
    updates.reference = newRef
  }

  const newNotes = input.new_notes ?? null
  const oldNotes = current.notes ?? ''
  const newNotesStr = newNotes ?? ''
  if (input.new_notes !== undefined && newNotesStr !== oldNotes) {
    amendments.push({
      order_id: input.order_id,
      field_amended: 'notes',
      old_value: oldNotes,
      new_value: newNotesStr,
      reason,
      amended_by: input.amended_by,
    })
    updates.notes = newNotes
  }

  if (amendments.length === 0) {
    return { ok: false, error: 'No fields changed — nothing to amend.' }
  }

  const insertErr = await store.insertAmendments(amendments)
  if (insertErr) {
    return { ok: false, error: `Failed to write amendment records: ${insertErr}` }
  }

  const updateErr = await store.updateOrder(input.order_id, updates)
  if (updateErr) {
    return { ok: false, error: `Amendment records written but order update failed: ${updateErr}. Investigate before retrying.` }
  }

  return {
    ok: true,
    amendments: amendments.map((a) => ({ field: a.field_amended, old_value: a.old_value, new_value: a.new_value })),
  }
}
