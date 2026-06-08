'use client'

import type { CSSProperties } from 'react'
import type { FilterConfig, ActiveFilters } from '@stock-brain/types'

export type MatrixFilterBarProps = {
  filterConfig: FilterConfig
  activeFilters: ActiveFilters
  onFilterChange: (filters: ActiveFilters) => void
}

export function MatrixFilterBar({
  filterConfig,
  activeFilters,
  onFilterChange,
}: MatrixFilterBarProps) {
  if (filterConfig.fields.length === 0) return null

  const hasActive = filterConfig.fields.some(
    (f) => (activeFilters[f.key] ?? []).length > 0,
  )

  const handleSelect = (key: string, value: string) => {
    onFilterChange({
      ...activeFilters,
      [key]: value === '' ? [] : [value],
    })
  }

  const handleCheckboxToggle = (key: string, value: string) => {
    const current = activeFilters[key] ?? []
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value]
    onFilterChange({ ...activeFilters, [key]: next })
  }

  const clearAll = () => {
    const cleared: ActiveFilters = {}
    for (const f of filterConfig.fields) cleared[f.key] = []
    onFilterChange(cleared)
  }

  const stripStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.6rem',
    flexWrap: 'wrap',
    marginBottom: '0.75rem',
    fontFamily: 'monospace',
    fontSize: '0.8rem',
  }

  const baseSelectStyle: CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
    padding: '0.2rem 0.4rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#bbb',
    borderRadius: '2px',
    background: '#fff',
    color: '#444',
    cursor: 'pointer',
  }

  const activeSelectStyle: CSSProperties = {
    ...baseSelectStyle,
    borderColor: '#1e3a5f',
    color: '#1e3a5f',
    background: '#f0f4ff',
  }

  return (
    <div style={stripStyle} className="matrix-no-print">
      <span style={{ color: '#999', fontSize: '0.75rem', whiteSpace: 'nowrap', paddingTop: '0.25rem' }}>Filter:</span>

      {filterConfig.fields.map((field) => {
        if (field.multiSelect) {
          const selected = activeFilters[field.key] ?? []
          return (
            <div
              key={field.key}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}
            >
              <span style={{ color: '#999', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                {field.label}:
              </span>
              {field.options.map((opt) => {
                const checked = selected.includes(opt.id)
                return (
                  <label
                    key={opt.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.2rem',
                      padding: '0.15rem 0.4rem',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderColor: checked ? '#1e3a5f' : '#bbb',
                      borderRadius: '2px',
                      background: checked ? '#f0f4ff' : '#fff',
                      color: checked ? '#1e3a5f' : '#555',
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                      fontFamily: 'monospace',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleCheckboxToggle(field.key, opt.id)}
                      style={{ margin: 0, cursor: 'pointer', accentColor: '#1e3a5f' }}
                    />
                    {opt.label}
                  </label>
                )
              })}
            </div>
          )
        }

        const selected = (activeFilters[field.key] ?? [])[0] ?? ''
        const isActive = selected !== ''
        return (
          <select
            key={field.key}
            value={selected}
            onChange={(e) => handleSelect(field.key, e.target.value)}
            style={isActive ? activeSelectStyle : baseSelectStyle}
          >
            <option value="">All {field.label}</option>
            {field.options.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        )
      })}

      {hasActive && (
        <button
          type="button"
          onClick={clearAll}
          style={{
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            padding: '0.2rem 0.5rem',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: '#ccc',
            borderRadius: '2px',
            background: '#fff',
            color: '#888',
            cursor: 'pointer',
          }}
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
