'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ActionState } from '@/lib/masters'

export async function addSize(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const code = (formData.get('code') as string ?? '').trim().toUpperCase()
  const rawName = (formData.get('name') as string ?? '').trim()
  const name = rawName || code
  const sortOrder = parseInt(formData.get('sort_order') as string ?? '0', 10)
  const isStandard = formData.get('is_standard') === 'on'

  if (!code) return { error: 'Code is required' }

  try {
    const supabase = createServerSupabaseClient()
    const { error } = await supabase.from('sizes').insert({
      code,
      name,
      sort_order: isNaN(sortOrder) ? 0 : sortOrder,
      is_standard: isStandard,
    })
    if (error) return { error: error.message }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to save' }
  }

  revalidatePath('/masters/sizes')
  return { success: `Added: ${name} (${code})` }
}
