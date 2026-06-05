import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3.5rem 1.5rem',
        textAlign: 'center',
      }}
    >
      <Icon
        size={44}
        style={{ color: 'var(--text-muted)', marginBottom: '1rem', opacity: 0.5 }}
      />
      <h3
        style={{
          fontSize: 'var(--text-lg)',
          fontWeight: 600,
          color: 'var(--text-primary)',
          margin: '0 0 0.4rem',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--text-secondary)',
          margin: '0 0 1.25rem',
          maxWidth: '340px',
          lineHeight: 1.6,
        }}
      >
        {description}
      </p>
      {action}
    </div>
  )
}
