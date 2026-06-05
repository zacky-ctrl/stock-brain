'use client'

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{
        fontSize: 'var(--text-sm)',
        border: '1px solid var(--border)',
        padding: '0.25rem 0.65rem',
        background: 'transparent',
        cursor: 'pointer',
        color: 'var(--text-secondary)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      Print — Velvet Stock Position
    </button>
  )
}
