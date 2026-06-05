'use client'

import { useActionState, useState } from 'react'
import { updateCustomer } from '../editActions'
import { Badge } from '@/components/ui/Badge'
import { inputStyle, msgError, msgOk, selectStyle } from '@/lib/ui'
import type { ActionState } from '@/lib/masters'

const BRAND_RULES = [
  { value: 'no_preference',    label: 'No preference' },
  { value: 'prefer_nirankari', label: 'Prefer Nirankari' },
  { value: 'prefer_suhela',    label: 'Prefer Suhela' },
  { value: 'strict_nirankari', label: 'Nirankari only' },
  { value: 'strict_suhela',    label: 'Suhela only' },
]

export type CustomerRow = {
  id: string
  name: string
  entity_name: string | null
  address: string | null
  phone_number: string | null
  transport_name: string | null
  default_dabbi_colour_id: string | null
  yellow_rate_per_gross: number | null
  white_rate_per_gross: number | null
  brand_rule: string
  payment_risk_flag: boolean
  notes: string | null
  is_active: boolean
  created_at: string
}

export type DabbiOption = {
  id: string
  label: string
}

type Props = {
  customers: CustomerRow[]
  dabbiColours: DabbiOption[]
}

function fmtRate(value: number | null): string {
  if (value === null) return '-'
  return value % 1 === 0 ? String(value) : value.toFixed(2)
}

function formatBrandRule(value: string): string {
  return BRAND_RULES.find((rule) => rule.value === value)?.label ?? value.replace(/_/g, ' ')
}

function CustomerEditForm({
  customer,
  dabbiColours,
  onClose,
}: {
  customer: CustomerRow
  dabbiColours: DabbiOption[]
  onClose: () => void
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(updateCustomer, null)

  return (
    <form action={formAction} className="customer-edit-panel">
      <input type="hidden" name="id" value={customer.id} />
      {state && 'error' in state && <p style={msgError}>✗ {state.error}</p>}
      {state && 'success' in state && <p style={msgOk}>✓ {state.success}</p>}

      <div className="customer-edit-grid">
        <label>
          <span>Name</span>
          <input name="name" defaultValue={customer.name} style={inputStyle} required />
        </label>
        <label>
          <span>Entity name</span>
          <input name="entity_name" defaultValue={customer.entity_name ?? ''} style={inputStyle} />
        </label>
        <label className="customer-edit-wide">
          <span>Address</span>
          <input name="address" defaultValue={customer.address ?? ''} style={inputStyle} />
        </label>
        <label>
          <span>Phone</span>
          <input name="phone_number" defaultValue={customer.phone_number ?? ''} style={inputStyle} />
        </label>
        <label>
          <span>Transport</span>
          <input name="transport_name" defaultValue={customer.transport_name ?? ''} style={inputStyle} />
        </label>
        <label>
          <span>Default dabbi colour</span>
          <select name="default_dabbi_colour_id" defaultValue={customer.default_dabbi_colour_id ?? ''} style={selectStyle}>
            <option value="">No default</option>
            {dabbiColours.map((dabbi) => (
              <option key={dabbi.id} value={dabbi.id}>{dabbi.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Brand rule</span>
          <select name="brand_rule" defaultValue={customer.brand_rule} style={selectStyle}>
            {BRAND_RULES.map((rule) => (
              <option key={rule.value} value={rule.value}>{rule.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Yellow rate / gross</span>
          <input name="yellow_rate_per_gross" type="number" step="0.01" min="0" defaultValue={customer.yellow_rate_per_gross ?? ''} style={inputStyle} />
        </label>
        <label>
          <span>White rate / gross</span>
          <input name="white_rate_per_gross" type="number" step="0.01" min="0" defaultValue={customer.white_rate_per_gross ?? ''} style={inputStyle} />
        </label>
        <label>
          <span>Active</span>
          <select name="is_active" defaultValue={String(customer.is_active)} style={selectStyle}>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
        <label>
          <span>Payment risk</span>
          <select name="payment_risk_flag" defaultValue={String(customer.payment_risk_flag)} style={selectStyle}>
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </label>
        <label className="customer-edit-wide">
          <span>Notes</span>
          <input name="notes" defaultValue={customer.notes ?? ''} style={inputStyle} />
        </label>
      </div>

      <div className="customer-edit-actions">
        <button type="submit" disabled={isPending}>{isPending ? 'Saving...' : 'Save customer'}</button>
        <button type="button" onClick={onClose}>Cancel</button>
      </div>
    </form>
  )
}

export function CustomerCards({ customers, dabbiColours }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(customers[0]?.id ?? null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const dabbiLabelById = new Map(dabbiColours.map((dabbi) => [dabbi.id, dabbi.label]))

  return (
    <div className="customer-card-list">
      {customers.map((customer) => {
        const expanded = expandedId === customer.id
        const editing = editingId === customer.id
        const defaultDabbi = customer.default_dabbi_colour_id
          ? dabbiLabelById.get(customer.default_dabbi_colour_id) ?? '-'
          : '-'

        return (
          <article
            key={customer.id}
            className="customer-card"
            onClick={(event) => {
              const target = event.target as HTMLElement
              if (target.closest('button, a, input, select, textarea, form')) return
              setExpandedId(expanded ? null : customer.id)
            }}
          >
            <div className="customer-card-top">
              <div>
                <h2>{customer.name}</h2>
                <p>{customer.entity_name || customer.address || 'No billing details added'}</p>
              </div>
              <div className="customer-card-actions">
                <Badge variant={customer.is_active ? 'success' : 'neutral'} label={customer.is_active ? 'Active' : 'Inactive'} size="sm" />
                {customer.payment_risk_flag && <Badge variant="danger" label="Risk" size="sm" />}
                <button
                  type="button"
                  onClick={() => {
                    setExpandedId(customer.id)
                    setEditingId(editing ? null : customer.id)
                  }}
                >
                  {editing ? 'Close' : 'Edit'}
                </button>
              </div>
            </div>

            <div className="customer-card-main">
              <div><span>Phone</span><strong>{customer.phone_number || '-'}</strong></div>
              <div><span>Transport</span><strong>{customer.transport_name || '-'}</strong></div>
              <div><span>Dabbi</span><strong>{defaultDabbi}</strong></div>
              <div><span>Rates / gross</span><strong>Y {fmtRate(customer.yellow_rate_per_gross)} · W {fmtRate(customer.white_rate_per_gross)}</strong></div>
            </div>

            {expanded && !editing && (
              <div className="customer-card-details">
                <div><span>Address</span><strong>{customer.address || '-'}</strong></div>
                <div><span>Brand rule</span><strong>{formatBrandRule(customer.brand_rule)}</strong></div>
                <div><span>Notes</span><strong>{customer.notes || '-'}</strong></div>
                <div><span>Created</span><strong>{new Date(customer.created_at).toLocaleDateString()}</strong></div>
              </div>
            )}

            {editing && (
              <CustomerEditForm
                customer={customer}
                dabbiColours={dabbiColours}
                onClose={() => setEditingId(null)}
              />
            )}
          </article>
        )
      })}
    </div>
  )
}
