'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getActorId } from '@/lib/get-actor'
import type { ActionState } from '@/lib/masters'

// ── Edit job metadata (expected_return_date, notes) ───────────

export async function editJobAction(
  jobId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const expectedReturn = (formData.get('expected_return_date') as string ?? '').trim() || null
  const notes = (formData.get('notes') as string ?? '').trim() || null
  const reason = (formData.get('reason') as string ?? '').trim()

  if (!reason) return { error: 'Reason is required for job edits' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()

  const { data: job } = await supabase
    .from('labour_jobs')
    .select('id, expected_return_date, notes, status')
    .eq('id', jobId)
    .single()

  if (!job) return { error: 'Job not found' }
  if (['returned_complete', 'cancelled_recalled'].includes(job.status as string)) {
    return { error: 'Cannot edit a terminal job' }
  }

  const { error: updateErr } = await supabase
    .from('labour_jobs')
    .update({ expected_return_date: expectedReturn, notes })
    .eq('id', jobId)

  if (updateErr) return { error: `Update failed: ${updateErr.message}` }

  // Record in status history as a note
  await supabase.from('labour_job_status_history').insert({
    labour_job_id: jobId,
    from_status: job.status,
    to_status: job.status,
    changed_by: actor,
    reason: `Job details updated: ${reason}`,
  })

  revalidatePath(`/operations/labour-jobs/${jobId}`)
  return { success: 'Job details updated.' }
}

// ── Force close (write-off WIP) ───────────────────────────────

export async function forceCloseJobAction(
  jobId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const reason = (formData.get('reason') as string ?? '').trim()
  if (!reason) return { error: 'Reason is required to force-close a job' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()
  const now = new Date().toISOString()

  const { data: job } = await supabase
    .from('labour_jobs')
    .select('id, status')
    .eq('id', jobId)
    .single()

  if (!job) return { error: 'Job not found' }
  if (['returned_complete', 'cancelled_recalled'].includes(job.status as string)) {
    return { error: 'Job is already terminal' }
  }

  // Get all lines with WIP remaining
  const { data: lines } = await supabase
    .from('labour_job_lines')
    .select('id, quantity_sent_gross, quantity_returned_gross')
    .eq('labour_job_id', jobId)

  let totalWriteOff = 0
  await Promise.all((lines ?? []).map(async (l) => {
    const wip = Number(l.quantity_sent_gross) - Number(l.quantity_returned_gross)
    if (wip <= 0) return

    totalWriteOff += wip

    // Write audit record
    await supabase.from('stock_corrections').insert({
      corrected_by: actor,
      stock_stage: 'wip',
      entity_table: 'labour_job_lines',
      entity_id: l.id,
      field_corrected: 'quantity_sent_gross',
      old_value: Number(l.quantity_sent_gross),
      new_value: Number(l.quantity_returned_gross),
      reason: `Force-closed: ${reason}`,
      notes: null,
    })

    // Reduce sent qty to match returned (zeroes WIP)
    await supabase
      .from('labour_job_lines')
      .update({ quantity_sent_gross: Number(l.quantity_returned_gross) })
      .eq('id', l.id)
  }))

  const prevStatus = job.status as string

  // Update job status to cancelled_recalled
  await supabase
    .from('labour_jobs')
    .update({ status: 'cancelled_recalled', actual_return_date: now.split('T')[0] })
    .eq('id', jobId)

  await supabase.from('labour_job_status_history').insert({
    labour_job_id: jobId,
    from_status: prevStatus,
    to_status: 'cancelled_recalled',
    changed_by: actor,
    reason: `Force-closed: ${reason}. ${totalWriteOff.toFixed(3)} gross written off.`,
  })

  revalidatePath(`/operations/labour-jobs/${jobId}`)
  revalidatePath('/operations/labour-jobs')
  revalidatePath('/planning/wip')
  revalidatePath('/admin/stock-correction')

  return { success: `Job force-closed. ${totalWriteOff.toFixed(3)} gross WIP written off.` }
}

type ReturnLineInput = {
  labour_job_line_id: string
  quantity_returned_gross: number
  variance_gross: number
  variance_type: 'none' | 'short_count' | 'wastage' | 'rejected' | 'other'
  variance_notes: string | null
  actual_dabbi_colour_id?: string
}

export async function recordLabourReturn(
  jobId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const returnDate = (formData.get('return_date') as string ?? '').trim()
  const notes = (formData.get('notes') as string ?? '').trim() || null
  const linesRaw = (formData.get('return_lines') as string ?? '').trim()

  if (!returnDate) return { error: 'Return date is required' }
  if (!linesRaw) return { error: 'Return lines data is missing' }

  let returnLines: ReturnLineInput[]
  try {
    returnLines = JSON.parse(linesRaw) as ReturnLineInput[]
  } catch {
    return { error: 'Return lines data is malformed — please try again' }
  }

  // Filter out zero-quantity lines — they are skipped (not an error)
  const activeLines = returnLines.filter((l) => l.quantity_returned_gross > 0)
  if (activeLines.length === 0) {
    return { error: 'Enter a quantity for at least one line' }
  }

  for (let i = 0; i < activeLines.length; i++) {
    const l = activeLines[i]
    const n = i + 1
    if (l.quantity_returned_gross < 0) return { error: `Line ${n}: returned quantity cannot be negative` }
    if (l.variance_gross < 0) return { error: `Line ${n}: variance cannot be negative` }
  }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()

  // Fetch the job lines to validate totals and get SKU identity for ready_stock_balance
  const { data: jobLines, error: jobLinesErr } = await supabase
    .from('labour_job_lines')
    .select(`
      id, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id, brand_id,
      quantity_sent_gross, quantity_returned_gross
    `)
    .eq('labour_job_id', jobId)

  if (jobLinesErr || !jobLines) {
    return { error: 'Could not fetch job lines — please try again' }
  }

  const jobLineMap = new Map(jobLines.map((l) => [l.id, l]))

  // Validate: returned + already_returned must not exceed sent
  for (const rl of activeLines) {
    const jl = jobLineMap.get(rl.labour_job_line_id)
    if (!jl) return { error: `Job line not found: ${rl.labour_job_line_id.slice(0, 8)}` }
    const alreadyReturned = Number(jl.quantity_returned_gross)
    const maxAllowed = Number(jl.quantity_sent_gross) - alreadyReturned
    if (rl.quantity_returned_gross > maxAllowed) {
      return {
        error: `A line return quantity (${rl.quantity_returned_gross}) exceeds remaining WIP (${maxAllowed})`,
      }
    }
  }

  // 1. Create return event header
  const { data: returnEvent, error: eventErr } = await supabase
    .from('labour_job_return_events')
    .insert({
      labour_job_id: jobId,
      return_date: returnDate,
      notes,
      recorded_by: actor,
    })
    .select('id')
    .single()

  if (eventErr || !returnEvent) {
    return { error: eventErr?.message ?? 'Failed to create return event' }
  }

  // 2. Insert return lines + update job line totals + UPSERT ready_stock_balance
  await Promise.all(activeLines.map(async (rl) => {
    const jl = jobLineMap.get(rl.labour_job_line_id)!

    // 2a. Insert return line
    const { error: rlErr } = await supabase.from('labour_job_return_lines').insert({
      return_event_id: returnEvent.id,
      labour_job_line_id: rl.labour_job_line_id,
      quantity_returned_gross: rl.quantity_returned_gross,
      variance_gross: rl.variance_gross,
      variance_type: rl.variance_type,
      variance_notes: rl.variance_notes,
    })

    if (rlErr) return

    // 2b. Increment quantity_returned_gross on the job line
    const newReturned = Number(jl.quantity_returned_gross) + rl.quantity_returned_gross
    const { error: updateLineErr } = await supabase
      .from('labour_job_lines')
      .update({ quantity_returned_gross: newReturned })
      .eq('id', rl.labour_job_line_id)

    if (updateLineErr) return

    // 2c. UPSERT ready_stock_balance with the returned quantity.
    // Use actual_dabbi_colour_id if provided (correction case), otherwise fall back to issued.
    const effectiveDabbiId = rl.actual_dabbi_colour_id ?? jl.dabbi_colour_id
    const dabbiCorrected = rl.actual_dabbi_colour_id != null && rl.actual_dabbi_colour_id !== jl.dabbi_colour_id

    const { data: existing } = await supabase
      .from('ready_stock_balance')
      .select('id, gross_qty')
      .match({
        shape_design_id: jl.shape_design_id,
        bindi_colour_id: jl.bindi_colour_id,
        size_id: jl.size_id,
        dabbi_colour_id: effectiveDabbiId,
        brand_id: jl.brand_id,
      })
      .maybeSingle()

    if (existing) {
      await supabase
        .from('ready_stock_balance')
        .update({
          gross_qty: Number(existing.gross_qty) + rl.quantity_returned_gross,
          last_updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('ready_stock_balance')
        .insert({
          shape_design_id: jl.shape_design_id,
          bindi_colour_id: jl.bindi_colour_id,
          size_id: jl.size_id,
          dabbi_colour_id: effectiveDabbiId,
          brand_id: jl.brand_id,
          gross_qty: rl.quantity_returned_gross,
          committed_qty: 0,
          last_updated_at: new Date().toISOString(),
        })
    }

    // Write audit record for dabbi colour correction
    if (dabbiCorrected) {
      const { data: dabbis } = await supabase
        .from('dabbi_colours')
        .select('id, code')
        .in('id', [jl.dabbi_colour_id, effectiveDabbiId])

      const originalCode = dabbis?.find((d) => d.id === jl.dabbi_colour_id)?.code ?? jl.dabbi_colour_id
      const actualCode = dabbis?.find((d) => d.id === effectiveDabbiId)?.code ?? effectiveDabbiId

      await supabase.from('stock_corrections').insert({
        corrected_by: actor,
        stock_stage: 'ready',
        entity_table: 'labour_job_lines',
        entity_id: rl.labour_job_line_id,
        field_corrected: 'dabbi_colour_correction',
        old_value: originalCode,
        new_value: actualCode,
        reason: `Labour return dabbi correction — issued as ${originalCode}, returned as ${actualCode}`,
        notes: null,
      })
    }
  }))

  // 3. Recompute job status from updated totals
  const { data: updatedLines } = await supabase
    .from('labour_job_lines')
    .select('quantity_sent_gross, quantity_returned_gross')
    .eq('labour_job_id', jobId)

  const totalSent = (updatedLines ?? []).reduce((s, l) => s + Number(l.quantity_sent_gross), 0)
  const totalReturned = (updatedLines ?? []).reduce((s, l) => s + Number(l.quantity_returned_gross), 0)

  let newStatus: string
  if (totalReturned <= 0) {
    newStatus = 'in_packaging'
  } else if (totalReturned >= totalSent) {
    newStatus = 'returned_complete'
  } else {
    newStatus = 'partially_returned'
  }

  const { data: job } = await supabase
    .from('labour_jobs')
    .select('status')
    .eq('id', jobId)
    .single()

  const prevStatus = job?.status ?? 'assigned'

  if (prevStatus !== newStatus) {
    await supabase.from('labour_jobs').update({
      status: newStatus,
      actual_return_date: newStatus === 'returned_complete' ? returnDate : undefined,
    }).eq('id', jobId)

    await supabase.from('labour_job_status_history').insert({
      labour_job_id: jobId,
      from_status: prevStatus,
      to_status: newStatus,
      changed_by: actor,
      reason: `Return recorded: ${totalReturned} of ${totalSent} gross returned`,
    })
  }

  revalidatePath(`/operations/labour-jobs/${jobId}`)
  revalidatePath('/operations/labour-jobs')
  revalidatePath('/planning/ready')

  return { success: `Return recorded. Ready stock updated.` }
}
