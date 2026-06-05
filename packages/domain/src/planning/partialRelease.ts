import type { PartialReleaseInput, PartialReleaseResult } from '@stock-brain/types'
import type { ReservationStore } from './reservations'

/**
 * Partially releases a reservation.
 *
 * Strategy: mark the existing allocation as 'released', then create a new
 * active allocation for (allocated_qty - release_qty). This preserves a
 * complete audit trail in stock_allocations rows — the released row records
 * what was freed and why, the new row records the remaining commitment.
 *
 * committed_qty on the balance decrements by release_qty only.
 */
export async function partialReleaseReservation(
  input: PartialReleaseInput,
  store: ReservationStore,
): Promise<PartialReleaseResult> {
  if (!input.allocation_id) return { ok: false, error: 'allocation_id is required' }
  if (!input.reason?.trim()) return { ok: false, error: 'Reason is required for partial release' }
  if (!Number.isFinite(input.release_qty) || input.release_qty <= 0) {
    return { ok: false, error: 'release_qty must be greater than zero' }
  }

  const allocation = await store.getAllocation(input.allocation_id)
  if (!allocation) return { ok: false, error: 'Reservation not found' }
  if (allocation.status !== 'active') return { ok: false, error: 'Reservation is not active' }
  if (allocation.stock_stage !== 'ready') {
    return { ok: false, error: 'Partial release is only supported for ready stock reservations' }
  }
  if (!allocation.ready_stock_balance_id) {
    return { ok: false, error: 'Reservation has no associated stock balance' }
  }
  if (input.release_qty >= allocation.allocated_qty) {
    return { ok: false, error: `release_qty (${input.release_qty}) must be less than allocated_qty (${allocation.allocated_qty}). Use full release to release the entire reservation.` }
  }

  const balance = await store.getBalance(allocation.ready_stock_balance_id)
  if (!balance) return { ok: false, error: 'Stock balance not found' }

  const now = new Date().toISOString()
  const remainingQty = allocation.allocated_qty - input.release_qty

  // Mark existing allocation as released (records the release audit trail)
  const releaseErr = await store.markReleased(input.allocation_id, {
    deactivated_by: input.released_by,
    deactivated_at: now,
    deactivation_reason: `Partial release of ${input.release_qty} gross. Reason: ${input.reason}`,
    released_by: input.released_by,
    released_at: now,
  })
  if (releaseErr) return { ok: false, error: `Failed to mark allocation released: ${releaseErr}` }

  // Create new active allocation for the remaining quantity
  const newAlloc = await store.insertAllocation({
    order_line_id: allocation.order_line_id,
    ready_stock_balance_id: allocation.ready_stock_balance_id,
    stock_stage: 'ready',
    allocated_qty: remainingQty,
    allocated_by: input.released_by,
    status: 'active',
    is_active: true,
  })
  if ('error' in newAlloc) return { ok: false, error: `Failed to create reduced allocation: ${newAlloc.error}` }

  // Decrement committed_qty by the released amount
  const newCommitted = Math.max(0, balance.committed_qty - input.release_qty)
  const balErr = await store.setCommittedQty(allocation.ready_stock_balance_id, newCommitted)
  if (balErr) return { ok: false, error: `Failed to update balance committed_qty: ${balErr}` }

  return {
    ok: true,
    released_qty: input.release_qty,
    remaining_qty: remainingQty,
    new_allocation_id: newAlloc.id,
  }
}
