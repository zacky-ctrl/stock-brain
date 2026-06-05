import type { DispatchStore, DispatchLineData } from '@stock-brain/domain'
import type { FulfilmentRecordInput } from '@stock-brain/types'
import { releaseReservation } from '@stock-brain/domain'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createSupabaseReservationStore } from '@/lib/reservation-store'

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>

export function createSupabaseDispatchStore(supabase: SupabaseClient): DispatchStore {
  const reservationStore = createSupabaseReservationStore(supabase)

  return {
    // ── Single reads ──────────────────────────────────────────────

    async getOrder(order_id) {
      const { data } = await supabase
        .from('orders')
        .select('customer_id')
        .eq('id', order_id)
        .single()
      if (!data) return null
      return { customer_id: data.customer_id as string }
    },

    async getAllLinesForOrder(order_id) {
      const { data } = await supabase
        .from('order_lines')
        .select('id, ordered_qty, closed_qty')
        .eq('order_id', order_id)
      return (data ?? []).map((l) => ({
        id: l.id as string,
        ordered_qty: Number(l.ordered_qty),
        closed_qty: Number(l.closed_qty),
      }))
    },

    // ── Batch reads ───────────────────────────────────────────────

    async getOrderLines(ids) {
      const map = new Map<string, { ordered_qty: number; closed_qty: number; order_id: string }>()
      if (ids.length === 0) return map
      const { data } = await supabase
        .from('order_lines')
        .select('id, ordered_qty, closed_qty, order_id')
        .in('id', ids)
      for (const d of data ?? []) {
        map.set(d.id as string, {
          ordered_qty: Number(d.ordered_qty),
          closed_qty: Number(d.closed_qty),
          order_id: d.order_id as string,
        })
      }
      return map
    },

    async getOrderLineSkus(ids) {
      const map = new Map<string, { shape_design_id: string; bindi_colour_id: string; size_id: string; dabbi_colour_id: string }>()
      if (ids.length === 0) return map
      const { data } = await supabase
        .from('order_lines')
        .select('id, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id')
        .in('id', ids)
      for (const d of data ?? []) {
        map.set(d.id as string, {
          shape_design_id: d.shape_design_id as string,
          bindi_colour_id: d.bindi_colour_id as string,
          size_id: d.size_id as string,
          dabbi_colour_id: d.dabbi_colour_id as string,
        })
      }
      return map
    },

    async getStockBalances(ids) {
      const map = new Map<string, { gross_qty: number; available_qty: number }>()
      if (ids.length === 0) return map
      const { data } = await supabase
        .from('ready_stock_balance')
        .select('id, gross_qty, available_qty')
        .in('id', ids)
      for (const d of data ?? []) {
        map.set(d.id as string, {
          gross_qty: Number(d.gross_qty),
          available_qty: Number(d.available_qty),
        })
      }
      return map
    },

    async getStockBalanceSkus(ids) {
      const map = new Map<string, { shape_design_id: string; bindi_colour_id: string; size_id: string; dabbi_colour_id: string; brand_id: string }>()
      if (ids.length === 0) return map
      const { data } = await supabase
        .from('ready_stock_balance')
        .select('id, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id, brand_id')
        .in('id', ids)
      for (const d of data ?? []) {
        map.set(d.id as string, {
          shape_design_id: d.shape_design_id as string,
          bindi_colour_id: d.bindi_colour_id as string,
          size_id: d.size_id as string,
          dabbi_colour_id: d.dabbi_colour_id as string,
          brand_id: d.brand_id as string,
        })
      }
      return map
    },

    async getActiveAllocations(order_line_ids) {
      const map = new Map<string, { id: string; allocated_qty: number }>()
      if (order_line_ids.length === 0) return map
      const { data } = await supabase
        .from('stock_allocations')
        .select('id, order_line_id, ready_stock_balance_id, allocated_qty')
        .in('order_line_id', order_line_ids)
        .eq('is_active', true)
        .eq('stock_stage', 'ready')
      for (const a of data ?? []) {
        const key = `${a.order_line_id as string}|${a.ready_stock_balance_id as string}`
        map.set(key, { id: a.id as string, allocated_qty: Number(a.allocated_qty) })
      }
      return map
    },

    async getDispatchedQtyForLines(order_line_ids) {
      const result = new Map<string, number>()
      if (order_line_ids.length === 0) return result

      const { data: events } = await supabase
        .from('dispatch_events')
        .select('id')
        .eq('status', 'confirmed')

      const confirmedIds = (events ?? []).map((e) => e.id as string)
      if (confirmedIds.length === 0) return result

      const { data: lines } = await supabase
        .from('dispatch_lines')
        .select('order_line_id, quantity_dispatched')
        .in('order_line_id', order_line_ids)
        .in('dispatch_event_id', confirmedIds)

      for (const l of lines ?? []) {
        const id = l.order_line_id as string
        result.set(id, (result.get(id) ?? 0) + Number(l.quantity_dispatched))
      }
      return result
    },

    // ── Write operations ──────────────────────────────────────────

    async insertDispatchEvent({ customer_id, dispatch_date, reference, notes, actor, confirmed_at }) {
      const { data, error } = await supabase
        .from('dispatch_events')
        .insert({
          customer_id,
          dispatch_date,
          reference,
          notes,
          status: 'confirmed',
          dispatched_by: actor,
          confirmed_by: actor,
          confirmed_at,
        })
        .select('id')
        .single()

      if (error || !data) throw new Error(error?.message ?? 'Failed to create dispatch event')
      return data.id as string
    },

    async insertDispatchLines(lines: DispatchLineData[]) {
      if (lines.length === 0) return
      const payload = lines.map((l) => {
        const record: Record<string, unknown> = {
          dispatch_event_id: l.dispatch_event_id,
          order_line_id: l.order_line_id,
          ready_stock_balance_id: l.ready_stock_balance_id,
          quantity_dispatched: l.quantity_dispatched,
          line_type: l.line_type,
          colour_match: l.colour_match,
          qty_variance: l.qty_variance,
          ordered_sku_context: l.ordered_sku_context,
        }
        // override_reason column only present via migration 016
        if (l.override_reason) record.override_reason = l.override_reason
        return record
      })
      const { error } = await supabase.from('dispatch_lines').insert(payload)
      if (error) throw new Error(`Failed to insert dispatch lines: ${error.message}`)
    },

    async insertFulfilmentRecords(records: FulfilmentRecordInput[]) {
      if (records.length === 0) return
      const { error } = await supabase.from('fulfilment_records').insert(
        records.map((data) => ({
          dispatch_event_id: data.dispatch_event_id,
          order_id: data.order_id,
          order_line_id: data.order_line_id,
          ordered_qty: data.ordered_qty,
          actual_qty: data.actual_qty,
          line_type: data.line_type,
          colour_match: data.colour_match,
          qty_match: data.qty_match,
          ordered_sku: data.ordered_sku,
          actual_sku: data.actual_sku,
        })),
      )
      if (error) throw new Error(`Failed to insert fulfilment records: ${error.message}`)
    },

    async decrementStockBalances(deductions, now) {
      if (deductions.length === 0) return
      const ids = deductions.map((d) => d.id)
      const { data: current } = await supabase
        .from('ready_stock_balance')
        .select('id, gross_qty')
        .in('id', ids)
      const deductMap = new Map(deductions.map((d) => [d.id, d.qty]))
      // Parallel updates — different rows, no contention
      await Promise.all(
        (current ?? []).map((row) => {
          const qty = deductMap.get(row.id as string) ?? 0
          if (qty <= 0) return Promise.resolve()
          return supabase
            .from('ready_stock_balance')
            .update({
              gross_qty: Math.max(0, Number(row.gross_qty) - qty),
              last_updated_at: now,
            })
            .eq('id', row.id)
        }),
      )
    },

    async releaseAllocationById(allocation_id, actor) {
      await releaseReservation(
        { allocation_id, reason: 'Consumed by dispatch', released_by: actor },
        reservationStore,
      )
    },

    async updateOrderLineStatuses(updates) {
      if (updates.length === 0) return
      // Group by status — one UPDATE per unique status value with IN clause
      const byStatus = new Map<string, string[]>()
      for (const { id, status } of updates) {
        const group = byStatus.get(status) ?? []
        group.push(id)
        byStatus.set(status, group)
      }
      await Promise.all(
        [...byStatus.entries()].map(([status, ids]) =>
          supabase.from('order_lines').update({ status }).in('id', ids),
        ),
      )
    },

    async updateOrderStatus(id, status) {
      await supabase.from('orders').update({ status }).eq('id', id)
    },
  }
}
