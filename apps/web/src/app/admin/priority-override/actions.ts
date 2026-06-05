'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getActorId } from '@/lib/get-actor'
import type { ActionState } from '@/lib/masters'

/**
 * Sets a priority override for an order line.
 *
 * Priority overrides are append-only. When a new override is set:
 *   1. Deactivate the current active override for this line (if any)
 *   2. Insert the new override row
 *   3. Set order_lines.has_priority_override = true
 *
 * When an override is cleared:
 *   1. Deactivate the current active override
 *   2. Set order_lines.has_priority_override = false
 *
 * priority_value: 1 = highest priority. Lower number = served first
 * in the planning allocation engine. This scale is separate from
 * customer_priority_weight (which is 1–10, higher = higher priority).
 * Any line with an active override ranks ABOVE all non-overridden lines
 * regardless of the override value.
 */
export async function setPriorityOverride(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderLineId = (formData.get('order_line_id') as string ?? '').trim()
  const priorityValueRaw = (formData.get('priority_value') as string ?? '').trim()
  const reason = (formData.get('reason') as string ?? '').trim()
  const expiresAt = (formData.get('expires_at') as string ?? '').trim() || null

  if (!orderLineId) return { error: 'Order line is required' }
  if (!priorityValueRaw) return { error: 'Priority value is required' }
  if (!reason) return { error: 'Reason is required — priority overrides must be attributed' }

  const priorityValue = parseInt(priorityValueRaw, 10)
  if (!Number.isInteger(priorityValue) || priorityValue < 1) {
    return { error: 'Priority value must be a positive integer (1 = highest priority)' }
  }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()
  const now = new Date().toISOString()

  // Fetch current active override for this line (to record previous value)
  const { data: currentOverride } = await supabase
    .from('priority_overrides')
    .select('id, priority_value')
    .eq('order_line_id', orderLineId)
    .eq('is_active', true)
    .order('overridden_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Deactivate current override if it exists
  if (currentOverride) {
    const { error: deactivateErr } = await supabase
      .from('priority_overrides')
      .update({ is_active: false })
      .eq('id', currentOverride.id)

    if (deactivateErr) {
      return { error: `Failed to deactivate previous override: ${deactivateErr.message}` }
    }
  }

  // Insert the new override
  const { error: insertErr } = await supabase.from('priority_overrides').insert({
    order_line_id: orderLineId,
    priority_value: priorityValue,
    previous_priority_value: currentOverride ? (currentOverride.priority_value as number) : null,
    reason,
    expires_at: expiresAt,
    is_active: true,
    overridden_by: actor,
  })

  if (insertErr) {
    return { error: `Failed to create priority override: ${insertErr.message}` }
  }

  // Update the order_lines flag so the planning engine can filter efficiently
  const { error: flagErr } = await supabase
    .from('order_lines')
    .update({ has_priority_override: true })
    .eq('id', orderLineId)

  if (flagErr) {
    return { error: `Override saved but flag update failed: ${flagErr.message}` }
  }

  revalidatePath('/planning/allocation')

  return { success: `Priority override set: line now ranks at P${priorityValue} (override tier)` }
}

/**
 * Clears the active priority override for an order line.
 * The line returns to its customer-weight-based priority.
 */
export async function clearPriorityOverride(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderLineId = (formData.get('order_line_id') as string ?? '').trim()
  const reason = (formData.get('reason') as string ?? '').trim()

  if (!orderLineId) return { error: 'Order line is required' }
  if (!reason) return { error: 'Reason is required when clearing an override' }

  const supabase = createServerSupabaseClient()

  const { error: deactivateErr } = await supabase
    .from('priority_overrides')
    .update({ is_active: false })
    .eq('order_line_id', orderLineId)
    .eq('is_active', true)

  if (deactivateErr) {
    return { error: `Failed to clear override: ${deactivateErr.message}` }
  }

  await supabase
    .from('order_lines')
    .update({ has_priority_override: false })
    .eq('id', orderLineId)

  revalidatePath('/planning/allocation')

  return { success: 'Priority override cleared. Line returns to customer weight ranking.' }
}
