import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getPlanningSnapshotForReadyStock } from '@stock-brain/domain'
import type { ReadyStockSnapshotFetchers } from '@stock-brain/domain'
import type {
  RawReadyStockRow,
  RawOpenOrderLineRow,
  RawConfirmedDispatchRow,
  ReadyStockPlanningRow,
} from '@stock-brain/types'

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>

// Supabase returns NUMERIC(10,3) columns as strings — coerced here,
// keeping the domain function free of DB-specific type quirks.
export async function fetchReadyStockPlanningSnapshot(
  supabase: SupabaseClient,
): Promise<ReadyStockPlanningRow[]> {
  const fetchers: ReadyStockSnapshotFetchers = {
    async fetchReadyStock(): Promise<RawReadyStockRow[]> {
      const { data, error } = await supabase
        .from('ready_stock_balance')
        .select(
          'id, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id, brand_id, gross_qty, committed_qty, available_qty',
        )
      if (error) throw new Error(`fetchReadyStock: ${error.message}`)
      return (data ?? []).map((r) => ({
        id: r.id as string,
        shape_design_id: r.shape_design_id as string,
        bindi_colour_id: r.bindi_colour_id as string,
        size_id: r.size_id as string,
        dabbi_colour_id: r.dabbi_colour_id as string,
        brand_id: r.brand_id as string,
        gross_qty: Number(r.gross_qty),
        committed_qty: Number(r.committed_qty),
        available_qty: Number(r.available_qty),
      }))
    },

    async fetchOpenOrderLines(): Promise<RawOpenOrderLineRow[]> {
      const { data, error } = await supabase
        .from('order_lines')
        .select(
          'id, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id, ordered_qty, closed_qty',
        )
        .in('status', ['open', 'partially_dispatched'])
      if (error) throw new Error(`fetchOpenOrderLines: ${error.message}`)
      return (data ?? []).map((r) => ({
        id: r.id as string,
        shape_design_id: r.shape_design_id as string,
        bindi_colour_id: r.bindi_colour_id as string,
        size_id: r.size_id as string,
        dabbi_colour_id: r.dabbi_colour_id as string,
        ordered_qty: Number(r.ordered_qty),
        closed_qty: Number(r.closed_qty),
      }))
    },

    async fetchConfirmedDispatch(orderLineIds: string[]): Promise<RawConfirmedDispatchRow[]> {
      if (orderLineIds.length === 0) return []

      // Two-step: confirmed event IDs first, then dispatch_lines.
      // Supabase JS doesn't reliably filter on embedded table columns,
      // so we can't do .eq('dispatch_events.status', 'confirmed') inline.
      const { data: events, error: eventsError } = await supabase
        .from('dispatch_events')
        .select('id')
        .eq('status', 'confirmed')
      if (eventsError) throw new Error(`fetchConfirmedDispatch (events): ${eventsError.message}`)

      const confirmedEventIds = (events ?? []).map((e) => e.id as string)
      if (confirmedEventIds.length === 0) return []

      const { data: lines, error: linesError } = await supabase
        .from('dispatch_lines')
        .select('order_line_id, quantity_dispatched')
        .in('order_line_id', orderLineIds)
        .in('dispatch_event_id', confirmedEventIds)
      if (linesError) throw new Error(`fetchConfirmedDispatch (lines): ${linesError.message}`)

      return (lines ?? []).map((r) => ({
        order_line_id: r.order_line_id as string,
        quantity_dispatched: Number(r.quantity_dispatched),
      }))
    },
  }

  return getPlanningSnapshotForReadyStock(fetchers)
}
