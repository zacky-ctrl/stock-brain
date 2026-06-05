import type {
  ReserveStockInput,
  ReserveStockResult,
  ReleaseReservationInput,
  ReleaseResult,
  ReassignReservationInput,
  ReassignResult,
  StoredAllocation,
  BalanceRowForReservation,
} from '@stock-brain/types'

// ── Store interface ───────────────────────────────────────────
//
// ReservationStore is the domain's DB dependency boundary.
// The domain defines this interface; the web app implements it
// using Supabase. This keeps business rules testable without a
// live database.
//
// ATOMICITY LIMITATION: Supabase JS client does not support
// transactions (BEGIN/COMMIT). Each operation below performs
// sequential writes. If a later step fails, a preceding step
// cannot be rolled back. Operations are ordered to minimise
// the inconsistency window:
//   - committed_qty is adjusted AFTER the allocation row change
//     on release/reassign (so the allocation record leads the trail)
//   - committed_qty is incremented BEFORE the allocation INSERT
//     on reserve (so we never show inflated availability)
// A future Phase 5 Postgres RPC will make these truly atomic.

export interface ReservationStore {
  /** Read a ready_stock_balance row by its primary key. */
  getBalance(id: string): Promise<BalanceRowForReservation | null>

  /**
   * Set committed_qty to an exact value on a ready_stock_balance row.
   * Caller must compute new value; store applies it unconditionally.
   * Returns an error string if the DB write fails, undefined on success.
   */
  setCommittedQty(balanceId: string, newCommittedQty: number): Promise<string | undefined>

  /**
   * Insert a new stock_allocations row with status = 'active'.
   * Returns the new row ID on success, error string on failure.
   */
  insertAllocation(row: {
    order_line_id: string
    ready_stock_balance_id: string
    stock_stage: 'ready'
    allocated_qty: number
    allocated_by: string
    status: 'active'
    is_active: true
  }): Promise<{ id: string } | { error: string }>

  /** Read a stock_allocations row by ID. */
  getAllocation(id: string): Promise<StoredAllocation | null>

  /**
   * Mark an allocation as released.
   * Sets status, is_active, deactivated fields, released fields.
   */
  markReleased(id: string, fields: {
    deactivated_by: string
    deactivated_at: string
    deactivation_reason: string
    released_by: string
    released_at: string
  }): Promise<string | undefined>

  /**
   * Mark an allocation as reassigned.
   * Sets status, is_active, deactivated fields, reassigned fields.
   */
  markReassigned(id: string, fields: {
    deactivated_by: string
    deactivated_at: string
    deactivation_reason: string
    reassigned_by: string
  }): Promise<string | undefined>

  /**
   * Insert a new allocation row that is the result of a reassignment.
   * Identical to insertAllocation but also carries reassigned_from_id.
   */
  insertReassignedAllocation(row: {
    order_line_id: string
    ready_stock_balance_id: string
    stock_stage: 'ready'
    allocated_qty: number
    allocated_by: string
    reassigned_from_id: string
    status: 'active'
    is_active: true
  }): Promise<{ id: string } | { error: string }>
}

// ── reserveStock ──────────────────────────────────────────────

/**
 * Hard-reserve stock from a specific ready_stock_balance row
 * for a specific order line.
 *
 * Business rules enforced:
 *   - requested qty must not exceed available_qty at read time
 *   - committed_qty is incremented to reflect the new reservation
 *   - a stock_allocations row is inserted with status = 'active'
 *
 * Operation order (minimises inconsistency window on partial failure):
 *   1. Read balance — validate available_qty
 *   2. Increment committed_qty  ← if step 3 fails, committed_qty is
 *      temporarily high (conservative; no over-dispatch can occur)
 *   3. Insert allocation row
 */
export async function reserveStock(
  input: ReserveStockInput,
  store: ReservationStore,
): Promise<ReserveStockResult> {
  const { order_line_id, ready_stock_balance_id, qty, allocated_by } = input

  if (qty <= 0) {
    return { ok: false, error: 'Reservation quantity must be greater than zero' }
  }

  // Step 1: read balance
  const balance = await store.getBalance(ready_stock_balance_id)
  if (!balance) {
    return { ok: false, error: 'Ready stock balance row not found' }
  }

  if (balance.available_qty < qty) {
    return {
      ok: false,
      error: `Insufficient available stock: ${balance.available_qty} available, ${qty} requested. Use stock correction to adjust balance before reserving.`,
    }
  }

  const newCommittedQty = balance.committed_qty + qty

  // Step 2: increment committed_qty (conservative first)
  const balanceErr = await store.setCommittedQty(ready_stock_balance_id, newCommittedQty)
  if (balanceErr) {
    return { ok: false, error: `Failed to reserve stock: ${balanceErr}` }
  }

  // Step 3: insert allocation row
  const result = await store.insertAllocation({
    order_line_id,
    ready_stock_balance_id,
    stock_stage: 'ready',
    allocated_qty: qty,
    allocated_by,
    status: 'active',
    is_active: true,
  })

  if ('error' in result) {
    // Compensate: decrement committed_qty to restore consistency
    await store.setCommittedQty(ready_stock_balance_id, balance.committed_qty)
    return { ok: false, error: `Reservation record failed: ${result.error}` }
  }

  return { ok: true, allocation_id: result.id }
}

// ── releaseReservation ────────────────────────────────────────

/**
 * Release an active reservation. Decrements committed_qty so the
 * stock becomes available to others.
 *
 * Operation order:
 *   1. Read allocation — validate it is active + ready stage
 *   2. Mark allocation as released (audit trail written first)
 *   3. Decrement committed_qty on the balance row
 */
export async function releaseReservation(
  input: ReleaseReservationInput,
  store: ReservationStore,
): Promise<ReleaseResult> {
  const { allocation_id, reason, released_by } = input

  if (!reason.trim()) {
    return { ok: false, error: 'Reason is required when releasing a reservation' }
  }

  // Step 1: read allocation
  const allocation = await store.getAllocation(allocation_id)
  if (!allocation) {
    return { ok: false, error: 'Reservation not found' }
  }
  if (!allocation.is_active || allocation.status !== 'active') {
    return { ok: false, error: `Reservation is already ${allocation.status} — cannot release` }
  }
  if (allocation.stock_stage !== 'ready' || !allocation.ready_stock_balance_id) {
    return { ok: false, error: 'Only ready-stage reservations can be released through this path' }
  }

  const now = new Date().toISOString()

  // Step 2: mark as released (audit trail first)
  const releaseErr = await store.markReleased(allocation_id, {
    deactivated_by: released_by,
    deactivated_at: now,
    deactivation_reason: reason,
    released_by,
    released_at: now,
  })

  if (releaseErr) {
    return { ok: false, error: `Failed to record release: ${releaseErr}` }
  }

  // Step 3: decrement committed_qty
  const balance = await store.getBalance(allocation.ready_stock_balance_id)
  if (balance) {
    const newCommitted = Math.max(0, balance.committed_qty - allocation.allocated_qty)
    await store.setCommittedQty(allocation.ready_stock_balance_id, newCommitted)
  }

  return {
    ok: true,
    released_qty: allocation.allocated_qty,
    balance_id: allocation.ready_stock_balance_id,
  }
}

// ── reassignReservation ───────────────────────────────────────

/**
 * Reassign an active reservation to a different order line.
 * committed_qty on the balance does not change — the same qty
 * is still committed, just to a different order line.
 *
 * Operation order:
 *   1. Read allocation — validate it is active
 *   2. Mark old allocation as reassigned
 *   3. Insert new allocation for new_order_line_id with reassigned_from_id
 *
 * committed_qty is unchanged (same stock, new owner).
 */
export async function reassignReservation(
  input: ReassignReservationInput,
  store: ReservationStore,
): Promise<ReassignResult> {
  const { allocation_id, new_order_line_id, reason, reassigned_by } = input

  if (!reason.trim()) {
    return { ok: false, error: 'Reason is required when reassigning a reservation' }
  }

  // Step 1: read allocation
  const allocation = await store.getAllocation(allocation_id)
  if (!allocation) {
    return { ok: false, error: 'Reservation not found' }
  }
  if (!allocation.is_active || allocation.status !== 'active') {
    return { ok: false, error: `Reservation is already ${allocation.status} — cannot reassign` }
  }
  if (allocation.stock_stage !== 'ready' || !allocation.ready_stock_balance_id) {
    return { ok: false, error: 'Only ready-stage reservations can be reassigned through this path' }
  }
  if (allocation.order_line_id === new_order_line_id) {
    return { ok: false, error: 'Target order line is the same as the current one' }
  }

  const now = new Date().toISOString()

  // Step 2: mark old allocation as reassigned
  const reassignErr = await store.markReassigned(allocation_id, {
    deactivated_by: reassigned_by,
    deactivated_at: now,
    deactivation_reason: reason,
    reassigned_by,
  })

  if (reassignErr) {
    return { ok: false, error: `Failed to mark as reassigned: ${reassignErr}` }
  }

  // Step 3: insert new allocation for the new order line
  const newRow = await store.insertReassignedAllocation({
    order_line_id: new_order_line_id,
    ready_stock_balance_id: allocation.ready_stock_balance_id,
    stock_stage: 'ready',
    allocated_qty: allocation.allocated_qty,
    allocated_by: reassigned_by,
    reassigned_from_id: allocation_id,
    status: 'active',
    is_active: true,
  })

  if ('error' in newRow) {
    // Compensate: the old row is now marked reassigned but the new row failed.
    // This is the atomicity gap — log it and return error. A manual fix is needed.
    return {
      ok: false,
      error: `Reassignment record failed after marking old reservation. Manual intervention required. Error: ${newRow.error}`,
    }
  }

  return { ok: true, new_allocation_id: newRow.id }
}
