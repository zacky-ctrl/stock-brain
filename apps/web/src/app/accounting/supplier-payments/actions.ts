'use server'

import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/lib/masters'
import { getActorId } from '@/lib/get-actor'
import { createServerSupabaseClient } from '@/lib/supabase/server'

type SupplierPaymentAllocationInput = {
  bill_id: string
  amount: number
}

function formString(formData: FormData, key: string): string {
  return ((formData.get(key) as string | null) ?? '').trim()
}

export async function postSupplierPaymentAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supplierId = formString(formData, 'supplier_id')
  const paymentDate = formString(formData, 'payment_date')
  const amountInput = formString(formData, 'amount')
  const mode = formString(formData, 'mode')
  const reference = formString(formData, 'reference') || null
  const notes = formString(formData, 'notes') || null
  const billIds = formData.getAll('allocation_bill_id')

  if (!supplierId) return { error: 'Supplier is required' }
  if (!paymentDate) return { error: 'Payment date is required' }

  const amount = Number(amountInput)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Amount must be greater than zero' }
  }

  if (!['cash', 'bank', 'upi', 'cheque', 'other'].includes(mode)) {
    return { error: 'Payment mode is invalid' }
  }

  const allocationByBill = new Map<string, number>()
  for (const rawBillId of billIds) {
    const billId = String(rawBillId)
    const allocationAmountInput = formString(formData, `allocation_amount_${billId}`)
    if (!allocationAmountInput) continue

    const allocationAmount = Number(allocationAmountInput)
    if (!Number.isFinite(allocationAmount) || allocationAmount < 0) {
      return { error: 'One of the bill allocation amounts is invalid' }
    }
    if (allocationAmount > 0) {
      allocationByBill.set(billId, (allocationByBill.get(billId) ?? 0) + allocationAmount)
    }
  }

  const allocations: SupplierPaymentAllocationInput[] = [...allocationByBill.entries()].map(([billId, allocationAmount]) => ({
    bill_id: billId,
    amount: Math.round(allocationAmount * 100) / 100,
  }))
  const allocatedTotal = allocations.reduce((total, allocation) => total + allocation.amount, 0)
  if (Math.round(allocatedTotal * 100) / 100 > Math.round(amount * 100) / 100) {
    return { error: 'Bill allocation cannot be more than payment amount' }
  }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()

  const { error } = await supabase.rpc('post_supplier_payment', {
    p_supplier_id: supplierId,
    p_payment_date: paymentDate,
    p_amount: amount,
    p_mode: mode,
    p_reference: reference,
    p_notes: notes,
    p_actor: actor,
    p_allocations: allocations,
  } as never)

  if (error) return { error: error.message }

  revalidatePath('/accounting/supplier-payments')
  revalidatePath('/accounting/supplier-ledger')
  revalidatePath('/accounting/journal')
  return { success: 'Supplier payment posted' }
}

export async function voidSupplierPaymentAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const paymentId = formString(formData, 'payment_id')
  const reason = formString(formData, 'void_reason')

  if (!paymentId) return { error: 'Payment is required' }
  if (!reason) return { error: 'Void reason is required' }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()

  const { error } = await supabase.rpc('void_supplier_payment', {
    p_payment_id: paymentId,
    p_actor: actor,
    p_reason: reason,
  } as never)

  if (error) return { error: error.message }

  revalidatePath('/accounting/supplier-payments')
  revalidatePath('/accounting/supplier-ledger')
  revalidatePath('/accounting/journal')
  return { success: 'Supplier payment voided' }
}
