import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { tableTd, tableTh } from '@/lib/ui'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ConfirmPurchaseBillForm, PurchaseBillDraftEditor } from './PurchaseBillActions'

type PurchaseBillRow = {
  id: string
  purchase_bill_number: string | null
  supplier_bill_number: string | null
  supplier_id: string
  purchase_date: string
  due_date: string | null
  status: string
  supplier_name_snapshot: string
  entity_name_snapshot: string | null
  address_snapshot: string | null
  phone_snapshot: string | null
  goods_amount: number | string
  inventory_amount: number | string
  expense_amount: number | string
  transport_charges: number | string
  other_charges: number | string
  discount_amount: number | string
  round_off_amount: number | string
  total_amount: number | string
  stock_impact_status: string
  notes: string | null
  accounting_journal_entry_id: string | null
}

type PurchaseBillLineRow = {
  id: string
  line_type: string
  description: string
  quantity: number | string
  unit: string
  rate_per_unit: number | string
  line_amount: number | string
  stock_stage: string
  notes: string | null
}

type AuditEventRow = {
  id: string
  event_type: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  reason: string | null
  created_at: string
}

function money(value: number | string): string {
  return Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function statusVariant(status: string): 'success' | 'warning' | 'neutral' | 'danger' {
  if (status === 'confirmed') return 'success'
  if (status === 'draft') return 'warning'
  if (status === 'voided') return 'danger'
  return 'neutral'
}

export default async function PurchaseBillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const [
    { data: billRaw, error: billError },
    { data: linesRaw },
    { data: auditRaw },
  ] = await Promise.all([
    supabase
      .from('purchase_bills')
      .select('id, purchase_bill_number, supplier_bill_number, supplier_id, purchase_date, due_date, status, supplier_name_snapshot, entity_name_snapshot, address_snapshot, phone_snapshot, goods_amount, inventory_amount, expense_amount, transport_charges, other_charges, discount_amount, round_off_amount, total_amount, stock_impact_status, notes, accounting_journal_entry_id')
      .eq('id', id)
      .single(),
    supabase
      .from('purchase_bill_lines')
      .select('id, line_type, description, quantity, unit, rate_per_unit, line_amount, stock_stage, notes')
      .eq('purchase_bill_id', id)
      .order('created_at'),
    supabase
      .from('purchase_bill_audit_events')
      .select('id, event_type, field_name, old_value, new_value, reason, created_at')
      .eq('purchase_bill_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (billError || !billRaw) notFound()

  const bill = billRaw as unknown as PurchaseBillRow
  const lines = (linesRaw ?? []) as unknown as PurchaseBillLineRow[]
  const auditEvents = (auditRaw ?? []) as unknown as AuditEventRow[]

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1280px' }}>
      <Link href="/accounting/purchases" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
        &lt; Back
      </Link>
      <PageHeader
        title={bill.purchase_bill_number ?? 'Draft Purchase Bill'}
        subtitle={`${bill.supplier_name_snapshot} · ${bill.purchase_date}`}
        actions={<Badge variant={statusVariant(bill.status)} label={bill.status} />}
      />

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 0.8fr)',
          gap: '1rem',
          marginBottom: '1rem',
        }}
      >
        <Card>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: 'var(--text-lg)' }}>{bill.supplier_name_snapshot}</h2>
          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <div>{bill.entity_name_snapshot ?? '-'}</div>
            <div>{bill.address_snapshot ?? '-'}</div>
            <div>{bill.phone_snapshot ? `Phone: ${bill.phone_snapshot}` : 'Phone: -'}</div>
            <div>Supplier bill: {bill.supplier_bill_number ?? '-'}</div>
          </div>
        </Card>
        <Card>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: 'var(--text-lg)' }}>Totals</h2>
          <div style={{ display: 'grid', gap: '0.45rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Goods</span><strong>{money(bill.goods_amount)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Transport</span><strong>{money(bill.transport_charges)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Other</span><strong>{money(bill.other_charges)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Discount</span><strong>- {money(bill.discount_amount)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Round off</span><strong>{money(bill.round_off_amount)}</strong></div>
            <div style={{ height: 1, background: 'var(--border)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-lg)' }}><span>Total</span><strong>{money(bill.total_amount)}</strong></div>
          </div>
        </Card>
      </section>

      <Card style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Purchase Lines</h2>
          <Badge variant={bill.stock_impact_status === 'pending' ? 'warning' : 'neutral'} label={`stock ${bill.stock_impact_status}`} size="sm" />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '860px' }}>
            <thead>
              <tr>
                <th style={tableTh}>Type</th>
                <th style={tableTh}>Description</th>
                <th style={tableTh}>Stock Stage</th>
                <th style={{ ...tableTh, textAlign: 'right' }}>Qty</th>
                <th style={tableTh}>Unit</th>
                <th style={{ ...tableTh, textAlign: 'right' }}>Rate</th>
                <th style={{ ...tableTh, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td style={tableTd}>{line.line_type}</td>
                  <td style={{ ...tableTd, fontWeight: 800 }}>{line.description}</td>
                  <td style={tableTd}>{line.stock_stage}</td>
                  <td style={{ ...tableTd, textAlign: 'right' }}>{Number(line.quantity).toLocaleString('en-IN')}</td>
                  <td style={tableTd}>{line.unit}</td>
                  <td style={{ ...tableTd, textAlign: 'right' }}>{money(line.rate_per_unit)}</td>
                  <td style={{ ...tableTd, textAlign: 'right', fontWeight: 900 }}>{money(line.line_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {bill.status === 'draft' && (
        <section style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}>
          <Card>
            <h2 style={{ margin: '0 0 0.75rem', fontSize: 'var(--text-lg)' }}>Edit Draft</h2>
            <PurchaseBillDraftEditor bill={bill} />
          </Card>
          <Card>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: 'var(--text-lg)' }}>Confirm Bill</h2>
            <p style={{ margin: '0 0 0.75rem', color: 'var(--text-secondary)' }}>
              Confirmation posts supplier payable and locks this bill into the supplier ledger.
            </p>
            <ConfirmPurchaseBillForm purchaseBillId={bill.id} />
          </Card>
        </section>
      )}

      {bill.accounting_journal_entry_id && (
        <Card style={{ marginBottom: '1rem' }}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: 'var(--text-lg)' }}>Accounting</h2>
          <Link href="/accounting/journal">
            <Button type="button" variant="secondary">View Journal</Button>
          </Link>
        </Card>
      )}

      {auditEvents.length > 0 && (
        <Card>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: 'var(--text-lg)' }}>Audit Trail</h2>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {auditEvents.map((event) => (
              <div key={event.id} style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                <strong>{event.event_type}</strong>
                <span style={{ color: 'var(--text-secondary)' }}> · {event.created_at}</span>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>{event.reason ?? '-'}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </main>
  )
}
