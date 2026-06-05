'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'

type Props = {
  title: string
  count?: number
  children: ReactNode
  defaultOpen?: boolean
}

export function CollapsibleSection({ title, count, children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          width: '100%',
          textAlign: 'left',
          background: 'none',
          border: 'none',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0 0 0.5rem 0',
          marginBottom: open ? '0.75rem' : '0',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', userSelect: 'none' }}>
          {open ? '▼' : '▶'}
        </span>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-secondary)',
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
      </button>
      {open && <div style={{ marginTop: '0.75rem' }}>{children}</div>}
    </div>
  )
}
