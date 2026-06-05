import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  const publicRoutes = ['/login', '/auth/callback', '/auth/waiting']
  if (publicRoutes.some(r => pathname.startsWith(r))) {
    return supabaseResponse
  }

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Role check via service role to bypass RLS.
  // 2-second timeout: if the role table is unreachable, fail open so a DB
  // hiccup doesn't lock out all legitimate users.
  let roles: { role: string }[] = []
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2000)
    try {
      const email = (user.email ?? '').toLowerCase()
      const roleRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/user_roles?email=eq.${encodeURIComponent(email)}&is_active=eq.true&select=role`,
        {
          headers: {
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
          },
          signal: controller.signal,
        }
      )
      roles = await roleRes.json() as { role: string }[]
    } finally {
      clearTimeout(timeoutId)
    }
  } catch {
    // Timeout or network error — fail open, session is valid
    return supabaseResponse
  }

  if (!roles || roles.length === 0) {
    if (!pathname.startsWith('/auth/waiting')) {
      return NextResponse.redirect(new URL('/auth/waiting', request.url))
    }
    return supabaseResponse
  }

  const role = roles[0]?.role as string | undefined

  const adminPrefixes = ['/admin', '/masters']
  if (adminPrefixes.some(p => pathname.startsWith(p)) && role !== 'admin') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if (pathname.startsWith('/planning/allocation') &&
      role !== 'admin' && role !== 'manager') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  if ((role === 'viewer' || role === 'accountant') &&
      !pathname.startsWith('/reports') &&
      !pathname.startsWith('/dispatch') &&
      pathname !== '/') {
    return NextResponse.redirect(new URL('/reports', request.url))
  }

  if (role === 'stock_operator' && (
      pathname.startsWith('/reports') ||
      pathname.startsWith('/planning/allocation') ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/masters'))) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
