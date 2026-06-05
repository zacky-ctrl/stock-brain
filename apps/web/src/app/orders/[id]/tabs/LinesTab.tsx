'use client'

import { useActionState, useState, useMemo, useEffect, Fragment } from 'react'
import { amendOrderLineAction, addOrderLineAction } from '../actions'
import type { ActionState } from '@/lib/masters'
import { inputStyle, selectStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'
import { MatrixViewToggle } from '@/components/matrix/MatrixViewToggle'
import { MatrixGrid } from '@/components/matrix/MatrixGrid'
import { MatrixFilterBar } from '@/components/matrix/MatrixFilterBar'
import { buildMatrixFromOrderLines, filterMatrixData } from '@stock-brain/domain'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import type { SizeMasterRow, DesignMasterRow, ColourMasterRow, OrderLineRow } from '@stock-brain/domain'
import type { FilterConfig, ActiveFilters } from '@stock-brain/types'
import type { CSSProperties } from 'react'
import type { OrderLineForDisplay, LineAmendmentRecord } from '../types'

type DabbiOption = { id: string; code: string; sort_order: number }

type Props = {
  orderId: string
  lines: OrderLineForDisplay[]
  sizes: SizeMasterRow[]
  designs: DesignMasterRow[]
  colours: ColourMasterRow[]
  dabbis: DabbiOption[]
  brands: { id: string; name: string }[]
  isClosed: boolean
}

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

// ── AmendForm ─────────────────────────────────────────────────

function AmendForm({ line, onCancel, onSuccess }: {
  line: OrderLineForDisplay; onCancel: () => void; onSuccess: () => void
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(amendOrderLineAction, null)
  useEffect(() => { if (state && 'success' in state) onSuccess() }, [state, onSuccess])

  return (
    <form action={formAction} style={{ padding: '0.75rem', background: 'var(--warning-subtle)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <input type="hidden" name="order_line_id" value={line.id} />
      <input type="hidden" name="order_id" value={line.order_id} />
      <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
        Current: Ordered <strong>{fmt(line.ordered_qty)}</strong>{' · '}
        Dispatched <strong>{fmt(line.dispatched_qty)}</strong>{' · '}
        Closed <strong>{fmt(line.closed_qty)}</strong>{' · '}
        Open <strong>{fmt(line.open_qty)}</strong>
      </p>
      {state && 'error' in state && <p style={{ ...msgError, margin: 0 }}>✗ {state.error}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: 'var(--text-sm)' }}>
          <label>New Ordered Qty</label>
          <input name="new_ordered_qty" type="number" min="0.001" step="0.001" defaultValue={line.ordered_qty} style={{ ...inputStyle, width: '100%' }} disabled={isPending} />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Cannot go below dispatched ({fmt(line.dispatched_qty)})</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: 'var(--text-sm)' }}>
          <label>New Closed Qty</label>
          <input name="new_closed_qty" type="number" min="0" step="0.001" defaultValue={line.closed_qty} style={{ ...inputStyle, width: '100%' }} disabled={isPending} />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>0 to ordered qty</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: 'var(--text-sm)' }}>
          <label>Reason (required)</label>
          <input name="reason" style={{ ...inputStyle, width: '100%' }} placeholder="Reason…" required minLength={3} disabled={isPending} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button type="submit" disabled={isPending} style={{ ...btnPrimary, marginTop: 0, opacity: isPending ? 0.6 : 1 }}>
          {isPending ? 'Saving…' : 'Save Amendment'}
        </button>
        <button type="button" onClick={onCancel} disabled={isPending}
          style={{ fontSize: 'var(--text-sm)', padding: '0.4rem 1rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Amendment history per line ────────────────────────────────

type AmendGroup = { key: string; amended_at: string; reason: string; ordered?: { old: string; new: string }; closed?: { old: string; new: string } }

function groupAmendments(rows: LineAmendmentRecord[]): AmendGroup[] {
  const groups: AmendGroup[] = []
  for (const row of rows) {
    const last = groups.at(-1)
    const sameEvent = last && Math.abs(new Date(row.amended_at).getTime() - new Date(last.amended_at).getTime()) < 10_000 && row.reason === last.reason
    if (sameEvent && last) {
      if (row.field_amended === 'ordered_qty') last.ordered = { old: row.old_value, new: row.new_value }
      else if (row.field_amended === 'closed_qty') last.closed = { old: row.old_value, new: row.new_value }
    } else {
      const g: AmendGroup = { key: row.id, amended_at: row.amended_at, reason: row.reason }
      if (row.field_amended === 'ordered_qty') g.ordered = { old: row.old_value, new: row.new_value }
      else if (row.field_amended === 'closed_qty') g.closed = { old: row.old_value, new: row.new_value }
      groups.push(g)
    }
  }
  return groups
}

function LineHistory({ amendments }: { amendments: LineAmendmentRecord[] }) {
  if (amendments.length === 0) return null
  return (
    <div style={{ paddingLeft: '0.5rem', borderLeft: '2px solid var(--border)' }}>
      {groupAmendments(amendments).map((g) => (
        <div key={g.key} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>{new Date(g.amended_at).toLocaleString()}</span>
          {' — '}<span style={{ fontStyle: 'italic' }}>{g.reason}</span>
          {g.ordered && <div style={{ paddingLeft: '0.5rem' }}>Ordered: <span style={{ color: 'var(--danger)' }}>{g.ordered.old}</span> → <span style={{ color: 'var(--success)' }}>{g.ordered.new}</span></div>}
          {g.closed && <div style={{ paddingLeft: '0.5rem' }}>Closed: <span style={{ color: 'var(--danger)' }}>{g.closed.old}</span> → <span style={{ color: 'var(--success)' }}>{g.closed.new}</span></div>}
        </div>
      ))}
    </div>
  )
}

// ── Add Line Form ─────────────────────────────────────────────

function AddLineForm({ orderId, designs, colours, sizes, dabbis }: {
  orderId: string; designs: DesignMasterRow[]; colours: ColourMasterRow[]
  sizes: SizeMasterRow[]; dabbis: DabbiOption[]
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(addOrderLineAction, null)
  useEffect(() => { if (state && 'success' in state) setOpen(false) }, [state])

  const lbl: CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }

  return (
    <div style={{ marginTop: '1rem' }}>
      {!open && (
        <button onClick={() => setOpen(true)} style={{ fontSize: 'var(--text-sm)', padding: '0.3rem 0.75rem', border: '1px solid var(--accent)', color: 'var(--accent)', background: 'var(--accent-subtle)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontWeight: 600 }}>
          + Add Line
        </button>
      )}
      {state && 'error' in state && <p style={{ ...msgError, marginTop: '0.5rem' }}>✗ {state.error}</p>}
      {state && 'success' in state && <p style={{ ...msgOk, marginTop: '0.5rem' }}>✓ {state.success}</p>}

      {open && (
        <form action={formAction} style={{ marginTop: '0.75rem', background: 'var(--info-subtle)', border: '1px solid rgba(56,189,248,0.25)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
          <input type="hidden" name="order_id" value={orderId} />
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--info)', margin: '0 0 0.75rem' }}>Adding a line post-creation. Reason/note is mandatory.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', marginBottom: '0.75rem' }}>
            <div><label style={lbl}>Shape / Design</label>
              <select name="shape_design_id" style={{ ...selectStyle, width: '100%' }} required>
                <option value="">Select…</option>
                {designs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Bindi Colour</label>
              <select name="bindi_colour_id" style={{ ...selectStyle, width: '100%' }} required>
                <option value="">Select…</option>
                {colours.map((c) => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Size</label>
              <select name="size_id" style={{ ...selectStyle, width: '100%' }} required>
                <option value="">Select…</option>
                {sizes.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Dabbi Colour</label>
              <select name="dabbi_colour_id" style={{ ...selectStyle, width: '100%' }} required>
                <option value="">Select…</option>
                {dabbis.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Ordered Qty (gross)</label>
              <input name="ordered_qty" type="number" min="1" step="1" style={{ ...inputStyle, width: '100%' }} required placeholder="0" />
            </div>
            <div><label style={lbl}>Promised Date (optional)</label>
              <input name="promised_date" type="date" style={{ ...inputStyle, width: '100%' }} />
            </div>
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={lbl}>Reason / Notes (required)</label>
            <input name="notes" style={{ ...inputStyle, width: '100%' }} placeholder="Why is this line being added?" required />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={isPending} style={{ ...btnPrimary, margin: 0 }}>{isPending ? 'Adding…' : 'Add Line'}</button>
            <button type="button" onClick={() => setOpen(false)} style={{ fontSize: 'var(--text-sm)', padding: '0.4rem 1rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  )
}

// ── LinesTab ──────────────────────────────────────────────────

export function LinesTab({ orderId, lines, sizes, designs, colours, dabbis, isClosed }: Props) {
  const [view, setView] = useState<'list' | 'matrix'>('list')
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({})
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const th: CSSProperties = { textAlign: 'left', padding: '0.4rem 0.75rem 0.4rem 0', borderBottom: '2px solid var(--border)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }
  const td: CSSProperties = { padding: '0.4rem 0.75rem 0.4rem 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 'var(--text-sm)', verticalAlign: 'top' }
  const tdN: CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const thN: CSSProperties = { ...th, textAlign: 'right' }

  const activeLines = lines.filter((l) => l.open_qty > 0)
  const displayLines = showAll ? lines : activeLines
  const hiddenCount = lines.length - activeLines.length

  const fullMatrixData = useMemo(() => {
    if (!sizes.length || !designs.length || !colours.length) return null
    const rows: OrderLineRow[] = lines.map((l) => ({
      shape_design_id: l.shape_design_id, bindi_colour_id: l.bindi_colour_id, size_id: l.size_id,
      ordered_qty: l.ordered_qty, dispatched_qty: l.dispatched_qty, closed_qty: l.closed_qty, open_qty: l.open_qty,
    }))
    return buildMatrixFromOrderLines(rows, sizes, designs, colours)
  }, [lines, sizes, designs, colours])

  const filterConfig: FilterConfig = useMemo(() => {
    if (!fullMatrixData) return { fields: [] }
    const ds = new Map<string, string>(), cs = new Map<string, string>()
    for (const row of fullMatrixData.rows) { ds.set(row.design_id, row.design_name); cs.set(row.colour_id, row.colour_code) }
    return {
      fields: [
        { key: 'design', label: 'Design', options: [...ds.entries()].map(([id, label]) => ({ id, label })) },
        { key: 'colour', label: 'CLR', options: [...cs.entries()].map(([id, label]) => ({ id, label })) },
      ],
    }
  }, [fullMatrixData])

  const matrixData = useMemo(
    () => fullMatrixData ? filterMatrixData(fullMatrixData, activeFilters, { design: 'design', colour: 'colour' }) : null,
    [fullMatrixData, activeFilters],
  )

  if (lines.length === 0) return <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>No lines on this order.</p>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {fullMatrixData && <MatrixViewToggle view={view} onViewChange={setView} />}
        {view === 'matrix' && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Matrix shows ordered qty. Switch to List to edit lines.
          </span>
        )}
        {view === 'list' && hiddenCount > 0 && (
          <button type="button" onClick={() => setShowAll((s) => !s)}
            style={{ fontSize: 'var(--text-xs)', padding: '0.15rem 0.5rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
            {showAll ? `Hide closed/dispatched (${hiddenCount})` : `Show all (${hiddenCount} hidden)`}
          </button>
        )}
      </div>

      {view === 'matrix' && fullMatrixData && (
        <div style={{ marginBottom: '1rem' }}>
          <MatrixFilterBar filterConfig={filterConfig} activeFilters={activeFilters} onFilterChange={setActiveFilters} />
          <div style={{ overflowX: 'auto' }}><MatrixGrid data={matrixData!} mode="view" /></div>
        </div>
      )}

      {view === 'list' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '780px' }}>
            <thead>
              <tr>
                <th style={th}>Shape</th><th style={th}>CLR</th><th style={th}>Size</th><th style={th}>Dabbi</th>
                <th style={thN}>Ordered</th><th style={thN}>Dispatched</th><th style={thN}>Closed</th><th style={thN}>Open</th>
                <th style={th}>Status</th><th style={th}>Promised</th><th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {displayLines.map((line) => {
                const isEditing = editingLineId === line.id
                const canEdit = line.line_status !== 'fully_dispatched' && line.line_status !== 'closed' && !isClosed
                return (
                  <Fragment key={line.id}>
                    <tr style={{ background: line.line_status === 'fully_dispatched' ? 'rgba(16,185,129,0.04)' : line.line_status === 'closed' ? 'rgba(0,0,0,0.02)' : undefined }}>
                      <td style={td}>{line.shape}</td>
                      <td style={td}>{line.bindi_colour}</td>
                      <td style={td}>{line.size}</td>
                      <td style={{ ...td, fontWeight: 700, color: 'var(--accent)' }}>{line.dabbi}</td>
                      <td style={tdN}>{fmt(line.ordered_qty)}</td>
                      <td style={{ ...tdN, color: line.dispatched_qty > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{fmt(line.dispatched_qty)}</td>
                      <td style={{ ...tdN, color: line.closed_qty > 0 ? 'var(--text-secondary)' : undefined }}>{fmt(line.closed_qty)}</td>
                      <td style={{ ...tdN, fontWeight: line.open_qty > 0 ? 700 : undefined, color: line.open_qty > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>{fmt(line.open_qty)}</td>
                      <td style={td}><Badge variant={statusBadgeVariant(line.line_status)} label={line.line_status.replace(/_/g, ' ')} size="sm" /></td>
                      <td style={{ ...td, color: line.promised_date ? undefined : 'var(--text-muted)' }}>{line.promised_date ?? '—'}</td>
                      <td style={td}>
                        {canEdit && (
                          <button type="button" onClick={() => setEditingLineId(isEditing ? null : line.id)}
                            style={{ fontSize: 'var(--text-xs)', cursor: 'pointer', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', padding: '0.1rem 0.5rem' }}>
                            {isEditing ? 'Cancel' : 'Edit'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isEditing && (
                      <tr>
                        <td colSpan={11} style={{ padding: '0 0 0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
                          <AmendForm line={line} onCancel={() => setEditingLineId(null)} onSuccess={() => setEditingLineId(null)} />
                        </td>
                      </tr>
                    )}
                    {line.amendments.length > 0 && (
                      <tr>
                        <td colSpan={11} style={{ padding: '0 0 0.5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                          <LineHistory amendments={line.amendments} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isClosed && (
        <AddLineForm orderId={orderId} designs={designs} colours={colours} sizes={sizes} dabbis={dabbis} />
      )}
    </div>
  )
}
