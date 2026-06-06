'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getActorId } from '@/lib/get-actor'
import { createDispatch, releaseReservation } from '@stock-brain/domain'
import { createSupabaseDispatchStore } from '@/lib/dispatch-store'
import { createSupabaseReservationStore } from '@/lib/reservation-store'
import type { ActionState } from '@/lib/masters'

type FormDispatchLine = {
  order_id?: string | null
  order_line_id?: string | null
  original_order_line_id?: string | null
  ready_stock_balance_id: string
  quantity_dispatched: number
  line_type?: 'ordered' | 'substitute' | 'extra' | 'short'
  override_reason?: string
}

export type DispatchActionState =
  | ActionState
  | {
      success: string
      dispatch_id: string
      order_id: string | null
      remaining_reserved_qty: number
    }

type OrderLineQtyRow = {
  id: string
  ordered_qty: string | number
  closed_qty: string | number
}

type DispatchQtyRow = {
  order_line_id: string | null
  quantity_dispatched: string | number
}

type ActiveAllocationRow = {
  id: string
  allocated_qty: string | number
  order_line:
    | { order_id: string | null }
    | Array<{ order_id: string | null }>
    | null
}

function withNextParcelNote(notes: string | null, nextParcelDate: string | null): string | null {
  if (!nextParcelDate) return notes
  return [notes, `Next parcel expected: ${nextParcelDate}`].filter(Boolean).join(' | ')
}

function resolveOrderLine(raw: ActiveAllocationRow['order_line']): { order_id: string | null } | null {
  if (!raw) return null
  return Array.isArray(raw) ? raw[0] ?? null : raw
}

async function getOpenQtyByLineId(lineIds: string[]): Promise<Map<string, number>> {
  const supabase = createServerSupabaseClient()
  const result = new Map<string, number>()
  if (lineIds.length === 0) return result

  const [{ data: lineRowsRaw }, { data: confirmedEventsRaw }] = await Promise.all([
    supabase
      .from('order_lines')
      .select('id, ordered_qty, closed_qty')
      .in('id', lineIds),
    supabase
      .from('dispatch_events')
      .select('id')
      .eq('status', 'confirmed'),
  ])

  const lineRows = (lineRowsRaw ?? []) as unknown as OrderLineQtyRow[]
  const confirmedIds = (confirmedEventsRaw ?? []).map((event) => event.id as string)
  const dispatchedByLineId = new Map<string, number>()

  if (confirmedIds.length > 0) {
    const { data: dispatchRowsRaw } = await supabase
      .from('dispatch_lines')
      .select('order_line_id, quantity_dispatched')
      .in('order_line_id', lineIds)
      .in('dispatch_event_id', confirmedIds)

    const dispatchRows = (dispatchRowsRaw ?? []) as unknown as DispatchQtyRow[]
    for (const row of dispatchRows) {
      if (!row.order_line_id) continue
      dispatchedByLineId.set(
        row.order_line_id,
        (dispatchedByLineId.get(row.order_line_id) ?? 0) + Number(row.quantity_dispatched),
      )
    }
  }

  for (const row of lineRows) {
    result.set(
      row.id,
      Math.max(0, Number(row.ordered_qty) - Number(row.closed_qty) - (dispatchedByLineId.get(row.id) ?? 0)),
    )
  }

  return result
}

async function splitOverflowToExtras(lines: FormDispatchLine[]): Promise<FormDispatchLine[]> {
  const orderedLineIds = [
    ...new Set(
      lines
        .filter((line) => {
          const lineType = line.line_type ?? 'ordered'
          return (lineType === 'ordered' || lineType === 'short') && !!line.order_line_id
        })
        .map((line) => line.order_line_id as string),
    ),
  ]

  const openQtyByLineId = await getOpenQtyByLineId(orderedLineIds)

  return lines.flatMap((line) => {
    const lineType = line.line_type ?? 'ordered'
    if ((lineType !== 'ordered' && lineType !== 'short') || !line.order_line_id) {
      return [line]
    }

    const openQty = openQtyByLineId.get(line.order_line_id) ?? 0
    if (line.quantity_dispatched <= openQty) {
      return [line]
    }

    const orderedQty = Math.max(0, openQty)
    const extraQty = line.quantity_dispatched - orderedQty
    const splitLines: FormDispatchLine[] = []

    if (orderedQty > 0) {
      splitLines.push({
        ...line,
        quantity_dispatched: orderedQty,
        line_type: lineType,
      })
    }

    splitLines.push({
      order_id: null,
      order_line_id: null,
      original_order_line_id: null,
      ready_stock_balance_id: line.ready_stock_balance_id,
      quantity_dispatched: extraQty,
      line_type: 'extra',
      override_reason: line.override_reason,
    })

    return splitLines
  })
}

async function getRemainingReservedQty(orderId: string | null): Promise<number> {
  if (!orderId) return 0
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('stock_allocations')
    .select('id, allocated_qty, order_line:order_line_id!inner(order_id)')
    .eq('is_active', true)
    .eq('stock_stage', 'ready')
    .eq('order_line.order_id', orderId)

  const rows = (data ?? []) as unknown as ActiveAllocationRow[]
  return rows.reduce((sum, row) => {
    const orderLine = resolveOrderLine(row.order_line)
    return orderLine?.order_id === orderId ? sum + Number(row.allocated_qty) : sum
  }, 0)
}

export async function createDispatchAction(
  _prevState: DispatchActionState,
  formData: FormData,
): Promise<DispatchActionState> {
  const dispatchDate = (formData.get('dispatch_date') as string ?? '').trim()
  const reference = (formData.get('reference') as string ?? '').trim() || null
  const notes = (formData.get('notes') as string ?? '').trim() || null
  const nextParcelDate = (formData.get('next_parcel_date') as string ?? '').trim() || null
  const linesRaw = (formData.get('dispatch_lines') as string ?? '').trim()

  if (!dispatchDate) return { error: 'Dispatch date is required' }
  if (!linesRaw) return { error: 'Dispatch lines are missing' }

  let allLines: FormDispatchLine[]
  try {
    allLines = JSON.parse(linesRaw) as FormDispatchLine[]
  } catch {
    return { error: 'Dispatch lines data is malformed' }
  }

  const activeLines = (await splitOverflowToExtras(allLines)).filter((l) => l.quantity_dispatched > 0)
  if (activeLines.length === 0) {
    return { error: 'Enter a dispatch quantity for at least one line' }
  }

  const customerId = (formData.get('customer_id') as string ?? '').trim()

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()
  const store = createSupabaseDispatchStore(supabase)
  const dispatchNotes = withNextParcelNote(notes, nextParcelDate)

  const orderedLines = activeLines.filter((l) => !l.line_type || l.line_type === 'ordered' || l.line_type === 'short' || l.line_type === 'substitute')
  const extraLines = activeLines.filter((l) => l.line_type === 'extra')

  // Group ordered/substitute lines by order_id
  const linesByOrder = new Map<string, FormDispatchLine[]>()
  for (const l of orderedLines) {
    if (!l.order_id) return { error: 'Missing order_id on ordered dispatch line' }
    const group = linesByOrder.get(l.order_id) ?? []
    group.push(l)
    linesByOrder.set(l.order_id, group)
  }

  // Call createDispatch once per order; attach extra lines to first call
  let extrasAttached = false
  let firstDispatchId: string | null = null
  let firstOrderId: string | null = null
  for (const [order_id, lines] of linesByOrder) {
    const linesForCall = lines.map((l) => ({
      order_line_id: l.order_line_id ?? null,
      original_order_line_id: l.original_order_line_id ?? null,
      ready_stock_balance_id: l.ready_stock_balance_id,
      dispatched_qty: l.quantity_dispatched,
      line_type: (l.line_type ?? 'ordered') as 'ordered' | 'substitute' | 'extra' | 'short',
      override_reason: l.override_reason || undefined,
    }))

    if (!extrasAttached && extraLines.length > 0) {
      for (const el of extraLines) {
        linesForCall.push({
          order_line_id: null,
          original_order_line_id: null,
          ready_stock_balance_id: el.ready_stock_balance_id,
          dispatched_qty: el.quantity_dispatched,
          line_type: 'extra',
          override_reason: el.override_reason || undefined,
        })
      }
      extrasAttached = true
    }

    try {
      const result = await createDispatch(
        { order_id, dispatch_date: dispatchDate, reference, notes: dispatchNotes, actor, lines: linesForCall },
        store,
      )
      if (!result.success) return { error: result.error }
      firstDispatchId ??= result.dispatch_id
      firstOrderId ??= order_id
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Dispatch failed unexpectedly' }
    }
  }

  // Extra-only dispatch (no ordered lines)
  if (!extrasAttached && extraLines.length > 0) {
    if (!customerId) return { error: 'customer_id is required for extra-only dispatch' }
    try {
      const result = await createDispatch(
        {
          order_id: '',
          customer_id: customerId,
          dispatch_date: dispatchDate,
          reference,
          notes: dispatchNotes,
          actor,
          lines: extraLines.map((el) => ({
            order_line_id: null,
            original_order_line_id: null,
            ready_stock_balance_id: el.ready_stock_balance_id,
            dispatched_qty: el.quantity_dispatched,
            line_type: 'extra' as const,
            override_reason: el.override_reason || undefined,
          })),
        },
        store,
      )
      if (!result.success) return { error: result.error }
      firstDispatchId ??= result.dispatch_id
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Extra dispatch failed unexpectedly' }
    }
  }

  revalidatePath('/dispatch')
  revalidatePath('/orders')
  if (firstOrderId) {
    revalidatePath(`/orders/${firstOrderId}`)
  }
  revalidatePath('/planning/allocation')
  revalidatePath('/planning/ready')

  if (!firstDispatchId) {
    return { error: 'Dispatch was not created' }
  }

  return {
    success: 'Dispatch confirmed',
    dispatch_id: firstDispatchId,
    order_id: firstOrderId,
    remaining_reserved_qty: await getRemainingReservedQty(firstOrderId),
  }
}

export async function releaseRemainingReservationsAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderId = (formData.get('order_id') as string ?? '').trim()
  if (!orderId) return { error: 'Order ID is missing' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()
  const store = createSupabaseReservationStore(supabase)

  const { data, error } = await supabase
    .from('stock_allocations')
    .select('id, allocated_qty, order_line:order_line_id!inner(order_id)')
    .eq('is_active', true)
    .eq('stock_stage', 'ready')
    .eq('order_line.order_id', orderId)

  if (error) return { error: error.message }

  const rows = ((data ?? []) as unknown as ActiveAllocationRow[])
    .filter((row) => resolveOrderLine(row.order_line)?.order_id === orderId)

  if (rows.length === 0) {
    return { success: 'No remaining reservations to release' }
  }

  for (const row of rows) {
    const result = await releaseReservation(
      {
        allocation_id: row.id,
        reason: 'Released after partial dispatch',
        released_by: actor,
      },
      store,
    )
    if (!result.ok) return { error: result.error }
  }

  revalidatePath('/dispatch')
  revalidatePath('/orders')
  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/planning/allocation')
  revalidatePath('/planning/ready')
  revalidatePath('/admin/reservations')

  return {
    success: `Released ${rows.length} reservation${rows.length === 1 ? '' : 's'}`,
  }
}
