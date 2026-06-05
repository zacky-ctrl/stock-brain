import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase client.
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS.
 * RLS is enabled on all tables but has no policies yet (Phase 3).
 * The anon key with RLS enabled and no policies returns 0 rows,
 * which would make the healthcheck silently misleading.
 *
 * This client must only be instantiated in server-side code:
 * Server Components, Route Handlers, Server Actions.
 * Never import this in 'use client' files.
 */
export function createServerSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase env vars not set. Add NEXT_PUBLIC_SUPABASE_URL and ' +
        'SUPABASE_SERVICE_ROLE_KEY to .env.local.'
    )
  }

  return createClient(url, serviceKey, {
    auth: {
      // Service role client does not need session management
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
