import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { AmendmentStore, StoredOrderLine, InsertAmendmentRow } from '@stock-brain/domain'

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>

/**
 * Creates a Supabase-backed implementation of AmendmentStore.
 * All reads/writes use the service role client (bypasses RLS).
 */
export function createSupabaseAmendmentStore(supabase: SupabaseClient): AmendmentStore {
  return {
    async getOrderLine(id: string): Promise<StoredOrderLine | null> {
      const { data, error } = await supabase
        .from('order_lines')
        .select('id, order_id, ordered_qty, closed_qty, status')
        .eq('id', id)
        .single()

      if (error || !data) return null
      return {
        id: data.id as string,
        order_id: data.order_id as string,
        ordered_qty: Number(data.ordered_qty),
        closed_qty: Number(data.closed_qty),
        status: data.status as string,
      }
    },

    async getDispatchedQty(orderLineId: string): Promise<number> {
      // Two-step: confirmed event IDs, then sum dispatch_lines for this line
      const { data: events } = await supabase
        .from('dispatch_events')
        .select('id')
        .eq('status', 'confirmed')

      const confirmedIds = (events ?? []).map((e) => e.id as string)
      if (confirmedIds.length === 0) return 0

      const { data: lines } = await supabase
        .from('dispatch_lines')
        .select('quantity_dispatched')
        .eq('order_line_id', orderLineId)
        .in('dispatch_event_id', confirmedIds)

      return (lines ?? []).reduce((s, l) => s + Number(l.quantity_dispatched), 0)
    },

    async insertAmendment(row: InsertAmendmentRow): Promise<string | undefined> {
      const { error } = await supabase.from('order_line_amendments').insert({
        order_line_id: row.order_line_id,
        amended_by: row.amended_by,
        field_amended: row.field_amended,
        old_value: row.old_value,
        new_value: row.new_value,
        reason: row.reason,
      })
      return error ? error.message : undefined
    },

    async updateOrderLine(
      id: string,
      patch: { ordered_qty?: number; closed_qty?: number; status: string },
    ): Promise<string | undefined> {
      const update: Record<string, unknown> = { status: patch.status }
      if (patch.ordered_qty !== undefined) update.ordered_qty = patch.ordered_qty
      if (patch.closed_qty !== undefined) update.closed_qty = patch.closed_qty

      const { error } = await supabase.from('order_lines').update(update).eq('id', id)
      return error ? error.message : undefined
    },

    async getAllOrderLinesForOrder(orderId: string): Promise<StoredOrderLine[]> {
      const { data } = await supabase
        .from('order_lines')
        .select('id, order_id, ordered_qty, closed_qty, status')
        .eq('order_id', orderId)

      return (data ?? []).map((l) => ({
        id: l.id as string,
        order_id: l.order_id as string,
        ordered_qty: Number(l.ordered_qty),
        closed_qty: Number(l.closed_qty),
        status: l.status as string,
      }))
    },

    async getDispatchedQtyBatch(lineIds: string[]): Promise<Map<string, number>> {
      const result = new Map<string, number>()
      if (lineIds.length === 0) return result

      const { data: events } = await supabase
        .from('dispatch_events')
        .select('id')
        .eq('status', 'confirmed')

      const confirmedIds = (events ?? []).map((e) => e.id as string)
      if (confirmedIds.length === 0) return result

      const { data: lines } = await supabase
        .from('dispatch_lines')
        .select('order_line_id, quantity_dispatched')
        .in('order_line_id', lineIds)
        .in('dispatch_event_id', confirmedIds)

      for (const l of lines ?? []) {
        const lineId = l.order_line_id as string
        result.set(lineId, (result.get(lineId) ?? 0) + Number(l.quantity_dispatched))
      }
      return result
    },

    async updateOrderStatus(orderId: string, status: string): Promise<void> {
      await supabase.from('orders').update({ status }).eq('id', orderId)
    },
  }
}
