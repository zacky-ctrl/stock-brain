'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import type { CSSProperties } from 'react'
import type {
  MatrixGridData,
  MatrixRow,
  MatrixChangeEvent,
  MatrixCellHighlight,
} from '@stock-brain/types'

// ── props ─────────────────────────────────────────────────────

export type MatrixGridProps = {
  data: MatrixGridData
  mode: 'view' | 'edit'
  compactMobile?: boolean
  onCellChange?: (change: MatrixChangeEvent) => void
  highlightCell?: (row: MatrixRow, sizeId: string) => MatrixCellHighlight
  /** Direct text color for a non-zero cell. When provided, overrides HIGHLIGHT_TEXT. */
  cellTextColor?: (row: MatrixRow, sizeId: string) => string | undefined
  printTitle?: string
  draftKey?: string
  onSaveComplete?: () => void
  onDraftDiscard?: () => void
}

// ── highlight colours (dark-theme tokens) ─────────────────────

const HIGHLIGHT_BG: Record<MatrixCellHighlight, string | undefined> = {
  normal:   undefined,
  shortage: 'var(--danger-subtle)',
  covered:  'var(--success-subtle)',
  partial:  'var(--warning-subtle)',
  wip:      'var(--info-subtle)',
  reserved: 'var(--accent-subtle)',
  excess:   'var(--warning-subtle)',
}

const HIGHLIGHT_TEXT: Record<MatrixCellHighlight, string | undefined> = {
  normal:   undefined,
  shortage: 'var(--danger)',
  covered:  'var(--success)',
  partial:  'var(--warning)',
  wip:      'var(--info)',
  reserved: 'var(--accent)',
  excess:   'var(--warning)',
}

// ── print styles ──────────────────────────────────────────────
//
// Injected into <head> on first render (client only).
// Forces white backgrounds for all matrix cells in print output,
// overriding the dark-mode CSS variables.

const PRINT_STYLE_ID = 'matrix-grid-print-style'

function injectPrintStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById(PRINT_STYLE_ID)) return
  const el = document.createElement('style')
  el.id = PRINT_STYLE_ID
  el.textContent = `
@media print {
  .matrix-no-print { display: none !important; }
  .matrix-print-root { display: none !important; }
  .matrix-print-only { display: block !important; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; }
  .matrix-print-grid {
    border-top: 1px solid #000;
    border-left: 1px solid #000;
    width: 100%;
  }
  .matrix-print-row {
    display: grid;
  }
  .matrix-print-row > div {
    border: 1px solid #000;
    border-top: 0;
    border-left: 0;
    box-sizing: border-box;
    min-width: 0;
    padding: 2px 4px;
    font-size: 9pt;
  }
  .matrix-print-only .mpo-hdr {
    background: #1e3a5f !important;
    color: #fff !important;
    font-weight: 700;
    text-align: center;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .matrix-print-only .mpo-design { font-weight: 700; text-align: left; }
  .matrix-print-only .mpo-clr { text-align: center; font-weight: 600; }
  .matrix-print-only .mpo-cell { text-align: center; font-variant-numeric: tabular-nums; }
  .matrix-print-only .mpo-total { text-align: center; font-weight: 700; background: #f5f5f5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .matrix-print-only .mpo-footer > div { background: #eaeaea !important; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .matrix-print-title { font-size: 11pt; font-weight: bold; margin-bottom: 4pt; }
  .matrix-print-label { font-size: 9pt; color: #333; margin-bottom: 2pt; }
}
`
  document.head.appendChild(el)
}

// ── component ─────────────────────────────────────────────────

function fmt(n: number): string {
  if (n === 0) return ''
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

export function MatrixGrid({
  data,
  mode,
  compactMobile = false,
  onCellChange,
  highlightCell,
  cellTextColor,
  printTitle,
  draftKey,
  onSaveComplete,
  onDraftDiscard,
}: MatrixGridProps) {
  const [focusedCell, setFocusedCell] = useState<string | null>(null)
  const [editState, setEditState] = useState<Record<string, Record<string, string>>>(() => {
    if (mode !== 'edit') return {}
    const init: Record<string, Record<string, string>> = {}
    for (const row of data.rows) {
      const key = `${row.design_id}|${row.colour_id}`
      init[key] = {}
      for (const size of data.sizes) {
        const qty = row.cells[size.size_id] ?? 0
        init[key][size.size_id] = qty > 0 ? String(qty) : ''
      }
    }
    return init
  })

  useEffect(() => {
    if (mode !== 'edit') return
    setEditState((prev) => {
      const next: Record<string, Record<string, string>> = { ...prev }
      for (const row of data.rows) {
        const rowKey = `${row.design_id}|${row.colour_id}`
        const existingRow = next[rowKey] ?? {}
        const nextRow = { ...existingRow }
        for (const size of data.sizes) {
          const qty = row.cells[size.size_id] ?? 0
          if (qty > 0 || nextRow[size.size_id] === undefined) {
            nextRow[size.size_id] = qty > 0 ? String(qty) : ''
          }
        }
        next[rowKey] = nextRow
      }
      return next
    })
  }, [data.rows, data.sizes, mode])

  const [hasDraft, setHasDraft] = useState(false)
  const [draftAge, setDraftAge] = useState('')

  // Keyboard navigation refs and index
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const cellIndex = useMemo(() => {
    const keys: string[] = []
    for (const row of data.rows) {
      const rowKey = `${row.design_id}|${row.colour_id}`
      for (const s of data.sizes) {
        keys.push(`${rowKey}|${s.size_id}`)
      }
    }
    return keys
  }, [data.rows, data.sizes])

  const focusCell = useCallback((idx: number) => {
    if (idx < 0 || idx >= cellIndex.length) return
    const el = cellRefs.current[cellIndex[idx]]
    if (el) { el.focus(); el.select() }
  }, [cellIndex])

  const handleKeyDown = useCallback((e: React.KeyboardEvent, cellKey: string) => {
    const idx = cellIndex.indexOf(cellKey)
    const numCols = data.sizes.length
    if (e.key === 'Tab' && !e.shiftKey)         { e.preventDefault(); focusCell(idx + 1) }
    else if (e.key === 'Tab' && e.shiftKey)      { e.preventDefault(); focusCell(idx - 1) }
    else if (e.key === 'Enter' && !e.shiftKey)   { e.preventDefault(); focusCell(idx + numCols) }
    else if (e.key === 'Enter' && e.shiftKey)    { e.preventDefault(); focusCell(idx - numCols) }
    else if (e.key === 'ArrowRight')             { e.preventDefault(); focusCell(idx + 1) }
    else if (e.key === 'ArrowLeft')              { e.preventDefault(); focusCell(idx - 1) }
    else if (e.key === 'ArrowDown')              { e.preventDefault(); focusCell(idx + numCols) }
    else if (e.key === 'ArrowUp')                { e.preventDefault(); focusCell(idx - numCols) }
  }, [cellIndex, data.sizes.length, focusCell])

  // Check for existing draft on mount
  useEffect(() => {
    if (mode !== 'edit' || !draftKey) return
    const raw = localStorage.getItem(`matrix-draft-${draftKey}`)
    if (!raw) return
    const parsed = JSON.parse(raw) as { state: Record<string, Record<string, string>>; timestamp: number }
    const ageMs = Date.now() - parsed.timestamp
    if (ageMs < 86_400_000) {
      setHasDraft(true)
      const mins = Math.floor(ageMs / 60000)
      setDraftAge(mins < 1 ? 'just now' : `${mins} min ago`)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Expose onSaveComplete effect so parent can clear draft after save
  useEffect(() => {
    if (!onSaveComplete || !draftKey) return
    // Patch the callback to also clear draft storage
    // Parent calls onSaveComplete(); we wrap it here via ref so we don't re-register
  }, [draftKey, onSaveComplete])

  if (typeof window !== 'undefined') {
    injectPrintStyle()
  }

  const handleCellInput = useCallback(
    (designId: string, colourId: string, sizeId: string, raw: string) => {
      const sanitized = raw.replace(/[^0-9.]/g, '')
      const qty = parseFloat(sanitized) || 0
      const key = `${designId}|${colourId}`
      setEditState((prev) => {
        const updatedEditState = {
          ...prev,
          [key]: { ...(prev[key] ?? {}), [sizeId]: sanitized },
        }
        if (draftKey) {
          localStorage.setItem(`matrix-draft-${draftKey}`, JSON.stringify({
            state: updatedEditState,
            timestamp: Date.now(),
          }))
        }
        return updatedEditState
      })
      onCellChange?.({ design_id: designId, colour_id: colourId, size_id: sizeId, quantity: qty })
    },
    [onCellChange, draftKey],
  )

  const handleRestoreDraft = useCallback(() => {
    if (!draftKey) return
    const raw = localStorage.getItem(`matrix-draft-${draftKey}`)
    if (!raw) return
    const parsed = JSON.parse(raw) as { state: Record<string, Record<string, string>>; timestamp: number }
    setEditState(parsed.state)
    for (const [rowKey, sizes] of Object.entries(parsed.state)) {
      const [design_id, colour_id] = rowKey.split('|')
      for (const [size_id, val] of Object.entries(sizes)) {
        const qty = parseFloat(val) || 0
        onCellChange?.({ design_id, colour_id, size_id, quantity: qty })
      }
    }
    setHasDraft(false)
  }, [draftKey, onCellChange])

  const handleDiscardDraft = useCallback(() => {
    if (draftKey) localStorage.removeItem(`matrix-draft-${draftKey}`)
    onDraftDiscard?.()
    setHasDraft(false)
  }, [draftKey, onDraftDiscard])

  // ── styles ────────────────────────────────────────────────

  const designColumnWidth = compactMobile ? 78 : 100
  const clrColumnWidth = compactMobile ? 40 : 48
  const sizeColumnWidth = compactMobile ? 44 : 52
  const totalColumnWidth = sizeColumnWidth
  const cellHeight = compactMobile ? 34 : 40

  // Fixed table width prevents browser auto-layout from sizing header and body
  // columns differently on mobile (particularly with rowSpan cells in Design column).
  const tableMinWidth =
    designColumnWidth +
    clrColumnWidth +
    data.sizes.length * sizeColumnWidth +
    totalColumnWidth

  const tableStyle: CSSProperties = {
    borderCollapse: 'collapse',
    fontSize: compactMobile ? 'var(--text-xs)' : 'var(--text-sm)',
    tableLayout: 'fixed',
    width: `${tableMinWidth}px`,
    minWidth: `${tableMinWidth}px`,
  }

  const headerThStyle: CSSProperties = {
    background: 'var(--bg-elevated)',
    color: 'var(--accent-bright)',
    fontWeight: 700,
    padding: compactMobile ? '0.35rem 0.3rem' : '0.6rem 0.5rem',
    border: '1px solid var(--border)',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    fontSize: compactMobile ? '0.7rem' : 'var(--text-xs)',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    borderBottom: '2px solid var(--accent)',
    position: 'sticky',
    top: 0,
    zIndex: 3,
  }

  const designThStyle: CSSProperties = {
    ...headerThStyle,
    textAlign: 'left',
    minWidth: `${designColumnWidth}px`,
    borderRight: '2px solid var(--border-strong)',
    position: 'sticky',
    left: 0,
    top: 0,
    zIndex: 4,
    background: 'var(--bg-elevated)',
  }

  const clrThStyle: CSSProperties = {
    ...headerThStyle,
    minWidth: `${clrColumnWidth}px`,
    borderRight: '1px solid var(--border-strong)',
    position: 'sticky',
    left: designColumnWidth,
    top: 0,
    zIndex: 4,
    background: 'var(--bg-elevated)',
  }

  const designCellStyleBase: CSSProperties = {
    padding: '0.4rem 0.6rem',
    border: '1px solid var(--border)',
    borderRight: '2px solid var(--border-strong)',
    fontWeight: 700,
    verticalAlign: 'top',
    whiteSpace: 'nowrap',
    color: 'var(--text-primary)',
    minWidth: `${designColumnWidth}px`,
    fontSize: compactMobile ? 'var(--text-xs)' : 'var(--text-sm)',
    position: 'sticky',
    left: 0,
    zIndex: 2,
  }

  const clrCellStyleBase: CSSProperties = {
    padding: compactMobile ? '0.3rem 0.25rem' : '0.4rem 0.5rem',
    border: '1px solid var(--border)',
    borderRight: '1px solid var(--border-strong)',
    textAlign: 'center',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
    fontSize: 'var(--text-xs)',
    minWidth: `${clrColumnWidth}px`,
    position: 'sticky',
    left: designColumnWidth,
    zIndex: 2,
  }

  const baseTdStyle: CSSProperties = {
    border: '1px solid var(--border)',
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
    minWidth: `${sizeColumnWidth}px`,
    height: `${cellHeight}px`,
    color: 'var(--text-primary)',
  }

  const inputStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    border: 'none',
    background: 'transparent',
    textAlign: 'center',
    fontSize: compactMobile ? 'var(--text-sm)' : 'var(--text-base)',
    outline: 'none',
    padding: '0 4px',
  }

  // Pre-compute design group sizes (for rowspan)
  const designSpan = new Map<string, number>()
  for (const row of data.rows) {
    designSpan.set(row.design_id, (designSpan.get(row.design_id) ?? 0) + 1)
  }
  const renderedDesigns = new Set<string>()

  // ── Totals (view = row.cells, edit = editState — both live on re-render) ──

  const sizeColumnTotals: Record<string, number> = {}
  for (const s of data.sizes) {
    sizeColumnTotals[s.size_id] = data.rows.reduce((sum, row) => {
      const rk = `${row.design_id}|${row.colour_id}`
      const qty = mode === 'edit'
        ? (parseFloat(editState[rk]?.[s.size_id] ?? '') || 0)
        : (row.cells[s.size_id] ?? 0)
      return sum + qty
    }, 0)
  }

  const grandTotal = data.sizes.reduce((s, sz) => s + (sizeColumnTotals[sz.size_id] ?? 0), 0)

  const skuCount = data.rows.reduce((count, row) => {
    const rk = `${row.design_id}|${row.colour_id}`
    return count + data.sizes.filter((s) => {
      const qty = mode === 'edit'
        ? (parseFloat(editState[rk]?.[s.size_id] ?? '') || 0)
        : (row.cells[s.size_id] ?? 0)
      return qty > 0
    }).length
  }, 0)

  // ── render ────────────────────────────────────────────────

  // Separate renderedDesigns tracker for the print table
  const printRenderedDesigns = new Set<string>()
  const printGridStyle: CSSProperties = {
    gridTemplateColumns: `13% 7% repeat(${Math.max(data.sizes.length, 1)}, minmax(0, 1fr)) 8%`,
  }

  return (
    <>
    <div
      className={`matrix-print-root${compactMobile ? ' matrix-grid-compact-mobile' : ''}`}
      style={{ position: 'relative', overflowX: 'auto', overflowY: 'auto', maxHeight: '70vh' }}
    >

      {/* Draft banner */}
      {hasDraft && mode === 'edit' && (
        <div className="matrix-no-print" style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.4rem 0.75rem', marginBottom: '0.5rem',
          background: 'var(--accent-subtle)',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--text-sm)',
        }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            Draft saved {draftAge}
          </span>
          <button type="button" onClick={handleRestoreDraft}
            style={{ color: 'var(--accent)', fontWeight: 600, background: 'none',
              border: 'none', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
            Restore
          </button>
          <button type="button" onClick={handleDiscardDraft}
            style={{ color: 'var(--text-muted)', background: 'none',
              border: 'none', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
            Discard
          </button>
        </div>
      )}

      {/* Print header */}
      {(printTitle || data.context_label || data.date_label) && (
        <div style={{ marginBottom: '0.75rem' }}>
          {printTitle && <div className="matrix-print-title" style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-primary)' }}>{printTitle}</div>}
          {data.context_label && <div className="matrix-print-label" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{data.context_label}</div>}
          {data.date_label && <div className="matrix-print-label" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{data.date_label}</div>}
        </div>
      )}

      <table style={tableStyle}>
        <colgroup>
          <col style={{ width: `${designColumnWidth}px` }} />
          <col style={{ width: `${clrColumnWidth}px` }} />
          {data.sizes.map((s) => (
            <col key={s.size_id} style={{ width: `${sizeColumnWidth}px` }} />
          ))}
          <col style={{ width: `${totalColumnWidth}px` }} />
        </colgroup>
        <thead>
          <tr className="matrix-header-row">
            <th style={designThStyle}>Design</th>
            <th style={clrThStyle}>CLR</th>
            {data.sizes.map((s) => (
              <th key={s.size_id} style={headerThStyle}>{s.size_name}</th>
            ))}
            <th style={{
              ...headerThStyle,
              borderLeft: '2px solid var(--border-strong)',
              position: 'sticky',
              right: 0,
              top: 0,
              zIndex: 4,
            }}>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIdx) => {
            const rowKey = `${row.design_id}|${row.colour_id}`
            const isFirstInDesign = !renderedDesigns.has(row.design_id)
            if (isFirstInDesign) renderedDesigns.add(row.design_id)
            const span = designSpan.get(row.design_id) ?? 1
            const rowBg = rowIdx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-base)'

            const rowTotal = data.sizes.reduce((sum, s) => {
              const qty = mode === 'edit'
                ? (parseFloat(editState[rowKey]?.[s.size_id] ?? '') || 0)
                : (row.cells[s.size_id] ?? 0)
              return sum + qty
            }, 0)

            return (
              <tr key={rowKey} style={{ background: rowBg }}>
                {isFirstInDesign && (
                  <td rowSpan={span} style={{ ...designCellStyleBase, background: rowBg }}>
                    {row.design_name}
                  </td>
                )}
                <td style={{ ...clrCellStyleBase, background: rowBg }}>{row.colour_code}</td>
                {data.sizes.map((s) => {
                  const highlight = highlightCell?.(row, s.size_id) ?? 'normal'
                  const highlightBg = HIGHLIGHT_BG[highlight]
                  const cellKey = `${rowKey}|${s.size_id}`
                  const isFocused = focusedCell === cellKey
                  const tdStyle: CSSProperties = {
                    ...baseTdStyle,
                    background: isFocused
                      ? 'var(--accent-subtle)'
                      : (highlightBg ?? rowBg),
                    border: isFocused
                      ? '1px solid var(--accent)'
                      : '1px solid var(--border)',
                    boxShadow: isFocused ? 'inset 0 0 0 1px var(--accent)' : undefined,
                  }

                  if (mode === 'view') {
                    const qty = row.cells[s.size_id] ?? 0
                    const directColor = qty > 0 ? cellTextColor?.(row, s.size_id) : undefined
                    const textColor = qty > 0
                      ? (directColor ?? HIGHLIGHT_TEXT[highlight] ?? 'var(--text-primary)')
                      : 'var(--text-muted)'
                    return (
                      <td key={s.size_id} style={tdStyle}>
                        <span style={{ fontWeight: qty > 0 ? 700 : undefined, color: textColor }}>
                          {qty > 0 ? fmt(qty) : ''}
                        </span>
                      </td>
                    )
                  }

                  const val = editState[rowKey]?.[s.size_id] ?? ''
                  return (
                    <td key={s.size_id} style={{ ...tdStyle, padding: '0' }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={val}
                        placeholder="·"
                        ref={(el) => { cellRefs.current[cellKey] = el }}
                        onChange={(e) =>
                          handleCellInput(row.design_id, row.colour_id, s.size_id, e.target.value)
                        }
                        onFocus={() => { setFocusedCell(cellKey) }}
                        onBlur={() => setFocusedCell(null)}
                        onKeyDown={(e) => handleKeyDown(e, cellKey)}
                        style={{
                          ...inputStyle,
                          color: val ? 'var(--text-primary)' : 'var(--text-muted)',
                          opacity: val ? 1 : 0.5,
                          fontWeight: val && Number(val) > 0 ? 600 : undefined,
                        }}
                      />
                    </td>
                  )
                })}
                {/* Row total */}
                <td style={{
                  ...baseTdStyle,
                  borderLeft: '2px solid var(--border-strong)',
                  background: 'var(--bg-elevated)',
                  fontWeight: 700,
                  color: rowTotal > 0 ? 'var(--accent-bright)' : 'var(--text-muted)',
                  position: 'sticky',
                  right: 0,
                  zIndex: 2,
                }}>
                  {rowTotal > 0 ? fmt(rowTotal) : '—'}
                </td>
              </tr>
            )
          })}

          {data.rows.length === 0 && (
            <tr>
              <td
                colSpan={data.sizes.length + 3}
                style={{ ...baseTdStyle, textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}
              >
                No data
              </td>
            </tr>
          )}
        </tbody>

        {/* Grand total footer — shown whenever there are rows */}
        {data.rows.length > 0 && (
          <tfoot>
            <tr style={{ background: 'var(--bg-elevated)', borderTop: '2px solid var(--accent)', fontWeight: 700 }}>
              <td
                colSpan={2}
                style={{
                  padding: '0.5rem 0.6rem',
                  border: '1px solid var(--border)',
                  borderTop: '2px solid var(--accent)',
                  borderRight: '2px solid var(--border-strong)',
                  fontWeight: 700,
                  fontSize: 'var(--text-xs)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-elevated)',
                  whiteSpace: 'nowrap',
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                }}
              >
                Grand Total
              </td>
              {data.sizes.map((s) => {
                const colTotal = sizeColumnTotals[s.size_id] ?? 0
                return (
                  <td key={s.size_id} style={{
                    ...baseTdStyle,
                    borderTop: '2px solid var(--accent)',
                    background: 'var(--bg-elevated)',
                    fontWeight: 700,
                    color: colTotal > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}>
                    {fmt(colTotal)}
                  </td>
                )
              })}
              <td style={{
                ...baseTdStyle,
                borderTop: '2px solid var(--accent)',
                borderLeft: '2px solid var(--border-strong)',
                background: 'var(--bg-elevated)',
                fontWeight: 700,
                fontSize: 'var(--text-base)',
                color: 'var(--accent-bright)',
                position: 'sticky',
                right: 0,
                zIndex: 2,
              }}>
                {grandTotal > 0 ? fmt(grandTotal) : '—'}
              </td>
            </tr>
          </tfoot>
        )}
      </table>

      {/* SKU count summary */}
      {data.rows.length > 0 && (
        <div style={{
          textAlign: 'right',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-secondary)',
          marginTop: '0.5rem',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {skuCount} SKU{skuCount !== 1 ? 's' : ''} | {grandTotal > 0 ? fmt(grandTotal) : '0'} gross total
        </div>
      )}
    </div>

    {/* ── Print-only table — no sticky positioning, renders correctly on paper ── */}
    <div className="matrix-print-only" style={{ display: 'none' }}>
      {(printTitle || data.context_label || data.date_label) && (
        <div style={{ marginBottom: '6pt' }}>
          {printTitle && <div className="matrix-print-title">{printTitle}</div>}
          {data.context_label && <div className="matrix-print-label">{data.context_label}</div>}
          {data.date_label && <div className="matrix-print-label">{data.date_label}</div>}
        </div>
      )}
      <div className="matrix-print-grid">
        <div className="matrix-print-row" style={printGridStyle}>
          <div className="mpo-hdr" style={{ textAlign: 'left' }}>Design</div>
          <div className="mpo-hdr">CLR</div>
          {data.sizes.map((s) => (
            <div key={s.size_id} className="mpo-hdr">{s.size_name}</div>
          ))}
          <div className="mpo-hdr">TOTAL</div>
        </div>
        {data.rows.map((row) => {
            const rowKey = `${row.design_id}|${row.colour_id}`
            const isFirst = !printRenderedDesigns.has(row.design_id)
            if (isFirst) printRenderedDesigns.add(row.design_id)
            const rowTotal = data.sizes.reduce((sum, s) => sum + (row.cells[s.size_id] ?? 0), 0)
            return (
              <div key={rowKey} className="matrix-print-row" style={printGridStyle}>
                <div className="mpo-design">{isFirst ? row.design_name : ''}</div>
                <div className="mpo-clr">{row.colour_code}</div>
                {data.sizes.map((s) => {
                  const qty = row.cells[s.size_id] ?? 0
                  return (
                    <div key={s.size_id} className="mpo-cell">{qty > 0 ? fmt(qty) : ''}</div>
                  )
                })}
                <div className="mpo-total">{rowTotal > 0 ? fmt(rowTotal) : '—'}</div>
              </div>
            )
          })}
        {data.rows.length > 0 && (
          <div className="matrix-print-row mpo-footer" style={printGridStyle}>
            <div style={{ gridColumn: 'span 2', textAlign: 'left', fontWeight: 700, fontSize: '9pt', textTransform: 'uppercase' }}>
              Grand Total
            </div>
            {data.sizes.map((s) => {
              const colTotal = sizeColumnTotals[s.size_id] ?? 0
              return (
                <div key={s.size_id} className="mpo-cell" style={{ fontWeight: 700 }}>
                  {fmt(colTotal)}
                </div>
              )
            })}
            <div className="mpo-total">{grandTotal > 0 ? fmt(grandTotal) : '—'}</div>
          </div>
        )}
      </div>
    </div>
    </>
  )
}

// ── PrintButton ───────────────────────────────────────────────

export function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <button
      type="button"
      className="matrix-no-print"
      onClick={() => window.print()}
      style={{
        fontSize: 'var(--text-sm)',
        padding: '0.45rem 1rem',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        background: 'var(--accent)',
        color: '#fff',
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  )
}
