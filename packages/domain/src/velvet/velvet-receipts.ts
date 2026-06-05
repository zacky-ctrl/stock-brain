import type {
  RecordVelvetReceiptInput,
  RecordVelvetReceiptResult,
  VelvetBalanceRow,
  NewVelvetReceiptRow,
} from '@stock-brain/types'

// ── Business constant ─────────────────────────────────────────────────────────
// 1 bundle of velvet = 25 metres. Fixed physical constant, not configurable.
// All velvet storage and receipt quantities are in METRES.
export const METRES_PER_BUNDLE = 25

// ── Store interface ───────────────────────────────────────────────────────────
//
// VelvetReceiptStore is the domain's DB dependency boundary.
// The domain defines this interface; the web app implements it via Supabase.

export interface VelvetReceiptStore {
  insertReceipt(row: NewVelvetReceiptRow): Promise<string | undefined>
  getVelvetBalance(): Promise<VelvetBalanceRow | null>
  incrementVelvetBalance(qty: number, now: string, bindi_colour_id: string | null): Promise<string | undefined>
}

// ── Domain functions ──────────────────────────────────────────────────────────

export async function recordVelvetReceipt(
  input: RecordVelvetReceiptInput,
  store: VelvetReceiptStore,
): Promise<RecordVelvetReceiptResult> {
  if (!input.receipt_date) {
    return { success: false, error: 'Receipt date is required' }
  }

  const today = new Date().toISOString().split('T')[0]
  if (input.receipt_date > today) {
    return { success: false, error: 'Receipt date cannot be in the future' }
  }

  if (!Number.isFinite(input.metres_received) || input.metres_received <= 0) {
    return { success: false, error: 'Metres received must be greater than zero' }
  }

  if (!input.bindi_colour_id) {
    return { success: false, error: 'Velvet colour is required' }
  }

  if (!input.actor) {
    return { success: false, error: 'actor is required' }
  }

  const now = new Date().toISOString()

  const insertErr = await store.insertReceipt({
    receipt_date: input.receipt_date,
    metres_received: input.metres_received,
    bundles_received: input.bundles_received ?? null,
    supplier: input.supplier ?? null,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    bindi_colour_id: input.bindi_colour_id,
    created_by: input.actor,
  })
  if (insertErr) {
    return { success: false, error: insertErr }
  }

  const balanceErr = await store.incrementVelvetBalance(input.metres_received, now, input.bindi_colour_id)
  if (balanceErr) {
    return { success: false, error: balanceErr }
  }

  const balance = await store.getVelvetBalance()
  if (!balance) {
    return { success: false, error: 'Could not read updated velvet balance' }
  }

  return { success: true, new_balance_bundles: balance.bundles_on_hand }
}

export async function getVelvetStockBalance(
  store: VelvetReceiptStore,
): Promise<VelvetBalanceRow | null> {
  return store.getVelvetBalance()
}
