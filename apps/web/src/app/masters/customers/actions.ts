'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ActionState } from '@/lib/masters'

export async function addCustomer(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = (formData.get('name') as string ?? '').trim()
  const brandRule = formData.get('brand_rule') as string
  const priorityWeight = parseInt(formData.get('priority_weight') as string ?? '5', 10)
  const paymentRiskFlag = formData.get('payment_risk_flag') === 'on'
  const entityName = (formData.get('entity_name') as string ?? '').trim() || null
  const address = (formData.get('address') as string ?? '').trim() || null
  const phoneNumber = (formData.get('phone_number') as string ?? '').trim() || null
  const transportName = (formData.get('transport_name') as string ?? '').trim() || null
  const rateGroup = (formData.get('rate_group') as string ?? '').trim() || null
  const yellowRateRaw = (formData.get('yellow_rate_per_gross') as string ?? '').trim()
  const whiteRateRaw = (formData.get('white_rate_per_gross') as string ?? '').trim()

  if (!name) return { error: 'Name is required' }
  if (!brandRule) return { error: 'Brand rule is required' }

  const validRules = ['no_preference', 'prefer_nirankari', 'prefer_suhela', 'strict_nirankari', 'strict_suhela']
  if (!validRules.includes(brandRule)) return { error: 'Invalid brand rule' }

  const weight = isNaN(priorityWeight) ? 5 : Math.min(10, Math.max(1, priorityWeight))
  const yellowRate = yellowRateRaw ? Number(yellowRateRaw) : null
  const whiteRate = whiteRateRaw ? Number(whiteRateRaw) : null
  if (yellowRate !== null && !Number.isFinite(yellowRate)) return { error: 'Yellow rate is invalid' }
  if (whiteRate !== null && !Number.isFinite(whiteRate)) return { error: 'White rate is invalid' }

  try {
    const supabase = createServerSupabaseClient()
    const { error } = await supabase.from('customers').insert({
      name,
      entity_name: entityName,
      address,
      phone_number: phoneNumber,
      transport_name: transportName,
      rate_group: rateGroup,
      yellow_rate_per_gross: yellowRate,
      white_rate_per_gross: whiteRate,
      brand_rule: brandRule,
      priority_weight: weight,
      payment_risk_flag: paymentRiskFlag,
    })
    if (error) return { error: error.message }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to save' }
  }

  revalidatePath('/masters/customers')
  return { success: `Added: ${name}` }
}
