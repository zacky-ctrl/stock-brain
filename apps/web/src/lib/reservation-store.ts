import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ReservationStore } from '@stock-brain/domain'
import type { StoredAllocation, BalanceRowForReservation } from '@stock-brain/types'

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>

/**
 * Creates a Supabase-backed implementation of ReservationStore.
 * Call this in server actions; pass the result to domain functions.
 *
 * All reads/writes use the service role client, which bypasses RLS
 * and is appropriate for server-side mutations.
 */
export function createSupabaseReservationStore(supabase: SupabaseClient): ReservationStore {
  return {
    async getBalance(id: string): Promise<BalanceRowForReservation | null> {
      const { data, error } = await supabase
        .from('ready_stock_balance')
        .select('id, gross_qty, committed_qty, available_qty')
        .eq('id', id)
        .single()

      if (error || !data) return null
      return {
        id: data.id as string,
        gross_qty: Number(data.gross_qty),
        committed_qty: Number(data.committed_qty),
        available_qty: Number(data.available_qty),
      }
    },

    async setCommittedQty(balanceId: string, newCommittedQty: number): Promise<string | undefined> {
      const { error } = await supabase
        .from('ready_stock_balance')
        .update({
          committed_qty: newCommittedQty,
          last_updated_at: new Date().toISOString(),
        })
        .eq('id', balanceId)

      return error ? error.message : undefined
    },

    async insertAllocation(row): Promise<{ id: string } | { error: string }> {
      const { data, error } = await supabase
        .from('stock_allocations')
        .insert({
          order_line_id: row.order_line_id,
          ready_stock_balance_id: row.ready_stock_balance_id,
          stock_stage: row.stock_stage,
          allocated_qty: row.allocated_qty,
          allocated_by: row.allocated_by,
          status: row.status,
          is_active: row.is_active,
        })
        .select('id')
        .single()

      if (error || !data) return { error: error?.message ?? 'Insert failed' }
      return { id: data.id as string }
    },

    async getAllocation(id: string): Promise<StoredAllocation | null> {
      const { data, error } = await supabase
        .from('stock_allocations')
        .select(`
          id, order_line_id, ready_stock_balance_id, labour_job_line_id,
          cuttings_stock_balance_id, stock_stage, allocated_qty, is_active,
          status, allocated_by, allocated_at
        `)
        .eq('id', id)
        .single()

      if (error || !data) return null
      return {
        id: data.id as string,
        order_line_id: data.order_line_id as string,
        ready_stock_balance_id: data.ready_stock_balance_id as string | null,
        labour_job_line_id: data.labour_job_line_id as string | null,
        cuttings_stock_balance_id: data.cuttings_stock_balance_id as string | null,
        stock_stage: data.stock_stage as 'ready' | 'wip' | 'cuttings',
        allocated_qty: Number(data.allocated_qty),
        is_active: data.is_active as boolean,
        status: data.status as 'active' | 'released' | 'reassigned',
        allocated_by: data.allocated_by as string,
        allocated_at: data.allocated_at as string,
      }
    },

    async markReleased(id: string, fields): Promise<string | undefined> {
      const { error } = await supabase
        .from('stock_allocations')
        .update({
          is_active: false,
          status: 'released',
          deactivated_by: fields.deactivated_by,
          deactivated_at: fields.deactivated_at,
          deactivation_reason: fields.deactivation_reason,
          released_by: fields.released_by,
          released_at: fields.released_at,
        })
        .eq('id', id)

      return error ? error.message : undefined
    },

    async markReassigned(id: string, fields): Promise<string | undefined> {
      const { error } = await supabase
        .from('stock_allocations')
        .update({
          is_active: false,
          status: 'reassigned',
          deactivated_by: fields.deactivated_by,
          deactivated_at: fields.deactivated_at,
          deactivation_reason: fields.deactivation_reason,
          reassigned_by: fields.reassigned_by,
        })
        .eq('id', id)

      return error ? error.message : undefined
    },

    async insertReassignedAllocation(row): Promise<{ id: string } | { error: string }> {
      const { data, error } = await supabase
        .from('stock_allocations')
        .insert({
          order_line_id: row.order_line_id,
          ready_stock_balance_id: row.ready_stock_balance_id,
          stock_stage: row.stock_stage,
          allocated_qty: row.allocated_qty,
          allocated_by: row.allocated_by,
          reassigned_from_id: row.reassigned_from_id,
          status: row.status,
          is_active: row.is_active,
        })
        .select('id')
        .single()

      if (error || !data) return { error: error?.message ?? 'Insert failed' }
      return { id: data.id as string }
    },
  }
}
