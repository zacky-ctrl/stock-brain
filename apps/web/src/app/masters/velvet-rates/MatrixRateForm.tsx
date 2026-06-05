'use client'

import { useState, useTransition } from 'react'
import { saveVelvetRatesMatrixAction } from './actions'
import { inputStyle, selectStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'

type ShapeOption = { id: string; name: string }
type SizeOption = { id: string; code: string }
type ExistingRate = {
  shape_design_id: string
  size_id: string
  gross_per_metre: number
  metres_per_bundle: number
  buffer_gross: number
}

type Props = {
  shapes: ShapeOption[]
  sizes: SizeOption[]
  existingRates: ExistingRate[]
}

type SizeInputs = {
  gross_per_metre: string
  metres_per_bundle: string
  buffer_gross: string
}

const labelSm = {
  fontSize: 'var(--text-xs)',
  color: 'var(--text-secondary)',
  display: 'block' as const,
  marginBottom: '0.15rem',
}

const badgeExists = {
  fontSize: '0.65rem',
  padding: '0.1rem 0.4rem',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--success-subtle)',
  color: 'var(--success)',
  fontWeight: 700,
  border: '1px solid rgba(16,185,129,0.3)',
}

const badgeNew = {
  fontSize: '0.65rem',
  padding: '0.1rem 0.4rem',
  borderRadius: 'var(--radius-sm)',
  background: 'rgba(99,102,241,0.1)',
  color: 'var(--accent)',
  fontWeight: 700,
  border: '1px solid rgba(99,102,241,0.3)',
}

const applyBtn = {
  fontSize: 'var(--text-xs)',
  padding: '0.2rem 0.5rem',
  border: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  cursor: 'pointer',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap' as const,
}

const numInput = { ...inputStyle, width: '88px', textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' }

export function MatrixRateForm({ shapes, sizes, existingRates }: Props) {
  const [selectedShape, setSelectedShape] = useState('')
  const [inputs, setInputs] = useState<Record<string, SizeInputs>>({})
  const [defaultGross, setDefaultGross] = useState('')
  const [defaultMpb, setDefaultMpb] = useState('')
  const [defaultBuffer, setDefaultBuffer] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const existingMap = new Map(
    existingRates.map((r) => [`${r.shape_design_id}|${r.size_id}`, r]),
  )

  function handleShapeChange(shapeId: string) {
    setSelectedShape(shapeId)
    setMessage(null)
    const initial: Record<string, SizeInputs> = {}
    for (const size of sizes) {
      const ex = existingMap.get(`${shapeId}|${size.id}`)
      initial[size.id] = ex
        ? {
            gross_per_metre: String(ex.gross_per_metre),
            metres_per_bundle: String(ex.metres_per_bundle),
            buffer_gross: String(ex.buffer_gross),
          }
        : { gross_per_metre: '', metres_per_bundle: '', buffer_gross: '' }
    }
    setInputs(initial)
  }

  function setField(sizeId: string, field: keyof SizeInputs, value: string) {
    setInputs((prev) => ({ ...prev, [sizeId]: { ...(prev[sizeId] ?? { gross_per_metre: '', metres_per_bundle: '', buffer_gross: '' }), [field]: value } }))
  }

  function applyDefault(field: keyof SizeInputs, value: string, emptyOnly: boolean) {
    if (!value) return
    setInputs((prev) => {
      const next = { ...prev }
      for (const size of sizes) {
        const cur = prev[size.id] ?? { gross_per_metre: '', metres_per_bundle: '', buffer_gross: '' }
        if (emptyOnly && cur[field]) continue
        next[size.id] = { ...cur, [field]: value }
      }
      return next
    })
  }

  function handleSave() {
    if (!reason.trim()) { setMessage({ type: 'err', text: 'Reason is required' }); return }
    const rows = sizes.flatMap((size) => {
      const inp = inputs[size.id]
      if (!inp?.gross_per_metre) return []
      const gross = parseFloat(inp.gross_per_metre)
      const mpb   = parseFloat(inp.metres_per_bundle || '25')
      const buf   = parseFloat(inp.buffer_gross || '10')
      if (!Number.isFinite(gross) || gross <= 0) return []
      return [{
        shape_design_id: selectedShape,
        size_id:         size.id,
        gross_per_metre: gross,
        metres_per_bundle: Number.isFinite(mpb) && mpb > 0 ? mpb : 25,
        buffer_gross:    Number.isFinite(buf) && buf >= 0 ? buf : 10,
      }]
    })
    if (rows.length === 0) { setMessage({ type: 'err', text: 'No rows to save — enter at least one Gross/Metre value' }); return }
    setMessage({ type: 'ok', text: `Saving ${rows.length} rate${rows.length === 1 ? '' : 's'}…` })
    startTransition(async () => {
      const result = await saveVelvetRatesMatrixAction({ rows, reason: reason.trim() })
      if (result.error) {
        setMessage({ type: 'err', text: result.error })
      } else {
        setMessage({ type: 'ok', text: `✓ ${result.success}` })
        setReason('')
      }
    })
  }

  const readyToSave = sizes.some((s) => !!inputs[s.id]?.gross_per_metre)
  const saveCount   = sizes.filter((s) => !!inputs[s.id]?.gross_per_metre).length

  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', marginBottom: '2rem' }}>
      <p style={{ fontSize: 'var(--text-sm)', fontWeight: 700, margin: '0 0 0.75rem', color: 'var(--text-primary)' }}>
        Matrix Entry — set rates for all sizes of one shape at once
      </p>

      {/* Shape selector */}
      <div style={{ marginBottom: '1rem' }}>
        <span style={labelSm}>Shape</span>
        <select
          value={selectedShape}
          onChange={(e) => handleShapeChange(e.target.value)}
          style={{ ...selectStyle, width: '220px' }}
        >
          <option value="">Select shape…</option>
          {shapes.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {selectedShape && (
        <>
          {/* Apply to all defaults */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem', padding: '0.6rem 0.75rem', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', alignItems: 'flex-end' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', alignSelf: 'center', fontWeight: 600, minWidth: '80px' }}>Apply to all:</span>
            {([
              { label: 'Gross/Metre',    field: 'gross_per_metre' as const,   val: defaultGross,  set: setDefaultGross  },
              { label: 'Metres/Bundle',  field: 'metres_per_bundle' as const, val: defaultMpb,    set: setDefaultMpb    },
              { label: 'Buffer Gross',   field: 'buffer_gross' as const,      val: defaultBuffer, set: setDefaultBuffer },
            ]).map(({ label, field, val, set }) => (
              <div key={field} style={{ display: 'flex', alignItems: 'flex-end', gap: '0.3rem' }}>
                <div>
                  <span style={labelSm}>{label}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    style={{ ...numInput, width: '80px' }}
                    placeholder="—"
                  />
                </div>
                <button type="button" onClick={() => applyDefault(field, val, true)}  style={applyBtn}>Fill empty</button>
                <button type="button" onClick={() => applyDefault(field, val, false)} style={applyBtn}>Fill all</button>
              </div>
            ))}
          </div>

          {/* Size matrix table */}
          <div style={{ overflowX: 'auto', marginBottom: '0.75rem' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '520px' }}>
              <thead>
                <tr>
                  <th style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'left', padding: '0.3rem 0.5rem', borderBottom: '1px solid var(--border)', width: '60px' }}>SIZE</th>
                  <th style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'right', padding: '0.3rem 0.5rem', borderBottom: '1px solid var(--border)' }}>GROSS/METRE</th>
                  <th style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'right', padding: '0.3rem 0.5rem', borderBottom: '1px solid var(--border)' }}>METRES/BUNDLE</th>
                  <th style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'right', padding: '0.3rem 0.5rem', borderBottom: '1px solid var(--border)' }}>BUFFER GROSS</th>
                  <th style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center', padding: '0.3rem 0.5rem', borderBottom: '1px solid var(--border)' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {sizes.map((size) => {
                  const inp = inputs[size.id] ?? { gross_per_metre: '', metres_per_bundle: '', buffer_gross: '' }
                  const hasExisting = existingMap.has(`${selectedShape}|${size.id}`)
                  return (
                    <tr key={size.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.3rem 0.5rem', fontSize: 'var(--text-sm)', fontWeight: 600 }}>{size.code}</td>
                      <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={inp.gross_per_metre}
                          onChange={(e) => setField(size.id, 'gross_per_metre', e.target.value)}
                          style={numInput}
                          placeholder="—"
                        />
                      </td>
                      <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={inp.metres_per_bundle}
                          onChange={(e) => setField(size.id, 'metres_per_bundle', e.target.value)}
                          style={numInput}
                          placeholder="25"
                        />
                      </td>
                      <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right' }}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={inp.buffer_gross}
                          onChange={(e) => setField(size.id, 'buffer_gross', e.target.value)}
                          style={numInput}
                          placeholder="10"
                        />
                      </td>
                      <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center' }}>
                        <span style={hasExisting ? badgeExists : badgeNew}>
                          {hasExisting ? 'Exists' : 'New'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Reason + Save */}
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <span style={labelSm}>Reason (required — affects planning engine)</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{ ...inputStyle, width: '300px' }}
                placeholder="e.g. Updated rates from new velvet spec"
              />
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !readyToSave}
              style={{ ...btnPrimary, margin: 0 }}
            >
              {isPending ? 'Saving…' : `Save ${saveCount > 0 ? saveCount : ''} rate${saveCount === 1 ? '' : 's'}`}
            </button>
          </div>

          {message && (
            <p style={{ ...(message.type === 'err' ? msgError : msgOk), padding: '0.25rem 0.5rem', marginTop: '0.4rem' }}>
              {message.text}
            </p>
          )}
        </>
      )}
    </div>
  )
}
