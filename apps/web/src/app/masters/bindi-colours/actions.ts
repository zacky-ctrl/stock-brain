'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ActionState } from '@/lib/masters'

export async function addBindiColour(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const code = (formData.get('code') as string ?? '').trim().toUpperCase()
  const name = (formData.get('name') as string ?? '').trim()
  const sortOrder = parseInt(formData.get('sort_order') as string ?? '0', 10)

  if (!code) return { error: 'Code is required' }
  if (!name) return { error: 'Name is required' }

  try {
    const supabase = createServerSupabaseClient()
    const { error } = await supabase.from('bindi_colours').insert({
      code,
      name,
      sort_order: isNaN(sortOrder) ? 0 : sortOrder,
    })
    if (error) return { error: error.message }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to save' }
  }

  revalidatePath('/masters/bindi-colours')
  return { success: `Added: ${name} (${code})` }
}
