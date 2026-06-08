'use client'

import { useActionState, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  calculatePurchaseBill,
  type PurchaseLineType,
} from '@stock-brain/domain'
import { Button } from '@/components/ui/Button'
import type { ActionState } from '@/lib/masters'
import { createPurchaseBillAction } from './actions'

type SupplierOption = {
  id: string
  name: string
  entity_name: string | null
  payment_terms_days: number
}

type PurchaseLineDraft = {
  id: number
  lineType: PurchaseLineType
  description: string
  unit: string
  quantity: string
  rate: string
  notes: string
}

type Props = {
  suppliers: SupplierOption[]
  defaultPurchaseDate: string
}

const lineTypeOptions: Array<{ value: PurchaseLineType; label: string; unit: string }> = [
  { value: 'velvet', label: 'Velvet / raw material', unit: 'metres' },
  { value: 'direct_ready_stock', label: 'Direct ready stock', unit: 'gross' },
  { value: 'direct_cuttings', label: 'Direct cuttings', unit: 'gross' },
  { value: 'packaging_material', label: 'Packaging material', unit: 'pcs' },
  { value: 'expense', label: 'Outside expense', unit: 'service' },
]

const fieldStyle = {
  display: 'grid',
  gap: '0.35rem',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-secondary)',
  fontWeight: 700,
} as const

const inputStyle = {
  width: '100%',
  minHeight: '2.5rem',
} as const

function money(value: number): string {
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function addDays(dateValue: string, days: number): string {
  if (!dateValue || days <= 0) return ''
  const date = new Date(`${dateValue}T00:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function createEmptyLine(id: number): PurchaseLineDraft {
  return {
    id,
    lineType: 'velvet',
    description: '',
    unit: 'metres',
    quantity: '',
    rate: '',
    notes: '',
  }
}

export function PurchaseBillForm({ suppliers, defaultPurchaseDate }: Props) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createPurchaseBillAction,
    null,
  )
  const [supplierId, setSupplierId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(defaultPurchaseDate)
  const [transportCharges, setTransportCharges] = useState('')
  const [otherCharges, setOtherCharges] = useState('')
  const [discountAmount, setDiscountAmount] = useState('')
  const [roundOffAmount, setRoundOffAmount] = useState('')
  const [lines, setLines] = useState<PurchaseLineDraft[]>(() => [createEmptyLine(0)])
  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId)
  const dueDate = selectedSupplier ? addDays(purchaseDate, selectedSupplier.payment_terms_days) : ''

  const calculation = useMemo(() => {
    return calculatePurchaseBill(
      lines
        .filter((line) => line.description || line.quantity || line.rate)
        .map((line, index) => ({
          id: `line ${index + 1}`,
          line_type: line.lineType,
          description: line.description,
          quantity: Number(line.quantity),
          rate_per_unit: Number(line.rate),
        })),
      {
        transport_charges: Number(transportCharges || 0),
        other_charges: Number(otherCharges || 0),
        discount_amount: Number(discountAmount || 0),
        round_off_amount: Number(roundOffAmount || 0),
      },
    )
  }, [discountAmount, lines, otherCharges, roundOffAmount, transportCharges])

  function updateLine(lineId: number, patch: Partial<PurchaseLineDraft>): void {
    setLines((current) => current.map((line) => {
      if (line.id !== lineId) return line
      const nextLine = { ...line, ...patch }
      if (patch.lineType) {
        nextLine.unit = lineTypeOptions.find((option) => option.value === patch.lineType)?.unit ?? line.unit
      }
      return nextLine
    }))
  }

  function addLine(): void {
    setLines((current) => [...current, createEmptyLine(Date.now())])
  }

  function removeLine(lineId: number): void {
    setLines((current) => current.length === 1 ? current : current.filter((line) => line.id !== lineId))
  }

  return (
    <form action={formAction} style={{ display: 'grid', gap: '1rem' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 1.3fr) repeat(3, minmax(150px, 0.7fr))',
          gap: '0.75rem',
        }}
      >
        <label style={fieldStyle}>
          Supplier
          <select
            name="supplier_id"
            required
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
            style={inputStyle}
          >
            <option value="">Select supplier</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}{supplier.entity_name ? ` — ${supplier.entity_name}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          Purchase Date
          <input
            name="purchase_date"
            type="date"
            required
            value={purchaseDate}
            onChange={(event) => setPurchaseDate(event.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={fieldStyle}>
          Due Date
          <input name="due_date" type="date" defaultValue={dueDate} style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Supplier Bill No.
          <input name="supplier_bill_number" placeholder="Vendor invoice / bill" style={inputStyle} />
        </label>
      </div>

      <section style={{ display: 'grid', gap: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Purchase Lines</h3>
          <Button type="button" size="sm" variant="secondary" icon={Plus} onClick={addLine}>
            Add Line
          </Button>
        </div>

        {lines.map((line, index) => (
          <div
            key={line.id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(170px, 0.9fr) minmax(220px, 1.4fr) 90px 110px 130px auto',
              gap: '0.65rem',
              alignItems: 'end',
              padding: '0.75rem',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-elevated)',
            }}
          >
            <input type="hidden" name="line_index" value={String(index)} />
            <label style={fieldStyle}>
              Type
              <select
                name={`line_type_${index}`}
                value={line.lineType}
                onChange={(event) => updateLine(line.id, { lineType: event.target.value as PurchaseLineType })}
                style={inputStyle}
              >
                {lineTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label style={fieldStyle}>
              Description
              <input
                name={`description_${index}`}
                value={line.description}
                onChange={(event) => updateLine(line.id, { description: event.target.value })}
                placeholder="e.g. Yellow velvet sheet, box packing, purchased stock"
                style={inputStyle}
              />
            </label>
            <label style={fieldStyle}>
              Unit
              <input
                name={`unit_${index}`}
                value={line.unit}
                onChange={(event) => updateLine(line.id, { unit: event.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={fieldStyle}>
              Qty
              <input
                name={`quantity_${index}`}
                type="number"
                min="0"
                step="0.001"
                value={line.quantity}
                onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                style={inputStyle}
              />
            </label>
            <label style={fieldStyle}>
              Rate
              <input
                name={`rate_per_unit_${index}`}
                type="number"
                min="0"
                step="0.01"
                value={line.rate}
                onChange={(event) => updateLine(line.id, { rate: event.target.value })}
                style={inputStyle}
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              icon={Trash2}
              onClick={() => removeLine(line.id)}
              aria-label="Remove line"
            />
          </div>
        ))}
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))',
          gap: '0.75rem',
        }}
      >
        <label style={fieldStyle}>
          Transport
          <input
            name="transport_charges"
            type="number"
            min="0"
            step="0.01"
            value={transportCharges}
            onChange={(event) => setTransportCharges(event.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={fieldStyle}>
          Other Charges
          <input
            name="other_charges"
            type="number"
            min="0"
            step="0.01"
            value={otherCharges}
            onChange={(event) => setOtherCharges(event.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={fieldStyle}>
          Discount
          <input
            name="discount_amount"
            type="number"
            min="0"
            step="0.01"
            value={discountAmount}
            onChange={(event) => setDiscountAmount(event.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={fieldStyle}>
          Round Off
          <input
            name="round_off_amount"
            type="number"
            step="0.01"
            value={roundOffAmount}
            onChange={(event) => setRoundOffAmount(event.target.value)}
            style={inputStyle}
          />
        </label>
      </div>

      <label style={fieldStyle}>
        Notes
        <input name="notes" placeholder="Optional purchase note" style={inputStyle} />
      </label>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
          padding: '0.85rem 1rem',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--bg-elevated)',
        }}
      >
        <div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Draft Total
          </div>
          <strong style={{ display: 'block', marginTop: '0.2rem', fontSize: 'var(--text-lg)' }}>
            {calculation.ok ? money(calculation.bill.total_amount) : '0.00'}
          </strong>
        </div>
        {calculation.ok && (
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', fontWeight: 700 }}>
            Goods {money(calculation.bill.goods_amount)} · Inventory {money(calculation.bill.inventory_amount)} · Expense {money(calculation.bill.expense_amount)}
          </div>
        )}
      </div>

      {state && 'error' in state && <p style={{ margin: 0, color: 'var(--danger)', fontWeight: 800 }}>{state.error}</p>}
      <div>
        <Button type="submit" variant="primary" loading={isPending}>
          Create Draft Purchase Bill
        </Button>
      </div>
    </form>
  )
}
