'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createPlanningOverride, resolvePlanningOverride } from '@stock-brain/domain'
import type { PlanningOverrideStore } from '@stock-brain/domain'

const ACTOR = process.env.DEV_ACTOR_ID ?? '00000000-0000-0000-0000-000000000001'

function makeStore(): PlanningOverrideStore {
  const supabase = createServerSupabaseClient()

  return {
    async insertOverride(row) {
      const { data, error } = await supabase
        .from('planning_overrides')
        .insert(row)
        .select('id')
        .single()

      if (error || !data) {
        throw new Error(error?.message ?? 'Insert failed')
      }
      return { id: data.id as string }
    },

    async resolveOverride(id, resolved_by, resolved_at) {
      const { error } = await supabase
        .from('planning_overrides')
        .update({ is_active: false, resolved_by, resolved_at })
        .eq('id', id)

      if (error) throw new Error(error.message)
    },

    async fetchActiveOverrides() {
      const { data, error } = await supabase
        .from('planning_overrides')
        .select('id, order_line_id, override_type, reason, created_by, created_at, resolved_at')
        .eq('is_active', true)

      if (error) throw new Error(error.message)
      return (data ?? []).map((ov: Record<string, unknown>) => ({
        id: ov['id'] as string,
        order_line_id: ov['order_line_id'] as string,
        override_type: ov['override_type'] as string,
        reason: ov['reason'] as string,
        created_by: ov['created_by'] as string,
        created_at: ov['created_at'] as string,
        resolved_at: ov['resolved_at'] as string | null,
      }))
    },
  }
}

export async function createOverrideAction(formData: FormData): Promise<void> {
  const order_line_id = formData.get('order_line_id') as string
  const override_type = formData.get('override_type') as
    | 'CUTTINGS_OVERRIDE'
    | 'READY_STOCK_OVERRIDE'
    | 'VELVET_OVERRIDE'
    | 'GENERAL_OVERRIDE'
  const reason = formData.get('reason') as string

  if (!order_line_id || !override_type || !reason?.trim()) {
    throw new Error('All fields are required.')
  }

  const result = await createPlanningOverride(
    { order_line_id, override_type, reason, created_by: ACTOR },
    makeStore(),
  )

  if (!result.ok) throw new Error(result.error)

  revalidatePath('/planning/allocation')
  revalidatePath('/admin/planning-overrides')
  redirect('/admin/planning-overrides')
}

export async function resolveOverrideAction(formData: FormData): Promise<void> {
  const id = formData.get('id') as string

  if (!id) throw new Error('Override ID is required.')

  const result = await resolvePlanningOverride(id, ACTOR, makeStore())

  if (!result.ok) throw new Error(result.error)

  revalidatePath('/planning/allocation')
  revalidatePath('/admin/planning-overrides')
}
