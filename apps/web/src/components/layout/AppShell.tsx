'use client'

import { usePathname } from 'next/navigation'

// Auth routes get a clean full-page render without the sidebar shell.
const AUTH_PREFIXES = ['/login', '/auth/']

export function AppShell({
  children,
  sidebar,
}: {
  children: React.ReactNode
  sidebar: React.ReactNode
}) {
  const pathname = usePathname()
  const isAuthRoute = AUTH_PREFIXES.some(p => pathname.startsWith(p))

  if (isAuthRoute) {
    return <>{children}</>
  }

  return (
    <div className="app-layout">
      {sidebar}
      <div className="app-main">
        {children}
      </div>
    </div>
  )
}
