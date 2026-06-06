'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'

type Tab = 'drafts' | 'invoices'

const TABS: { id: Tab; label: string }[] = [
  { id: 'drafts', label: 'Drafts' },
  { id: 'invoices', label: 'Invoices' },
]

export function InvoicesTabs({
  activeTab,
  counts,
}: {
  activeTab: Tab
  counts: Record<Tab, number>
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function buildHref(tab: Tab): string {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    return `${pathname}?${params.toString()}`
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.25rem',
        borderBottom: '2px solid var(--border-subtle)',
        marginBottom: '1.5rem',
      }}
    >
      {TABS.map((t) => {
        const isActive = t.id === activeTab
        return (
          <Link
            key={t.id}
            href={buildHref(t.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.6rem 1rem',
              fontSize: 'var(--text-sm)',
              fontWeight: isActive ? 700 : 500,
              color: isActive ? 'var(--accent-bright)' : 'var(--text-secondary)',
              borderBottom: isActive
                ? '2px solid var(--accent-bright)'
                : '2px solid transparent',
              marginBottom: '-2px',
              textDecoration: 'none',
              transition: 'color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
            {counts[t.id] > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '1.25rem',
                  height: '1.25rem',
                  padding: '0 0.3rem',
                  borderRadius: '999px',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  background: isActive ? 'var(--accent-bright)' : 'var(--border-strong)',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {counts[t.id]}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
