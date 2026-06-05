import { createAuthClient } from './supabase/auth-client'

export async function getActorId(): Promise<string> {
  try {
    const supabase = await createAuthClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.id) return user.id
  } catch {}

  return process.env.DEV_ACTOR_ID ?? '00000000-0000-0000-0000-000000000001'
}
