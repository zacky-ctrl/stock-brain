import type { ReactNode } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

type PageHeaderProps = {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  backHref?: string
  badge?: ReactNode
}

export function PageHeader({ title, subtitle, actions, backHref, badge }: PageHeaderProps) {
  return (
    <div className="page-header" style={{ marginBottom: '1.5rem' }}>
      {backHref && (
        <Link
          href={backHref}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.2rem',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
            marginBottom: '0.65rem',
          }}
        >
          <ChevronLeft size={14} />
          Back
        </Link>
      )}
      <div className="page-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <h1
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              {title}
            </h1>
            {badge}
          </div>
          {subtitle && (
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                margin: '0.3rem 0 0',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="page-header-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
