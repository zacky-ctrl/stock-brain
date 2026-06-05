// Magic link PKCE callback — no longer used for login.
// Kept to avoid broken references; redirects safely to home.
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url)
  return NextResponse.redirect(`${origin}/`)
}
