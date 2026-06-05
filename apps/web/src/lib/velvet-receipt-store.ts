import type { VelvetReceiptStore } from '@stock-brain/domain'
import { createServerSupabaseClient } from '@/lib/supabase/server'

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>

export function createSupabaseVelvetReceiptStore(supabase: SupabaseClient): VelvetReceiptStore {
  return {
    async insertReceipt(row) {
      const { error } = await supabase.from('velvet_receipts').insert({
        receipt_date: row.receipt_date,
        metres_received: row.metres_received,
        bundles_received: row.bundles_received ?? null,
        supplier: row.supplier,
        reference: row.reference,
        notes: row.notes,
        bindi_colour_id: row.bindi_colour_id,
        created_by: row.created_by,
      })
      return error?.message
    },

    async getVelvetBalance() {
      // Aggregate all rows for velvet_type='standard' (generic + colour-specific)
      // so the balance card always shows the true total on hand.
      const { data } = await supabase
        .from('velvet_stock_balance')
        .select('metres_on_hand, last_updated_at')
        .eq('velvet_type', 'standard')
      if (!data || data.length === 0) return null
      const total = data.reduce((sum, row) => sum + Number(row.metres_on_hand), 0)
      const lastUpdated = data.reduce(
        (latest, row) => ((row.last_updated_at as string) > latest ? (row.last_updated_at as string) : latest),
        data[0].last_updated_at as string,
      )
      return { bundles_on_hand: total, last_updated_at: lastUpdated }
    },

    async incrementVelvetBalance(qty, now, bindi_colour_id) {
      // Find the existing row for this (velvet_type, bindi_colour_id) combination.
      // NULL bindi_colour_id = generic pool (the original seeded 'standard' row).
      const selectQuery = bindi_colour_id !== null
        ? supabase
            .from('velvet_stock_balance')
            .select('metres_on_hand')
            .eq('velvet_type', 'standard')
            .eq('bindi_colour_id', bindi_colour_id)
        : supabase
            .from('velvet_stock_balance')
            .select('metres_on_hand')
            .eq('velvet_type', 'standard')
            .is('bindi_colour_id', null)

      const { data: current } = await selectQuery.maybeSingle()

      if (!current) {
        // First receipt for this colour — insert new balance row
        const { error } = await supabase.from('velvet_stock_balance').insert({
          velvet_type: 'standard',
          bindi_colour_id: bindi_colour_id,
          metres_on_hand: qty,
          last_updated_at: now,
        })
        return error?.message
      }

      const updateQuery = bindi_colour_id !== null
        ? supabase
            .from('velvet_stock_balance')
            .update({ metres_on_hand: Number(current.metres_on_hand) + qty, last_updated_at: now })
            .eq('velvet_type', 'standard')
            .eq('bindi_colour_id', bindi_colour_id)
        : supabase
            .from('velvet_stock_balance')
            .update({ metres_on_hand: Number(current.metres_on_hand) + qty, last_updated_at: now })
            .eq('velvet_type', 'standard')
            .is('bindi_colour_id', null)

      const { error } = await updateQuery
      return error?.message
    },
  }
}
