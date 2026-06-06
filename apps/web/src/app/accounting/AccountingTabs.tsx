import Link from 'next/link'

type AccountingTab = {
  href: string
  label: string
}

const TABS: AccountingTab[] = [
  { href: '/accounting/invoices', label: 'Invoices' },
  { href: '/accounting/ledger', label: 'Customer Ledger' },
  { href: '/accounting/journal', label: 'Journal' },
]

type Props = {
  active: 'invoices' | 'ledger' | 'journal'
}

export function AccountingTabs({ active }: Props) {
  return (
    <nav
      style={{
        display: 'flex',
        gap: '0.35rem',
        overflowX: 'auto',
        borderBottom: '1px solid var(--border)',
        marginBottom: '1.25rem',
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.href.endsWith(active)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0.65rem 0.85rem',
              color: isActive ? 'var(--accent-bright)' : 'var(--text-secondary)',
              borderBottom: isActive ? '2px solid var(--accent-bright)' : '2px solid transparent',
              fontSize: 'var(--text-sm)',
              fontWeight: isActive ? 800 : 650,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
