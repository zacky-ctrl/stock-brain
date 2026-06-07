'use client'

import { Fragment, useActionState, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { updateCustomer } from '../editActions'
import { Badge } from '@/components/ui/Badge'
import { inputStyle, msgError, msgOk, selectStyle, tableTd, tableTh } from '@/lib/ui'
import type { ActionState } from '@/lib/masters'

const BRAND_RULES = [
  { value: 'no_preference', label: 'No preference' },
  { value: 'prefer_nirankari', label: 'Prefer Nirankari' },
  { value: 'prefer_suhela', label: 'Prefer Suhela' },
  { value: 'strict_nirankari', label: 'Nirankari only' },
  { value: 'strict_suhela', label: 'Suhela only' },
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
      {state && 'error' in state && <p style={msgError}>x {state.error}</p>}
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
          <span>Location / Address</span>
          <input name="address" defaultValue={customer.address ?? ''} style={inputStyle} />
        </label>
        <label>
          <span>Phone</span>
          <input name="phone_number" defaultValue={customer.phone_number ?? ''} style={inputStyle} inputMode="tel" />
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const dabbiLabelById = new Map(dabbiColours.map((dabbi) => [dabbi.id, dabbi.label]))
  const visibleCustomers = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return customers
    return customers.filter((customer) => {
      const haystack = [
        customer.name,
        customer.entity_name,
        customer.address,
        customer.phone_number,
        customer.transport_name,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(needle)
    })
  }, [customers, query])

  return (
    <div>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.55rem',
          maxWidth: '520px',
          marginBottom: '1rem',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '0 0.75rem',
          background: 'var(--bg-elevated)',
        }}
      >
        <Search size={17} color="var(--text-secondary)" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search customer name, phone, location..."
          style={{ ...inputStyle, border: 0, background: 'transparent', paddingInline: 0 }}
        />
      </label>

      <div className="desktop-table-card" style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
        <table style={{ width: '100%', minWidth: '980px', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={tableTh}>Name</th>
              <th style={tableTh}>Location</th>
              <th style={tableTh}>Phone</th>
              <th style={tableTh}>Transport</th>
              <th style={tableTh}>Dabbi</th>
              <th style={tableTh}>Rates / Gross</th>
              <th style={tableTh}>Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleCustomers.map((customer) => {
              const editing = editingId === customer.id
              const defaultDabbi = customer.default_dabbi_colour_id
                ? dabbiLabelById.get(customer.default_dabbi_colour_id) ?? '-'
                : '-'

              return (
                <Fragment key={customer.id}>
                  <tr key={customer.id}>
                    <td style={{ ...tableTd, fontWeight: 900 }}>
                      <div style={{ color: 'var(--accent-bright)' }}>{customer.name}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', marginTop: '0.2rem' }}>
                        {customer.entity_name || formatBrandRule(customer.brand_rule)}
                      </div>
                      <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <Badge variant={customer.is_active ? 'success' : 'neutral'} label={customer.is_active ? 'Active' : 'Inactive'} size="sm" />
                        {customer.payment_risk_flag && <Badge variant="danger" label="Risk" size="sm" />}
                      </div>
                    </td>
                    <td style={tableTd}>{customer.address || '-'}</td>
                    <td style={tableTd}>{customer.phone_number || '-'}</td>
                    <td style={tableTd}>{customer.transport_name || '-'}</td>
                    <td style={tableTd}>{defaultDabbi}</td>
                    <td style={tableTd}>Y {fmtRate(customer.yellow_rate_per_gross)} · W {fmtRate(customer.white_rate_per_gross)}</td>
                    <td style={tableTd}>
                      <button
                        type="button"
                        className="customer-list-edit-button"
                        onClick={() => setEditingId(editing ? null : customer.id)}
                      >
                        {editing ? 'Close' : 'Edit'}
                      </button>
                    </td>
                  </tr>
                  {editing && (
                    <tr>
                      <td colSpan={7} style={{ ...tableTd, background: 'var(--bg-elevated)' }}>
                        <CustomerEditForm
                          customer={customer}
                          dabbiColours={dabbiColours}
                          onClose={() => setEditingId(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mobile-card-list" style={{ marginBottom: '1.5rem' }}>
        {visibleCustomers.map((customer) => {
          const editing = editingId === customer.id
          const defaultDabbi = customer.default_dabbi_colour_id
            ? dabbiLabelById.get(customer.default_dabbi_colour_id) ?? '-'
            : '-'

          return (
            <article key={customer.id} className="mobile-data-card">
              <div className="mobile-card-top">
                <div>
                  <div className="mobile-card-title">{customer.name}</div>
                  <div className="mobile-card-meta">{customer.address || customer.entity_name || '-'}</div>
                </div>
                <button
                  type="button"
                  className="customer-list-edit-button"
                  onClick={() => setEditingId(editing ? null : customer.id)}
                >
                  {editing ? 'Close' : 'Edit'}
                </button>
              </div>
              <div className="mobile-card-grid">
                <div><span className="mobile-card-label">Phone</span><strong className="mobile-card-value">{customer.phone_number || '-'}</strong></div>
                <div><span className="mobile-card-label">Transport</span><strong className="mobile-card-value">{customer.transport_name || '-'}</strong></div>
                <div><span className="mobile-card-label">Dabbi</span><strong className="mobile-card-value">{defaultDabbi}</strong></div>
                <div><span className="mobile-card-label">Rates</span><strong className="mobile-card-value">Y {fmtRate(customer.yellow_rate_per_gross)} · W {fmtRate(customer.white_rate_per_gross)}</strong></div>
              </div>
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

      {visibleCustomers.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>No customers match this search.</p>
      )}
    </div>
  )
}
