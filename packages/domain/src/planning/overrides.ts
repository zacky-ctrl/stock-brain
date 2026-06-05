import type { PlanningOverride } from '@stock-brain/types'

export type CreatePlanningOverrideInput = {
  order_line_id: string
  override_type: 'CUTTINGS_OVERRIDE' | 'READY_STOCK_OVERRIDE' | 'VELVET_OVERRIDE' | 'GENERAL_OVERRIDE'
  reason: string
  created_by: string
}

export type PlanningOverrideStore = {
  insertOverride: (row: {
    order_line_id: string
    override_type: string
    reason: string
    created_by: string
  }) => Promise<{ id: string }>

  resolveOverride: (id: string, resolved_by: string, resolved_at: string) => Promise<void>

  fetchActiveOverrides: () => Promise<PlanningOverride[]>
}

export type CreatePlanningOverrideResult =
  | { ok: true; override_id: string }
  | { ok: false; error: string }

export type ResolvePlanningOverrideResult =
  | { ok: true }
  | { ok: false; error: string }

export async function createPlanningOverride(
  input: CreatePlanningOverrideInput,
  store: PlanningOverrideStore,
): Promise<CreatePlanningOverrideResult> {
  const reason = input.reason.trim()
  if (!reason) {
    return { ok: false, error: 'Reason is required and must not be empty.' }
  }

  try {
    const row = await store.insertOverride({
      order_line_id: input.order_line_id,
      override_type: input.override_type,
      reason,
      created_by: input.created_by,
    })
    return { ok: true, override_id: row.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function resolvePlanningOverride(
  id: string,
  actor: string,
  store: PlanningOverrideStore,
): Promise<ResolvePlanningOverrideResult> {
  try {
    await store.resolveOverride(id, actor, new Date().toISOString())
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
