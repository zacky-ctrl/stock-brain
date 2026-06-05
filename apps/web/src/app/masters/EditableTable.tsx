'use client'

import { useActionState, useState } from 'react'
import type { ActionState } from '@/lib/masters'
import { tableTh, tableTd, inputStyle, msgError, msgOk } from '@/lib/ui'

export type ColDef = {
  key: string
  label: string
  type?: 'date'
}

export type EditFieldDef = {
  name: string
  label: string
  type: 'text' | 'number' | 'boolean'
  valueKey: string   // key in the row object
}

export type EditableTableRow = Record<string, unknown>

type EditRowFormProps = {
  row: EditableTableRow
  editFields: EditFieldDef[]
  colSpan: number
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>
  onClose: () => void
}

function EditRowForm({ row, editFields, colSpan, action, onClose }: EditRowFormProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, null)

  const labelStyle = {
    fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
    display: 'block' as const, marginBottom: '0.15rem',
  }

  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: '0.5rem 1rem', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
        {state && 'error' in state && state.error && (
          <p style={{ ...msgError, padding: '0.2rem 0.5rem', marginBottom: '0.4rem' }}>✗ {state.error}</p>
        )}
        {state && 'success' in state && state.success && (
          <p style={{ ...msgOk, padding: '0.2rem 0.5rem', marginBottom: '0.4rem' }}>✓ {state.success}</p>
        )}
        <form action={formAction} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
          <input type="hidden" name="id" value={String(row.id ?? '')} />

          {editFields.map((f) => (
            <div key={f.name}>
              <span style={labelStyle}>{f.label}</span>
              {f.type === 'boolean' ? (
                <select name={f.name} defaultValue={String(row[f.valueKey] ?? 'false')} style={{ ...inputStyle, width: '80px', padding: '0.25rem 0.35rem' }}>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <input
                  name={f.name}
                  type={f.type === 'number' ? 'number' : 'text'}
                  defaultValue={String(row[f.valueKey] ?? '')}
                  step={f.type === 'number' ? '0.01' : undefined}
                  style={{ ...inputStyle, width: f.type === 'number' ? '80px' : '160px', padding: '0.25rem 0.35rem' }}
                />
              )}
            </div>
          ))}

          <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'flex-end', paddingBottom: '0.05rem' }}>
            <button type="submit" disabled={isPending} style={{ fontSize: 'var(--text-xs)', padding: '0.28rem 0.65rem', border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', borderRadius: 'var(--radius-sm)', fontWeight: 600 }}>
              {isPending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={onClose} style={{ fontSize: 'var(--text-xs)', padding: '0.28rem 0.65rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>
              Cancel
            </button>
          </div>
        </form>
      </td>
    </tr>
  )
}

type EditableTableProps = {
  rows: EditableTableRow[]
  cols: ColDef[]
  editFields: EditFieldDef[]
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>
}

export function EditableTable({ rows, cols, editFields, action }: EditableTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null)

  if (rows.length === 0) return null

  const totalCols = cols.length + 1 // +1 for Actions col

  return (
    <div className="table-card" style={{ marginBottom: '1.5rem' }}>
    <table className="stock-table">
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c.key} style={tableTh}>{c.label}</th>
          ))}
          <th style={tableTh}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const id = String(row.id ?? '')
          const isEditing = editingId === id
          return (
            <>
              <tr key={id}>
                {cols.map((c) => {
                  const val = row[c.key]
                  const display = c.type === 'date'
                    ? (val ? new Date(val as string).toLocaleDateString() : '—')
                    : val === true ? 'yes' : val === false ? 'no' : val === null ? '—' : String(val ?? '')
                  return <td key={c.key} style={tableTd}>{display}</td>
                })}
                <td style={{ ...tableTd, whiteSpace: 'nowrap' }}>
                  {!isEditing && (
                    <button
                      onClick={() => setEditingId(id)}
                      style={{ fontSize: 'var(--text-xs)', padding: '0.15rem 0.5rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}
                    >
                      Edit
                    </button>
                  )}
                  {isEditing && (
                    <button
                      onClick={() => setEditingId(null)}
                      style={{ fontSize: 'var(--text-xs)', padding: '0.15rem 0.5rem', border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
              {isEditing && (
                <EditRowForm
                  key={`edit-${id}`}
                  row={row}
                  editFields={editFields}
                  colSpan={totalCols}
                  action={action}
                  onClose={() => setEditingId(null)}
                />
              )}
            </>
          )
        })}
      </tbody>
    </table>
    </div>
  )
}
