'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getActorId } from '@/lib/get-actor'
import { validateAndDeductCuttingsForLabourJob } from '@stock-brain/domain'
import type { CuttingSessionStore } from '@stock-brain/domain'
import type { ActionState } from '@/lib/masters'
import type {
  StoredCuttingSession,
  StoredCuttingSessionLine,
  StoredCuttingsBalance,
  NewCuttingSessionRow,
  NewCuttingSessionLineRow,
  LabourJobLineForCuttingsCheck,
} from '@stock-brain/types'

type JobLineInput = {
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  brand_id: string
  quantity_sent_gross: number
}

function makeCuttingsReadStore(supabase: ReturnType<typeof createServerSupabaseClient>): CuttingSessionStore {
  return {
    async insertSession(_row: NewCuttingSessionRow) { return null },
    async insertLines(_rows: NewCuttingSessionLineRow[]) { return undefined },
    async deleteSession(_id: string) {},
    async getSession(_id: string): Promise<StoredCuttingSession | null> { return null },
    async getSessionLines(_sessionId: string): Promise<StoredCuttingSessionLine[]> { return [] },
    async getBalance(designId: string, colourId: string, sizeId: string): Promise<StoredCuttingsBalance | null> {
      const { data } = await supabase
        .from('cuttings_stock_balance')
        .select('id, shape_design_id, bindi_colour_id, size_id, gross_qty, committed_qty, available_qty, last_updated_at')
        .eq('shape_design_id', designId)
        .eq('bindi_colour_id', colourId)
        .eq('size_id', sizeId)
        .single()
      return data as StoredCuttingsBalance | null
    },
    async incrementBalance() { return undefined },
    async deductBalance(designId: string, colourId: string, sizeId: string, subtractQty: number) {
      const existing = await this.getBalance(designId, colourId, sizeId)
      if (!existing) return 'Balance row not found'
      const { error } = await supabase
        .from('cuttings_stock_balance')
        .update({
          gross_qty: Math.max(0, Number(existing.gross_qty) - subtractQty),
          last_updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      return error?.message
    },
    async confirmSession() { return undefined },
    async voidSession() { return undefined },
    async getVelvetBalance() { return null },
    async decrementVelvetBalance() { return undefined },
  }
}

export async function createLabourJob(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const labourUnitId = (formData.get('labour_unit_id') as string ?? '').trim()
  const dateAssigned = (formData.get('date_assigned') as string ?? '').trim()
  const expectedReturn = (formData.get('expected_return_date') as string ?? '').trim() || null
  const notes = (formData.get('notes') as string ?? '').trim() || null
  const linesRaw = (formData.get('lines') as string ?? '').trim()

  if (!labourUnitId) return { error: 'Labour unit is required' }
  if (!dateAssigned) return { error: 'Assigned date is required' }
  if (!linesRaw) return { error: 'At least one line is required' }

  let lines: JobLineInput[]
  try {
    lines = JSON.parse(linesRaw) as JobLineInput[]
  } catch {
    return { error: 'Lines data is malformed — please try again' }
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    return { error: 'At least one line is required' }
  }

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const n = i + 1
    if (!l.shape_design_id) return { error: `Line ${n}: shape is required` }
    if (!l.bindi_colour_id) return { error: `Line ${n}: bindi colour is required` }
    if (!l.size_id) return { error: `Line ${n}: size is required` }
    if (!l.dabbi_colour_id) return { error: `Line ${n}: dabbi colour is required` }
    if (!l.brand_id) return { error: `Line ${n}: brand is required` }
    if (!Number.isFinite(l.quantity_sent_gross) || l.quantity_sent_gross <= 0) {
      return { error: `Line ${n}: quantity must be greater than zero` }
    }
  }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()

  // Fetch display names for error messages
  const lineIds = lines.map((l) => l.shape_design_id)
  const sizeIds = lines.map((l) => l.size_id)
  const [{ data: designRows }, { data: sizeRows }] = await Promise.all([
    supabase.from('shape_designs').select('id, code, name').in('id', [...new Set(lineIds)]),
    supabase.from('sizes').select('id, code').in('id', [...new Set(sizeIds)]),
  ])
  const designMap = new Map((designRows ?? []).map((d) => [d.id as string, ((d as { name?: string | null }).name ?? d.code) as string]))
  const sizeMap = new Map((sizeRows ?? []).map((s) => [s.id as string, s.code as string]))

  // Validate cuttings stock before creating the job
  const cuttingsLines: LabourJobLineForCuttingsCheck[] = lines.map((l) => ({
    shape_design_id: l.shape_design_id,
    bindi_colour_id: l.bindi_colour_id,
    size_id: l.size_id,
    quantity_sent_gross: l.quantity_sent_gross,
    design_name: designMap.get(l.shape_design_id),
    size_code: sizeMap.get(l.size_id),
  }))

  const store = makeCuttingsReadStore(supabase)
  const cuttingsCheck = await validateAndDeductCuttingsForLabourJob(cuttingsLines, store)
  if (!cuttingsCheck.ok) {
    return { error: cuttingsCheck.error }
  }

  const { data: job, error: jobErr } = await supabase
    .from('labour_jobs')
    .insert({
      labour_unit_id: labourUnitId,
      date_assigned: dateAssigned,
      expected_return_date: expectedReturn,
      status: 'assigned',
      notes,
      created_by: actor,
    })
    .select('id')
    .single()

  if (jobErr || !job) {
    return { error: jobErr?.message ?? 'Failed to create labour job' }
  }

  const lineInserts = lines.map((l) => ({
    labour_job_id: job.id,
    shape_design_id: l.shape_design_id,
    bindi_colour_id: l.bindi_colour_id,
    size_id: l.size_id,
    dabbi_colour_id: l.dabbi_colour_id,
    brand_id: l.brand_id,
    quantity_sent_gross: l.quantity_sent_gross,
    quantity_returned_gross: 0,
  }))

  const { error: linesErr } = await supabase.from('labour_job_lines').insert(lineInserts)

  if (linesErr) {
    await supabase.from('labour_jobs').delete().eq('id', job.id)
    return { error: linesErr.message }
  }

  await supabase.from('labour_job_status_history').insert({
    labour_job_id: job.id,
    from_status: null,
    to_status: 'assigned',
    changed_by: actor,
  })

  revalidatePath('/operations/labour-jobs')
  redirect(`/operations/labour-jobs/${job.id}`)
}
