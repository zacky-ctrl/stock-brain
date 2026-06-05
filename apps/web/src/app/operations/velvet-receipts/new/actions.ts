'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getActorId } from '@/lib/get-actor'
import { recordVelvetReceipt, METRES_PER_BUNDLE } from '@stock-brain/domain'
import { createSupabaseVelvetReceiptStore } from '@/lib/velvet-receipt-store'
import type { ActionState } from '@/lib/masters'

export async function recordVelvetReceiptAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const receiptDate = (formData.get('receipt_date') as string ?? '').trim()
  const unit = (formData.get('unit') as string ?? 'bundles').trim()
  const rawValue = parseFloat((formData.get('quantity') as string ?? '').trim())
  const supplier = (formData.get('supplier') as string ?? '').trim() || null
  const reference = (formData.get('reference') as string ?? '').trim() || null
  const notes = (formData.get('notes') as string ?? '').trim() || null
  const bindiColourId = (formData.get('bindi_colour_id') as string ?? '').trim()

  if (!receiptDate) return { error: 'Receipt date is required' }
  if (!bindiColourId) return { error: 'Velvet colour is required' }
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return { error: 'Quantity must be greater than zero' }
  }

  // Primary unit is metres. Calculate both.
  const metresReceived = unit === 'bundles' ? rawValue * METRES_PER_BUNDLE : rawValue
  const bundlesReceived = metresReceived / METRES_PER_BUNDLE

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()
  const store = createSupabaseVelvetReceiptStore(supabase)

  const result = await recordVelvetReceipt(
    { receipt_date: receiptDate, metres_received: metresReceived, bundles_received: bundlesReceived, supplier, reference, notes, bindi_colour_id: bindiColourId, actor },
    store,
  )

  if (!result.success) return { error: result.error }

  revalidatePath('/operations/velvet-receipts')
  revalidatePath('/operations/velvet-receipts/stock')
  redirect('/operations/velvet-receipts')
}
