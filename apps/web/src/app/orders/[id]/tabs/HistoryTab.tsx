'use client'

import { useState } from 'react'
import type { DispatchEventFull, HeaderAmendmentRecord, OrderLineForDisplay, LineAmendmentRecord } from '../types'
import Link from 'next/link'

type Props = {
  dispatchHistory: DispatchEventFull[]
  headerAmendments: HeaderAmendmentRecord[]
  linesForDisplay: OrderLineForDisplay[]
}

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

type CombinedAmendment = {
  amended_at: string
  context: string
  field_amended: string
  old_value: string
  new_value: string
  reason: string
}

export function HistoryTab({ dispatchHistory, headerAmendments, linesForDisplay }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Combined amendment history ────────────────────────────────
  const lineAmendments: CombinedAmendment[] = linesForDisplay.flatMap((l) =>
    l.amendments.map((a: LineAmendmentRecord) => ({
      amended_at: a.amended_at,
      context: `${l.shape} ${l.bindi_colour} ${l.size} / ${l.dabbi}`,
      field_amended: a.field_amended,
      old_value: a.old_value,
      new_value: a.new_value,
      reason: a.reason,
    })),
  )

  const headerAmendmentsMapped: CombinedAmendment[] = headerAmendments.map((a) => ({
    amended_at: a.amended_at,
    context: 'Order header',
    field_amended: a.field_amended,
    old_value: a.old_value,
    new_value: a.new_value,
    reason: a.reason,
  }))

  const allAmendments = [...lineAmendments, ...headerAmendmentsMapped].sort(
    (a, b) => (a.amended_at < b.amended_at ? 1 : -1),
  )

  const tdStyle = {
    padding: '0.4rem 0.65rem',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    borderBottom: '1px solid var(--border-subtle)',
    verticalAlign: 'top' as const,
  }

  return (
    <div>
      {/* ── Dispatch History ───────────────────────────────────── */}
      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
        Dispatch History
        <span style={{ fontWeight: 400, marginLeft: '0.5rem', color: 'var(--text-muted)' }}>({dispatchHistory.length})</span>
      </div>

      {dispatchHistory.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginBottom: '2rem' }}>No confirmed dispatches yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '2rem' }}>
          {[...dispatchHistory].reverse().map((ev) => {
            const isExpanded = expandedIds.has(ev.id)
            const isExtrasOnly = ev.orderedQty === 0 && ev.extrasQty > 0
            return (
              <div key={ev.id} style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
              }}>
                <button
                  type="button"
                  onClick={() => toggleExpand(ev.id)}
                  style={{
                    width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
                    padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
                  }}
                >
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', width: '12px', flexShrink: 0 }}>
                    {isExpanded ? '▾' : '▸'}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: isExtrasOnly ? 'var(--info)' : 'var(--text-primary)', flex: 1 }}>
                    {isExtrasOnly ? 'Extra — ' : ''}{ev.dispatch_date}
                    {ev.reference && <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>· {ev.reference}</span>}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {fmt(ev.totalQty)} gross
                    {ev.orderedQty > 0 && ev.extrasQty > 0 && (
                      <span style={{ color: 'var(--text-muted)', marginLeft: '0.4rem' }}>
                        (ord {fmt(ev.orderedQty)} + ext {fmt(ev.extrasQty)})
                      </span>
                    )}
                  </span>
                  <Link
                    href={`/dispatch/${ev.id}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{ fontSize: 'var(--text-xs)', color: 'var(--info)', fontFamily: 'monospace', marginLeft: '0.5rem' }}
                  >
                    {ev.id.slice(0, 8)}
                  </Link>
                </button>

                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '0.5rem 1rem 0.75rem' }}>
                    {isExtrasOnly && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--info)', marginBottom: '0.4rem' }}>
                        Parcel filler — not linked to specific order lines
                      </div>
                    )}
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 'var(--text-xs)' }}>
                      <tbody>
                        {ev.lines.map((l) => (
                          <tr key={l.key}>
                            <td style={{ padding: '0.12rem 0.3rem 0.12rem 0', width: '36px' }}>
                              {l.line_type === 'extra' && (
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.05rem 0.25rem', borderRadius: '2px', background: 'rgba(99,102,241,0.12)', color: 'var(--info)' }}>EXTRA</span>
                              )}
                              {l.line_type === 'short' && (
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.05rem 0.25rem', borderRadius: '2px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>SHORT</span>
                              )}
                              {l.line_type === 'substitute' && (
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.05rem 0.25rem', borderRadius: '2px', background: 'rgba(245,158,11,0.12)', color: 'var(--warning)' }}>SUB</span>
                              )}
                            </td>
                            <td style={{ padding: '0.12rem 0.3rem 0.12rem 0', color: 'var(--text-secondary)' }}>{l.shape}</td>
                            <td style={{ padding: '0.12rem 0.3rem 0.12rem 0', color: 'var(--text-secondary)' }}>{l.bindi_colour}</td>
                            <td style={{ padding: '0.12rem 0.3rem 0.12rem 0', color: 'var(--text-secondary)' }}>{l.size}</td>
                            <td style={{ padding: '0.12rem 0.3rem 0.12rem 0', color: 'var(--text-muted)' }}>{l.dabbi}</td>
                            <td style={{ padding: '0.12rem 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: l.line_type === 'extra' ? 'var(--info)' : 'var(--text-primary)' }}>
                              {fmt(l.quantity_dispatched)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Amendment History ──────────────────────────────────── */}
      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
        Amendment History
        <span style={{ fontWeight: 400, marginLeft: '0.5rem', color: 'var(--text-muted)' }}>({allAmendments.length})</span>
      </div>

      {allAmendments.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No amendments recorded.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '600px' }}>
            <thead>
              <tr>
                {['When', 'What', 'Field', 'Old', 'New', 'Reason'].map((h) => (
                  <th key={h} style={{ ...tdStyle, color: 'var(--text-secondary)', fontWeight: 700, borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allAmendments.map((a, i) => (
                <tr key={i}>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{new Date(a.amended_at).toLocaleString()}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: '0.7rem' }}>{a.context}</td>
                  <td style={tdStyle}>{a.field_amended.replace(/_/g, ' ')}</td>
                  <td style={{ ...tdStyle, color: 'var(--danger)' }}>{a.old_value || '—'}</td>
                  <td style={{ ...tdStyle, color: 'var(--success)' }}>{a.new_value || '—'}</td>
                  <td style={{ ...tdStyle, fontStyle: 'italic' }}>{a.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
