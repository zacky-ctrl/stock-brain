'use client'

import { useActionState } from 'react'
import { BadgeCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { ActionState } from '@/lib/masters'
import { issueInvoiceAction } from './actions'

type Props = {
  invoiceId: string
}

export function IssueInvoiceForm({ invoiceId }: Props) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    issueInvoiceAction,
    null,
  )

  return (
    <form action={formAction} style={{ display: 'grid', gap: '0.55rem', justifyItems: 'start' }}>
      <input type="hidden" name="invoice_id" value={invoiceId} />
      {state && 'error' in state && (
        <p style={{ margin: 0, color: 'var(--danger)', fontSize: 'var(--text-sm)', fontWeight: 700 }}>
          {state.error}
        </p>
      )}
      <Button type="submit" variant="primary" icon={BadgeCheck} loading={isPending}>
        Issue Invoice
      </Button>
    </form>
  )
}
