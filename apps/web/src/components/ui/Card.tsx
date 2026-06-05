import type { CSSProperties, ReactNode } from 'react'

type CardPadding = 'sm' | 'md' | 'lg'

type CardProps = {
  children: ReactNode
  padding?: CardPadding
  hover?: boolean
  style?: CSSProperties
  className?: string
}

const PADDING: Record<CardPadding, string> = {
  sm: '1rem',
  md: '1.5rem',
  lg: '2rem',
}

export function Card({ children, padding = 'md', hover, style, className }: CardProps) {
  return (
    <div
      className={hover ? `card-hover ${className ?? ''}` : className}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-md)',
        padding: PADDING[padding],
        ...style,
      }}
    >
      {children}
    </div>
  )
}
