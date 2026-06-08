'use server'

import { revalidatePath } from 'next/cache'
import { getActorId } from '@/lib/get-actor'
import type { ActionState } from '@/lib/masters'
import { createServerSupabaseClient } from '@/lib/supabase/server'

function formString(formData: FormData, key: string): string {
  return ((formData.get(key) as string | null) ?? '').trim()
}

function optionalNumber(formData: FormData, key: string): number {
  const raw = formString(formData, key)
  if (!raw) return 0
  const value = Number(raw)
  return Number.isFinite(value) ? value : Number.NaN
}

function validatePhone(phone: string): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 10) return 'Phone number must have at least 10 digits'
  return null
}

export async function createSupplierAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = formString(formData, 'name')
  const entityName = formString(formData, 'entity_name') || null
  const address = formString(formData, 'address') || null
  const phoneNumber = formString(formData, 'phone_number') || null
  const paymentTermsDays = optionalNumber(formData, 'payment_terms_days')
  const notes = formString(formData, 'notes') || null

  if (!name) return { error: 'Supplier name is required' }
  if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0) {
    return { error: 'Payment terms must be zero or more days' }
  }
  const phoneError = validatePhone(phoneNumber ?? '')
  if (phoneError) return { error: phoneError }

  const supabase = createServerSupabaseClient()
  const actor = await getActorId()
  const { error } = await supabase
    .from('suppliers')
    .insert({
      name,
      entity_name: entityName,
      address,
      phone_number: phoneNumber,
      payment_terms_days: paymentTermsDays,
      notes,
      created_by: actor,
    })

  if (error) return { error: error.message }

  revalidatePath('/accounting/suppliers')
  revalidatePath('/accounting/purchases')
  revalidatePath('/accounting/supplier-payments')
  return { success: 'Supplier added' }
}

export async function updateSupplierAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supplierId = formString(formData, 'supplier_id')
  const name = formString(formData, 'name')
  const entityName = formString(formData, 'entity_name') || null
  const address = formString(formData, 'address') || null
  const phoneNumber = formString(formData, 'phone_number') || null
  const paymentTermsDays = optionalNumber(formData, 'payment_terms_days')
  const notes = formString(formData, 'notes') || null
  const isActive = formString(formData, 'is_active') === 'true'

  if (!supplierId) return { error: 'Supplier is required' }
  if (!name) return { error: 'Supplier name is required' }
  if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0) {
    return { error: 'Payment terms must be zero or more days' }
  }
  const phoneError = validatePhone(phoneNumber ?? '')
  if (phoneError) return { error: phoneError }

  const supabase = createServerSupabaseClient()
  const { error } = await supabase
    .from('suppliers')
    .update({
      name,
      entity_name: entityName,
      address,
      phone_number: phoneNumber,
      payment_terms_days: paymentTermsDays,
      notes,
      is_active: isActive,
    })
    .eq('id', supplierId)

  if (error) return { error: error.message }

  revalidatePath('/accounting/suppliers')
  revalidatePath('/accounting/purchases')
  revalidatePath('/accounting/supplier-payments')
  revalidatePath('/accounting/supplier-ledger')
  return { success: 'Supplier updated' }
}
