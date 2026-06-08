'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { ActionState } from '@/lib/masters'
import { createSupplierAction, updateSupplierAction } from './actions'

type SupplierRow = {
  id: string
  name: string
  entity_name: string | null
  address: string | null
  phone_number: string | null
  payment_terms_days: number
  notes: string | null
  is_active: boolean
}

type SupplierCreateFormProps = {
  compact?: boolean
}

type SupplierEditFormProps = {
  supplier: SupplierRow
  onCancel?: () => void
}

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

export function SupplierCreateForm({ compact }: SupplierCreateFormProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createSupplierAction,
    null,
  )

  return (
    <form action={formAction} style={{ display: 'grid', gap: '0.75rem' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact
            ? 'repeat(2, minmax(180px, 1fr))'
            : 'repeat(3, minmax(180px, 1fr))',
          gap: '0.75rem',
        }}
      >
        <label style={fieldStyle}>
          Supplier Name
          <input name="name" required placeholder="Supplier / vendor name" style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Entity Name
          <input name="entity_name" placeholder="Billing firm name" style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Phone
          <input name="phone_number" placeholder="10 digit number" style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Address
          <input name="address" placeholder="Address / location" style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Payment Terms
          <input name="payment_terms_days" type="number" min="0" step="1" defaultValue="0" style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Notes
          <input name="notes" placeholder="Optional notes" style={inputStyle} />
        </label>
      </div>
      {state && 'error' in state && <p style={{ margin: 0, color: 'var(--danger)', fontWeight: 800 }}>{state.error}</p>}
      {state && 'success' in state && <p style={{ margin: 0, color: 'var(--success)', fontWeight: 800 }}>{state.success}</p>}
      <div>
        <Button type="submit" variant="primary" loading={isPending}>
          Add Supplier
        </Button>
      </div>
    </form>
  )
}

export function SupplierEditRow({ supplier, onCancel }: SupplierEditFormProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    updateSupplierAction,
    null,
  )

  return (
    <form action={formAction} style={{ display: 'grid', gap: '0.75rem', padding: '0.85rem 0' }}>
      <input type="hidden" name="supplier_id" value={supplier.id} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))',
          gap: '0.75rem',
          alignItems: 'end',
        }}
      >
        <label style={fieldStyle}>
          Name
          <input name="name" defaultValue={supplier.name} required style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Entity
          <input name="entity_name" defaultValue={supplier.entity_name ?? ''} style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Phone
          <input name="phone_number" defaultValue={supplier.phone_number ?? ''} style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Address
          <input name="address" defaultValue={supplier.address ?? ''} style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Terms
          <input name="payment_terms_days" type="number" min="0" step="1" defaultValue={supplier.payment_terms_days} style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Notes
          <input name="notes" defaultValue={supplier.notes ?? ''} style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          Active
          <select name="is_active" defaultValue={supplier.is_active ? 'true' : 'false'} style={inputStyle}>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button type="submit" variant="primary" loading={isPending}>Save</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
      {state && 'error' in state && <p style={{ margin: 0, color: 'var(--danger)', fontWeight: 800 }}>{state.error}</p>}
      {state && 'success' in state && <p style={{ margin: 0, color: 'var(--success)', fontWeight: 800 }}>{state.success}</p>}
    </form>
  )
}

export function SupplierList({ suppliers }: { suppliers: SupplierRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const filteredSuppliers = suppliers.filter((supplier) => {
    const haystack = `${supplier.name} ${supplier.entity_name ?? ''} ${supplier.phone_number ?? ''} ${supplier.address ?? ''}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })

  return (
    <section style={{ display: 'grid', gap: '0.75rem' }}>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search supplier"
        style={{ ...inputStyle, maxWidth: '420px' }}
      />
      <div style={{ display: 'grid', gap: 0, borderTop: '1px solid var(--border)' }}>
        {filteredSuppliers.map((supplier) => (
          <div key={supplier.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(220px, 1.2fr) minmax(180px, 1fr) minmax(120px, 0.7fr) minmax(110px, 0.5fr) auto',
                gap: '1rem',
                alignItems: 'center',
                padding: '0.9rem 0',
              }}
            >
              <div>
                <strong style={{ fontSize: 'var(--text-base)' }}>{supplier.name}</strong>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                  {supplier.entity_name ?? supplier.address ?? 'No billing details'}
                </div>
              </div>
              <div style={{ color: 'var(--text-secondary)' }}>{supplier.phone_number ?? '-'}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{supplier.payment_terms_days} day terms</div>
              <div style={{ color: supplier.is_active ? 'var(--success)' : 'var(--text-muted)', fontWeight: 800 }}>
                {supplier.is_active ? 'Active' : 'Inactive'}
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={() => setEditingId(supplier.id)}>
                Edit
              </Button>
            </div>
            {editingId === supplier.id && (
              <SupplierEditRow supplier={supplier} onCancel={() => setEditingId(null)} />
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
