import type { ReactNode } from 'react'

type SectionHeaderProps = {
  title: string
  count?: number
  actions?: ReactNode
  color?: string
}

export function SectionHeader({ title, count, actions, color }: SectionHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid var(--border-subtle)',
        marginBottom: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: color ?? 'var(--text-secondary)',
          }}
        >
          {title}
        </span>
        {count !== undefined && (
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              background: 'var(--bg-elevated)',
              padding: '0.1rem 0.4rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {count}
          </span>
        )}
      </div>
      {actions && <div style={{ display: 'flex', gap: '0.5rem' }}>{actions}</div>}
    </div>
  )
}
