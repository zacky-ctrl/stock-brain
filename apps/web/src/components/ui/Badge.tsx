import type { CSSProperties } from 'react'

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'
type BadgeSize = 'sm' | 'md'

type BadgeProps = {
  variant?: BadgeVariant
  size?: BadgeSize
  label: string
  dot?: boolean
}

const VARIANT_STYLES: Record<BadgeVariant, CSSProperties> = {
  success: {
    background: 'var(--success-subtle)',
    color: 'var(--success-bright)',
    borderColor: 'rgba(0, 217, 126, 0.4)',
  },
  warning: {
    background: 'var(--warning-subtle)',
    color: 'var(--warning)',
    borderColor: 'rgba(255, 184, 0, 0.4)',
  },
  danger: {
    background: 'var(--danger-subtle)',
    color: 'var(--danger)',
    borderColor: 'rgba(255, 71, 87, 0.4)',
  },
  info: {
    background: 'var(--info-subtle)',
    color: 'var(--info)',
    borderColor: 'rgba(0, 180, 216, 0.4)',
  },
  neutral: {
    background: 'var(--bg-elevated)',
    color: 'var(--text-secondary)',
    borderColor: 'var(--border-strong)',
  },
  accent: {
    background: 'var(--accent-subtle)',
    color: 'var(--accent-bright)',
    borderColor: 'rgba(124, 110, 245, 0.4)',
  },
}

export function Badge({ variant = 'neutral', size = 'md', label, dot }: BadgeProps) {
  const variantStyle = VARIANT_STYLES[variant]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        padding: size === 'sm' ? '0.2rem 0.55rem' : '0.3rem 0.75rem',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        borderRadius: '9999px',
        border: '1px solid',
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        ...variantStyle,
      }}
    >
      {dot && (
        <span
          style={{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            background: 'currentColor',
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </span>
  )
}

export function statusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case 'open': return 'info'
    case 'partially_dispatched': return 'warning'
    case 'fully_dispatched': return 'success'
    case 'closed': return 'neutral'
    case 'confirmed': return 'success'
    case 'draft': return 'warning'
    case 'voided': return 'neutral'
    case 'ready_to_dispatch':
    case 'ready_to_dispatch_override': return 'success'
    case 'give_to_labour':
    case 'give_to_labour_override': return 'warning'
    case 'cut_on_machine':
    case 'cut_on_machine_override': return 'danger'
    case 'procure_velvet': return 'danger'
    case 'covered_by_wip': return 'info'
    default: return 'neutral'
  }
}
