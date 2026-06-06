'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CreateDraftInvoiceForm } from './CreateDraftInvoiceForm'

type Props = {
  dispatchId: string
  challanNumber: string | null
  dispatchDate: string
  customerName: string
  transportName: string | null
  yellowRate: number | string | null
  whiteRate: number | string | null
}

export function ExpandableChallanCard({
  dispatchId,
  challanNumber,
  dispatchDate,
  customerName,
  transportName,
  yellowRate,
  whiteRate,
}: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        background: 'var(--bg-card)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '0.75rem 1rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
            {customerName}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
            Challan {challanNumber ?? dispatchId.slice(0, 8)} · {dispatchDate}
            {transportName ? ` · ${transportName}` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
          <Link href={`/dispatch/${dispatchId}`}>
            <Button type="button" size="sm" variant="secondary">
              View Challan
            </Button>
          </Link>
          <Button
            type="button"
            size="sm"
            variant={expanded ? 'secondary' : 'primary'}
            icon={expanded ? ChevronUp : ChevronDown}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Cancel' : 'Create Draft Invoice'}
          </Button>
        </div>
      </div>

      {expanded && (
        <div
          style={{
            borderTop: '1px solid var(--border-subtle)',
            padding: '1rem',
            background: 'var(--bg-elevated)',
          }}
        >
          <CreateDraftInvoiceForm
            dispatchId={dispatchId}
            defaultInvoiceDate={dispatchDate}
            defaultYellowRate={yellowRate}
            defaultWhiteRate={whiteRate}
          />
        </div>
      )}
    </div>
  )
}
