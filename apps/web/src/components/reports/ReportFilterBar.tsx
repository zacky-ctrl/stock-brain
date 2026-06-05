'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Printer, X, ChevronDown } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { FilterField, ActiveFilters } from '@stock-brain/types'

type ReportFilterBarProps = {
  filters: FilterField[]
  activeFilters: ActiveFilters
  printLabel?: string
}

export function ReportFilterBar({ filters, activeFilters, printLabel = 'Print' }: ReportFilterBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [openKey, setOpenKey] = useState<string | null>(null)
  // Tracks pending multi-select state while a dropdown is open
  const [pendingMulti, setPendingMulti] = useState<Record<string, string[]>>({})

  if (filters.length === 0) return null

  const hasActive = filters.some((f) => (activeFilters[f.key] ?? []).length > 0)

  function buildParams(overrides: Record<string, string | string[]>): string {
    const params = new URLSearchParams()
    for (const f of filters) {
      let val: string[]
      if (f.key in overrides) {
        const ov = overrides[f.key]
        val = Array.isArray(ov) ? ov : ov ? [ov] : []
      } else {
        val = activeFilters[f.key] ?? []
      }
      val = val.filter(Boolean)
      if (val.length > 0) params.set(f.key, val.join(','))
    }
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  function handleChange(key: string, value: string) {
    router.push(buildParams({ [key]: value }))
  }

  function openMultiDropdown(key: string) {
    setOpenKey(key)
    setPendingMulti((prev) => ({ ...prev, [key]: [...(activeFilters[key] ?? [])] }))
  }

  function toggleMultiPending(key: string, id: string) {
    setPendingMulti((prev) => {
      const current = prev[key] ?? activeFilters[key] ?? []
      const next = current.includes(id) ? current.filter((v) => v !== id) : [...current, id]
      return { ...prev, [key]: next }
    })
  }

  function closeDropdownAndApply() {
    if (openKey) {
      const pending = pendingMulti[openKey] ?? activeFilters[openKey] ?? []
      router.push(buildParams({ [openKey]: pending }))
    }
    setOpenKey(null)
  }

  function removePill(key: string, id: string) {
    const next = (activeFilters[key] ?? []).filter((v) => v !== id)
    router.push(buildParams({ [key]: next }))
  }

  function clearAll() {
    setPendingMulti({})
    setOpenKey(null)
    router.push(pathname)
  }

  const labelStyle: CSSProperties = {
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
    letterSpacing: '0.05em',
    display: 'block',
    marginBottom: '2px',
  }

  const inputBase: CSSProperties = {
    fontFamily: 'inherit',
    fontSize: 'var(--text-sm)',
    padding: '0.3rem 0.6rem',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-hover)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    outline: 'none',
  }

  return (
    <>
      {openKey && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 49 }}
          onClick={closeDropdownAndApply}
        />
      )}
      <div
        className="report-filter-bar"
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

        {filters.map((field) => {
          const applied = activeFilters[field.key] ?? []

          // ── Date picker ──────────────────────────────────────
          if (field.inputType === 'date') {
            const dateVal = applied[0] ?? ''
            return (
              <div key={field.key} style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={labelStyle}>{field.label}</label>
                <input
                  type="date"
                  value={dateVal}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  style={{
                    ...inputBase,
                    borderColor: dateVal ? 'var(--accent)' : 'var(--border)',
                    color: dateVal ? 'var(--accent)' : 'var(--text-primary)',
                    background: dateVal ? 'var(--accent-subtle)' : 'var(--bg-hover)',
                  }}
                />
              </div>
            )
          }

          // ── Multi-select dropdown ─────────────────────────────
          if (field.multiSelect) {
            const isOpen = openKey === field.key
            // While open, show pending state; while closed, show applied state
            const displaySelected = isOpen
              ? (pendingMulti[field.key] ?? applied)
              : applied
            const isEmpty = displaySelected.length === 0

            return (
              <div key={field.key} style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={labelStyle}>{field.label}</label>
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isOpen) closeDropdownAndApply()
                      else openMultiDropdown(field.key)
                    }}
                    style={{
                      ...inputBase,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      flexWrap: 'wrap',
                      minWidth: '130px',
                      maxWidth: '280px',
                      textAlign: 'left',
                      borderColor: !isEmpty ? 'var(--accent)' : 'var(--border)',
                      background: !isEmpty ? 'var(--accent-subtle)' : 'var(--bg-hover)',
                    }}
                  >
                    {isEmpty ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                        All {field.label}
                      </span>
                    ) : (
                      displaySelected.map((id) => {
                        const opt = field.options.find((o) => o.id === id)
                        return (
                          <span
                            key={id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.15rem',
                              padding: '0.1rem 0.35rem',
                              background: 'var(--accent)',
                              color: '#fff',
                              borderRadius: '4px',
                              fontSize: 'var(--text-xs)',
                              fontWeight: 600,
                              lineHeight: 1.4,
                            }}
                          >
                            {opt?.label ?? id}
                            <span
                              role="button"
                              aria-label={`Remove ${opt?.label ?? id}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (isOpen) {
                                  toggleMultiPending(field.key, id)
                                } else {
                                  removePill(field.key, id)
                                }
                              }}
                              style={{ cursor: 'pointer', lineHeight: 1, fontWeight: 700 }}
                            >
                              ×
                            </span>
                          </span>
                        )
                      })
                    )}
                    <ChevronDown
                      size={11}
                      style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--text-muted)' }}
                    />
                  </button>

                  {isOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        zIndex: 50,
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 'var(--radius-sm)',
                        boxShadow: 'var(--shadow-md)',
                        maxHeight: '220px',
                        overflowY: 'auto',
                        minWidth: '180px',
                      }}
                    >
                      {field.options.length === 0 && (
                        <div style={{ padding: '0.5rem 0.75rem', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                          No options
                        </div>
                      )}
                      {field.options.map((opt) => {
                        const pending = pendingMulti[field.key] ?? applied
                        const checked = pending.includes(opt.id)
                        return (
                          <label
                            key={opt.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                              padding: '0.4rem 0.75rem',
                              cursor: 'pointer',
                              fontSize: 'var(--text-sm)',
                              background: checked ? 'var(--accent-subtle)' : 'transparent',
                              color: checked ? 'var(--accent)' : 'var(--text-primary)',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleMultiPending(field.key, opt.id)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                            />
                            {opt.label}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          }

          // ── Single select (default) ──────────────────────────
          const singleVal = applied[0] ?? ''
          const isActive = singleVal !== ''
          return (
            <div key={field.key} style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={labelStyle}>{field.label}</label>
              <select
                value={singleVal}
                onChange={(e) => handleChange(field.key, e.target.value)}
                style={{
                  ...inputBase,
                  borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                  color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                  background: isActive ? 'var(--accent-subtle)' : 'var(--bg-hover)',
                }}
              >
                <option value="">All</option>
                {field.options.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )
        })}

        {hasActive && (
          <button
            type="button"
            onClick={clearAll}
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
            Clear
          </button>
        )}

        <div style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            onClick={() => setTimeout(() => window.print(), 100)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 1rem',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent)',
              color: '#fff',
            }}
          >
            <Printer size={14} />
            {printLabel}
          </button>
        </div>
      </div>
    </>
  )
}
