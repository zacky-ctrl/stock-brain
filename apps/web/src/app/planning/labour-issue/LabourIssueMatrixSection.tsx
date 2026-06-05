'use client'

import { useState } from 'react'
import type { CSSProperties } from 'react'
import { MatrixGrid } from '@/components/matrix/MatrixGrid'
import type { MatrixGridData } from '@stock-brain/types'

type DabbiSection = {
  dabbiId: string
  dabbiCode: string
  dabbiName: string
  matrixData: MatrixGridData
  totalQty: number
}

type Props = {
  sections: DabbiSection[]
  combinedMatrixData: MatrixGridData
  printTitle: string
}

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

export function LabourIssueMatrixSection({ sections, combinedMatrixData, printTitle }: Props) {
  const [showCombined, setShowCombined] = useState(false)

  const base: CSSProperties = {
    fontSize: 'var(--text-sm)',
    padding: '0.25rem 0.7rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    cursor: 'pointer',
    background: 'var(--bg-elevated)',
    color: 'var(--text-secondary)',
  }

  const active: CSSProperties = {
    ...base,
    borderColor: 'var(--accent)',
    background: 'var(--accent-subtle)',
    color: 'var(--accent)',
    fontWeight: 600,
  }

  return (
    <div className="no-print">
      {/* Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <span style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          View:
        </span>
        <span style={{ display: 'inline-flex' }}>
          <button
            type="button"
            onClick={() => setShowCombined(false)}
            style={{
              ...(!showCombined ? active : base),
              borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)',
              borderRightWidth: '0px',
            }}
          >
            Separate
          </button>
          <button
            type="button"
            onClick={() => setShowCombined(true)}
            style={{
              ...(showCombined ? active : base),
              borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
            }}
          >
            Combined
          </button>
        </span>
      </div>

      {/* Separate sections (default) */}
      {!showCombined && sections.map((section) => {
        const badgeBg     = section.dabbiCode === 'YELLOW' ? 'var(--warning-subtle)' : 'var(--bg-elevated)'
        const badgeColor  = section.dabbiCode === 'YELLOW' ? 'var(--warning)'        : 'var(--text-secondary)'
        const badgeBorder = section.dabbiCode === 'YELLOW' ? 'var(--warning)'        : 'var(--border)'

        return (
          <div key={section.dabbiId} style={{ marginBottom: '2rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              paddingBottom: '0.5rem',
              borderBottom: '1px solid var(--border-subtle)',
              marginBottom: '0.75rem',
            }}>
              <span style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-secondary)',
              }}>
                Matrix View — Suggested Issue Qty (gross)
              </span>
              <span style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                padding: '0.15rem 0.5rem',
                background: badgeBg,
                border: `1px solid ${badgeBorder}`,
                borderRadius: 'var(--radius-sm)',
                color: badgeColor,
              }}>
                {section.dabbiName}
              </span>
              <span style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
                background: 'var(--bg-elevated)',
                padding: '0.1rem 0.4rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {fmt(section.totalQty)} gross
              </span>
            </div>
            <MatrixGrid data={section.matrixData} mode="view" printTitle={printTitle} />
          </div>
        )
      })}

      {/* Combined view */}
      {showCombined && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            paddingBottom: '0.5rem',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: '0.75rem',
          }}>
            <span style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-secondary)',
            }}>
              Matrix View — Suggested Issue Qty (gross) — All Dabbi
            </span>
          </div>
          <MatrixGrid data={combinedMatrixData} mode="view" printTitle={printTitle} />
        </div>
      )}
    </div>
  )
}
