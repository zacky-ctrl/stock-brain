import type { Metadata } from 'next'
import './globals.css'
import { AppShell } from '@/components/layout/AppShell'
import { SidebarNavServer } from '@/components/layout/SidebarNavServer'
import { ThemeProvider } from '@/components/ui/ThemeProvider'
import { NavigationProgress } from '@/components/layout/NavigationProgress'

export const metadata: Metadata = {
  title: 'Stock Brain',
  description: 'Production planning, stock allocation, and dispatch system for bindi manufacturing',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before paint to avoid flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('stock-brain-theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark')}catch(e){}`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <NavigationProgress />
          <AppShell sidebar={<SidebarNavServer />}>
            {children}
          </AppShell>
        </ThemeProvider>
      </body>
    </html>
  )
}
