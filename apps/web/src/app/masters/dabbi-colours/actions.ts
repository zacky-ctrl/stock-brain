'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ActionState } from '@/lib/masters'

export async function addDabbiColour(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const code = (formData.get('code') as string ?? '').trim().toUpperCase()
  const name = (formData.get('name') as string ?? '').trim()

  if (!code) return { error: 'Code is required' }
  if (!name) return { error: 'Name is required' }

  try {
    const supabase = createServerSupabaseClient()
    const { error } = await supabase.from('dabbi_colours').insert({ code, name })
    if (error) return { error: error.message }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to save' }
  }

  revalidatePath('/masters/dabbi-colours')
  return { success: `Added: ${name} (${code})` }
}
