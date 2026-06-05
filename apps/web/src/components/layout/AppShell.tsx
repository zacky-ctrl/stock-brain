'use client'

import { usePathname } from 'next/navigation'
import { SidebarNav } from './SidebarNav'

// Auth routes get a clean full-page render without the sidebar shell.
const AUTH_PREFIXES = ['/login', '/auth/']

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthRoute = AUTH_PREFIXES.some(p => pathname.startsWith(p))

  if (isAuthRoute) {
    return <>{children}</>
  }

  return (
    <div className="app-layout">
      <SidebarNav />
      <div className="app-main">
        {children}
      </div>
    </div>
  )
}
