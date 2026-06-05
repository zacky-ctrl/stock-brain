'use client'

import { usePathname } from 'next/navigation'

const MASTERS = [
  { href: '/masters/shape-designs', label: 'Shapes' },
  { href: '/masters/bindi-colours', label: 'Bindi Colours' },
  { href: '/masters/sizes', label: 'Sizes' },
  { href: '/masters/brands', label: 'Brands' },
  { href: '/masters/dabbi-colours', label: 'Dabbi Colours' },
  { href: '/masters/customers', label: 'Customers' },
  { href: '/masters/labour-units', label: 'Labour Units' },
  { href: '/masters/machines', label: 'Machines' },
  { href: '/masters/velvet-rates', label: 'Velvet Rates' },
]

export default function MastersLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 45px)' }}>
      <nav
        style={{
          width: '160px',
          flexShrink: 0,
          borderRight: '1px solid var(--border-subtle)',
          padding: '1rem 0',
          background: 'var(--bg-surface)',
        }}
      >
        <p
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            margin: '0 0 0.5rem 1rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Masters
        </p>
        {MASTERS.map(({ href, label }) => {
          const active = pathname === href
          return (
            <a
              key={href}
              href={href}
              style={{
                display: 'block',
                padding: '0.35rem 1rem',
                fontSize: 'var(--text-sm)',
                textDecoration: 'none',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                background: active ? 'var(--accent-subtle)' : 'transparent',
                fontWeight: active ? 600 : 'normal',
                borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
              }}
            >
              {label}
            </a>
          )
        })}
      </nav>
      <main style={{ flex: 1, padding: '1.5rem 2rem' }}>{children}</main>
    </div>
  )
}
