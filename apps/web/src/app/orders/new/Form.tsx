'use client'

import { useActionState, useState, useCallback, useTransition, useEffect } from 'react'
import { createOrder, quickAddCustomer } from './actions'
import type { QuickCustomerState } from './actions'
import type { ActionState } from '@/lib/masters'
import { fieldWrap, inputStyle, selectStyle, btnPrimary, msgError } from '@/lib/ui'
import type { CSSProperties } from 'react'
import { MatrixViewToggle } from '@/components/matrix/MatrixViewToggle'
import { MatrixGrid } from '@/components/matrix/MatrixGrid'
import { buildMatrixFromOrderLines, parseMatrixToOrderLines, filterMatrixData } from '@stock-brain/domain'
import type { SizeMasterRow, DesignMasterRow, ColourMasterRow } from '@stock-brain/domain'
import type { MatrixGridData, MatrixChangeEvent, FilterConfig, ActiveFilters } from '@stock-brain/types'
import { MatrixFilterBar } from '@/components/matrix/MatrixFilterBar'

export type MasterOption = {
  id: string
  label: string
  defaultDabbiColourId?: string | null
}

// Additional master data types for matrix mode
export type SizeMaster = SizeMasterRow
export type DesignMaster = DesignMasterRow
export type ColourMaster = ColourMasterRow

export type CreateOrderFormProps = {
  customers: MasterOption[]
  shapes: MasterOption[]
  bindiColours: MasterOption[]
  sizes: MasterOption[]
  dabbiColours: MasterOption[]
  // Raw master rows for matrix builder (optional — if absent, matrix toggle is hidden)
  sizeMaster?: SizeMaster[]
  designMaster?: DesignMaster[]
  colourMaster?: ColourMaster[]
}

type LineState = {
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  dabbi_colour_id: string
  ordered_qty: string
}

const emptyLine = (dabbiColourId = ''): LineState => ({
  shape_design_id: '',
  bindi_colour_id: '',
  size_id: '',
  dabbi_colour_id: dabbiColourId,
  ordered_qty: '',
})

// ── matrix block ──────────────────────────────────────────────
//
// One block = one dabbi colour + its independent set of cell changes.
// The form state holds an array of these; saving merges them all.

type MatrixBlock = {
  id: string               // stable client-side ID used as React key + draft key
  dabbiColourId: string
  changes: MatrixChangeEvent[]
}

const BLOCK_CONFIG_KEY = 'orders-new-block-config'

// Block 0 keeps the original draft key for backward compatibility.
function blockDraftKey(blockId: string): string {
  return blockId === 'block-0' ? 'orders-new' : `orders-new-${blockId}`
}

// ── styles ────────────────────────────────────────────────────

const lineBox: CSSProperties = {
  border: '1px solid var(--border)',
  padding: '0.75rem',
  marginBottom: '0.5rem',
  background: 'var(--bg-elevated)',
  borderRadius: 'var(--radius-sm)',
}

const lineHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '0.5rem',
}

const lineGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr 1fr 110px',
  gap: '0.5rem',
}

const smallLabel: CSSProperties = {
  fontSize: 'var(--text-xs)',
}

const removeBtn: CSSProperties = {
  fontSize: 'var(--text-xs)',
  cursor: 'pointer',
  border: '1px solid var(--danger)',
  background: 'var(--danger-subtle)',
  padding: '0.15rem 0.5rem',
  color: 'var(--danger)',
  borderRadius: 'var(--radius-sm)',
}

const addLineBtn: CSSProperties = {
  ...btnPrimary,
  marginTop: '0.25rem',
  marginBottom: '1.25rem',
  fontSize: '0.82rem',
}

const sectionHead: CSSProperties = {
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  margin: '0 0 0.75rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const headerGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '0.5rem',
  marginBottom: '0.5rem',
}

// ── component ─────────────────────────────────────────────────

export function CreateOrderForm({
  customers,
  shapes,
  bindiColours,
  sizes,
  dabbiColours,
  sizeMaster = [],
  designMaster = [],
  colourMaster = [],
}: CreateOrderFormProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(createOrder, null)
  const [customerOptions, setCustomerOptions] = useState<MasterOption[]>(customers)
  const [customerId, setCustomerId] = useState('')
  const [showQuickCustomer, setShowQuickCustomer] = useState(false)
  const [quickCustomerState, setQuickCustomerState] = useState<QuickCustomerState | null>(null)
  const [quickCustomerDraft, setQuickCustomerDraft] = useState({
    name: '',
    entity_name: '',
    address: '',
    phone_number: '',
    transport_name: '',
    default_dabbi_colour_id: '',
  })
  const [isAddingCustomer, startAddingCustomer] = useTransition()
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().split('T')[0])
  const [promisedDate, setPromisedDate] = useState('')
  const [reference, setReference] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [lines, setLines] = useState<LineState[]>([emptyLine()])
  const [view, setView] = useState<'list' | 'matrix'>('list')
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({})
  const [matrixBlocks, setMatrixBlocks] = useState<MatrixBlock[]>([
    { id: 'block-0', dabbiColourId: '', changes: [] },
  ])

  // Restore block config (dabbi colour selections + extra blocks) from localStorage after mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(BLOCK_CONFIG_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as { id: string; dabbiColourId: string }[]
      if (!Array.isArray(saved) || saved.length === 0) return
      setMatrixBlocks((prev) => {
        const isDefault = prev.length === 1 && !prev[0].dabbiColourId && prev[0].changes.length === 0
        if (!isDefault) return prev
        return saved.map((s) => ({ id: s.id, dabbiColourId: s.dabbiColourId, changes: [] }))
      })
    } catch { /* ignore */ }
  }, [])

  // Persist block config whenever it changes.
  useEffect(() => {
    try {
      localStorage.setItem(
        BLOCK_CONFIG_KEY,
        JSON.stringify(matrixBlocks.map((b) => ({ id: b.id, dabbiColourId: b.dabbiColourId }))),
      )
    } catch { /* ignore */ }
  }, [matrixBlocks])

  const selectedCustomerDefaultDabbi = customerOptions.find((customer) => customer.id === customerId)?.defaultDabbiColourId ?? ''

  const addLine = () => setLines((prev) => [...prev, emptyLine(selectedCustomerDefaultDabbi)])
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i))

  const updateLine = (i: number, field: keyof LineState, value: string) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))

  const handleCustomerChange = (nextCustomerId: string) => {
    const defaultDabbiColourId = customerOptions.find((customer) => customer.id === nextCustomerId)?.defaultDabbiColourId ?? ''
    setCustomerId(nextCustomerId)
    if (!defaultDabbiColourId) return
    // Set first matrix block's dabbi if not already set
    setMatrixBlocks((prev) => prev.map((b, i) =>
      i === 0 ? { ...b, dabbiColourId: b.dabbiColourId || defaultDabbiColourId } : b,
    ))
    // Set list mode lines
    setLines((prev) => prev.map((line) => ({
      ...line,
      dabbi_colour_id: line.dabbi_colour_id || defaultDabbiColourId,
    })))
  }

  const handleQuickCustomerDraftChange = (field: keyof typeof quickCustomerDraft, value: string) => {
    setQuickCustomerDraft((current) => ({ ...current, [field]: value }))
  }

  const handleQuickCustomerSubmit = () => {
    startAddingCustomer(async () => {
      const formData = new FormData()
      Object.entries(quickCustomerDraft).forEach(([key, value]) => formData.set(key, value))
      const result = await quickAddCustomer(formData)
      setQuickCustomerState(result)
      if ('error' in result) return

      setCustomerOptions((prev) => {
        const withoutDuplicate = prev.filter((customer) => customer.id !== result.customer.id)
        return [...withoutDuplicate, result.customer].sort((a, b) => a.label.localeCompare(b.label))
      })
      handleCustomerChange(result.customer.id)
      setShowQuickCustomer(false)
      setQuickCustomerDraft({
        name: '',
        entity_name: '',
        address: '',
        phone_number: '',
        transport_name: '',
        default_dabbi_colour_id: '',
      })
    })
  }

  // ── matrix block handlers ─────────────────────────────────

  const addMatrixBlock = () => {
    setMatrixBlocks((prev) => [
      ...prev,
      { id: `block-${Date.now()}`, dabbiColourId: '', changes: [] },
    ])
  }

  const removeMatrixBlock = (blockId: string) => {
    setMatrixBlocks((prev) => prev.filter((b) => b.id !== blockId))
    // Clear the draft for the removed block from localStorage
    try { localStorage.removeItem(`matrix-draft-${blockDraftKey(blockId)}`) } catch { /* ignore */ }
  }

  const updateBlockDabbi = (blockId: string, dabbiColourId: string) => {
    setMatrixBlocks((prev) => prev.map((b) => b.id === blockId ? { ...b, dabbiColourId } : b))
  }

  const handleBlockCellChange = useCallback((blockId: string, change: MatrixChangeEvent) => {
    setMatrixBlocks((prev) => prev.map((b) => {
      if (b.id !== blockId) return b
      const idx = b.changes.findIndex(
        (c) => c.design_id === change.design_id && c.colour_id === change.colour_id && c.size_id === change.size_id,
      )
      if (idx >= 0) {
        const next = [...b.changes]
        next[idx] = change
        return { ...b, changes: next }
      }
      return { ...b, changes: [...b.changes, change] }
    }))
  }, [])

  // Build full blank matrix (all designs × colours × sizes = zero) for entry
  const fullMatrixData: MatrixGridData | null = sizeMaster.length > 0 && designMaster.length > 0 && colourMaster.length > 0
    ? buildMatrixFromOrderLines([], sizeMaster, designMaster, colourMaster, { showAllRows: true })
    : null

  // Filter options derived from masters
  const filterConfig: FilterConfig = {
    fields: [
      {
        key: 'design',
        label: 'Design',
        options: designMaster.map((d) => ({ id: d.id, label: d.name })),
      },
      {
        key: 'colour',
        label: 'CLR',
        options: colourMaster.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` })),
      },
    ],
  }

  const emptyMatrixData = fullMatrixData
    ? filterMatrixData(fullMatrixData, activeFilters, { design: 'design', colour: 'colour' })
    : null

  // Build lines payload from all matrix blocks.
  // Returns null if any block has quantities but no dabbi colour selected.
  const buildMatrixLinesPayload = () => {
    const allLines: { shape_design_id: string; bindi_colour_id: string; size_id: string; dabbi_colour_id: string; ordered_qty: number }[] = []
    for (const block of matrixBlocks) {
      const nonZeroChanges = block.changes.filter((c) => c.quantity > 0)
      if (nonZeroChanges.length === 0) continue
      if (!block.dabbiColourId) return null
      allLines.push(...parseMatrixToOrderLines(nonZeroChanges, block.dabbiColourId))
    }
    return allLines
  }

  // Serialize lines to JSON for the hidden input.
  // In list mode: from the list state.
  // In matrix mode: from all matrix blocks.
  const linesPayload = view === 'matrix'
    ? JSON.stringify(buildMatrixLinesPayload() ?? [])
    : JSON.stringify(
        lines.map((l) => ({
          ...l,
          ordered_qty: parseFloat(l.ordered_qty) || 0,
        })),
      )

  const canShowMatrix = fullMatrixData !== null

  // Matrix validation state (for hints before submit)
  const hasBlocksWithQtyButNoDabbi = matrixBlocks.some(
    (b) => b.changes.some((c) => c.quantity > 0) && !b.dabbiColourId,
  )
  const firstBlockHasNothingSelected = !matrixBlocks[0].dabbiColourId && !matrixBlocks[0].changes.some((c) => c.quantity > 0)

  // Dabbi colours already used across all blocks (for per-block dropdown filtering)
  const allUsedDabbiIds = new Set(matrixBlocks.map((b) => b.dabbiColourId).filter(Boolean))
  const unusedDabbiColours = dabbiColours.filter((d) => !allUsedDabbiIds.has(d.id))

  return (
    <div>
      {state && 'error' in state && (
        <p style={{ ...msgError, marginBottom: '1rem' }}>✗ {state.error}</p>
      )}

      <form action={formAction}>
        {/* Lines payload — serialized so the server action receives all lines in one FormData entry */}
        <input type="hidden" name="lines" value={linesPayload} />

        {/* ── Order header ─────────────────────────────────── */}
        <h3 style={sectionHead}>Order Details</h3>

        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ ...fieldWrap, marginBottom: '0.5rem' }}>
            <label>Customer</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select
                name="customer_id"
                style={{ ...selectStyle, flex: '1 1 auto' }}
                required
                value={customerId}
                onChange={(e) => handleCustomerChange(e.target.value)}
              >
                <option value="">Select customer…</option>
                {customerOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowQuickCustomer((current) => !current)}
                style={{
                  minHeight: '2.5rem',
                  padding: '0 0.8rem',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: showQuickCustomer ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                  color: showQuickCustomer ? 'var(--accent-bright)' : 'var(--text-primary)',
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                + Customer
              </button>
            </div>
          </div>

          {showQuickCustomer && (
            <div
              style={{
                display: 'grid',
                gap: '0.75rem',
                margin: '0 0 1rem',
                padding: '0.85rem',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)',
              }}
            >
              {quickCustomerState && 'error' in quickCustomerState && (
                <p style={{ ...msgError, margin: 0 }}>x {quickCustomerState.error}</p>
              )}
              <div style={headerGrid}>
                <div style={fieldWrap}>
                  <label>Name</label>
                  <input
                    value={quickCustomerDraft.name}
                    onChange={(event) => handleQuickCustomerDraftChange('name', event.target.value)}
                    required
                    style={inputStyle}
                    placeholder="Customer name"
                  />
                </div>
                <div style={fieldWrap}>
                  <label>Entity / Firm</label>
                  <input
                    value={quickCustomerDraft.entity_name}
                    onChange={(event) => handleQuickCustomerDraftChange('entity_name', event.target.value)}
                    style={inputStyle}
                    placeholder="Optional billing name"
                  />
                </div>
              </div>
              <div style={headerGrid}>
                <div style={fieldWrap}>
                  <label>Location / Address</label>
                  <input
                    value={quickCustomerDraft.address}
                    onChange={(event) => handleQuickCustomerDraftChange('address', event.target.value)}
                    style={inputStyle}
                    placeholder="City, market, address"
                  />
                </div>
                <div style={fieldWrap}>
                  <label>Phone</label>
                  <input
                    value={quickCustomerDraft.phone_number}
                    onChange={(event) => handleQuickCustomerDraftChange('phone_number', event.target.value)}
                    inputMode="tel"
                    style={inputStyle}
                    placeholder="10 digit phone"
                  />
                </div>
              </div>
              <div style={headerGrid}>
                <div style={fieldWrap}>
                  <label>Transport</label>
                  <input
                    value={quickCustomerDraft.transport_name}
                    onChange={(event) => handleQuickCustomerDraftChange('transport_name', event.target.value)}
                    style={inputStyle}
                    placeholder="Preferred transport"
                  />
                </div>
                <div style={fieldWrap}>
                  <label>Default Dabbi</label>
                  <select
                    value={quickCustomerDraft.default_dabbi_colour_id}
                    onChange={(event) => handleQuickCustomerDraftChange('default_dabbi_colour_id', event.target.value)}
                    style={selectStyle}
                  >
                    <option value="">No default</option>
                    {dabbiColours.map((d) => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
                <button type="button" onClick={handleQuickCustomerSubmit} disabled={isAddingCustomer} style={{ ...btnPrimary, marginTop: 0 }}>
                  {isAddingCustomer ? 'Adding...' : 'Add and select customer'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuickCustomer(false)}
                  style={{
                    minHeight: '2.5rem',
                    border: 0,
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div style={headerGrid}>
            <div style={fieldWrap}>
              <label>Order Date</label>
              <input
                name="order_date"
                type="date"
                style={inputStyle}
                required
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </div>
            <div style={fieldWrap}>
              <label>Promised Date (optional)</label>
              <input
                name="promised_date"
                type="date"
                style={inputStyle}
                value={promisedDate}
                onChange={(e) => setPromisedDate(e.target.value)}
              />
            </div>
          </div>

          <div style={headerGrid}>
            <div style={fieldWrap}>
              <label>Reference (optional)</label>
              <input
                name="reference"
                style={inputStyle}
                placeholder="Challan / PO number"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <div style={fieldWrap}>
              <label>Notes (optional)</label>
              <input
                name="notes"
                style={inputStyle}
                placeholder="Any order-level notes"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ── Order lines ──────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
          <h3 style={{ ...sectionHead, margin: 0 }}>Order Lines</h3>
          {canShowMatrix && (
            <MatrixViewToggle view={view} onViewChange={setView} />
          )}
        </div>

        {/* ── Matrix entry mode ────────────────────────────── */}
        {view === 'matrix' && fullMatrixData && (
          <div style={{ marginBottom: '1.25rem' }}>
            <MatrixFilterBar
              filterConfig={filterConfig}
              activeFilters={activeFilters}
              onFilterChange={setActiveFilters}
            />

            {matrixBlocks.map((block, blockIndex) => {
              // Per-block dabbi options: exclude colours already taken by other blocks
              const otherUsedDabbis = new Set(
                matrixBlocks.filter((b) => b.id !== block.id).map((b) => b.dabbiColourId).filter(Boolean),
              )
              const blockDabbiOptions = dabbiColours.filter((d) => !otherUsedDabbis.has(d.id))

              const blockLabel = block.dabbiColourId
                ? `${dabbiColours.find((d) => d.id === block.dabbiColourId)?.label ?? 'Dabbi'} quantities`
                : `Dabbi Colour Block ${blockIndex + 1}`

              return (
                <div
                  key={block.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.75rem',
                    marginBottom: '1rem',
                    background: 'var(--bg-elevated)',
                  }}
                >
                  {/* Block header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 'var(--text-sm)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {blockLabel}
                    </span>
                    {matrixBlocks.length > 1 && blockIndex > 0 && (
                      <button type="button" onClick={() => removeMatrixBlock(block.id)} style={removeBtn}>
                        × Remove
                      </button>
                    )}
                  </div>

                  {/* Dabbi colour selector */}
                  <div style={{ ...fieldWrap, marginBottom: '0.75rem', maxWidth: '220px' }}>
                    <label style={{ fontSize: '0.82rem' }}>Dabbi Colour</label>
                    <select
                      value={block.dabbiColourId}
                      onChange={(e) => updateBlockDabbi(block.id, e.target.value)}
                      style={selectStyle}
                    >
                      <option value="">Select dabbi colour…</option>
                      {blockDabbiOptions.map((d) => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                      ))}
                    </select>
                  </div>

                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '0 0 0.5rem' }}>
                    Enter quantities in gross. Leave cells blank or zero to skip.
                  </p>

                  <div style={{ overflowX: 'auto' }}>
                    <MatrixGrid
                      data={emptyMatrixData!}
                      mode="edit"
                      onCellChange={(change) => handleBlockCellChange(block.id, change)}
                      draftKey={blockDraftKey(block.id)}
                    />
                  </div>
                </div>
              )
            })}

            {/* Add dabbi colour block — hidden once all colours are taken */}
            {unusedDabbiColours.length > 0 && (
              <button type="button" onClick={addMatrixBlock} style={addLineBtn}>
                + Add Dabbi Colour
              </button>
            )}
          </div>
        )}

        {/* ── List entry mode ──────────────────────────────── */}
        {view === 'list' && lines.map((line, i) => (
          <div key={i} style={lineBox}>
            <div style={lineHeader}>
              <span style={{ ...smallLabel, color: 'var(--text-secondary)' }}>Line {i + 1}</span>
              {lines.length > 1 && (
                <button type="button" onClick={() => removeLine(i)} style={removeBtn}>
                  Remove
                </button>
              )}
            </div>

            <div style={lineGrid}>
              <div style={fieldWrap}>
                <label style={smallLabel}>Shape</label>
                <select
                  value={line.shape_design_id}
                  onChange={(e) => updateLine(i, 'shape_design_id', e.target.value)}
                  style={selectStyle}
                >
                  <option value="">Select…</option>
                  {shapes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={smallLabel}>Bindi Colour</label>
                <select
                  value={line.bindi_colour_id}
                  onChange={(e) => updateLine(i, 'bindi_colour_id', e.target.value)}
                  style={selectStyle}
                >
                  <option value="">Select…</option>
                  {bindiColours.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={smallLabel}>Size</label>
                <select
                  value={line.size_id}
                  onChange={(e) => updateLine(i, 'size_id', e.target.value)}
                  style={selectStyle}
                >
                  <option value="">Select…</option>
                  {sizes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={smallLabel}>Dabbi Colour</label>
                <select
                  value={line.dabbi_colour_id}
                  onChange={(e) => updateLine(i, 'dabbi_colour_id', e.target.value)}
                  style={selectStyle}
                >
                  <option value="">Select…</option>
                  {dabbiColours.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={fieldWrap}>
                <label style={smallLabel}>Qty (gross)</label>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={line.ordered_qty}
                  onChange={(e) => updateLine(i, 'ordered_qty', e.target.value)}
                  style={inputStyle}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        ))}

        {/* Add line button — list mode only */}
        {view === 'list' && (
          <button type="button" onClick={addLine} style={addLineBtn}>
            + Add Line
          </button>
        )}

        {/* Matrix mode validation hints */}
        {view === 'matrix' && hasBlocksWithQtyButNoDabbi && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)', margin: '0 0 0.75rem' }}>
            Select a dabbi colour for every block that has quantities entered.
          </p>
        )}
        {view === 'matrix' && !hasBlocksWithQtyButNoDabbi && firstBlockHasNothingSelected && matrixBlocks.length === 1 && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)', margin: '0 0 0.75rem' }}>
            Select a dabbi colour above before submitting.
          </p>
        )}

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            type="submit"
            disabled={isPending}
            style={{ ...btnPrimary, fontWeight: 'bold', marginTop: 0 }}
          >
            {isPending ? 'Saving…' : 'Create Order'}
          </button>
          <a
            href="/orders"
            style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', textDecoration: 'none' }}
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  )
}
