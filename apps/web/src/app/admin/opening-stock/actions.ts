'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ActionState } from '@/lib/masters'

const ACTOR = process.env.DEV_ACTOR_ID ?? '00000000-0000-0000-0000-000000000001'

type MatrixLine = {
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  quantity: number
}

// ── Cuttings opening stock ────────────────────────────────────

export async function applyCuttingsOpeningStock(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const reason = (formData.get('reason') as string ?? '').trim()
  const linesRaw = (formData.get('lines') as string ?? '').trim()

  if (reason.length < 3) return { error: 'Reason must be at least 3 characters.' }
  if (!linesRaw) return { error: 'No quantities entered.' }

  let lines: MatrixLine[]
  try {
    lines = JSON.parse(linesRaw)
  } catch {
    return { error: 'Invalid matrix data.' }
  }

  const nonZero = lines.filter((l) => l.quantity > 0)
  if (nonZero.length === 0) return { error: 'No non-zero quantities entered.' }

  const supabase = createServerSupabaseClient()
  const now = new Date().toISOString()
  const fullReason = `OPENING_BALANCE: ${reason}`
  const warnings: string[] = []

  await Promise.all(nonZero.map(async (line) => {
    const { data: existing } = await supabase
      .from('cuttings_stock_balance')
      .select('id, gross_qty, committed_qty')
      .eq('shape_design_id', line.shape_design_id)
      .eq('bindi_colour_id', line.bindi_colour_id)
      .eq('size_id', line.size_id)
      .maybeSingle()

    const old_value = existing ? Number(existing.gross_qty) : 0
    const committed = existing ? Number(existing.committed_qty) : 0
    const newGross  = old_value + line.quantity
    // gross_qty must never fall below committed_qty — that would violate the check constraint
    const safeGross = Math.max(newGross, committed)

    if (committed > newGross) {
      warnings.push(`${committed} gross is reserved for a cuttings SKU. Gross qty set to ${committed} to maintain reservation integrity.`)
    }

    if (old_value === safeGross) return

    // Write correction audit record before balance change
    const { error: corrErr } = existing
      ? await supabase.from('stock_corrections').insert({
          corrected_by: ACTOR,
          stock_stage: 'cuttings',
          entity_table: 'cuttings_stock_balance',
          entity_id: existing.id,
          field_corrected: 'gross_qty',
          old_value,
          new_value: safeGross,
          reason: fullReason,
        })
      : { error: null }

    // Upsert the balance
    let entityId = existing?.id
    if (existing) {
      if (corrErr) return
      const { error: upErr } = await supabase
        .from('cuttings_stock_balance')
        .update({ gross_qty: safeGross, last_updated_at: now })
        .eq('id', existing.id)
      if (upErr) return
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from('cuttings_stock_balance')
        .insert({
          shape_design_id: line.shape_design_id,
          bindi_colour_id: line.bindi_colour_id,
          size_id: line.size_id,
          gross_qty: line.quantity,
          committed_qty: committed,
          last_updated_at: now,
        })
        .select('id')
        .single()
      if (insErr || !inserted) return
      entityId = inserted.id
      // Write correction after insert (we now have entity_id)
      await supabase.from('stock_corrections').insert({
        corrected_by: ACTOR,
        stock_stage: 'cuttings',
        entity_table: 'cuttings_stock_balance',
        entity_id: entityId,
        field_corrected: 'gross_qty',
        old_value: 0,
        new_value: line.quantity,
        reason: fullReason,
      })
    }
  }))

  revalidatePath('/planning/allocation')
  revalidatePath('/operations/cutting-sessions/stock')
  const base = `Opening cuttings stock applied: ${nonZero.length} SKU(s) updated.`
  const msg = warnings.length > 0 ? `${base}\n⚠ ${warnings.join('\n⚠ ')}` : base
  return { success: msg }
}

// ── Purchased cuttings stock ──────────────────────────────────

export async function applyPurchasedCuttingsStock(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const purchaseDate = (formData.get('purchase_date') as string ?? '').trim()
  const supplier    = (formData.get('supplier')      as string ?? '').trim()
  const billRef     = (formData.get('bill_ref')      as string ?? '').trim()
  const notes       = (formData.get('notes')         as string ?? '').trim()
  const linesRaw    = (formData.get('lines')         as string ?? '').trim()

  if (!purchaseDate) return { error: 'Purchase date is required.' }
  if (notes.length < 3) return { error: 'Notes / reason must be at least 3 characters.' }
  if (!linesRaw) return { error: 'No quantities entered.' }

  let lines: MatrixLine[]
  try {
    lines = JSON.parse(linesRaw)
  } catch {
    return { error: 'Invalid matrix data.' }
  }

  const nonZero = lines.filter((l) => l.quantity > 0)
  if (nonZero.length === 0) return { error: 'No non-zero quantities entered.' }

  // Build audit reason with PURCHASED: prefix so history can identify the source
  const parts: string[] = [`PURCHASED: ${purchaseDate}`]
  if (supplier) parts.push(supplier)
  if (billRef)  parts.push(`Bill:${billRef}`)
  parts.push(notes)
  const fullReason = parts.join(' | ')

  const supabase = createServerSupabaseClient()
  const now = new Date().toISOString()

  await Promise.all(nonZero.map(async (line) => {
    const { data: existing } = await supabase
      .from('cuttings_stock_balance')
      .select('id, gross_qty, committed_qty')
      .eq('shape_design_id', line.shape_design_id)
      .eq('bindi_colour_id', line.bindi_colour_id)
      .eq('size_id', line.size_id)
      .maybeSingle()

    // Purchased stock is additive — add to whatever is already there
    const old_value = existing ? Number(existing.gross_qty) : 0
    const new_value = old_value + line.quantity

    if (existing) {
      const { error: corrErr } = await supabase.from('stock_corrections').insert({
        corrected_by: ACTOR,
        stock_stage: 'cuttings',
        entity_table: 'cuttings_stock_balance',
        entity_id: existing.id,
        field_corrected: 'gross_qty',
        old_value,
        new_value,
        reason: fullReason,
      })
      if (corrErr) return

      const { error: upErr } = await supabase
        .from('cuttings_stock_balance')
        .update({ gross_qty: new_value, last_updated_at: now })
        .eq('id', existing.id)
      if (upErr) return
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from('cuttings_stock_balance')
        .insert({
          shape_design_id: line.shape_design_id,
          bindi_colour_id: line.bindi_colour_id,
          size_id: line.size_id,
          gross_qty: line.quantity,
          committed_qty: 0,
          last_updated_at: now,
        })
        .select('id')
        .single()
      if (insErr || !inserted) return

      await supabase.from('stock_corrections').insert({
        corrected_by: ACTOR,
        stock_stage: 'cuttings',
        entity_table: 'cuttings_stock_balance',
        entity_id: inserted.id,
        field_corrected: 'gross_qty',
        old_value: 0,
        new_value: line.quantity,
        reason: fullReason,
      })
    }
  }))

  revalidatePath('/planning/allocation')
  revalidatePath('/operations/cutting-sessions/stock')
  return { success: `Purchased stock applied: ${nonZero.length} SKU(s) added to cuttings.` }
}

// ── Ready stock opening stock ─────────────────────────────────

type ReadyStockLine = MatrixLine & {
  dabbi_colour_id: string
  brand_id: string
}

export async function applyReadyStockOpeningStock(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const reason = (formData.get('reason') as string ?? '').trim()
  const dabbiId = (formData.get('dabbi_colour_id') as string ?? '').trim()
  const brandId = (formData.get('brand_id') as string ?? '').trim()
  const linesRaw = (formData.get('lines') as string ?? '').trim()

  if (reason.length < 3) return { error: 'Reason must be at least 3 characters.' }
  if (!dabbiId) return { error: 'Dabbi colour is required.' }
  if (!brandId) return { error: 'Brand is required.' }
  if (!linesRaw) return { error: 'No quantities entered.' }

  let lines: MatrixLine[]
  try {
    lines = JSON.parse(linesRaw)
  } catch {
    return { error: 'Invalid matrix data.' }
  }

  const nonZero = lines.filter((l) => l.quantity > 0)
  if (nonZero.length === 0) return { error: 'No non-zero quantities entered.' }

  const supabase = createServerSupabaseClient()
  const now = new Date().toISOString()
  const fullReason = `OPENING_BALANCE: ${reason}`
  const warnings: string[] = []

  await Promise.all(nonZero.map(async (line) => {
    const readyLine: ReadyStockLine = { ...line, dabbi_colour_id: dabbiId, brand_id: brandId }

    const { data: existing } = await supabase
      .from('ready_stock_balance')
      .select('id, gross_qty, committed_qty')
      .eq('shape_design_id', readyLine.shape_design_id)
      .eq('bindi_colour_id', readyLine.bindi_colour_id)
      .eq('size_id', readyLine.size_id)
      .eq('dabbi_colour_id', dabbiId)
      .eq('brand_id', brandId)
      .maybeSingle()

    const old_value = existing ? Number(existing.gross_qty) : 0
    const committed = existing ? Number(existing.committed_qty) : 0
    const newGross  = old_value + line.quantity
    // gross_qty must never fall below committed_qty — that would violate ready_committed_cannot_exceed_gross
    const safeGross = Math.max(newGross, committed)

    if (committed > newGross) {
      warnings.push(`${committed} gross is reserved for this SKU. Gross qty set to ${committed} to maintain reservation integrity.`)
    }

    if (old_value === safeGross) return

    if (existing) {
      await supabase.from('stock_corrections').insert({
        corrected_by: ACTOR,
        stock_stage: 'ready',
        entity_table: 'ready_stock_balance',
        entity_id: existing.id,
        field_corrected: 'gross_qty',
        old_value,
        new_value: safeGross,
        reason: fullReason,
      })
      const { error: upErr } = await supabase
        .from('ready_stock_balance')
        .update({ gross_qty: safeGross, last_updated_at: now })
        .eq('id', existing.id)
      if (upErr) return
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from('ready_stock_balance')
        .insert({
          shape_design_id: readyLine.shape_design_id,
          bindi_colour_id: readyLine.bindi_colour_id,
          size_id: readyLine.size_id,
          dabbi_colour_id: dabbiId,
          brand_id: brandId,
          gross_qty: line.quantity,
          committed_qty: committed,
          last_updated_at: now,
        })
        .select('id')
        .single()
      if (insErr || !inserted) return
      await supabase.from('stock_corrections').insert({
        corrected_by: ACTOR,
        stock_stage: 'ready',
        entity_table: 'ready_stock_balance',
        entity_id: inserted.id,
        field_corrected: 'gross_qty',
        old_value: 0,
        new_value: line.quantity,
        reason: fullReason,
      })
    }
  }))

  revalidatePath('/planning/allocation')
  revalidatePath('/planning/ready')
  const base = `Opening ready stock applied: ${nonZero.length} SKU(s) updated.`
  const msg = warnings.length > 0 ? `${base}\n⚠ ${warnings.join('\n⚠ ')}` : base
  return { success: msg }
}

// ── Velvet opening stock ──────────────────────────────────────

export async function applyVelvetOpeningStock(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const reason = (formData.get('reason') as string ?? '').trim()
  const qtyRaw = (formData.get('bundles') as string ?? '').trim()

  if (reason.length < 3) return { error: 'Reason must be at least 3 characters.' }
  if (!qtyRaw) return { error: 'Quantity is required.' }

  const addQty = parseFloat(qtyRaw)
  if (!Number.isFinite(addQty) || addQty <= 0) {
    return { error: 'Quantity must be a positive number.' }
  }

  const supabase = createServerSupabaseClient()
  const now = new Date().toISOString()
  const fullReason = `OPENING_BALANCE: ${reason}`

  const { data: balance } = await supabase
    .from('velvet_stock_balance')
    .select('id, bundles_on_hand')
    .eq('velvet_type', 'standard')
    .single()

  if (!balance) return { error: 'Velvet balance row not found.' }

  const oldQty = Number(balance.bundles_on_hand)
  const newQty = oldQty + addQty

  await supabase.from('stock_corrections').insert({
    corrected_by: ACTOR,
    stock_stage: 'velvet',
    entity_table: 'velvet_stock_balance',
    entity_id: balance.id,
    field_corrected: 'bundles_on_hand',
    old_value: oldQty,
    new_value: newQty,
    reason: fullReason,
  })

  const { error: upErr } = await supabase
    .from('velvet_stock_balance')
    .update({ bundles_on_hand: newQty, last_updated_at: now })
    .eq('id', balance.id)

  if (upErr) {
    return { error: `Balance update failed: ${upErr.message}. Correction record was written.` }
  }

  revalidatePath('/operations/velvet-receipts')
  revalidatePath('/planning/allocation')
  return { success: `Velvet opening stock: added ${addQty.toFixed(3)} bundles (new total: ${newQty.toFixed(3)}).` }
}
