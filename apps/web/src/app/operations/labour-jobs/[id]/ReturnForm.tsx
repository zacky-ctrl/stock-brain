'use client'

import { useActionState, useState, useEffect } from 'react'
import type { ActionState } from '@/lib/masters'
import { fieldWrap, inputStyle, selectStyle, btnPrimary, msgError, msgOk } from '@/lib/ui'
import { Badge } from '@/components/ui/Badge'
import type { CSSProperties } from 'react'

export type JobLineForReturn = {
  id: string
  shape: string
  bindi_colour: string
  size: string
  dabbi_colour: string
  dabbi_colour_id: string
  brand: string
  quantity_sent_gross: number
  quantity_returned_gross: number
  available_dabbi_colours: { id: string; code: string }[]
}

type ReturnLineState = {
  labour_job_line_id: string
  quantity_returned_gross: string
  variance_gross: string
  variance_type: 'none' | 'short_count' | 'wastage' | 'rejected' | 'other'
  variance_notes: string
  actual_dabbi_colour_id: string
}

type DraftPayload = {
  returnLines: ReturnLineState[]
  timestamp: number
}

export type ReturnFormProps = {
  jobId: string
  jobLines: JobLineForReturn[]
  dabbiColours: { id: string; code: string }[]
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>
}

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

function draftAgeLabel(ms: number): string {
  const mins = Math.floor(ms / 60000)
  return mins < 1 ? 'just now' : `${mins} min ago`
}

const pillStyle: CSSProperties = {
  display: 'inline-block',
  padding: '0.15rem 0.5rem',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  borderRadius: '9999px',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-strong)',
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
}

const dataRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: 'var(--text-sm)',
  marginBottom: '0.25rem',
}

const labelStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-xs)',
}

export function ReturnForm({ jobId, jobLines, action }: ReturnFormProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, null)

  const today = new Date().toISOString().split('T')[0]

  const DRAFT_KEY = `labour-return-draft-${jobId}`

  const [returnLines, setReturnLines] = useState<ReturnLineState[]>(
    jobLines.map((jl) => ({
      labour_job_line_id: jl.id,
      quantity_returned_gross: '',
      variance_gross: '0',
      variance_type: 'none',
      variance_notes: '',
      actual_dabbi_colour_id: jl.dabbi_colour_id,
    })),
  )

  const [hasDraft, setHasDraft] = useState(false)
  const [draftAge, setDraftAge] = useState('')

  // On mount: check for existing draft < 24 hours
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as DraftPayload
      const ageMs = Date.now() - parsed.timestamp
      if (ageMs < 86_400_000) {
        setHasDraft(true)
        setDraftAge(draftAgeLabel(ageMs))
      } else {
        localStorage.removeItem(DRAFT_KEY)
      }
    } catch {
      // ignore malformed draft
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Save draft on every returnLines change
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ returnLines, timestamp: Date.now() }))
    } catch {
      // quota exceeded or SSR — ignore
    }
  }, [returnLines]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear draft on successful submit
  useEffect(() => {
    if (state && 'success' in state) {
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
      setHasDraft(false)
    }
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleRestoreDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as DraftPayload
      setReturnLines(parsed.returnLines)
      setHasDraft(false)
    } catch { /* ignore */ }
  }

  function handleDiscardDraft() {
    try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
    setHasDraft(false)
  }

  const updateLine = (i: number, field: keyof ReturnLineState, value: string) =>
    setReturnLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))

  const payload = JSON.stringify(
    returnLines.map((l) => ({
      labour_job_line_id: l.labour_job_line_id,
      quantity_returned_gross: parseFloat(l.quantity_returned_gross) || 0,
      variance_gross: parseFloat(l.variance_gross) || 0,
      variance_type: l.variance_type,
      variance_notes: l.variance_notes || null,
      actual_dabbi_colour_id: l.actual_dabbi_colour_id,
    })),
  )

  return (
    <form action={formAction}>
      <input type="hidden" name="return_lines" value={payload} />

      {state && 'error' in state && (
        <p style={{ ...msgError, marginBottom: '0.75rem' }}>✗ {state.error}</p>
      )}
      {state && 'success' in state && (
        <p style={{ ...msgOk, marginBottom: '0.75rem' }}>✓ {state.success}</p>
      )}

      {hasDraft && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.4rem 0.75rem', marginBottom: '0.75rem',
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

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div style={{ ...fieldWrap, width: '160px', minWidth: '140px' }}>
          <label style={{ fontSize: 'var(--text-sm)' }}>Return Date</label>
          <input name="return_date" type="date" defaultValue={today} style={inputStyle} required />
        </div>
        <div style={{ ...fieldWrap, flex: 1, minWidth: '200px' }}>
          <label style={{ fontSize: 'var(--text-sm)' }}>Notes (optional)</label>
          <input name="notes" style={inputStyle} placeholder="Any notes about this return" />
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
        gap: '0.75rem',
        marginBottom: '1.25rem',
      }}>
        {jobLines.map((jl, i) => {
          const remaining = jl.quantity_sent_gross - jl.quantity_returned_gross
          const isDone = remaining <= 0
          const issuedDabbiCode = jl.available_dabbi_colours.find((d) => d.id === jl.dabbi_colour_id)?.code ?? jl.dabbi_colour
          const actualDabbiId = returnLines[i].actual_dabbi_colour_id
          const dabbiChanged = actualDabbiId !== jl.dabbi_colour_id

          return (
            <div
              key={jl.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                background: 'var(--bg-elevated)',
                opacity: isDone ? 0.65 : 1,
              }}
            >
              {/* Card header */}
              <div style={{ marginBottom: '0.4rem' }}>
                <span style={{ fontWeight: 700, fontSize: 'var(--text-base)' }}>
                  {jl.shape} · {jl.bindi_colour} · {jl.size}
                </span>
              </div>

              {/* Sub-header: dabbi + brand pills */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <span style={pillStyle}>{jl.dabbi_colour}</span>
                <span style={pillStyle}>{jl.brand}</span>
              </div>

              {/* Quantity rows */}
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={dataRowStyle}>
                  <span style={labelStyle}>Sent</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(jl.quantity_sent_gross)} gross</span>
                </div>
                <div style={dataRowStyle}>
                  <span style={labelStyle}>Already returned</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                    {fmt(jl.quantity_returned_gross)} gross
                  </span>
                </div>
                <div style={dataRowStyle}>
                  <span style={labelStyle}>Remaining WIP</span>
                  <span style={{
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: remaining > 0 ? 700 : undefined,
                    color: remaining > 0 ? 'var(--accent-bright)' : undefined,
                  }}>
                    {fmt(Math.max(0, remaining))} gross
                  </span>
                </div>
              </div>

              {/* Complete badge or inputs */}
              {isDone ? (
                <Badge variant="success" size="sm" label="Complete" />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={fieldWrap}>
                    <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Return Qty (gross)</label>
                    <input
                      type="number"
                      min="0"
                      max={remaining}
                      step="0.001"
                      value={returnLines[i].quantity_returned_gross}
                      onChange={(e) => updateLine(i, 'quantity_returned_gross', e.target.value)}
                      style={{ ...inputStyle, width: '100%', minHeight: '44px', fontSize: 'var(--text-base)' }}
                      placeholder="0"
                    />
                  </div>

                  <div style={fieldWrap}>
                    <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Actual Dabbi</label>
                    <select
                      value={returnLines[i].actual_dabbi_colour_id}
                      onChange={(e) => updateLine(i, 'actual_dabbi_colour_id', e.target.value)}
                      style={{ ...selectStyle, width: '100%', minHeight: '44px' }}
                    >
                      {jl.available_dabbi_colours.map((d) => (
                        <option key={d.id} value={d.id}>{d.code}</option>
                      ))}
                    </select>
                    {dabbiChanged && (
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', marginTop: '0.2rem', display: 'block' }}>
                        ⚠ Different from issued (was {issuedDabbiCode})
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ ...fieldWrap, flex: '0 0 120px' }}>
                      <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Variance Qty</label>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={returnLines[i].variance_gross}
                        onChange={(e) => updateLine(i, 'variance_gross', e.target.value)}
                        style={{ ...inputStyle, width: '100%', minHeight: '44px' }}
                        placeholder="0"
                      />
                    </div>
                    <div style={{ ...fieldWrap, flex: 1, minWidth: '140px' }}>
                      <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Variance Type</label>
                      <select
                        value={returnLines[i].variance_type}
                        onChange={(e) => updateLine(i, 'variance_type', e.target.value as ReturnLineState['variance_type'])}
                        style={{ ...selectStyle, width: '100%', minHeight: '44px' }}
                      >
                        <option value="none">none</option>
                        <option value="short_count">short count</option>
                        <option value="wastage">wastage</option>
                        <option value="rejected">rejected</option>
                        <option value="other">other</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div>
        <button type="submit" disabled={isPending} style={{ ...btnPrimary, fontWeight: 'bold', marginTop: 0 }}>
          {isPending ? 'Recording…' : 'Record Return'}
        </button>
      </div>
    </form>
  )
}
