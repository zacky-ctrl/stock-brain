'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ActionState } from '@/lib/masters'

type MatrixRow = {
  shape_design_id: string
  size_id: string
  gross_per_metre: number
  metres_per_bundle: number
  buffer_gross: number
}

export async function saveVelvetRatesMatrixAction(data: {
  rows: MatrixRow[]
  reason: string
}): Promise<{ success?: string; error?: string }> {
  if (!data.reason.trim()) return { error: 'Reason is required' }
  if (!data.rows.length) return { error: 'No rows provided' }

  const supabase = createServerSupabaseClient()

  const results = await Promise.all(data.rows.map(async (row): Promise<string | null> => {
    const { data: existing } = await supabase
      .from('velvet_conversion_rates')
      .select('id, gross_per_metre, metres_per_bundle, buffer_gross')
      .eq('shape_design_id', row.shape_design_id)
      .eq('size_id', row.size_id)
      .eq('is_active', true)
      .maybeSingle()

    if (existing) {
      const { error: deactErr } = await supabase
        .from('velvet_conversion_rates')
        .update({ is_active: false })
        .eq('id', existing.id)
      if (deactErr) return `Deactivate failed: ${deactErr.message}`
    }

    const { error: insertErr } = await supabase
      .from('velvet_conversion_rates')
      .insert({
        shape_design_id: row.shape_design_id,
        size_id: row.size_id,
        gross_per_metre: row.gross_per_metre,
        metres_per_bundle: row.metres_per_bundle,
        buffer_gross: row.buffer_gross,
        is_active: true,
        notes: existing
          ? `Matrix update: g/m ${Number(existing.gross_per_metre).toFixed(3)}→${row.gross_per_metre.toFixed(3)}, buf ${existing.buffer_gross}→${row.buffer_gross}. ${data.reason}`
          : `Added via matrix. ${data.reason}`,
      })

    if (insertErr) {
      if (existing) {
        await supabase.from('velvet_conversion_rates').update({ is_active: true }).eq('id', existing.id)
      }
      return `Insert failed: ${insertErr.message}`
    }

    return null
  }))

  const errors = results.filter((r): r is string => r !== null)
  if (errors.length > 0) return { error: errors[0] }

  revalidatePath('/masters/velvet-rates')
  revalidatePath('/planning/allocation')
  revalidatePath('/planning/cutting-required')

  return { success: `${data.rows.length} rate${data.rows.length === 1 ? '' : 's'} saved` }
}

export async function updateVelvetRate(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const rateId = (fd.get('rate_id') as string ?? '').trim()
  const newGrossRaw = (fd.get('gross_per_metre') as string ?? '').trim()
  const newMetresPerBundleRaw = (fd.get('metres_per_bundle') as string ?? '').trim()
  const notes = (fd.get('notes') as string ?? '').trim() || null
  const reason = (fd.get('reason') as string ?? '').trim()

  if (!rateId) return { error: 'Rate ID missing' }
  if (!newGrossRaw) return { error: 'Gross per metre is required' }
  if (!newMetresPerBundleRaw) return { error: 'Metres per bundle is required' }
  if (!reason) return { error: 'Reason is required (this affects the planning engine)' }

  const newGross = parseFloat(newGrossRaw)
  if (!Number.isFinite(newGross) || newGross <= 0) {
    return { error: 'Gross per metre must be a positive number' }
  }

  const newMetresPerBundle = parseFloat(newMetresPerBundleRaw)
  if (!Number.isFinite(newMetresPerBundle) || newMetresPerBundle <= 0) {
    return { error: 'Metres per bundle must be a positive number' }
  }

  const supabase = createServerSupabaseClient()

  // Fetch current rate to preserve shape_design_id + size_id + get old value
  const { data: current } = await supabase
    .from('velvet_conversion_rates')
    .select('id, shape_design_id, size_id, gross_per_metre, metres_per_bundle, is_active, notes')
    .eq('id', rateId)
    .single()

  if (!current) return { error: 'Rate not found' }
  if (Number(current.gross_per_metre) === newGross && Number(current.metres_per_bundle) === newMetresPerBundle && (current.notes as string | null) === notes) {
    return { error: 'No changes — gross_per_metre, metres_per_bundle, and notes are unchanged' }
  }

  // Deactivate the old rate
  const { error: deactErr } = await supabase
    .from('velvet_conversion_rates')
    .update({ is_active: false })
    .eq('id', rateId)

  if (deactErr) return { error: `Failed to deactivate old rate: ${deactErr.message}` }

  // Insert new rate as the active version
  const { error: insertErr } = await supabase
    .from('velvet_conversion_rates')
    .insert({
      shape_design_id: current.shape_design_id,
      size_id: current.size_id,
      gross_per_metre: newGross,
      metres_per_bundle: newMetresPerBundle,
      is_active: true,
      notes: notes ? `${notes} [Updated from ${Number(current.gross_per_metre as number | string).toFixed(3)}: ${reason}]` : `Updated from ${Number(current.gross_per_metre as number | string).toFixed(3)}: ${reason}`,
    })

  if (insertErr) {
    // Rollback deactivation attempt
    await supabase.from('velvet_conversion_rates').update({ is_active: true }).eq('id', rateId)
    return { error: `Failed to insert new rate: ${insertErr.message}. Old rate reactivated.` }
  }

  revalidatePath('/masters/velvet-rates')
  revalidatePath('/planning/allocation')
  revalidatePath('/planning/cutting-required')

  return { success: `Rate updated: ${Number(current.gross_per_metre).toFixed(3)} → ${newGross.toFixed(3)} gross/metre. Old rate deactivated (preserved in history).` }
}

export async function addVelvetRate(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const shapeDesignId = (fd.get('shape_design_id') as string ?? '').trim()
  const sizeId = (fd.get('size_id') as string ?? '').trim()
  const grossRaw = (fd.get('gross_per_metre') as string ?? '').trim()
  const metresPerBundleRaw = (fd.get('metres_per_bundle') as string ?? '').trim()
  const notes = (fd.get('notes') as string ?? '').trim() || null

  if (!shapeDesignId) return { error: 'Shape is required' }
  if (!sizeId) return { error: 'Size is required' }
  if (!grossRaw) return { error: 'Gross per metre is required' }
  if (!metresPerBundleRaw) return { error: 'Metres per bundle is required' }

  const gross = parseFloat(grossRaw)
  if (!Number.isFinite(gross) || gross <= 0) {
    return { error: 'Gross per metre must be a positive number' }
  }

  const metresPerBundle = parseFloat(metresPerBundleRaw)
  if (!Number.isFinite(metresPerBundle) || metresPerBundle <= 0) {
    return { error: 'Metres per bundle must be a positive number' }
  }

  const supabase = createServerSupabaseClient()

  // Check if an active rate already exists for this (shape, size) pair
  const { data: existing } = await supabase
    .from('velvet_conversion_rates')
    .select('id')
    .eq('shape_design_id', shapeDesignId)
    .eq('size_id', sizeId)
    .eq('is_active', true)
    .maybeSingle()

  if (existing) {
    return { error: 'An active rate already exists for this (Shape, Size) pair. Use the Edit button to update it.' }
  }

  const { error: insertErr } = await supabase.from('velvet_conversion_rates').insert({
    shape_design_id: shapeDesignId,
    size_id: sizeId,
    gross_per_metre: gross,
    metres_per_bundle: metresPerBundle,
    is_active: true,
    notes,
  })

  if (insertErr) return { error: `Failed to add rate: ${insertErr.message}` }

  revalidatePath('/masters/velvet-rates')
  revalidatePath('/planning/allocation')
  revalidatePath('/planning/cutting-required')
  revalidatePath('/operations/cutting-sessions')
  revalidatePath('/operations/cutting-sessions/new')

  return { success: `Rate added: ${gross.toFixed(3)} gross/metre for this (Shape, Size) pair.` }
}
