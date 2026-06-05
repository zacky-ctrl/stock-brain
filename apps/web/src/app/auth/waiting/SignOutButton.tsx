'use client'

import { createSupabaseBrowserClient } from '@/lib/supabase/browser-client'
import { useRouter } from 'next/navigation'
import { btnPrimary } from '@/lib/ui'

export function SignOutButton() {
  const router = useRouter()

  const supabase = createSupabaseBrowserClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      style={{
        ...btnPrimary,
        marginTop: 0,
        minHeight: '44px',
        padding: '0.6rem 1.5rem',
      }}
    >
      Sign out
    </button>
  )
}
