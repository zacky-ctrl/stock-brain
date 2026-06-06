'use client'

import { useActionState, useState } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { ActionState } from '@/lib/masters'
import { updateDraftInvoiceAction } from './actions'

type Props = {
  invoice: {
    id: string
    invoice_date: string
    due_date: string | null
    yellow_rate_per_gross: number | string | null
    white_rate_per_gross: number | string | null
    transport_charges: number | string
    other_charges: number | string
    discount_amount: number | string
    round_off_amount: number | string
    notes: string | null
  }
  customerYellowRate: number | null
  customerWhiteRate: number | null
}

const fieldStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
} as const

const inputStyle = {
  width: '100%',
  minHeight: '2.5rem',
} as const

export function EditDraftInvoiceForm({ invoice, customerYellowRate, customerWhiteRate }: Props) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    updateDraftInvoiceAction,
    null,
  )

  const currentYellow = invoice.yellow_rate_per_gross !== null ? Number(invoice.yellow_rate_per_gross) : null
  const currentWhite = invoice.white_rate_per_gross !== null ? Number(invoice.white_rate_per_gross) : null
  const defaultYellow =
    (currentYellow === null || currentYellow === 0) && customerYellowRate !== null
      ? customerYellowRate
      : currentYellow
  const defaultWhite =
    (currentWhite === null || currentWhite === 0) && customerWhiteRate !== null
      ? customerWhiteRate
      : currentWhite

  const [yellowInput, setYellowInput] = useState(String(defaultYellow ?? ''))
  const [whiteInput, setWhiteInput] = useState(String(defaultWhite ?? ''))

  const yellowDiffersFromMaster =
    customerYellowRate !== null &&
    yellowInput !== '' &&
    Number(yellowInput) !== customerYellowRate

  const whiteDiffersFromMaster =
    customerWhiteRate !== null &&
    whiteInput !== '' &&
    Number(whiteInput) !== customerWhiteRate

  const rateModified = yellowDiffersFromMaster || whiteDiffersFromMaster

  return (
    <form action={formAction} style={{ display: 'grid', gap: '0.9rem' }}>
      <input type="hidden" name="invoice_id" value={invoice.id} />

      {rateModified && (
        <div
          style={{
            padding: '0.65rem 0.9rem',
            background: 'var(--warning-bg, #fffbeb)',
            border: '1px solid var(--warning, #d97706)',
            borderRadius: 'var(--radius)',
            fontSize: 'var(--text-sm)',
            color: 'var(--warning, #92400e)',
          }}
        >
          <strong>Rate differs from customer master.</strong>{' '}
          {yellowDiffersFromMaster && (
            <span>Yellow: master = {customerYellowRate}. </span>
          )}
          {whiteDiffersFromMaster && (
            <span>White: master = {customerWhiteRate}. </span>
          )}
          A reason is required when saving with modified rates.
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '0.75rem',
        }}
      >
        <label style={fieldStyle}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Invoice Date
          </span>
          <input name="invoice_date" type="date" defaultValue={invoice.invoice_date} required style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Due Date
          </span>
          <input name="due_date" type="date" defaultValue={invoice.due_date ?? ''} style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: yellowDiffersFromMaster ? 'var(--warning)' : 'var(--text-secondary)',
              fontWeight: 700,
            }}
          >
            Yellow Rate / Gross{yellowDiffersFromMaster ? ' ⚠' : ''}
          </span>
          <input
            name="yellow_rate_per_gross"
            type="number"
            step="0.01"
            min="0"
            value={yellowInput}
            onChange={(e) => setYellowInput(e.target.value)}
            required
            style={{
              ...inputStyle,
              borderColor: yellowDiffersFromMaster ? 'var(--warning)' : undefined,
            }}
          />
        </label>
        <label style={fieldStyle}>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: whiteDiffersFromMaster ? 'var(--warning)' : 'var(--text-secondary)',
              fontWeight: 700,
            }}
          >
            White Rate / Gross{whiteDiffersFromMaster ? ' ⚠' : ''}
          </span>
          <input
            name="white_rate_per_gross"
            type="number"
            step="0.01"
            min="0"
            value={whiteInput}
            onChange={(e) => setWhiteInput(e.target.value)}
            required
            style={{
              ...inputStyle,
              borderColor: whiteDiffersFromMaster ? 'var(--warning)' : undefined,
            }}
          />
        </label>
        <label style={fieldStyle}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Transport
          </span>
          <input name="transport_charges" type="number" step="0.01" min="0" defaultValue={invoice.transport_charges} style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Manual Addition / Correction
          </span>
          <input name="other_charges" type="number" step="0.01" min="0" defaultValue={invoice.other_charges} style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Discount
          </span>
          <input name="discount_amount" type="number" step="0.01" min="0" defaultValue={invoice.discount_amount} style={inputStyle} />
        </label>
        <label style={fieldStyle}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            Round Off
          </span>
          <input name="round_off_amount" type="number" step="0.01" defaultValue={invoice.round_off_amount} style={inputStyle} />
        </label>
      </div>
      <label style={fieldStyle}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 700 }}>
          Notes / Reason{rateModified ? ' *' : ''}
        </span>
        <input
          name="notes"
          defaultValue={invoice.notes ?? ''}
          placeholder={rateModified ? 'Required: reason for rate change' : 'Invoice review note'}
          required={rateModified}
          style={inputStyle}
        />
      </label>
      {state && 'error' in state && (
        <p style={{ margin: 0, color: 'var(--danger)', fontSize: 'var(--text-sm)', fontWeight: 700 }}>
          {state.error}
        </p>
      )}
      {state && 'success' in state && (
        <p style={{ margin: 0, color: 'var(--success-bright)', fontSize: 'var(--text-sm)', fontWeight: 700 }}>
          {state.success}
        </p>
      )}
      <Button type="submit" variant="secondary" icon={Save} loading={isPending} style={{ justifySelf: 'start' }}>
        Save Draft Changes
      </Button>
    </form>
  )
}
