'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createDispatch } from '@stock-brain/domain'
import { createSupabaseDispatchStore } from '@/lib/dispatch-store'
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

export async function createDispatchAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const dispatchDate = (formData.get('dispatch_date') as string ?? '').trim()
  const reference = (formData.get('reference') as string ?? '').trim() || null
  const notes = (formData.get('notes') as string ?? '').trim() || null
  const linesRaw = (formData.get('dispatch_lines') as string ?? '').trim()

  if (!dispatchDate) return { error: 'Dispatch date is required' }
  if (!linesRaw) return { error: 'Dispatch lines are missing' }

  let allLines: FormDispatchLine[]
  try {
    allLines = JSON.parse(linesRaw) as FormDispatchLine[]
  } catch {
    return { error: 'Dispatch lines data is malformed' }
  }

  const activeLines = allLines.filter((l) => l.quantity_dispatched > 0)
  if (activeLines.length === 0) {
    return { error: 'Enter a dispatch quantity for at least one line' }
  }

  const customerId = (formData.get('customer_id') as string ?? '').trim()

  const supabase = createServerSupabaseClient()
  const actor = process.env.DEV_ACTOR_ID ?? '00000000-0000-0000-0000-000000000001'
  const store = createSupabaseDispatchStore(supabase)

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
        { order_id, dispatch_date: dispatchDate, reference, notes, actor, lines: linesForCall },
        store,
      )
      if (!result.success) return { error: result.error }
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
          notes,
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
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Extra dispatch failed unexpectedly' }
    }
  }

  revalidatePath('/dispatch')
  revalidatePath('/orders')

  redirect('/dispatch')
}
