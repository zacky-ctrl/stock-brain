'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  calculatePurchaseBill,
  type PurchaseLineType,
} from '@stock-brain/domain'
import { getActorId } from '@/lib/get-actor'
import type { ActionState } from '@/lib/masters'
import { createServerSupabaseClient } from '@/lib/supabase/server'

type SupplierSnapshot = {
  id: string
  name: string
  entity_name: string | null
  address: string | null
  phone_number: string | null
}

const PURCHASE_LINE_TYPES: PurchaseLineType[] = [
  'velvet',
  'direct_ready_stock',
  'direct_cuttings',
  'packaging_material',
  'expense',
]

function formString(formData: FormData, key: string): string {
  return ((formData.get(key) as string | null) ?? '').trim()
}

function optionalMoney(formData: FormData, key: string): number {
  const raw = formString(formData, key)
  if (!raw) return 0
  const value = Number(raw)
  return Number.isFinite(value) ? value : Number.NaN
}

function nullableDate(value: string): string | null {
  return value || null
}

function resolveStockStage(lineType: PurchaseLineType): 'velvet' | 'ready' | 'cuttings' | 'packaging' | 'none' {
  if (lineType === 'velvet') return 'velvet'
  if (lineType === 'direct_ready_stock') return 'ready'
  if (lineType === 'direct_cuttings') return 'cuttings'
  if (lineType === 'packaging_material') return 'packaging'
  return 'none'
}

function unitForLineType(lineType: PurchaseLineType, rawUnit: string): string {
  if (rawUnit) return rawUnit
  if (lineType === 'velvet') return 'metres'
  if (lineType === 'direct_ready_stock' || lineType === 'direct_cuttings') return 'gross'
  return 'pcs'
}

export async function createPurchaseBillAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supplierId = formString(formData, 'supplier_id')
  const purchaseDate = formString(formData, 'purchase_date')
  const dueDate = nullableDate(formString(formData, 'due_date'))
  const supplierBillNumber = formString(formData, 'supplier_bill_number') || null
  const transportCharges = optionalMoney(formData, 'transport_charges')
  const otherCharges = optionalMoney(formData, 'other_charges')
  const discountAmount = optionalMoney(formData, 'discount_amount')
  const roundOffAmount = optionalMoney(formData, 'round_off_amount')
  const notes = formString(formData, 'notes') || null

  if (!supplierId) return { error: 'Supplier is required' }
  if (!purchaseDate) return { error: 'Purchase date is required' }

  const moneyValues = [transportCharges, otherCharges, discountAmount, roundOffAmount]
  if (moneyValues.some((value) => !Number.isFinite(value))) {
    return { error: 'One of the amount fields is invalid' }
  }

  const lineIndexes = formData.getAll('line_index').map((value) => String(value))
  const parsedLines = lineIndexes.flatMap((index) => {
    const lineType = formString(formData, `line_type_${index}`) as PurchaseLineType
    const description = formString(formData, `description_${index}`)
    const quantityInput = formString(formData, `quantity_${index}`)
    const rateInput = formString(formData, `rate_per_unit_${index}`)
    const quantity = Number(quantityInput)
    const rate = Number(rateInput)

    if (!description && !quantityInput && !rateInput) return []
    if (!PURCHASE_LINE_TYPES.includes(lineType)) return []

    return [{
      formIndex: index,
      sourceLine: {
        id: `line ${Number(index) + 1}`,
        line_type: lineType,
        description,
        quantity,
        rate_per_unit: rate,
      },
    }]
  })
  const sourceLines = parsedLines.map((line) => line.sourceLine)

  const calculation = calculatePurchaseBill(sourceLines, {
    transport_charges: transportCharges,
    other_charges: otherCharges,
    discount_amount: discountAmount,
    round_off_amount: roundOffAmount,
  })

  if (!calculation.ok) return { error: calculation.error }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()
  const { data: supplierRaw, error: supplierError } = await supabase
    .from('suppliers')
    .select('id, name, entity_name, address, phone_number')
    .eq('id', supplierId)
    .single()

  if (supplierError || !supplierRaw) {
    return { error: supplierError?.message ?? 'Supplier not found' }
  }

  const supplier = supplierRaw as unknown as SupplierSnapshot
  const hasStockImpact = calculation.bill.lines.some((line) => line.line_type !== 'expense')
  const { data: billRaw, error: billError } = await supabase
    .from('purchase_bills')
    .insert({
      supplier_id: supplier.id,
      supplier_bill_number: supplierBillNumber,
      purchase_date: purchaseDate,
      due_date: dueDate,
      supplier_name_snapshot: supplier.name,
      entity_name_snapshot: supplier.entity_name,
      address_snapshot: supplier.address,
      phone_snapshot: supplier.phone_number,
      goods_amount: calculation.bill.goods_amount,
      inventory_amount: calculation.bill.inventory_amount,
      expense_amount: calculation.bill.expense_amount,
      transport_charges: calculation.bill.transport_charges,
      other_charges: calculation.bill.other_charges,
      discount_amount: calculation.bill.discount_amount,
      round_off_amount: calculation.bill.round_off_amount,
      total_amount: calculation.bill.total_amount,
      stock_impact_status: hasStockImpact ? 'pending' : 'none',
      notes,
      created_by: actor,
    })
    .select('id')
    .single()

  if (billError || !billRaw) return { error: billError?.message ?? 'Purchase bill could not be created' }

  const bill = billRaw as unknown as { id: string }
  const lineInserts = calculation.bill.lines.map((line, lineIndex) => {
    const originalIndex = parsedLines[lineIndex]?.formIndex ?? String(lineIndex)
    const unit = unitForLineType(line.line_type, formString(formData, `unit_${originalIndex}`))
    return {
      purchase_bill_id: bill.id,
      line_type: line.line_type,
      description: line.description,
      quantity: line.quantity,
      unit,
      rate_per_unit: line.rate_per_unit,
      line_amount: line.line_amount,
      stock_stage: resolveStockStage(line.line_type),
      notes: formString(formData, `line_notes_${originalIndex}`) || null,
    }
  })

  const { error: linesError } = await supabase
    .from('purchase_bill_lines')
    .insert(lineInserts)

  if (linesError) return { error: linesError.message }

  revalidatePath('/accounting/purchases')
  revalidatePath('/accounting/supplier-ledger')
  redirect(`/accounting/purchases/${bill.id}`)
}

export async function confirmPurchaseBillAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const purchaseBillId = formString(formData, 'purchase_bill_id')
  if (!purchaseBillId) return { error: 'Purchase bill is required' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()
  const { error } = await supabase.rpc('confirm_purchase_bill', {
    p_purchase_bill_id: purchaseBillId,
    p_actor: actor,
  } as never)

  if (error) return { error: error.message }

  revalidatePath('/accounting/purchases')
  revalidatePath(`/accounting/purchases/${purchaseBillId}`)
  revalidatePath('/accounting/supplier-payments')
  revalidatePath('/accounting/supplier-ledger')
  revalidatePath('/accounting/journal')
  return { success: 'Purchase bill confirmed' }
}

export async function updatePurchaseBillDraftAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const purchaseBillId = formString(formData, 'purchase_bill_id')
  const purchaseDate = formString(formData, 'purchase_date')
  const dueDate = nullableDate(formString(formData, 'due_date'))
  const transportCharges = optionalMoney(formData, 'transport_charges')
  const otherCharges = optionalMoney(formData, 'other_charges')
  const discountAmount = optionalMoney(formData, 'discount_amount')
  const roundOffAmount = optionalMoney(formData, 'round_off_amount')
  const notes = formString(formData, 'notes') || null
  const reason = formString(formData, 'reason')

  if (!purchaseBillId) return { error: 'Purchase bill is required' }
  if (!purchaseDate) return { error: 'Purchase date is required' }
  if (!reason) return { error: 'Reason is required for draft edits' }

  const moneyValues = [transportCharges, otherCharges, discountAmount, roundOffAmount]
  if (moneyValues.some((value) => !Number.isFinite(value))) {
    return { error: 'One of the amount fields is invalid' }
  }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()

  const { data: billRaw, error: billError } = await supabase
    .from('purchase_bills')
    .select('id, status, goods_amount, inventory_amount, expense_amount, transport_charges, other_charges, discount_amount, round_off_amount')
    .eq('id', purchaseBillId)
    .single()

  if (billError || !billRaw) return { error: billError?.message ?? 'Purchase bill not found' }
  const bill = billRaw as unknown as {
    status: string
    goods_amount: number | string
    inventory_amount: number | string
    expense_amount: number | string
  }
  if (bill.status !== 'draft') return { error: 'Only draft purchase bills can be edited' }

  const totalAmount = Math.round((
    Number(bill.goods_amount)
    + transportCharges
    + otherCharges
    - discountAmount
    + roundOffAmount
  ) * 100) / 100
  if (totalAmount <= 0) return { error: 'Purchase bill total must be greater than zero' }

  const { error: updateError } = await supabase
    .from('purchase_bills')
    .update({
      purchase_date: purchaseDate,
      due_date: dueDate,
      transport_charges: transportCharges,
      other_charges: otherCharges,
      discount_amount: discountAmount,
      round_off_amount: roundOffAmount,
      total_amount: totalAmount,
      notes,
    })
    .eq('id', purchaseBillId)

  if (updateError) return { error: updateError.message }

  const { error: auditError } = await supabase
    .from('purchase_bill_audit_events')
    .insert({
      purchase_bill_id: purchaseBillId,
      event_type: 'draft_edit',
      field_name: 'charges_or_dates',
      old_value: 'previous draft values',
      new_value: `total ${totalAmount}`,
      reason,
      actor_id: actor,
    })

  if (auditError) return { error: auditError.message }

  revalidatePath('/accounting/purchases')
  revalidatePath(`/accounting/purchases/${purchaseBillId}`)
  return { success: 'Draft purchase bill updated' }
}
