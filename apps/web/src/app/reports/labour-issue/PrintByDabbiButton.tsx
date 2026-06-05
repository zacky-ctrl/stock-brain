'use client'

export function PrintByDabbiButton() {
  function handlePrint() {
    document.body.setAttribute('data-print-dabbi', '')
    window.print()
    // Remove after brief delay — print() is synchronous on most browsers
    setTimeout(() => document.body.removeAttribute('data-print-dabbi'), 1000)
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.45rem 1rem',
        fontSize: 'var(--text-sm)',
        fontWeight: 600,
        cursor: 'pointer',
        border: '1px solid var(--warning)',
        borderRadius: 'var(--radius-sm)',
        background: 'transparent',
        color: 'var(--warning)',
        whiteSpace: 'nowrap',
      }}
    >
      Print by Dabbi
    </button>
  )
}
