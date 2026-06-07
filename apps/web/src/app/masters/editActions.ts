'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ActionState } from '@/lib/masters'

// Generic helper — no audit trail required for master reference data edits.
async function updateMaster(
  table: string,
  id: string,
  updates: Record<string, unknown>,
  revalidatePaths: string[],
): Promise<ActionState> {
  const supabase = createServerSupabaseClient()
  const { error } = await supabase.from(table).update(updates).eq('id', id)
  if (error) return { error: error.message }
  revalidatePaths.forEach((p) => revalidatePath(p))
  return { success: 'Updated.' }
}

function isMissingDefaultDabbiColumn(message: string): boolean {
  return message.includes('default_dabbi_colour_id')
}

type CustomerDuplicateRow = {
  id: string
  name: string
  entity_name: string | null
  address: string | null
  phone_number: string | null
}

function digitCount(value: string | null): number {
  return value?.replace(/\D/g, '').length ?? 0
}

function normalizeCustomerText(value: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

async function findDuplicateCustomer({
  supabase,
  id,
  name,
  entityName,
  address,
  phoneNumber,
}: {
  supabase: ReturnType<typeof createServerSupabaseClient>
  id: string
  name: string
  entityName: string | null
  address: string | null
  phoneNumber: string | null
}): Promise<CustomerDuplicateRow | null> {
  const { data } = await supabase
    .from('customers')
    .select('id, name, entity_name, address, phone_number')
    .neq('id', id)
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

export async function updateShapeDesign(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = fd.get('id') as string
  if (!id) return { error: 'ID missing' }
  return updateMaster('shape_designs', id, {
    name: fd.get('name') as string,
    code: fd.get('code') as string,
    sort_order: parseInt(fd.get('sort_order') as string) || 0,
    is_active: fd.get('is_active') === 'true',
  }, ['/masters/shape-designs'])
}

export async function updateBindiColour(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = fd.get('id') as string
  if (!id) return { error: 'ID missing' }
  return updateMaster('bindi_colours', id, {
    name: fd.get('name') as string,
    code: fd.get('code') as string,
    sort_order: parseInt(fd.get('sort_order') as string) || 0,
    is_active: fd.get('is_active') === 'true',
  }, ['/masters/bindi-colours'])
}

export async function updateSize(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = fd.get('id') as string
  if (!id) return { error: 'ID missing' }
  return updateMaster('sizes', id, {
    name: fd.get('name') as string,
    code: fd.get('code') as string,
    sort_order: parseInt(fd.get('sort_order') as string) || 0,
    is_active: fd.get('is_active') === 'true',
  }, ['/masters/sizes'])
}

export async function updateBrand(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = fd.get('id') as string
  if (!id) return { error: 'ID missing' }
  return updateMaster('brands', id, {
    name: fd.get('name') as string,
    code: fd.get('code') as string,
    is_active: fd.get('is_active') === 'true',
  }, ['/masters/brands'])
}

export async function updateDabbiColour(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = fd.get('id') as string
  if (!id) return { error: 'ID missing' }
  return updateMaster('dabbi_colours', id, {
    name: fd.get('name') as string,
    code: fd.get('code') as string,
    sort_order: parseInt(fd.get('sort_order') as string) || 0,
    is_active: fd.get('is_active') === 'true',
  }, ['/masters/dabbi-colours'])
}

export async function updateCustomer(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = fd.get('id') as string
  if (!id) return { error: 'ID missing' }
  const name = (fd.get('name') as string ?? '').trim()
  const entityName = (fd.get('entity_name') as string ?? '').trim() || null
  const address = (fd.get('address') as string ?? '').trim() || null
  const phoneNumber = (fd.get('phone_number') as string ?? '').trim() || null
  const transportName = (fd.get('transport_name') as string ?? '').trim() || null
  const yellowRateRaw = (fd.get('yellow_rate_per_gross') as string ?? '').trim()
  const whiteRateRaw = (fd.get('white_rate_per_gross') as string ?? '').trim()
  const yellowRate = yellowRateRaw ? Number(yellowRateRaw) : null
  const whiteRate = whiteRateRaw ? Number(whiteRateRaw) : null
  if (!name) return { error: 'Name is required' }
  if (phoneNumber && digitCount(phoneNumber) < 10) return { error: 'Phone number must have at least 10 digits' }
  if (yellowRate !== null && !Number.isFinite(yellowRate)) return { error: 'Yellow rate is invalid' }
  if (whiteRate !== null && !Number.isFinite(whiteRate)) return { error: 'White rate is invalid' }
  const supabase = createServerSupabaseClient()
  const duplicate = await findDuplicateCustomer({ supabase, id, name, entityName, address, phoneNumber })
  if (duplicate) return { error: `Customer already exists: ${duplicate.name}` }

  const updates = {
    name,
    entity_name: entityName,
    address,
    phone_number: phoneNumber,
    transport_name: transportName,
    default_dabbi_colour_id: (fd.get('default_dabbi_colour_id') as string) || null,
    yellow_rate_per_gross: yellowRate,
    white_rate_per_gross: whiteRate,
    brand_rule: (fd.get('brand_rule') as string) || 'no_preference',
    payment_risk_flag: fd.get('payment_risk_flag') === 'true',
    notes: (fd.get('notes') as string) || null,
    is_active: fd.get('is_active') === 'true',
  }

  const result = await updateMaster('customers', id, updates, ['/masters/customers', '/orders/new', '/planning/allocation'])
  if (!result || !('error' in result) || !isMissingDefaultDabbiColumn(result.error)) return result

  const legacyUpdates = {
    name: updates.name,
    entity_name: updates.entity_name,
    address: updates.address,
    phone_number: updates.phone_number,
    transport_name: updates.transport_name,
    yellow_rate_per_gross: updates.yellow_rate_per_gross,
    white_rate_per_gross: updates.white_rate_per_gross,
    brand_rule: updates.brand_rule,
    payment_risk_flag: updates.payment_risk_flag,
    notes: updates.notes,
    is_active: updates.is_active,
  }
  return updateMaster('customers', id, legacyUpdates, ['/masters/customers', '/orders/new', '/planning/allocation'])
}

export async function updateLabourUnit(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = fd.get('id') as string
  if (!id) return { error: 'ID missing' }

  const serialRaw = (fd.get('serial_number') as string ?? '').trim()
  const serial = parseInt(serialRaw, 10)
  if (!serialRaw || !Number.isInteger(serial) || serial < 1) {
    return { error: 'Serial number must be a positive integer.' }
  }

  const supabase = createServerSupabaseClient()

  const { data: conflict } = await supabase
    .from('labour_units')
    .select('id')
    .eq('serial_number', serial)
    .neq('id', id)
    .maybeSingle()

  if (conflict) {
    return { error: 'Serial number already exists for another labour unit.' }
  }

  return updateMaster('labour_units', id, {
    serial_number: serial,
    name: fd.get('name') as string,
    notes: (fd.get('notes') as string) || null,
    is_active: fd.get('is_active') === 'true',
  }, ['/masters/labour-units'])
}

export async function updateMachine(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = fd.get('id') as string
  if (!id) return { error: 'ID missing' }
  return updateMaster('machines', id, {
    name: fd.get('name') as string,
    machine_number: fd.get('machine_number') as string,
    operator_name: (fd.get('operator_name') as string) || null,
    location: (fd.get('location') as string) || null,
    notes: (fd.get('notes') as string) || null,
    is_active: fd.get('is_active') === 'true',
  }, ['/masters/machines'])
}
