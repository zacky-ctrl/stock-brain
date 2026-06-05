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

  const clearAll = () => {
    const cleared: ActiveFilters = {}
    for (const f of filterConfig.fields) cleared[f.key] = []
    onFilterChange(cleared)
  }

  const stripStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
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
    borderTopWidth: '1px',
    borderBottomWidth: '1px',
    borderLeftWidth: '1px',
    borderRightWidth: '1px',
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
      <span style={{ color: '#999', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>Filter:</span>

      {filterConfig.fields.map((field) => {
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
            borderTopWidth: '1px',
            borderBottomWidth: '1px',
            borderLeftWidth: '1px',
            borderRightWidth: '1px',
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
