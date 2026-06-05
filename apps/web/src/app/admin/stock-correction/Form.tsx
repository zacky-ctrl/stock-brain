'use client'

import { useActionState, useState, useTransition, useMemo } from 'react'
import {
  applyVelvetCorrection,
  applyWipWriteOff,
  applyBulkReadyCorrections,
  applyBulkCuttingsCorrections,
} from './actions'
import type { ActionState } from '@/lib/masters'
import type { BulkCorrectionInput, BulkCorrectionResult } from './actions'
import { fieldWrap, inputStyle, selectStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'
import type { CSSProperties } from 'react'

// ── Exported types (used by page.tsx) ─────────────────────────

export type DimOption = { id: string; code: string }

export type BalanceOption = {
  id: string
  label: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  brand_id: string
  shape_code: string
  bindi_code: string
  size_code: string
  dabbi_code: string
  brand_code: string
  current_gross_qty: number
  committed_qty: number
  available_qty: number
}

export type CuttingsBalanceOption = {
  id: string
  label: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  shape_code: string
  bindi_code: string
  size_code: string
  current_gross_qty: number
  committed_qty: number
  available_qty: number
}

export type VelvetBalance = {
  bundles_on_hand: number
}

export type WipLineOption = {
  id: string
  job_label: string
  line_label: string
  wip_qty: number
}

export type CorrectionHistoryRow = {
  id: string
  corrected_at: string
  stock_stage: string
  sku_label: string
  old_value: number
  new_value: number
  delta_value: number
  reason: string
}

export type StockCorrectionFormProps = {
  readyBalances: BalanceOption[]
  cuttingsBalances: CuttingsBalanceOption[]
  velvetBalance: VelvetBalance | null
  wipLines: WipLineOption[]
  shapes: DimOption[]
  bindis: DimOption[]
  sizes: DimOption[]
  dabbis: DimOption[]
  brands: DimOption[]
  history: CorrectionHistoryRow[]
}

// ── Cascade state types ───────────────────────────────────────

type ReadyCascade = {
  shape_id: string
  bindi_id: string
  size_id: string
  dabbi_id: string
  brand_id: string
}

type CuttingsCascade = {
  shape_id: string
  bindi_id: string
  size_id: string
}

type ReadyLine = {
  localId: string
  cascade: ReadyCascade
  new_gross_qty: string
  reason: string
}

type CuttingsLine = {
  localId: string
  cascade: CuttingsCascade
  new_gross_qty: string
  reason: string
}

const EMPTY_READY_CASCADE: ReadyCascade = { shape_id: '', bindi_id: '', size_id: '', dabbi_id: '', brand_id: '' }
const EMPTY_CUTTINGS_CASCADE: CuttingsCascade = { shape_id: '', bindi_id: '', size_id: '' }

function newReadyLine(): ReadyLine {
  return { localId: crypto.randomUUID(), cascade: EMPTY_READY_CASCADE, new_gross_qty: '', reason: '' }
}
function newCuttingsLine(): CuttingsLine {
  return { localId: crypto.randomUUID(), cascade: EMPTY_CUTTINGS_CASCADE, new_gross_qty: '', reason: '' }
}

// ── Balance resolution ────────────────────────────────────────

function resolveReady(balances: BalanceOption[], c: ReadyCascade): BalanceOption | null {
  if (!c.shape_id || !c.bindi_id || !c.size_id || !c.dabbi_id || !c.brand_id) return null
  return balances.find(
    (b) =>
      b.shape_design_id === c.shape_id &&
      b.bindi_colour_id === c.bindi_id &&
      b.size_id === c.size_id &&
      b.dabbi_colour_id === c.dabbi_id &&
      b.brand_id === c.brand_id,
  ) ?? null
}

function resolveCuttings(balances: CuttingsBalanceOption[], c: CuttingsCascade): CuttingsBalanceOption | null {
  if (!c.shape_id || !c.bindi_id || !c.size_id) return null
  return balances.find(
    (b) =>
      b.shape_design_id === c.shape_id &&
      b.bindi_colour_id === c.bindi_id &&
      b.size_id === c.size_id,
  ) ?? null
}

// ── Helpers ───────────────────────────────────────────────────

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10)
}

function filterDims(ids: string[], sorted: DimOption[]): DimOption[] {
  const set = new Set(ids)
  return sorted.filter((d) => set.has(d.id))
}

// ── Styles ────────────────────────────────────────────────────

const warningStyle: CSSProperties = {
  fontSize: '0.82rem',
  color: 'var(--warning)',
  background: 'var(--warning-subtle)',
  border: '1px solid var(--warning)',
  padding: '0.75rem 1rem',
  marginBottom: '1.25rem',
}

const tabStyle = (active: boolean): CSSProperties => ({
  fontSize: '0.82rem',
  padding: '0.3rem 0.9rem',
  cursor: 'pointer',
  border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
  background: active ? 'var(--accent)' : 'var(--bg-elevated)',
  color: active ? 'white' : 'var(--text-primary)',
  borderRadius: '2px',
  marginRight: '0.4rem',
})

const thStyle: CSSProperties = {
  padding: '0.35rem 0.75rem 0.35rem 0',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  borderBottom: '2px solid var(--border)',
  whiteSpace: 'nowrap',
}

const tdStyle: CSSProperties = {
  padding: '0.5rem 0.75rem 0.5rem 0',
  fontSize: '0.85rem',
  borderBottom: '1px solid var(--border-subtle)',
  verticalAlign: 'top',
}

const compactSelect: CSSProperties = {
  ...selectStyle,
  padding: '0.35rem 0.5rem',
  fontSize: '0.82rem',
  minWidth: '80px',
}

const compactInput: CSSProperties = {
  ...inputStyle,
  padding: '0.35rem 0.5rem',
  fontSize: '0.82rem',
}

const skuInfoBox: CSSProperties = {
  padding: '0.5rem 0.75rem',
  background: 'var(--surface-raised)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  fontSize: '0.82rem',
  color: 'var(--text-secondary)',
  marginTop: '0.4rem',
}

type Stage = 'ready' | 'cuttings' | 'velvet' | 'wip'

// ── Cascading Ready SKU Selector ──────────────────────────────

function CascadingReadySelector({
  balances, shapes, bindis, sizes, dabbis, brands,
  value, onChange,
}: {
  balances: BalanceOption[]
  shapes: DimOption[]
  bindis: DimOption[]
  sizes: DimOption[]
  dabbis: DimOption[]
  brands: DimOption[]
  value: ReadyCascade
  onChange: (c: ReadyCascade) => void
}) {
  const byShape  = useMemo(() => value.shape_id ? balances.filter((b) => b.shape_design_id === value.shape_id) : balances, [balances, value.shape_id])
  const byBindi  = useMemo(() => value.bindi_id  ? byShape.filter((b) => b.bindi_colour_id === value.bindi_id)  : byShape,  [byShape,  value.bindi_id])
  const bySize   = useMemo(() => value.size_id   ? byBindi.filter((b) => b.size_id === value.size_id)           : byBindi,  [byBindi,  value.size_id])
  const byDabbi  = useMemo(() => value.dabbi_id  ? bySize.filter((b) => b.dabbi_colour_id === value.dabbi_id)   : bySize,   [bySize,   value.dabbi_id])

  const availShapes = useMemo(() => filterDims(balances.map((b) => b.shape_design_id), shapes), [balances, shapes])
  const availBindis = useMemo(() => filterDims(byShape.map((b) => b.bindi_colour_id),  bindis), [byShape,  bindis])
  const availSizes  = useMemo(() => filterDims(byBindi.map((b) => b.size_id),           sizes),  [byBindi,  sizes])
  const availDabbis = useMemo(() => filterDims(bySize.map((b) => b.dabbi_colour_id),   dabbis), [bySize,   dabbis])
  const availBrands = useMemo(() => filterDims(byDabbi.map((b) => b.brand_id),         brands), [byDabbi,  brands])

  const resolved = resolveReady(balances, value)

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <select
          style={compactSelect}
          value={value.shape_id}
          onChange={(e) => onChange({ shape_id: e.target.value, bindi_id: '', size_id: '', dabbi_id: '', brand_id: '' })}
        >
          <option value="">Design</option>
          {availShapes.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
        </select>
        <select
          style={compactSelect}
          value={value.bindi_id}
          disabled={!value.shape_id}
          onChange={(e) => onChange({ ...value, bindi_id: e.target.value, size_id: '', dabbi_id: '', brand_id: '' })}
        >
          <option value="">CLR</option>
          {availBindis.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
        </select>
        <select
          style={compactSelect}
          value={value.size_id}
          disabled={!value.bindi_id}
          onChange={(e) => onChange({ ...value, size_id: e.target.value, dabbi_id: '', brand_id: '' })}
        >
          <option value="">Size</option>
          {availSizes.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
        </select>
        <select
          style={compactSelect}
          value={value.dabbi_id}
          disabled={!value.size_id}
          onChange={(e) => onChange({ ...value, dabbi_id: e.target.value, brand_id: '' })}
        >
          <option value="">Dabbi</option>
          {availDabbis.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
        </select>
        <select
          style={compactSelect}
          value={value.brand_id}
          disabled={!value.dabbi_id}
          onChange={(e) => onChange({ ...value, brand_id: e.target.value })}
        >
          <option value="">Brand</option>
          {availBrands.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
        </select>
      </div>
      {resolved ? (
        <div style={skuInfoBox}>
          <strong style={{ color: 'var(--text-primary)' }}>{resolved.label}</strong>
          {'  '}
          <span>Gross: {fmt(resolved.current_gross_qty)}</span>
          {' | '}
          <span>Committed: {fmt(resolved.committed_qty)}</span>
          {' | '}
          <span>Available: {fmt(resolved.available_qty)}</span>
        </div>
      ) : value.shape_id ? (
        <div style={{ ...skuInfoBox, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
          Select all 5 dimensions to identify the SKU
        </div>
      ) : null}
    </div>
  )
}

// ── Cascading Cuttings SKU Selector ──────────────────────────

function CascadingCuttingsSelector({
  balances, shapes, bindis, sizes,
  value, onChange,
}: {
  balances: CuttingsBalanceOption[]
  shapes: DimOption[]
  bindis: DimOption[]
  sizes: DimOption[]
  value: CuttingsCascade
  onChange: (c: CuttingsCascade) => void
}) {
  const byShape = useMemo(() => value.shape_id ? balances.filter((b) => b.shape_design_id === value.shape_id) : balances, [balances, value.shape_id])
  const byBindi = useMemo(() => value.bindi_id ? byShape.filter((b) => b.bindi_colour_id === value.bindi_id)  : byShape,  [byShape,  value.bindi_id])

  const availShapes = useMemo(() => filterDims(balances.map((b) => b.shape_design_id), shapes), [balances, shapes])
  const availBindis = useMemo(() => filterDims(byShape.map((b) => b.bindi_colour_id),  bindis), [byShape,  bindis])
  const availSizes  = useMemo(() => filterDims(byBindi.map((b) => b.size_id),           sizes),  [byBindi,  sizes])

  const resolved = resolveCuttings(balances, value)

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <select
          style={compactSelect}
          value={value.shape_id}
          onChange={(e) => onChange({ shape_id: e.target.value, bindi_id: '', size_id: '' })}
        >
          <option value="">Design</option>
          {availShapes.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
        </select>
        <select
          style={compactSelect}
          value={value.bindi_id}
          disabled={!value.shape_id}
          onChange={(e) => onChange({ ...value, bindi_id: e.target.value, size_id: '' })}
        >
          <option value="">CLR</option>
          {availBindis.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
        </select>
        <select
          style={compactSelect}
          value={value.size_id}
          disabled={!value.bindi_id}
          onChange={(e) => onChange({ ...value, size_id: e.target.value })}
        >
          <option value="">Size</option>
          {availSizes.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
        </select>
      </div>
      {resolved ? (
        <div style={skuInfoBox}>
          <strong style={{ color: 'var(--text-primary)' }}>{resolved.label}</strong>
          {'  '}
          <span>Gross: {fmt(resolved.current_gross_qty)}</span>
          {' | '}
          <span>Committed: {fmt(resolved.committed_qty)}</span>
          {' | '}
          <span>Available: {fmt(resolved.available_qty)}</span>
        </div>
      ) : value.shape_id ? (
        <div style={{ ...skuInfoBox, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
          Select all 3 dimensions to identify the SKU
        </div>
      ) : null}
    </div>
  )
}

// ── Multi-line Ready form ─────────────────────────────────────

function MultiLineReadyForm({
  balances, shapes, bindis, sizes, dabbis, brands,
}: {
  balances: BalanceOption[]
  shapes: DimOption[]
  bindis: DimOption[]
  sizes: DimOption[]
  dabbis: DimOption[]
  brands: DimOption[]
}) {
  const [lines, setLines] = useState<ReadyLine[]>([newReadyLine()])
  const [isPending, startTransition] = useTransition()
  const [bulkResult, setBulkResult] = useState<BulkCorrectionResult | null>(null)
  const [bulkError, setBulkError] = useState<string | null>(null)

  function addLine() {
    setLines((prev) => [...prev, newReadyLine()])
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.localId !== id))
  }

  function updateCascade(id: string, cascade: ReadyCascade) {
    setLines((prev) => prev.map((l) => l.localId === id ? { ...l, cascade } : l))
  }

  function updateField(id: string, field: 'new_gross_qty' | 'reason', val: string) {
    setLines((prev) => prev.map((l) => l.localId === id ? { ...l, [field]: val } : l))
  }

  const validLines = lines.filter((l) => {
    const b = resolveReady(balances, l.cascade)
    return b !== null && l.new_gross_qty !== '' && l.reason.trim() !== ''
  })

  function handleApplyAll() {
    setBulkError(null)
    setBulkResult(null)

    if (!validLines.length) {
      setBulkError('No complete correction lines — resolve SKU, enter new qty and reason for each line.')
      return
    }

    const corrections: BulkCorrectionInput[] = validLines.map((l) => ({
      balance_id: resolveReady(balances, l.cascade)!.id,
      new_gross_qty: parseFloat(l.new_gross_qty),
      reason: l.reason.trim(),
    }))

    startTransition(async () => {
      const res = await applyBulkReadyCorrections(corrections)
      if ('error' in res) {
        setBulkError(res.error)
      } else {
        setBulkResult(res)
        if (res.errors.length === 0) {
          setLines([newReadyLine()])
        }
      }
    })
  }

  if (balances.length === 0) {
    return <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>No ready stock balance rows found.</p>
  }

  return (
    <div>
      {bulkError && <p style={{ ...msgError, marginBottom: '1rem' }}>✗ {bulkError}</p>}
      {bulkResult && (
        <div style={{ ...msgOk, marginBottom: '1rem' }}>
          ✓ {bulkResult.applied} correction{bulkResult.applied !== 1 ? 's' : ''} applied.
          {bulkResult.errors.length > 0 && (
            <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.25rem' }}>
              {bulkResult.errors.map((e, i) => <li key={i} style={{ color: 'var(--danger)' }}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {lines.length} line{lines.length !== 1 ? 's' : ''}
          {validLines.length > 0 && ` — ${validLines.length} ready to apply`}
        </span>
        <button
          type="button"
          onClick={addLine}
          style={{
            fontSize: '0.82rem',
            padding: '0.3rem 0.8rem',
            cursor: 'pointer',
            border: '1px solid var(--accent)',
            background: 'transparent',
            color: 'var(--accent)',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 600,
          }}
        >
          + Add Line
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {lines.map((line) => {
          const resolved = resolveReady(balances, line.cascade)
          const newQty = line.new_gross_qty !== '' ? parseFloat(line.new_gross_qty) : null
          const delta = resolved !== null && newQty !== null ? newQty - resolved.current_gross_qty : null

          return (
            <div
              key={line.localId}
              style={{
                padding: '0.75rem 1rem',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <CascadingReadySelector
                  balances={balances}
                  shapes={shapes} bindis={bindis} sizes={sizes} dabbis={dabbis} brands={brands}
                  value={line.cascade}
                  onChange={(c) => updateCascade(line.localId, c)}
                />
                <button
                  type="button"
                  onClick={() => removeLine(line.localId)}
                  disabled={lines.length === 1}
                  style={{
                    fontSize: '0.85rem',
                    padding: '0.3rem 0.6rem',
                    cursor: lines.length === 1 ? 'default' : 'pointer',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    borderRadius: 'var(--radius-sm)',
                    flexShrink: 0,
                    opacity: lines.length === 1 ? 0.4 : 1,
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ ...fieldWrap, minWidth: '110px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>New Gross Qty</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    style={compactInput}
                    placeholder="New total"
                    value={line.new_gross_qty}
                    onChange={(e) => updateField(line.localId, 'new_gross_qty', e.target.value)}
                  />
                </div>
                {delta !== null && (
                  <div style={{ paddingBottom: '0.35rem', fontWeight: 700, fontSize: '0.85rem', fontVariantNumeric: 'tabular-nums', color: delta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {delta >= 0 ? '+' : ''}{fmt(delta)}
                  </div>
                )}
                <div style={{ ...fieldWrap, flex: 1, minWidth: '180px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Reason (required)</label>
                  <input
                    style={compactInput}
                    placeholder="e.g. Physical count discrepancy"
                    value={line.reason}
                    onChange={(e) => updateField(line.localId, 'reason', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {validLines.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <th style={thStyle}>SKU</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Current</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>New</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Change</th>
                <th style={thStyle}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {validLines.map((l) => {
                const b = resolveReady(balances, l.cascade)!
                const newQty = parseFloat(l.new_gross_qty)
                const delta = newQty - b.current_gross_qty
                return (
                  <tr key={l.localId}>
                    <td style={tdStyle}>{b.label}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(b.current_gross_qty)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(newQty)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: delta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {delta >= 0 ? '+' : ''}{fmt(delta)}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{l.reason}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        onClick={handleApplyAll}
        disabled={isPending || validLines.length === 0}
        style={{ ...btnPrimary, marginTop: '1rem', opacity: validLines.length === 0 ? 0.5 : 1 }}
      >
        {isPending ? 'Applying…' : `Apply All Corrections${validLines.length > 0 ? ` (${validLines.length})` : ''}`}
      </button>
    </div>
  )
}

// ── Multi-line Cuttings form ──────────────────────────────────

function MultiLineCuttingsForm({
  balances, shapes, bindis, sizes,
}: {
  balances: CuttingsBalanceOption[]
  shapes: DimOption[]
  bindis: DimOption[]
  sizes: DimOption[]
}) {
  const [lines, setLines] = useState<CuttingsLine[]>([newCuttingsLine()])
  const [isPending, startTransition] = useTransition()
  const [bulkResult, setBulkResult] = useState<BulkCorrectionResult | null>(null)
  const [bulkError, setBulkError] = useState<string | null>(null)

  function addLine() {
    setLines((prev) => [...prev, newCuttingsLine()])
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.localId !== id))
  }

  function updateCascade(id: string, cascade: CuttingsCascade) {
    setLines((prev) => prev.map((l) => l.localId === id ? { ...l, cascade } : l))
  }

  function updateField(id: string, field: 'new_gross_qty' | 'reason', val: string) {
    setLines((prev) => prev.map((l) => l.localId === id ? { ...l, [field]: val } : l))
  }

  const validLines = lines.filter((l) => {
    const b = resolveCuttings(balances, l.cascade)
    return b !== null && l.new_gross_qty !== '' && l.reason.trim() !== ''
  })

  function handleApplyAll() {
    setBulkError(null)
    setBulkResult(null)

    if (!validLines.length) {
      setBulkError('No complete correction lines — resolve SKU, enter new qty and reason for each line.')
      return
    }

    const corrections: BulkCorrectionInput[] = validLines.map((l) => ({
      balance_id: resolveCuttings(balances, l.cascade)!.id,
      new_gross_qty: parseFloat(l.new_gross_qty),
      reason: l.reason.trim(),
    }))

    startTransition(async () => {
      const res = await applyBulkCuttingsCorrections(corrections)
      if ('error' in res) {
        setBulkError(res.error)
      } else {
        setBulkResult(res)
        if (res.errors.length === 0) {
          setLines([newCuttingsLine()])
        }
      }
    })
  }

  if (balances.length === 0) {
    return <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>No cuttings stock balance rows found.</p>
  }

  return (
    <div>
      {bulkError && <p style={{ ...msgError, marginBottom: '1rem' }}>✗ {bulkError}</p>}
      {bulkResult && (
        <div style={{ ...msgOk, marginBottom: '1rem' }}>
          ✓ {bulkResult.applied} correction{bulkResult.applied !== 1 ? 's' : ''} applied.
          {bulkResult.errors.length > 0 && (
            <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.25rem' }}>
              {bulkResult.errors.map((e, i) => <li key={i} style={{ color: 'var(--danger)' }}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {lines.length} line{lines.length !== 1 ? 's' : ''}
          {validLines.length > 0 && ` — ${validLines.length} ready to apply`}
        </span>
        <button
          type="button"
          onClick={addLine}
          style={{
            fontSize: '0.82rem',
            padding: '0.3rem 0.8rem',
            cursor: 'pointer',
            border: '1px solid var(--accent)',
            background: 'transparent',
            color: 'var(--accent)',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 600,
          }}
        >
          + Add Line
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {lines.map((line) => {
          const resolved = resolveCuttings(balances, line.cascade)
          const newQty = line.new_gross_qty !== '' ? parseFloat(line.new_gross_qty) : null
          const delta = resolved !== null && newQty !== null ? newQty - resolved.current_gross_qty : null

          return (
            <div
              key={line.localId}
              style={{
                padding: '0.75rem 1rem',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <CascadingCuttingsSelector
                  balances={balances}
                  shapes={shapes} bindis={bindis} sizes={sizes}
                  value={line.cascade}
                  onChange={(c) => updateCascade(line.localId, c)}
                />
                <button
                  type="button"
                  onClick={() => removeLine(line.localId)}
                  disabled={lines.length === 1}
                  style={{
                    fontSize: '0.85rem',
                    padding: '0.3rem 0.6rem',
                    cursor: lines.length === 1 ? 'default' : 'pointer',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    borderRadius: 'var(--radius-sm)',
                    flexShrink: 0,
                    opacity: lines.length === 1 ? 0.4 : 1,
                  }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ ...fieldWrap, minWidth: '110px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>New Gross Qty</label>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    style={compactInput}
                    placeholder="New total"
                    value={line.new_gross_qty}
                    onChange={(e) => updateField(line.localId, 'new_gross_qty', e.target.value)}
                  />
                </div>
                {delta !== null && (
                  <div style={{ paddingBottom: '0.35rem', fontWeight: 700, fontSize: '0.85rem', fontVariantNumeric: 'tabular-nums', color: delta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {delta >= 0 ? '+' : ''}{fmt(delta)}
                  </div>
                )}
                <div style={{ ...fieldWrap, flex: 1, minWidth: '180px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Reason (required)</label>
                  <input
                    style={compactInput}
                    placeholder="e.g. Physical count discrepancy"
                    value={line.reason}
                    onChange={(e) => updateField(line.localId, 'reason', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {validLines.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <th style={thStyle}>SKU</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Current</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>New</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Change</th>
                <th style={thStyle}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {validLines.map((l) => {
                const b = resolveCuttings(balances, l.cascade)!
                const newQty = parseFloat(l.new_gross_qty)
                const delta = newQty - b.current_gross_qty
                return (
                  <tr key={l.localId}>
                    <td style={tdStyle}>{b.label}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(b.current_gross_qty)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(newQty)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: delta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {delta >= 0 ? '+' : ''}{fmt(delta)}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{l.reason}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        onClick={handleApplyAll}
        disabled={isPending || validLines.length === 0}
        style={{ ...btnPrimary, marginTop: '1rem', opacity: validLines.length === 0 ? 0.5 : 1 }}
      >
        {isPending ? 'Applying…' : `Apply All Corrections${validLines.length > 0 ? ` (${validLines.length})` : ''}`}
      </button>
    </div>
  )
}

// ── Velvet form (unchanged) ───────────────────────────────────

function VelvetForm({ balance }: { balance: VelvetBalance | null }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(applyVelvetCorrection, null)

  return (
    <div>
      {state && 'error' in state && <p style={{ ...msgError, marginBottom: '1rem' }}>✗ {state.error}</p>}
      {state && 'success' in state && <p style={{ ...msgOk, marginBottom: '1rem' }}>✓ {state.success}</p>}

      {balance !== null && (
        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Current velvet stock: <strong>{fmt(balance.bundles_on_hand)}</strong> bundles ({fmt(balance.bundles_on_hand * 25)} m)
        </p>
      )}

      <form action={formAction} style={{ maxWidth: '600px' }}>
        <div style={{ ...fieldWrap, marginBottom: '0.75rem' }}>
          <label>New Bundles on Hand</label>
          <input name="new_bundles" type="number" min="0" step="0.001" style={inputStyle} placeholder="Correct total (not a delta)" required />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Enter the correct total bundles, not a change.</span>
        </div>
        <div style={{ ...fieldWrap, marginBottom: '0.75rem' }}>
          <label>Reason (required)</label>
          <input name="reason" style={inputStyle} placeholder="e.g. Physical count discrepancy" required />
        </div>
        <div style={{ ...fieldWrap, marginBottom: '1.25rem' }}>
          <label>Notes (optional)</label>
          <input name="notes" style={inputStyle} placeholder="Additional context" />
        </div>
        <button type="submit" disabled={isPending} style={{ ...btnPrimary, fontWeight: 'bold', marginTop: 0 }}>
          {isPending ? 'Applying…' : 'Apply Correction'}
        </button>
      </form>
    </div>
  )
}

// ── WIP write-off form (unchanged) ───────────────────────────

function WipForm({ wipLines }: { wipLines: WipLineOption[] }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(applyWipWriteOff, null)

  return (
    <div>
      {state && 'error' in state && <p style={{ ...msgError, marginBottom: '1rem' }}>✗ {state.error}</p>}
      {state && 'success' in state && <p style={{ ...msgOk, marginBottom: '1rem' }}>✓ {state.success}</p>}

      {wipLines.length === 0 ? (
        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>No active WIP job lines found.</p>
      ) : (
        <form action={formAction} style={{ maxWidth: '600px' }}>
          <div style={{ ...fieldWrap, marginBottom: '0.75rem' }}>
            <label>Labour Job Line</label>
            <select name="job_line_id" style={selectStyle} required>
              <option value="">Select job line…</option>
              {wipLines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.job_label} — {l.line_label} — {fmt(l.wip_qty)} WIP
                </option>
              ))}
            </select>
          </div>
          <div style={{ ...fieldWrap, marginBottom: '0.75rem' }}>
            <label>Write-off Qty (gross)</label>
            <input name="writeoff_qty" type="number" min="0.001" step="0.001" style={inputStyle} placeholder="Qty to write off" required />
          </div>
          <div style={{ ...fieldWrap, marginBottom: '0.75rem' }}>
            <label>Reason (required) — damaged / lost / unrecoverable</label>
            <input name="reason" style={inputStyle} placeholder="e.g. goods damaged at labour unit" required />
          </div>
          <div style={{ ...fieldWrap, marginBottom: '1.25rem' }}>
            <label>Notes (optional)</label>
            <input name="notes" style={inputStyle} placeholder="Additional context" />
          </div>
          <button type="submit" disabled={isPending} style={{ ...btnPrimary, fontWeight: 'bold', marginTop: 0 }}>
            {isPending ? 'Applying…' : 'Apply Write-off'}
          </button>
        </form>
      )}
    </div>
  )
}

// ── History section ───────────────────────────────────────────

function HistorySection({ history }: { history: CorrectionHistoryRow[] }) {
  const today = new Date()
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(today.getDate() - 7)

  const [fromDate, setFromDate] = useState(sevenDaysAgo.toISOString().slice(0, 10))
  const [toDate, setToDate] = useState(today.toISOString().slice(0, 10))
  const [stageFilter, setStageFilter] = useState<'all' | 'ready' | 'cuttings' | 'velvet' | 'wip'>('all')
  const [movementFilter, setMovementFilter] = useState<'all' | 'positive' | 'negative'>('all')

  const filtered = useMemo(() => {
    return history.filter((h) => {
      const date = h.corrected_at.slice(0, 10)
      if (date < fromDate || date > toDate) return false
      if (stageFilter !== 'all' && h.stock_stage !== stageFilter) return false
      if (movementFilter === 'positive' && h.delta_value <= 0) return false
      if (movementFilter === 'negative' && h.delta_value >= 0) return false
      return true
    })
  }, [history, fromDate, toDate, stageFilter, movementFilter])

  return (
    <div style={{ marginTop: '3rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 1rem' }}>Recent Corrections</h2>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'flex-end' }}>
        <div style={fieldWrap}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>From</label>
          <input type="date" style={compactInput} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div style={fieldWrap}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>To</label>
          <input type="date" style={compactInput} value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div style={fieldWrap}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Stage</label>
          <select style={compactSelect} value={stageFilter} onChange={(e) => setStageFilter(e.target.value as typeof stageFilter)}>
            <option value="all">All stages</option>
            <option value="ready">Ready</option>
            <option value="cuttings">Cuttings</option>
            <option value="velvet">Velvet</option>
            <option value="wip">WIP</option>
          </select>
        </div>
        <div style={fieldWrap}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Movement</label>
          <select style={compactSelect} value={movementFilter} onChange={(e) => setMovementFilter(e.target.value as typeof movementFilter)}>
            <option value="all">All</option>
            <option value="positive">Positive (+)</option>
            <option value="negative">Negative (−)</option>
          </select>
        </div>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', paddingBottom: '0.35rem' }}>
          {filtered.length} record{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>No corrections match these filters.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>SKU</th>
                <th style={thStyle}>Stage</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Old Qty</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>New Qty</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Change</th>
                <th style={thStyle}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((h) => (
                <tr key={h.id}>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtDate(h.corrected_at)}</td>
                  <td style={{ ...tdStyle, maxWidth: '200px' }}>{h.sku_label}</td>
                  <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{h.stock_stage}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(h.old_value)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(h.new_value)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: h.delta_value >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {h.delta_value >= 0 ? '+' : ''}{fmt(h.delta_value)}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)', maxWidth: '200px' }}>{h.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────

export function StockCorrectionForm({
  readyBalances,
  cuttingsBalances,
  velvetBalance,
  wipLines,
  shapes,
  bindis,
  sizes,
  dabbis,
  brands,
  history,
}: StockCorrectionFormProps) {
  const [stage, setStage] = useState<Stage>('ready')

  return (
    <div>
      <div style={warningStyle}>
        ⚠ Stock corrections are permanent audit records. Every correction is attributed to an actor
        with reason. This is an admin exception path — not a routine operation.
      </div>

      <div style={{ display: 'flex', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.25rem' }}>
        <button style={tabStyle(stage === 'ready')}    onClick={() => setStage('ready')}>Ready Stock</button>
        <button style={tabStyle(stage === 'cuttings')} onClick={() => setStage('cuttings')}>Cuttings</button>
        <button style={tabStyle(stage === 'velvet')}   onClick={() => setStage('velvet')}>Velvet</button>
        <button style={tabStyle(stage === 'wip')}      onClick={() => setStage('wip')}>WIP Write-off</button>
      </div>

      {stage === 'ready' && (
        <MultiLineReadyForm
          balances={readyBalances}
          shapes={shapes} bindis={bindis} sizes={sizes} dabbis={dabbis} brands={brands}
        />
      )}
      {stage === 'cuttings' && (
        <MultiLineCuttingsForm
          balances={cuttingsBalances}
          shapes={shapes} bindis={bindis} sizes={sizes}
        />
      )}
      {stage === 'velvet' && <VelvetForm balance={velvetBalance} />}
      {stage === 'wip' && <WipForm wipLines={wipLines} />}

      <HistorySection history={history} />
    </div>
  )
}
