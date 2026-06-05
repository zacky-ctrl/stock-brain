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
  const priorityRaw = fd.get('priority_weight') as string
  const priority = parseFloat(priorityRaw)
  return updateMaster('customers', id, {
    name: fd.get('name') as string,
    priority_weight: Number.isFinite(priority) ? priority : 1,
    notes: (fd.get('notes') as string) || null,
    is_active: fd.get('is_active') === 'true',
  }, ['/masters/customers', '/planning/allocation'])
}

export async function updateLabourUnit(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const id = fd.get('id') as string
  if (!id) return { error: 'ID missing' }
  return updateMaster('labour_units', id, {
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
