import type {
  CreateCuttingSessionInput,
  CreateCuttingSessionResult,
  ConfirmCuttingSessionResult,
  VoidCuttingSessionResult,
  CuttingsValidationResult,
  StoredCuttingSession,
  StoredCuttingSessionLine,
  StoredCuttingsBalance,
  NewCuttingSessionRow,
  NewCuttingSessionLineRow,
  LabourJobLineForCuttingsCheck,
} from '@stock-brain/types'
import { METRES_PER_BUNDLE } from '../velvet/velvet-receipts'

// ── Store interface ───────────────────────────────────────────────────────────
//
// CuttingSessionStore is the domain's DB dependency boundary.
// The domain defines this interface; the web app implements it using Supabase.
//
// ATOMICITY LIMITATION: Supabase JS client does not support transactions.
// confirmCuttingSession performs sequential writes. Balance credits happen
// before the status update so that a mid-flight failure leaves the session
// in 'draft' (retriable) rather than 'confirmed' with missing stock credits.
// A future Phase 5 Postgres RPC will make confirmation truly atomic.

export interface CuttingSessionStore {
  insertSession(row: NewCuttingSessionRow): Promise<{ id: string } | null>
  insertLines(rows: NewCuttingSessionLineRow[]): Promise<string | undefined>
  deleteSession(id: string): Promise<void>
  getSession(id: string): Promise<StoredCuttingSession | null>
  getSessionLines(sessionId: string): Promise<StoredCuttingSessionLine[]>
  getBalance(designId: string, colourId: string, sizeId: string): Promise<StoredCuttingsBalance | null>
  incrementBalance(designId: string, colourId: string, sizeId: string, addQty: number): Promise<string | undefined>
  deductBalance(designId: string, colourId: string, sizeId: string, subtractQty: number): Promise<string | undefined>
  confirmSession(id: string, confirmedBy: string, confirmedAt: string): Promise<string | undefined>
  voidSession(id: string, notesWithReason: string | null): Promise<string | undefined>
  getVelvetBalance(colourId: string): Promise<{ bundles_on_hand: number } | null>
  decrementVelvetBalance(qty: number, now: string, colourId: string): Promise<string | undefined>
}

// ── Domain functions ──────────────────────────────────────────────────────────

export async function createCuttingSession(
  input: CreateCuttingSessionInput,
  store: CuttingSessionStore,
): Promise<CreateCuttingSessionResult> {
  if (!input.lines || input.lines.length === 0) {
    return { ok: false, error: 'At least one line is required' }
  }

  if (!input.skip_velvet_deduction) {
    if (!Number.isFinite(input.velvet_bundles_consumed) || input.velvet_bundles_consumed <= 0) {
      return { ok: false, error: 'Velvet bundles consumed must be greater than zero. Enable "Skip velvet deduction" or enter the bundles used.' }
    }
  }

  for (let i = 0; i < input.lines.length; i++) {
    const l = input.lines[i]
    const n = i + 1
    if (!l.shape_design_id) return { ok: false, error: `Line ${n}: shape is required` }
    if (!l.bindi_colour_id) return { ok: false, error: `Line ${n}: bindi colour is required` }
    if (!l.size_id) return { ok: false, error: `Line ${n}: size is required` }
    if (!Number.isFinite(l.quantity_gross) || l.quantity_gross <= 0) {
      return { ok: false, error: `Line ${n}: quantity must be greater than zero` }
    }
  }

  const session = await store.insertSession({
    session_date: input.session_date,
    machine_id: input.machine_id,
    velvet_bundles_consumed: input.skip_velvet_deduction ? null : input.velvet_bundles_consumed,
    status: 'draft',
    notes: input.notes ?? null,
    created_by: input.actor,
  })

  if (!session) {
    return { ok: false, error: 'Failed to create cutting session' }
  }

  const lineRows: NewCuttingSessionLineRow[] = input.lines.map((l) => ({
    cutting_session_id: session.id,
    shape_design_id: l.shape_design_id,
    bindi_colour_id: l.bindi_colour_id,
    size_id: l.size_id,
    quantity_gross: l.quantity_gross,
  }))

  const linesErr = await store.insertLines(lineRows)
  if (linesErr) {
    await store.deleteSession(session.id)
    return { ok: false, error: linesErr }
  }

  return { ok: true, session_id: session.id }
}

export async function confirmCuttingSession(
  sessionId: string,
  actor: string,
  store: CuttingSessionStore,
): Promise<ConfirmCuttingSessionResult> {
  const session = await store.getSession(sessionId)
  if (!session) {
    return { ok: false, error: 'Session not found' }
  }
  if (session.status !== 'draft') {
    return { ok: false, error: `Cannot confirm a session with status '${session.status}'` }
  }

  const lines = await store.getSessionLines(sessionId)
  if (lines.length === 0) {
    return { ok: false, error: 'Session has no lines — cannot confirm' }
  }

  const sessionColourId = lines[0].bindi_colour_id

  // velvet_bundles_consumed === 0 means velvet deduction was skipped at session creation.
  const velvetTracked = Number(session.velvet_bundles_consumed) > 0
  const now = new Date().toISOString()

  if (velvetTracked) {
    // Check velvet balance before crediting cuttings stock.
    // Debit happens first so a failure leaves the session in 'draft' (retriable).
    const velvetBalance = await store.getVelvetBalance(sessionColourId)
    const available = velvetBalance ? velvetBalance.bundles_on_hand : 0
    const required = Number(session.velvet_bundles_consumed)
    if (available < required) {
      const availM = (available * METRES_PER_BUNDLE).toFixed(1)
      const reqM = (required * METRES_PER_BUNDLE).toFixed(1)
      return {
        ok: false,
        error: `Insufficient velvet stock. Available: ${available.toFixed(3)} bundles (${availM} m). This session requires: ${required.toFixed(3)} bundles (${reqM} m).`,
      }
    }

    const velvetErr = await store.decrementVelvetBalance(required, now, sessionColourId)
    if (velvetErr) {
      return { ok: false, error: `Failed to debit velvet balance: ${velvetErr}` }
    }
  }

  // Credit cuttings_stock_balance for each line.
  // Balance credits happen before status update: if a credit fails, the session
  // stays in 'draft' and can be retried rather than being stuck as 'confirmed'
  // with incomplete stock.
  for (const line of lines) {
    const err = await store.incrementBalance(
      line.shape_design_id,
      line.bindi_colour_id,
      line.size_id,
      Number(line.quantity_gross),
    )
    if (err) {
      return { ok: false, error: `Failed to credit stock balance: ${err}` }
    }
  }

  const confirmErr = await store.confirmSession(sessionId, actor, now)
  if (confirmErr) {
    return { ok: false, error: confirmErr }
  }

  return { ok: true }
}

export async function voidCuttingSession(
  sessionId: string,
  reason: string,
  actor: string,
  store: CuttingSessionStore,
): Promise<VoidCuttingSessionResult> {
  const session = await store.getSession(sessionId)
  if (!session) {
    return { ok: false, error: 'Session not found' }
  }
  if (session.status === 'voided') {
    return { ok: false, error: 'Session is already voided' }
  }
  if (session.status === 'confirmed') {
    return {
      ok: false,
      error:
        'Confirmed sessions cannot be voided here. A stock correction record is required. Contact admin.',
    }
  }

  const trimmedReason = reason.trim()
  if (!trimmedReason) {
    return { ok: false, error: 'A reason is required to void a session' }
  }

  const notesWithReason = `[VOIDED by ${actor}: ${trimmedReason}]${session.notes ? ` | ${session.notes}` : ''}`

  const voidErr = await store.voidSession(sessionId, notesWithReason)
  if (voidErr) {
    return { ok: false, error: voidErr }
  }

  return { ok: true }
}

/**
 * Validates that cuttings_stock_balance has sufficient available_qty
 * for the given labour job lines, then deducts gross_qty for each matched key.
 *
 * Lines are first aggregated by (shape_design_id, bindi_colour_id, size_id)
 * because the cuttings balance is a 3-part key — multiple job lines for
 * the same cuttings SKU draw from the same pool.
 */
export async function validateAndDeductCuttingsForLabourJob(
  lines: LabourJobLineForCuttingsCheck[],
  store: CuttingSessionStore,
): Promise<CuttingsValidationResult> {
  // Aggregate total needed per 3-part cuttings key
  const needed = new Map<string, { designId: string; colourId: string; sizeId: string; qty: number; label: string }>()
  for (const l of lines) {
    const key = `${l.shape_design_id}|${l.bindi_colour_id}|${l.size_id}`
    const existing = needed.get(key)
    const label = l.design_name && l.size_code
      ? `${l.design_name} size ${l.size_code}`
      : `design ${l.shape_design_id} size ${l.size_id}`
    if (existing) {
      existing.qty += l.quantity_sent_gross
    } else {
      needed.set(key, { designId: l.shape_design_id, colourId: l.bindi_colour_id, sizeId: l.size_id, qty: l.quantity_sent_gross, label })
    }
  }

  // Validate all keys first before any deductions
  for (const [, entry] of needed) {
    const balance = await store.getBalance(entry.designId, entry.colourId, entry.sizeId)
    const available = balance ? Number(balance.available_qty) : 0
    if (available < entry.qty) {
      return {
        ok: false,
        error: `Insufficient cuttings stock for ${entry.label}. Available: ${available}, Requested: ${entry.qty}. Run a cutting session first.`,
      }
    }
  }

  // All checks passed — deduct gross_qty for each key
  for (const [, entry] of needed) {
    const err = await store.deductBalance(entry.designId, entry.colourId, entry.sizeId, entry.qty)
    if (err) {
      return { ok: false, error: `Failed to deduct cuttings stock: ${err}` }
    }
  }

  return { ok: true }
}
