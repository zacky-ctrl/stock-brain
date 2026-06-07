'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ActionState } from '@/lib/masters'

export async function addLabourUnit(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = (formData.get('name') as string ?? '').trim()
  const phone = (formData.get('phone') as string ?? '').trim() || null

  if (!name) return { error: 'Name is required' }

  try {
    const supabase = createServerSupabaseClient()

    // Serial number is MAX+1 — not a sequence RPC, keeps it simple and auditable
    const { data: maxRow } = await supabase
      .from('labour_units')
      .select('serial_number')
      .order('serial_number', { ascending: false })
      .limit(1)
      .single()

    const nextSerial = maxRow ? maxRow.serial_number + 1 : 1

    const { error } = await supabase.from('labour_units').insert({
      name,
      phone,
      serial_number: nextSerial,
    })
    if (error) {
      if (error.code === '23505') {
        return { error: 'Serial number already exists. Please try again.' }
      }
      return { error: error.message }
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to save' }
  }

  revalidatePath('/masters/labour-units')
  return { success: `Added: ${name}` }
}
