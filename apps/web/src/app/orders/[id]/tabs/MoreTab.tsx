'use client'

import { useActionState, useState, useTransition, useEffect } from 'react'
import { amendOrderHeaderAction } from '../actions'
import { createDispatchAction } from '@/app/dispatch/new/actions'
import type { ActionState } from '@/lib/masters'
import { inputStyle, selectStyle, btnPrimary, fieldWrap, msgError, msgOk } from '@/lib/ui'
import type { CSSProperties } from 'react'
import type { ExtraSkuOption } from '../types'

type CustomerOption = { id: string; name: string }

type Props = {
  orderId: string
  orderCustomerId: string
  orderDate: string
  orderReference: string | null
  orderNotes: string | null
  customerName: string
  customerBrandRule: string
  customerOptions: CustomerOption[]
  extraStockOptions: ExtraSkuOption[]
  totalOrdered: number
  linesCount: number
  totalOrderedDispatched: number
  totalExtrasSent: number
  totalOpen: number
  totalClosed: number
  fulfilmentPct: number
  openLineCount: number
}

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

const labelStyle: CSSProperties = {
  fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem',
}

const sectionTitle: CSSProperties = {
  fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.07em', color: 'var(--text-secondary)', marginBottom: '0.75rem',
}

// ── Extra stock form ──────────────────────────────────────────

type PendingLine = { localId: string; balance_id: string; qty: string }

function newLine(defaultId: string): PendingLine {
  return { localId: crypto.randomUUID(), balance_id: defaultId, qty: '' }
}

function ExtraStockForm({ customerId, options }: { customerId: string; options: ExtraSkuOption[] }) {
  const defaultId = options[0]?.id ?? ''
  const [lines, setLines] = useState<PendingLine[]>([newLine(defaultId)])
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionState>(null)
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState('')

  const compactInput: CSSProperties = { ...inputStyle, padding: '0.35rem 0.5rem', fontSize: '0.82rem' }
  const compactSelect: CSSProperties = { ...selectStyle, padding: '0.35rem 0.5rem', fontSize: '0.82rem' }

  function addLine() { setLines((prev) => [...prev, newLine(defaultId)]) }
  function removeLine(id: string) { if (lines.length > 1) setLines((prev) => prev.filter((l) => l.localId !== id)) }
  function updateLine(id: string, field: 'balance_id' | 'qty', val: string) {
    setLines((prev) => prev.map((l) => l.localId === id ? { ...l, [field]: val } : l))
  }

  const validLines = lines.filter((l) => {
    const opt = options.find((o) => o.id === l.balance_id)
    const qty = parseFloat(l.qty)
    return opt && Number.isFinite(qty) && qty > 0 && qty <= opt.gross_qty
  })

  function handleDispatch() {
    if (!validLines.length) return
    setResult(null)
    const dispatchLines = validLines.map((l) => ({
      order_id: null, order_line_id: null,
      ready_stock_balance_id: l.balance_id,
      quantity_dispatched: parseFloat(l.qty),
      line_type: 'extra' as const,
    }))
    const formData = new FormData()
    formData.set('customer_id', customerId)
    formData.set('dispatch_date', dispatchDate)
    formData.set('reference', reference)
    formData.set('dispatch_lines', JSON.stringify(dispatchLines))
    startTransition(async () => {
      const res = await createDispatchAction(null, formData)
      setResult(res)
      if (res && 'success' in res) setLines([newLine(defaultId)])
    })
  }

  if (options.length === 0) {
    return <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>No ready stock available to send as extras.</p>
  }

  return (
    <div>
      {result && 'error' in result && <p style={{ ...msgError, marginBottom: '0.75rem' }}>✗ {result.error}</p>}
      {result && 'success' in result && <p style={{ ...msgOk, marginBottom: '0.75rem' }}>✓ {result.success}</p>}

      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div style={fieldWrap}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Date</label>
          <input type="date" style={compactInput} value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} />
        </div>
        <div style={{ ...fieldWrap, flex: 1, minWidth: '160px' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Reference (optional)</label>
          <input style={compactInput} placeholder="Challan / note" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '0.75rem' }}>
        {lines.map((line) => {
          const opt = options.find((o) => o.id === line.balance_id)
          const qty = parseFloat(line.qty)
          const isOverGross = opt && Number.isFinite(qty) && qty > opt.gross_qty
          return (
            <div key={line.localId} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <select style={{ ...compactSelect, flex: 1, minWidth: '200px' }} value={line.balance_id} onChange={(e) => updateLine(line.localId, 'balance_id', e.target.value)}>
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <div>
                <input type="number" min="0.001" step="1"
                  style={{ ...compactInput, width: '80px', border: isOverGross ? '1px solid var(--danger)' : undefined }}
                  placeholder="Qty" value={line.qty} onChange={(e) => updateLine(line.localId, 'qty', e.target.value)} />
                {isOverGross && opt && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '0.1rem' }}>max {fmt(opt.gross_qty)}</div>
                )}
              </div>
              {opt && opt.committed_qty > 0 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--warning)', alignSelf: 'center' }}>⚠ {fmt(opt.committed_qty)} committed</div>
              )}
              <button type="button" onClick={() => removeLine(line.localId)} disabled={lines.length === 1}
                style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: lines.length === 1 ? 'default' : 'pointer', borderRadius: 'var(--radius-sm)', opacity: lines.length === 1 ? 0.4 : 1 }}>
                ✕
              </button>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={addLine}
          style={{ fontSize: '0.8rem', padding: '0.3rem 0.75rem', border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontWeight: 600 }}>
          + Add Line
        </button>
        <button type="button" onClick={handleDispatch} disabled={isPending || validLines.length === 0}
          style={{ ...btnPrimary, opacity: validLines.length === 0 ? 0.5 : 1 }}>
          {isPending ? 'Dispatching…' : `Dispatch Extras${validLines.length > 0 ? ` (${validLines.length})` : ''}`}
        </button>
      </div>
    </div>
  )
}

// ── Header edit form ──────────────────────────────────────────

function HeaderEditForm({
  orderId, orderCustomerId, orderDate, orderReference, orderNotes, customerOptions,
}: {
  orderId: string; orderCustomerId: string; orderDate: string
  orderReference: string | null; orderNotes: string | null
  customerOptions: CustomerOption[]
}) {
  const [editing, setEditing] = useState(false)
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(amendOrderHeaderAction, null)

  useEffect(() => {
    if (state && 'success' in state) setEditing(false)
  }, [state])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
          Customer: <strong style={{ color: 'var(--text-primary)' }}>
            {customerOptions.find((c) => c.id === orderCustomerId)?.name ?? '—'}
          </strong>
          {' · '}{orderDate}
          {orderReference && <span style={{ marginLeft: '0.4rem' }}>· Ref: <strong>{orderReference}</strong></span>}
          {orderNotes && <span style={{ marginLeft: '0.4rem', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>· {orderNotes}</span>}
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)}
            style={{ fontSize: 'var(--text-xs)', padding: '0.2rem 0.65rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            Edit Header
          </button>
        )}
      </div>

      {state && 'error' in state && <p style={{ ...msgError, marginBottom: '0.5rem' }}>✗ {state.error}</p>}
      {state && 'success' in state && <p style={{ ...msgOk, marginBottom: '0.5rem' }}>✓ {state.success}</p>}

      {editing && (
        <form action={formAction} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', padding: '1rem', marginTop: '0.5rem', borderRadius: 'var(--radius-md)' }}>
          <input type="hidden" name="order_id" value={orderId} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Customer</label>
              <select name="new_customer_id" defaultValue={orderCustomerId} style={{ ...selectStyle, width: '100%' }}>
                {customerOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Order Date</label>
              <input name="new_order_date" type="date" defaultValue={orderDate} style={{ ...inputStyle, width: '100%' }} required />
            </div>
            <div>
              <label style={labelStyle}>Reference</label>
              <input name="new_reference" defaultValue={orderReference ?? ''} style={{ ...inputStyle, width: '100%' }} placeholder="Optional" />
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <input name="new_notes" defaultValue={orderNotes ?? ''} style={{ ...inputStyle, width: '100%' }} placeholder="Optional" />
            </div>
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <label style={labelStyle}>Reason for change (required)</label>
            <input name="reason" style={{ ...inputStyle, width: '100%' }} placeholder="Why is this being changed?" required />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={isPending} style={{ ...btnPrimary, margin: 0 }}>
              {isPending ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={() => setEditing(false)}
              style={{ fontSize: 'var(--text-sm)', padding: '0.4rem 1rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ── MoreTab ───────────────────────────────────────────────────

export function MoreTab({
  orderId, orderCustomerId, orderDate, orderReference, orderNotes,
  customerName, customerBrandRule, customerOptions,
  extraStockOptions,
  totalOrdered, linesCount, totalOrderedDispatched, totalExtrasSent,
  totalOpen, totalClosed, fulfilmentPct, openLineCount,
}: Props) {
  const divider: CSSProperties = { borderTop: '1px solid var(--border-subtle)', marginTop: '1.75rem', paddingTop: '1.75rem' }

  return (
    <div>
      {/* ── 1. Edit Header ─────────────────────────────────────── */}
      <div style={sectionTitle}>Order Header</div>
      <HeaderEditForm
        orderId={orderId}
        orderCustomerId={orderCustomerId}
        orderDate={orderDate}
        orderReference={orderReference}
        orderNotes={orderNotes}
        customerOptions={customerOptions}
      />

      {/* ── 2. Add Extra to Parcel ────────────────────────────── */}
      {extraStockOptions.length > 0 && (
        <div style={divider}>
          <div style={sectionTitle}>Add Extra to Parcel</div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '0 0 0.75rem' }}>
            Send additional stock with next delivery — not linked to order lines, not counted in fulfilment.
          </p>
          <ExtraStockForm customerId={orderCustomerId} options={extraStockOptions} />
        </div>
      )}

      {/* ── 3. Order Summary ──────────────────────────────────── */}
      <div style={divider}>
        <div style={sectionTitle}>Order Summary</div>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1rem', maxWidth: '340px' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Customer: <strong style={{ color: 'var(--text-secondary)' }}>{customerName}</strong>
            {' · '}{customerBrandRule.replace(/_/g, ' ')}
          </div>
          {(
            [
              ['Ordered', `${fmt(totalOrdered)} (${linesCount} lines)`, undefined],
              ['Dispatched', fmt(totalOrderedDispatched), totalOrderedDispatched > 0 ? 'var(--success)' : undefined],
              ...(totalExtrasSent > 0 ? [
                ['Extras sent', fmt(totalExtrasSent), 'var(--info)' as string | undefined],
                ['Total sent', fmt(totalOrderedDispatched + totalExtrasSent), undefined],
              ] : []),
              ['Pending', `${fmt(totalOpen)} (${openLineCount} lines)`, totalOpen > 0 ? 'var(--warning)' : 'var(--text-muted)'],
              ...(totalClosed > 0 ? [['Closed', fmt(totalClosed), 'var(--text-muted)' as string | undefined]] : []),
            ] as [string, string, string | undefined][]
          ).map(([label, value, color]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.4rem' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{label}</span>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: color ?? 'var(--text-primary)' }}>{value}</span>
            </div>
          ))}
          <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Fulfilment</span>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: fulfilmentPct === 100 ? 'var(--success)' : 'var(--text-primary)' }}>{fulfilmentPct}%</span>
            </div>
            <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px' }}>
              <div style={{ height: '100%', width: `${Math.min(fulfilmentPct, 100)}%`, background: fulfilmentPct === 100 ? 'var(--success)' : 'var(--accent)', borderRadius: '2px', transition: 'width 300ms' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
