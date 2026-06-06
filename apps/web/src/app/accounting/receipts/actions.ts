'use server'

import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/lib/masters'
import { getActorId } from '@/lib/get-actor'
import { createServerSupabaseClient } from '@/lib/supabase/server'

function formString(formData: FormData, key: string): string {
  return ((formData.get(key) as string | null) ?? '').trim()
}

export async function postCustomerReceiptAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const customerId = formString(formData, 'customer_id')
  const receiptDate = formString(formData, 'receipt_date')
  const amountInput = formString(formData, 'amount')
  const mode = formString(formData, 'mode')
  const reference = formString(formData, 'reference') || null
  const notes = formString(formData, 'notes') || null

  if (!customerId) return { error: 'Customer is required' }
  if (!receiptDate) return { error: 'Receipt date is required' }

  const amount = Number(amountInput)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Amount must be greater than zero' }
  }

  if (!['cash', 'bank', 'upi', 'cheque', 'other'].includes(mode)) {
    return { error: 'Receipt mode is invalid' }
  }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()

  const { error } = await supabase.rpc('post_customer_receipt', {
    p_customer_id: customerId,
    p_receipt_date: receiptDate,
    p_amount: amount,
    p_mode: mode,
    p_reference: reference,
    p_notes: notes,
    p_actor: actor,
  } as never)

  if (error) return { error: error.message }

  revalidatePath('/accounting/receipts')
  revalidatePath('/accounting/ledger')
  revalidatePath('/accounting/journal')
  return { success: 'Receipt posted' }
}
