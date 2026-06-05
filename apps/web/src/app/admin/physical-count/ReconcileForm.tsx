'use client'

import { useActionState, useState } from 'react'
import {
  applyCuttingsReconciliation,
  applyReadyReconciliation,
  applyVelvetReconciliation,
} from './actions'
import type { ActionState } from '@/lib/masters'
import { inputStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'
import type { CSSProperties } from 'react'

// ── Types passed from server ──────────────────────────────────

export type CuttingsRow = {
  id: string
  label: string
  system_qty: number
  committed_qty: number
  available_qty: number
}

export type ReadyRow = {
  id: string
  label: string
  system_qty: number
  committed_qty: number
  available_qty: number
}

export type VelvetState = {
  bundles_on_hand: number
}

export type ReconcileFormProps = {
  cuttingsRows: CuttingsRow[]
  readyRows: ReadyRow[]
  velvet: VelvetState | null
}

// ── Helpers ───────────────────────────────────────────────────

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

const tdStyle: CSSProperties = {
  padding: '0.35rem 0.75rem 0.35rem 0',
  fontSize: '0.82rem',
  borderBottom: '1px solid var(--border-subtle)',
}

const tabStyle = (active: boolean): CSSProperties => ({
  fontSize: '0.82rem',
  padding: '0.3rem 0.9rem', cursor: 'pointer',
  border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
  background: active ? 'var(--accent)' : 'var(--bg-elevated)',
  color: active ? 'white' : 'var(--text-primary)',
  borderRadius: '2px', marginRight: '0.4rem',
})

const warningStyle: CSSProperties = {
  fontSize: '0.82rem',
  color: 'var(--warning)',
  background: 'var(--warning-subtle)',
  border: '1px solid var(--warning)',
  padding: '0.75rem 1rem', marginBottom: '1.25rem',
}

type Tab = 'cuttings' | 'ready' | 'velvet'

// ── Sub-forms ─────────────────────────────────────────────────

function CuttingsReconcile({ rows }: { rows: CuttingsRow[] }) {
  const [physical, setPhysical] = useState<Record<string, string>>({})
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(applyCuttingsReconciliation, null)

  const variances = rows.map((r) => {
    const p = parseFloat(physical[r.id] ?? '')
    const v = Number.isFinite(p) ? p - r.system_qty : 0
    return { ...r, physical: Number.isFinite(p) ? p : null, variance: v }
  }).filter((r) => r.physical !== null && Math.abs(r.variance) > 0.0005)

  return (
    <div>
      {state && 'error' in state && state.error && <p style={{ ...msgError, marginBottom: '1rem' }}>✗ {state.error}</p>}
      {state && 'success' in state && state.success && <p style={{ ...msgOk, marginBottom: '1rem' }}>✓ {state.success}</p>}

      {rows.length === 0 ? (
        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>No cuttings stock balance rows found.</p>
      ) : (
        <form action={formAction}>
          <table style={{ borderCollapse: 'collapse', marginBottom: '1rem' }}>
            <thead>
              <tr>
                <th style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem', borderBottom: '2px solid var(--border)' }}>SKU (Design/CLR/Size)</th>
                <th style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem', borderBottom: '2px solid var(--border)', textAlign: 'right' }}>System</th>
                <th style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem', borderBottom: '2px solid var(--border)', textAlign: 'right' }}>Physical Count</th>
                <th style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem', borderBottom: '2px solid var(--border)', textAlign: 'right' }}>Variance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = parseFloat(physical[r.id] ?? '')
                const hasP = Number.isFinite(p)
                const variance = hasP ? p - r.system_qty : 0
                const varColor = variance > 0 ? 'var(--success)' : variance < 0 ? 'var(--danger)' : 'var(--text-secondary)'
                return (
                  <tr key={r.id}>
                    <td style={tdStyle}>{r.label}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(r.system_qty)}
                      <input type="hidden" name={`system_${r.id}`} value={r.system_qty} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <input
                        type="number" min="0" step="0.001"
                        name={`physical_${r.id}`}
                        value={physical[r.id] ?? ''}
                        onChange={(e) => setPhysical((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        style={{ ...inputStyle, width: '90px', textAlign: 'right' }}
                        placeholder={fmt(r.system_qty)}
                      />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: varColor, fontWeight: hasP && variance !== 0 ? 'bold' : undefined }}>
                      {hasP && variance !== 0 ? `${variance > 0 ? '+' : ''}${variance.toFixed(3)}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {variances.length > 0 && (
            <div style={{ background: 'var(--warning-subtle)', border: '1px solid var(--warning)', padding: '0.75rem', marginBottom: '0.75rem', fontSize: '0.82rem', color: 'var(--warning)' }}>
              {variances.length} row{variances.length !== 1 ? 's' : ''} with variance. Review before approving.
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input name="reason" style={{ ...inputStyle, width: '280px' }} placeholder="Reason for reconciliation" required />
            <button type="submit" disabled={isPending || variances.length === 0} style={{ ...btnPrimary, margin: 0 }}>
              {isPending ? 'Applying…' : `Apply Reconciliation (${variances.length} variances)`}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function ReadyReconcile({ rows }: { rows: ReadyRow[] }) {
  const [physical, setPhysical] = useState<Record<string, string>>({})
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(applyReadyReconciliation, null)

  const variances = rows.map((r) => {
    const p = parseFloat(physical[r.id] ?? '')
    const v = Number.isFinite(p) ? p - r.system_qty : 0
    return { ...r, physical: Number.isFinite(p) ? p : null, variance: v }
  }).filter((r) => r.physical !== null && Math.abs(r.variance) > 0.0005)

  return (
    <div>
      {state && 'error' in state && state.error && <p style={{ ...msgError, marginBottom: '1rem' }}>✗ {state.error}</p>}
      {state && 'success' in state && state.success && <p style={{ ...msgOk, marginBottom: '1rem' }}>✓ {state.success}</p>}

      {rows.length === 0 ? (
        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>No ready stock balance rows found.</p>
      ) : (
        <form action={formAction}>
          <table style={{ borderCollapse: 'collapse', marginBottom: '1rem' }}>
            <thead>
              <tr>
                <th style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem', borderBottom: '2px solid var(--border)' }}>SKU</th>
                <th style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem', borderBottom: '2px solid var(--border)', textAlign: 'right' }}>System</th>
                <th style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem', borderBottom: '2px solid var(--border)', textAlign: 'right' }}>Committed</th>
                <th style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem', borderBottom: '2px solid var(--border)', textAlign: 'right' }}>Physical Count</th>
                <th style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem', borderBottom: '2px solid var(--border)', textAlign: 'right' }}>Variance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = parseFloat(physical[r.id] ?? '')
                const hasP = Number.isFinite(p)
                const variance = hasP ? p - r.system_qty : 0
                const varColor = variance > 0 ? 'var(--success)' : variance < 0 ? 'var(--danger)' : 'var(--text-secondary)'
                const belowCommitted = hasP && p < r.committed_qty
                return (
                  <tr key={r.id}>
                    <td style={tdStyle}>{r.label}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(r.system_qty)}
                      <input type="hidden" name={`system_${r.id}`} value={r.system_qty} />
                      <input type="hidden" name={`committed_${r.id}`} value={r.committed_qty} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{fmt(r.committed_qty)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <input
                        type="number" min="0" step="0.001"
                        name={`physical_${r.id}`}
                        value={physical[r.id] ?? ''}
                        onChange={(e) => setPhysical((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        style={{ ...inputStyle, width: '90px', textAlign: 'right', borderColor: belowCommitted ? 'var(--danger)' : undefined }}
                        placeholder={fmt(r.system_qty)}
                      />
                      {belowCommitted && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--danger)' }}>below committed</div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: varColor, fontWeight: hasP && variance !== 0 ? 'bold' : undefined }}>
                      {hasP && variance !== 0 ? `${variance > 0 ? '+' : ''}${variance.toFixed(3)}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {variances.length > 0 && (
            <div style={{ background: 'var(--warning-subtle)', border: '1px solid var(--warning)', padding: '0.75rem', marginBottom: '0.75rem', fontSize: '0.82rem', color: 'var(--warning)' }}>
              {variances.length} row{variances.length !== 1 ? 's' : ''} with variance. Review before approving.
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input name="reason" style={{ ...inputStyle, width: '280px' }} placeholder="Reason for reconciliation" required />
            <button type="submit" disabled={isPending || variances.length === 0} style={{ ...btnPrimary, margin: 0 }}>
              {isPending ? 'Applying…' : `Apply Reconciliation (${variances.length} variances)`}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function VelvetReconcile({ velvet }: { velvet: VelvetState | null }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(applyVelvetReconciliation, null)

  const systemBundles = velvet?.bundles_on_hand ?? 0

  return (
    <div>
      {state && 'error' in state && state.error && <p style={{ ...msgError, marginBottom: '1rem' }}>✗ {state.error}</p>}
      {state && 'success' in state && state.success && <p style={{ ...msgOk, marginBottom: '1rem' }}>✓ {state.success}</p>}

      <p style={{ fontSize: '0.88rem', marginBottom: '1rem' }}>
        System velvet: <strong>{fmt(systemBundles)}</strong> bundles ({fmt(systemBundles * 25)} m)
      </p>

      <form action={formAction} style={{ maxWidth: '500px' }}>
        <input type="hidden" name="system_bundles" value={systemBundles} />
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>
              Physical Count (bundles)
            </label>
            <input
              name="physical_bundles" type="number" min="0" step="0.001"
              style={{ ...inputStyle, width: '130px' }}
              placeholder={fmt(systemBundles)}
              required
            />
          </div>
          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.2rem' }}>
              Reason
            </label>
            <input name="reason" style={{ ...inputStyle, width: '250px' }} placeholder="Reason for reconciliation" required />
          </div>
        </div>
        <button type="submit" disabled={isPending} style={{ ...btnPrimary, margin: 0 }}>
          {isPending ? 'Applying…' : 'Apply Velvet Reconciliation'}
        </button>
      </form>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────

export function ReconcileForm({ cuttingsRows, readyRows, velvet }: ReconcileFormProps) {
  const [tab, setTab] = useState<Tab>('cuttings')

  return (
    <div>
      <div style={warningStyle}>
        ⚠ Physical count reconciliation creates stock_correction records and immediately adjusts balances.
        All corrections are permanent and auditable. Review variances carefully before approving.
      </div>

      <div style={{ display: 'flex', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button style={tabStyle(tab === 'cuttings')} onClick={() => setTab('cuttings')}>Cuttings</button>
        <button style={tabStyle(tab === 'ready')} onClick={() => setTab('ready')}>Ready Stock</button>
        <button style={tabStyle(tab === 'velvet')} onClick={() => setTab('velvet')}>Velvet</button>
      </div>

      {tab === 'cuttings' && <CuttingsReconcile rows={cuttingsRows} />}
      {tab === 'ready' && <ReadyReconcile rows={readyRows} />}
      {tab === 'velvet' && <VelvetReconcile velvet={velvet} />}
    </div>
  )
}
