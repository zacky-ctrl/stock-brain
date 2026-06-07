'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Banknote, BookOpen, MoreHorizontal } from 'lucide-react'

type Props = {
  customerId: string
}

const menuItemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.55rem 0.65rem',
  color: 'var(--text-primary)',
  textDecoration: 'none',
  fontSize: 'var(--text-sm)',
  fontWeight: 800,
  borderRadius: 'var(--radius-sm)',
} as const

export function LedgerRowActions({ customerId }: Props) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-flex', justifyContent: 'flex-end' }}>
      <button
        type="button"
        aria-label="Customer ledger actions"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        style={{
          width: '2.35rem',
          height: '2.35rem',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          background: open ? 'var(--accent-soft)' : 'var(--bg-elevated)',
          color: open ? 'var(--accent-bright)' : 'var(--text-secondary)',
          cursor: 'pointer',
        }}
      >
        <MoreHorizontal size={18} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.35rem)',
            right: 0,
            zIndex: 30,
            minWidth: '150px',
            padding: '0.35rem',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <Link href={`/accounting/ledger?customer=${customerId}`} role="menuitem" style={menuItemStyle}>
            <BookOpen size={15} />
            Open
          </Link>
          <Link href={`/accounting/receipts?customer=${customerId}`} role="menuitem" style={menuItemStyle}>
            <Banknote size={15} />
            Receipt
          </Link>
        </div>
      )}
    </div>
  )
}
