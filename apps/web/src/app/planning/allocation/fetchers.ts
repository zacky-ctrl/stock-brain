import { createServerSupabaseClient } from '@/lib/supabase/server'
import { computePlanningAllocation } from '@stock-brain/domain'
import { fetchPlanningInputs } from '@/lib/planning-fetcher'
import type { PlanningAllocationRow } from '@stock-brain/types'

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>

/**
 * Thin wrapper: fetches all planning inputs and runs the allocation engine.
 * All pages that need PlanningAllocationRow[] use this or call fetchPlanningInputs
 * + computePlanningAllocation directly when they need filtered inputs.
 */
export async function fetchPlanningAllocation(
  supabase: SupabaseClient,
): Promise<PlanningAllocationRow[]> {
  const inputs = await fetchPlanningInputs(supabase)
  return computePlanningAllocation(inputs)
}
