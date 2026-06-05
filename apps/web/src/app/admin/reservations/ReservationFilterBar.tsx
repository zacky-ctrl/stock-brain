'use client'

import { useRouter, usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import type { CSSProperties } from 'react'

type Option = { id: string; label: string }

type ReservationFilterBarProps = {
  customerOptions: Option[]
  designOptions: Option[]
  clrOptions: Option[]
  dabbiOptions: Option[]
  customerFilter: string
  designFilter: string
  clrFilter: string
  dabbiFilter: string
}

export function ReservationFilterBar({
  customerOptions,
  designOptions,
  clrOptions,
  dabbiOptions,
  customerFilter,
  designFilter,
  clrFilter,
  dabbiFilter,
}: ReservationFilterBarProps) {
  const router = useRouter()
  const pathname = usePathname()

  const activeCount = [customerFilter, designFilter, clrFilter, dabbiFilter].filter(Boolean).length

  function buildUrl(overrides: Record<string, string>): string {
    const params = new URLSearchParams()
    const vals: Record<string, string> = {
      customer: customerFilter,
      design: designFilter,
      clr: clrFilter,
      dabbi: dabbiFilter,
      ...overrides,
    }
    for (const [k, v] of Object.entries(vals)) {
      if (v) params.set(k, v)
    }
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  function handleChange(key: string, value: string) {
    router.push(buildUrl({ [key]: value }))
  }

  const labelStyle: CSSProperties = {
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
    letterSpacing: '0.05em',
    display: 'block',
    marginBottom: '2px',
  }

  function selectStyle(active: boolean): CSSProperties {
    return {
      fontFamily: 'inherit',
      fontSize: 'var(--text-sm)',
      padding: '0.3rem 0.6rem',
      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-sm)',
      background: active ? 'var(--accent-subtle)' : 'var(--bg-hover)',
      color: active ? 'var(--accent)' : 'var(--text-primary)',
      cursor: 'pointer',
      outline: 'none',
    }
  }

  const fields = [
    { key: 'customer', label: 'Customer', value: customerFilter, options: customerOptions },
    { key: 'design',   label: 'Design',   value: designFilter,   options: designOptions },
    { key: 'clr',      label: 'CLR',      value: clrFilter,      options: clrOptions },
    { key: 'dabbi',    label: 'Dabbi',    value: dabbiFilter,    options: dabbiOptions },
  ]

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.6rem',
        flexWrap: 'wrap',
        marginBottom: '1rem',
        padding: '0.75rem 1rem',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
      }}
    >
      <span
        style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          color: 'var(--text-muted)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          paddingTop: '0.5rem',
        }}
      >
        Filters:
      </span>

      {activeCount > 0 && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0.1rem 0.45rem',
            background: 'var(--accent)',
            color: '#fff',
            borderRadius: '999px',
            fontSize: '0.65rem',
            fontWeight: 700,
            alignSelf: 'center',
          }}
        >
          {activeCount}
        </span>
      )}

      {fields.map(({ key, label, value, options }) => (
        <div key={key} style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={labelStyle}>{label}</label>
          <select
            value={value}
            onChange={(e) => handleChange(key, e.target.value)}
            style={selectStyle(value !== '')}
          >
            <option value="">All</option>
            {options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.35rem 0.65rem',
            fontSize: 'var(--text-xs)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            background: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            marginTop: '1rem',
          }}
        >
          <X size={12} />
          Clear all
        </button>
      )}
    </div>
  )
}
