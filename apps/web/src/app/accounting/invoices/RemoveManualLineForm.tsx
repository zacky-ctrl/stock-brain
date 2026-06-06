'use client'

import { useActionState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { ActionState } from '@/lib/masters'
import { removeManualInvoiceLineAction } from './actions'

type Props = {
  invoiceId: string
  lineId: string
}

export function RemoveManualLineForm({ invoiceId, lineId }: Props) {
  const [, formAction, isPending] = useActionState<ActionState, FormData>(
    removeManualInvoiceLineAction,
    null,
  )

  return (
    <form action={formAction}>
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <input type="hidden" name="line_id" value={lineId} />
      <Button type="submit" variant="secondary" size="sm" icon={Trash2} loading={isPending}>
        Remove
      </Button>
    </form>
  )
}
