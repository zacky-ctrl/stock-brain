import type { CSSProperties } from 'react'

export const tableTh: CSSProperties = {
  textAlign: 'left',
  padding: '0.85rem 1rem',
  borderBottom: '2px solid var(--border-strong)',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

export const tableTd: CSSProperties = {
  padding: '1rem',
  borderBottom: '1px solid var(--border-subtle)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  verticalAlign: 'middle',
}

export const fieldWrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  fontSize: 'var(--text-sm)',
}

export const inputStyle: CSSProperties = {
  padding: '0.45rem 0.65rem',
  fontSize: 'var(--text-sm)',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
}

export const selectStyle: CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

export const btnPrimary: CSSProperties = {
  padding: '0.45rem 1.1rem',
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  cursor: 'pointer',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--accent)',
  color: '#fff',
}

export const formWrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.9rem',
  maxWidth: '400px',
}

export const msgError: CSSProperties = {
  color: 'var(--danger)',
  margin: '0 0 0.5rem',
  fontSize: 'var(--text-sm)',
}

export const msgOk: CSSProperties = {
  color: 'var(--success)',
  margin: '0 0 0.5rem',
  fontSize: 'var(--text-sm)',
}
