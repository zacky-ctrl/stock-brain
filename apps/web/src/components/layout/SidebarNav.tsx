'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { BrandCredit } from './BrandCredit'
import {
  ShoppingCart,
  Scissors,
  Package,
  Users,
  Truck,
  LayoutDashboard,
  ClipboardList,
  AlertTriangle,
  Archive,
  Clock,
  Lock,
  BarChart2,
  Settings,
  Shield,
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  Grid3X3,
  X,
  FileText,
  ReceiptText,
  TrendingUp,
  Layers,
  UserCheck,
  TimerReset,
  ArrowLeftRight,
  Zap,
  Brain,
  History,
  PackagePlus,
} from 'lucide-react'
import { ThemeToggle } from '@/components/ui/ThemeToggle'

type NavItem = {
  href: string
  label: string
  icon: LucideIcon
}

type NavSection = {
  label: string
  items: NavItem[]
}

type Props = {
  role?: string
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'DAILY',
    items: [
      { href: '/orders',                    label: 'Orders',           icon: ShoppingCart },
      { href: '/dispatch',                  label: 'Dispatch',         icon: Truck },
      { href: '/planning/labour-issue',     label: 'Labour Issue',     icon: ClipboardList },
      { href: '/planning/cutting-required', label: 'Cutting Required', icon: AlertTriangle },
    ],
  },
  {
    label: 'STOCK',
    items: [
      { href: '/planning/allocation',         label: 'Plan',        icon: LayoutDashboard },
      { href: '/planning/ready',              label: 'Ready Stock', icon: Archive },
      { href: '/planning/wip',                label: 'WIP',         icon: Clock },
      { href: '/operations/cutting-sessions', label: 'Cuttings',    icon: Scissors },
      { href: '/operations/velvet-receipts',  label: 'Velvet',      icon: Package },
      { href: '/operations/labour-jobs',      label: 'Labour',      icon: Users },
      { href: '/admin/reservations',          label: 'Reserves',    icon: Lock },
    ],
  },
  {
    label: 'REPORTS',
    items: [
      { href: '/reports',                     label: 'All Reports',      icon: BarChart2 },
      { href: '/reports/stock-position',      label: 'Stock Position',   icon: Layers },
      { href: '/reports/orders-aging',        label: 'Orders Aging',     icon: TimerReset },
      { href: '/reports/production-pipeline', label: 'Pipeline',         icon: TrendingUp },
      { href: '/reports/labour-performance',  label: 'Labour Perf.',     icon: UserCheck },
      { href: '/reports/customer-summary',    label: 'Customer Summary', icon: Users },
      { href: '/reports/dispatch-history',    label: 'Dispatch History', icon: History },
      { href: '/reports/shortage-summary',    label: 'Shortage Summary', icon: Zap },
      { href: '/reports/stock-movement',      label: 'Stock Movement',   icon: ArrowLeftRight },
      { href: '/reports/fulfilment',          label: 'Fulfilment',       icon: FileText },
      { href: '/reports/ai-strategy',         label: 'AI Strategy',      icon: Brain },
    ],
  },
  {
    label: 'ACCOUNTING',
    items: [
      { href: '/accounting/invoices', label: 'Invoices', icon: ReceiptText },
    ],
  },
  {
    label: 'SETTINGS',
    items: [
      { href: '/masters',                  label: 'Masters',           icon: Settings },
      { href: '/admin/opening-stock',      label: 'Opening Stock',     icon: PackagePlus },
      { href: '/admin/planning-overrides', label: 'Planning Override', icon: Shield },
      { href: '/admin/stock-correction',   label: 'Stock Correction',  icon: Shield },
      { href: '/admin/users',              label: 'Users',             icon: UserCheck },
      { href: '/admin/audit',              label: 'Audit Trail',       icon: Activity },
    ],
  },
]

const MOBILE_TABS: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/planning/allocation', label: 'Plan', icon: LayoutDashboard },
  { href: '/dispatch', label: 'Dispatch', icon: Truck },
]

const ROLE_SECTIONS: Record<string, string[]> = {
  admin: ['DAILY', 'STOCK', 'REPORTS', 'ACCOUNTING', 'SETTINGS'],
  manager: ['DAILY', 'STOCK', 'REPORTS', 'ACCOUNTING'],
  stock_operator: ['DAILY', 'STOCK'],
  accountant: ['REPORTS', 'ACCOUNTING'],
  viewer: ['REPORTS'],
}

function getVisibleSections(role?: string): NavSection[] {
  if (!role) return NAV_SECTIONS

  const sectionLabels = ROLE_SECTIONS[role] ?? ['DAILY', 'STOCK', 'REPORTS', 'ACCOUNTING', 'SETTINGS']

  return NAV_SECTIONS
    .filter((section) => sectionLabels.includes(section.label))
    .map((section) => ({
      ...section,
      items: role === 'stock_operator' && section.label === 'STOCK'
        ? section.items.filter((item) =>
            item.href !== '/planning/allocation' &&
            item.href !== '/admin/reservations')
        : section.items,
    }))
}

export function SidebarNav({ role }: Props) {
  const [collapsed, setCollapsed] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => ({
    DAILY: true,
    STOCK: false,
    REPORTS: false,
    ACCOUNTING: false,
    SETTINGS: false,
  }))
  const pathname = usePathname()
  const visibleSections = getVisibleSections(role)
  const visibleItems = visibleSections.flatMap((section) => section.items)
  const visibleHrefs = new Set(visibleItems.map((item) => item.href))
  const mobileTabs = MOBILE_TABS.filter((item) => item.href === '/' || visibleHrefs.has(item.href))

  const isExpanded = !collapsed || hovered

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }

  function toggleSection(label: string) {
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }))
  }

  return (
    <>
      {/* ── Desktop Sidebar ─────────────────────────────────── */}
      <aside
        className={`app-sidebar${!isExpanded ? ' collapsed' : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Logo */}
        <div
          style={{
            padding: !isExpanded ? '1.1rem 0' : '1.1rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: !isExpanded ? 'center' : 'flex-start',
            borderBottom: '1px solid var(--border-subtle)',
            flexShrink: 0,
          }}
        >
          <Link
            href="/"
            style={{
              fontSize: !isExpanded ? '1.1rem' : 'var(--text-lg)',
              fontWeight: 800,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              background: 'linear-gradient(135deg, var(--accent-bright), var(--success))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.02em',
            }}
          >
            {!isExpanded ? 'SB' : 'Stock Brain'}
          </Link>
        </div>

        {/* Nav sections */}
        <nav style={{ flex: 1, padding: '0.5rem 0', overflowY: 'auto', overflowX: 'hidden' }}>
          {visibleSections.map((section) => (
            <div key={section.label} style={{ marginBottom: '0.25rem' }}>
              {isExpanded && (
                <button
                  type="button"
                  onClick={() => toggleSection(section.label)}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    background: 'none',
                    border: 'none',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    padding: '1.5rem 1rem 0.4rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span>{section.label}</span>
                  <ChevronDown
                    size={12}
                    style={{
                      flexShrink: 0,
                      transform: openSections[section.label] ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                    }}
                  />
                </button>
              )}
              {!isExpanded && <div style={{ height: '0.5rem' }} />}
              {(!isExpanded || openSections[section.label]) && section.items.map((item) => {
                const active = isActive(item.href)
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={!isExpanded ? item.label : undefined}
                    className={`nav-item${active ? ' nav-item-active' : ''}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: !isExpanded ? '0.6rem 0' : '0.6rem 1rem',
                      margin: '1px 0.5rem',
                      justifyContent: !isExpanded ? 'center' : 'flex-start',
                      fontSize: 'var(--text-sm)',
                      color: active ? undefined : 'var(--text-secondary)',
                      fontWeight: active ? 600 : 500,
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <Icon size={18} style={{ flexShrink: 0 }} />
                    {isExpanded && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* DB Health */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <Link
            href="/health/db"
            title={!isExpanded ? 'DB Health' : undefined}
            className={`nav-item${isActive('/health/db') ? ' nav-item-active' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              padding: !isExpanded ? '0.6rem 0' : '0.55rem 1rem',
              justifyContent: !isExpanded ? 'center' : 'flex-start',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
            }}
          >
            <Activity size={14} style={{ flexShrink: 0 }} />
            {isExpanded && 'DB Health'}
          </Link>

          {/* Theme toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: !isExpanded ? 'center' : 'flex-start',
              padding: !isExpanded ? '0.1rem 0' : '0.1rem 0.65rem',
              gap: '0.25rem',
            }}
          >
            <ThemeToggle />
            {isExpanded && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Theme
              </span>
            )}
          </div>

          {isExpanded && <BrandCredit className="brand-credit-sidebar" />}

          {/* Collapse toggle */}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: !isExpanded ? 'center' : 'flex-end',
              padding: !isExpanded ? '0.6rem 0' : '0.55rem 1rem',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: 'var(--text-xs)',
              gap: '0.4rem',
            }}
          >
            {!isExpanded ? <ChevronRight size={14} /> : (
              <>
                <span>Collapse</span>
                <ChevronLeft size={14} />
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ── Tablet Top Nav ─────────────────────────────────── */}
      <header className="app-topnav">
        <Link href="/" style={{ fontSize: 'var(--text-lg)', fontWeight: 800, flexShrink: 0, marginRight: '0.5rem', background: 'linear-gradient(135deg, var(--accent-bright), var(--success))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          SB
        </Link>
        <div style={{ display: 'flex', flex: 1, gap: '0.25rem', overflowX: 'auto' }}>
          {visibleItems.slice(0, 7).map((item) => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.3rem 0.6rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-xs)',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  background: active ? 'var(--accent-subtle)' : 'transparent',
                  fontWeight: active ? 600 : 400,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                <Icon size={13} />
                {item.label}
              </Link>
            )
          })}
        </div>
      </header>

      {/* ── Mobile Bottom Tabs ─────────────────────────────── */}
      <nav className="app-bottomtabs">
        {mobileTabs.map((item) => {
          const active = isActive(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.2rem',
                padding: '0.3rem 0.5rem',
                flex: 1,
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: '0.65rem',
                fontWeight: active ? 600 : 400,
              }}
            >
              <Icon size={20} />
              {item.label}
            </Link>
          )
        })}
        {/* More button */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.2rem',
            padding: '0.3rem 0.5rem',
            flex: 1,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: '0.65rem',
          }}
        >
          <Grid3X3 size={20} />
          More
        </button>
      </nav>

      {/* ── Mobile Drawer ──────────────────────────────────── */}
      {drawerOpen && (
        <>
          <div
            className="mobile-drawer-overlay"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="mobile-drawer">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: 'var(--text-lg)', fontWeight: 800, background: 'linear-gradient(135deg, var(--accent-bright), var(--success))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Stock Brain
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0.25rem' }}
              >
                <X size={20} />
              </button>
            </div>
            {visibleSections.map((section) => (
              <div key={section.label} style={{ marginBottom: '0.75rem' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
                  {section.label}
                </div>
                {section.items.map((item) => {
                  const active = isActive(item.href)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setDrawerOpen(false)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.7rem',
                        padding: '0.6rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 'var(--text-base)',
                        color: active ? 'var(--accent)' : 'var(--text-primary)',
                        background: active ? 'var(--accent-subtle)' : 'transparent',
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      <Icon size={17} />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            ))}
            <BrandCredit className="brand-credit-drawer" />
          </div>
        </>
      )}
    </>
  )
}
