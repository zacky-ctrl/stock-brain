import type { LucideIcon } from 'lucide-react'

type Trend = 'up' | 'down' | 'neutral'
type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info'

type StatCardProps = {
  label: string
  value: string | number
  sub?: string
  trend?: Trend
  icon?: LucideIcon
  variant?: Variant
}

const VARIANT_BORDER: Record<Variant, string> = {
  default: 'var(--border-strong)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger:  'var(--danger)',
  info:    'var(--info)',
}

const VARIANT_ICON_BG: Record<Variant, string> = {
  default: 'var(--bg-hover)',
  success: 'var(--success-subtle)',
  warning: 'var(--warning-subtle)',
  danger:  'var(--danger-subtle)',
  info:    'var(--info-subtle)',
}

const VARIANT_ICON_COLOR: Record<Variant, string> = {
  default: 'var(--text-secondary)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger:  'var(--danger)',
  info:    'var(--info)',
}

export function StatCard({ label, value, sub, trend, icon: Icon, variant = 'default' }: StatCardProps) {
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-strong)',
        borderLeft: `3px solid ${VARIANT_BORDER[variant]}`,
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem',
        boxShadow: 'var(--shadow-md)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '0.75rem',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
            marginBottom: '0.5rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 500,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 'var(--text-3xl)',
            fontWeight: 700,
            color: 'var(--text-primary)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
            {sub}
          </div>
        )}
        {trend && trend !== 'neutral' && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.2rem',
              marginTop: '0.5rem',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              padding: '0.15rem 0.5rem',
              borderRadius: '9999px',
              background: trend === 'up' ? 'var(--success-subtle)' : 'var(--danger-subtle)',
              color: trend === 'up' ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {trend === 'up' ? '↑' : '↓'}
          </span>
        )}
      </div>
      {Icon && (
        <div
          style={{
            flexShrink: 0,
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: VARIANT_ICON_BG[variant],
            borderRadius: 'var(--radius-sm)',
            color: VARIANT_ICON_COLOR[variant],
          }}
        >
          <Icon size={20} />
        </div>
      )}
    </div>
  )
}
