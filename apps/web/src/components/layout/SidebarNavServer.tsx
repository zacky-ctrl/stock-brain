import { createAuthClient } from '@/lib/supabase/auth-client'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { SidebarNav } from './SidebarNav'

export async function SidebarNavServer() {
  try {
    const authClient = await createAuthClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user?.email) return <SidebarNav role={undefined} />

    const email = user.email.toLowerCase()
    const supabase = createServerSupabaseClient()
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('email', email)
      .eq('is_active', true)
      .single()

    return <SidebarNav role={data?.role ?? undefined} />
  } catch {
    return <SidebarNav role={undefined} />
  }
}
