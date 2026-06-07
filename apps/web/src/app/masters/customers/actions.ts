'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ActionState } from '@/lib/masters'

type CustomerInsert = {
  name: string
  entity_name: string | null
  address: string | null
  phone_number: string | null
  transport_name: string | null
  default_dabbi_colour_id?: string | null
  yellow_rate_per_gross: number | null
  white_rate_per_gross: number | null
  brand_rule: string
  priority_weight: number
  payment_risk_flag: boolean
}

type CustomerDuplicateRow = {
  id: string
  name: string
  entity_name: string | null
  address: string | null
  phone_number: string | null
}

function isMissingDefaultDabbiColumn(message: string): boolean {
  return message.includes('default_dabbi_colour_id')
}

function digitCount(value: string | null): number {
  return value?.replace(/\D/g, '').length ?? 0
}

function normalizeCustomerText(value: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

async function findDuplicateCustomer({
  supabase,
  name,
  entityName,
  address,
  phoneNumber,
}: {
  supabase: ReturnType<typeof createServerSupabaseClient>
  name: string
  entityName: string | null
  address: string | null
  phoneNumber: string | null
}): Promise<CustomerDuplicateRow | null> {
  const { data } = await supabase
    .from('customers')
    .select('id, name, entity_name, address, phone_number')
    .limit(1000)

  const normalizedName = normalizeCustomerText(name)
  const normalizedEntity = normalizeCustomerText(entityName)
  const normalizedAddress = normalizeCustomerText(address)
  const normalizedPhone = phoneNumber?.replace(/\D/g, '') ?? ''

  return ((data ?? []) as unknown as CustomerDuplicateRow[]).find((customer) => {
    const samePhone = normalizedPhone.length >= 10 && customer.phone_number?.replace(/\D/g, '') === normalizedPhone
    const sameIdentity = normalizeCustomerText(customer.name) === normalizedName
      && normalizeCustomerText(customer.entity_name) === normalizedEntity
      && normalizeCustomerText(customer.address) === normalizedAddress

    return samePhone || sameIdentity
  }) ?? null
}

export async function addCustomer(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = (formData.get('name') as string ?? '').trim()
  const brandRule = formData.get('brand_rule') as string
  const paymentRiskFlag = formData.get('payment_risk_flag') === 'on'
  const entityName = (formData.get('entity_name') as string ?? '').trim() || null
  const address = (formData.get('address') as string ?? '').trim() || null
  const phoneNumber = (formData.get('phone_number') as string ?? '').trim() || null
  const transportName = (formData.get('transport_name') as string ?? '').trim() || null
  const defaultDabbiColourId = (formData.get('default_dabbi_colour_id') as string ?? '').trim() || null
  const yellowRateRaw = (formData.get('yellow_rate_per_gross') as string ?? '').trim()
  const whiteRateRaw = (formData.get('white_rate_per_gross') as string ?? '').trim()

  if (!name) return { error: 'Name is required' }
  if (!brandRule) return { error: 'Brand rule is required' }
  if (phoneNumber && digitCount(phoneNumber) < 10) return { error: 'Phone number must have at least 10 digits' }

  const validRules = ['no_preference', 'prefer_nirankari', 'prefer_suhela', 'strict_nirankari', 'strict_suhela']
  if (!validRules.includes(brandRule)) return { error: 'Invalid brand rule' }

  const yellowRate = yellowRateRaw ? Number(yellowRateRaw) : null
  const whiteRate = whiteRateRaw ? Number(whiteRateRaw) : null
  if (yellowRate !== null && !Number.isFinite(yellowRate)) return { error: 'Yellow rate is invalid' }
  if (whiteRate !== null && !Number.isFinite(whiteRate)) return { error: 'White rate is invalid' }

  try {
    const supabase = createServerSupabaseClient()
    const duplicate = await findDuplicateCustomer({ supabase, name, entityName, address, phoneNumber })
    if (duplicate) return { error: `Customer already exists: ${duplicate.name}` }

    const payload: CustomerInsert = {
      name,
      entity_name: entityName,
      address,
      phone_number: phoneNumber,
      transport_name: transportName,
      default_dabbi_colour_id: defaultDabbiColourId,
      yellow_rate_per_gross: yellowRate,
      white_rate_per_gross: whiteRate,
      brand_rule: brandRule,
      priority_weight: 5,
      payment_risk_flag: paymentRiskFlag,
    }
    const { error } = await supabase.from('customers').insert(payload)
    if (error && isMissingDefaultDabbiColumn(error.message)) {
      const legacyPayload: Omit<CustomerInsert, 'default_dabbi_colour_id'> = {
        name: payload.name,
        entity_name: payload.entity_name,
        address: payload.address,
        phone_number: payload.phone_number,
        transport_name: payload.transport_name,
        yellow_rate_per_gross: payload.yellow_rate_per_gross,
        white_rate_per_gross: payload.white_rate_per_gross,
        brand_rule: payload.brand_rule,
        priority_weight: payload.priority_weight,
        payment_risk_flag: payload.payment_risk_flag,
      }
      const retry = await supabase.from('customers').insert(legacyPayload)
      if (retry.error) return { error: retry.error.message }
    } else if (error) {
      return { error: error.message }
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to save' }
  }

  revalidatePath('/masters/customers')
  revalidatePath('/orders/new')
  return { success: `Added: ${name}` }
}
