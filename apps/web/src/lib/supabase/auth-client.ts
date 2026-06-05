// Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.
// This client uses the anon key and manages user sessions via cookies.
// Intentionally separate from createServerSupabaseClient (service role, no session).
// Server-side only — never import this in 'use client' files.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createAuthClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )
}
