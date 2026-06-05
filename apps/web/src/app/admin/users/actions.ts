'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { ActionState } from '@/lib/masters'

export async function assignUserRoleAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = (formData.get('email') as string ?? '').trim().toLowerCase()
  const role = (formData.get('role') as string ?? '').trim()

  if (!email) return { error: 'Email is required' }
  if (!['admin', 'manager', 'viewer'].includes(role)) return { error: 'Invalid role' }

  const supabase = createServerSupabaseClient()

  const { error } = await supabase
    .from('user_roles')
    .upsert(
      { email, role, is_active: true, assigned_at: new Date().toISOString() },
      { onConflict: 'email' },
    )

  if (error) return { error: `Failed to assign role: ${error.message}` }

  revalidatePath('/admin/users')
  return { success: `Role '${role}' assigned to ${email}.` }
}

export async function revokeUserRoleAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = (formData.get('email') as string ?? '').trim().toLowerCase()
  if (!email) return { error: 'Email is required' }

  const supabase = createServerSupabaseClient()

  const { error } = await supabase
    .from('user_roles')
    .update({ is_active: false })
    .eq('email', email)

  if (error) return { error: `Failed to revoke access: ${error.message}` }

  revalidatePath('/admin/users')
  return { success: `Access revoked for ${email}.` }
}
