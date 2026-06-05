'use client'

import { Sun, Moon } from 'lucide-react'
import { useTheme } from './ThemeProvider'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      style={{
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-muted)',
        borderRadius: 'var(--radius-sm)',
        transition: 'color 200ms ease, background 200ms ease',
        flexShrink: 0,
      }}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
