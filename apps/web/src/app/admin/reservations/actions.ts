'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getActorId } from '@/lib/get-actor'
import { releaseReservation, reassignReservation, partialReleaseReservation } from '@stock-brain/domain'
import { createSupabaseReservationStore } from '@/lib/reservation-store'
import type { ActionState } from '@/lib/masters'

export async function releaseReservationAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const allocationId = (formData.get('allocation_id') as string ?? '').trim()
  const reason = (formData.get('reason') as string ?? '').trim()

  if (!allocationId) return { error: 'Allocation ID is missing' }
  if (!reason) return { error: 'Reason is required when releasing a reservation' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()
  const store = createSupabaseReservationStore(supabase)

  const result = await releaseReservation({ allocation_id: allocationId, reason, released_by: actor }, store)

  if (!result.ok) {
    return { error: result.error }
  }

  revalidatePath('/admin/reservations')
  revalidatePath('/planning/allocation')
  revalidatePath('/planning/ready')

  return { success: `Released ${result.released_qty} gross. Stock now available for dispatch.` }
}

export async function reassignReservationAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const allocationId = (formData.get('allocation_id') as string ?? '').trim()
  const newOrderLineId = (formData.get('new_order_line_id') as string ?? '').trim()
  const reason = (formData.get('reason') as string ?? '').trim()

  if (!allocationId) return { error: 'Allocation ID is missing' }
  if (!newOrderLineId) return { error: 'Target order line is required' }
  if (!reason) return { error: 'Reason is required when reassigning a reservation' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()
  const store = createSupabaseReservationStore(supabase)

  const result = await reassignReservation(
    { allocation_id: allocationId, new_order_line_id: newOrderLineId, reason, reassigned_by: actor },
    store,
  )

  if (!result.ok) {
    return { error: result.error }
  }

  revalidatePath('/admin/reservations')
  revalidatePath('/planning/allocation')

  return { success: `Reservation reassigned. New allocation ID: ${result.new_allocation_id.slice(0, 8)}` }
}

export async function partialReleaseReservationAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const allocationId = (formData.get('allocation_id') as string ?? '').trim()
  const releaseQtyRaw = (formData.get('release_qty') as string ?? '').trim()
  const reason = (formData.get('reason') as string ?? '').trim()

  if (!allocationId) return { error: 'Allocation ID is missing' }
  if (!releaseQtyRaw) return { error: 'Release quantity is required' }
  const release_qty = parseFloat(releaseQtyRaw)
  if (!Number.isFinite(release_qty) || release_qty <= 0) {
    return { error: 'Release quantity must be a positive number' }
  }
  if (!reason) return { error: 'Reason is required for partial release' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()
  const store = createSupabaseReservationStore(supabase)

  const result = await partialReleaseReservation(
    { allocation_id: allocationId, release_qty, reason, released_by: actor },
    store,
  )

  if (!result.ok) {
    return { error: result.error }
  }

  revalidatePath('/admin/reservations')
  revalidatePath('/planning/allocation')
  revalidatePath('/planning/ready')

  return { success: `Released ${result.released_qty} gross. ${result.remaining_qty} gross remains reserved.` }
}
