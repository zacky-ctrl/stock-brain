'use client'

import type { CSSProperties } from 'react'

export type MatrixView = 'list' | 'matrix'

type MatrixViewToggleProps = {
  view: MatrixView
  onViewChange: (v: MatrixView) => void
}

export function MatrixViewToggle({ view, onViewChange }: MatrixViewToggleProps) {
  const base: CSSProperties = {
    fontSize: 'var(--text-sm)',
    padding: '0.25rem 0.7rem',
    borderTopWidth: '1px',
    borderBottomWidth: '1px',
    borderLeftWidth: '1px',
    borderRightWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    cursor: 'pointer',
    background: 'var(--bg-elevated)',
    color: 'var(--text-secondary)',
  }
  const active: CSSProperties = {
    fontSize: 'var(--text-sm)',
    padding: '0.25rem 0.7rem',
    borderTopWidth: '1px',
    borderBottomWidth: '1px',
    borderLeftWidth: '1px',
    borderRightWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--accent)',
    cursor: 'pointer',
    background: 'var(--accent-subtle)',
    color: 'var(--accent)',
    fontWeight: 600,
  }

  return (
    <span style={{ display: 'inline-flex', gap: 0 }}>
      <button
        type="button"
        onClick={() => onViewChange('list')}
        style={{ ...(view === 'list' ? active : base), borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)', borderRightWidth: '0px' }}
      >
        List
      </button>
      <button
        type="button"
        onClick={() => onViewChange('matrix')}
        style={{ ...(view === 'matrix' ? active : base), borderRadius: '0 var(--radius-sm) var(--radius-sm) 0' }}
      >
        Matrix
      </button>
    </span>
  )
}
