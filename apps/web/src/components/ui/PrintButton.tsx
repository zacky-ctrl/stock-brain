'use client'

import { Printer } from 'lucide-react'

type PrintButtonProps = {
  label?: string
  variant?: 'primary' | 'secondary'
}

export function PrintButton({ label = 'Print', variant = 'primary' }: PrintButtonProps) {
  const isPrimary = variant === 'primary'
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.45rem 1rem',
        fontSize: 'var(--text-sm)',
        fontWeight: 600,
        cursor: 'pointer',
        border: isPrimary ? 'none' : '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        background: isPrimary ? 'var(--accent)' : 'var(--bg-elevated)',
        color: isPrimary ? '#fff' : 'var(--text-primary)',
        transition: 'background 150ms',
      }}
    >
      <Printer size={14} />
      {label}
    </button>
  )
}
