import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createOverrideAction } from '../actions'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { selectStyle, inputStyle } from '@/lib/ui'
import Link from 'next/link'

export default async function NewPlanningOverridePage({
  searchParams,
}: {
  searchParams: Promise<{ order_line_id?: string }>
}) {
  const { order_line_id } = await searchParams

  // Load order line context for display
  let lineContext: { customer_name: string; sku: string; open_qty: number } | null = null

  if (order_line_id) {
    const supabase = createServerSupabaseClient()
    const { data } = await supabase
      .from('order_lines')
      .select(`
        ordered_qty, closed_qty,
        shape_designs(name),
        bindi_colours(code),
        sizes(code),
        orders(customers(name))
      `)
      .eq('id', order_line_id)
      .single()

    if (data) {
      const orderRaw = Array.isArray(data.orders) ? data.orders[0] : (data.orders as Record<string, unknown> | null)
      const customerRaw = orderRaw
        ? (Array.isArray(orderRaw['customers']) ? (orderRaw['customers'] as Record<string, unknown>[])[0] : (orderRaw['customers'] as Record<string, unknown> | null))
        : null
      const designRaw = Array.isArray(data.shape_designs) ? data.shape_designs[0] : (data.shape_designs as Record<string, unknown> | null)
      const bindiRaw = Array.isArray(data.bindi_colours) ? data.bindi_colours[0] : (data.bindi_colours as Record<string, unknown> | null)
      const sizeRaw = Array.isArray(data.sizes) ? data.sizes[0] : (data.sizes as Record<string, unknown> | null)

      lineContext = {
        customer_name: customerRaw ? (customerRaw['name'] as string) : '—',
        sku: [
          designRaw ? (designRaw['name'] as string) : null,
          bindiRaw ? (bindiRaw['code'] as string) : null,
          sizeRaw ? (sizeRaw['code'] as string) : null,
        ].filter(Boolean).join(' / ') || '—',
        open_qty: Math.max(0, Number(data.ordered_qty) - Number(data.closed_qty)),
      }
    }
  }

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '640px' }}>
      <PageHeader
        title="Create Planning Override"
        backHref="/admin/planning-overrides"
      />

      {lineContext && (
        <Card style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.85rem' }}>
            <div><strong>Customer:</strong> {lineContext.customer_name}</div>
            <div><strong>SKU:</strong> {lineContext.sku}</div>
            <div><strong>Open Qty:</strong> {lineContext.open_qty}</div>
          </div>
        </Card>
      )}

      {!order_line_id && (
        <p style={{ color: 'var(--danger)', fontSize: '0.88rem' }}>
          No order_line_id provided. Use the Override button on the planning page.
        </p>
      )}

      {order_line_id && (
        <form action={createOverrideAction} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <input type="hidden" name="order_line_id" value={order_line_id} />

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.88rem' }}>
            Override Type
            <select
              name="override_type"
              required
              style={{
                ...selectStyle,
                fontSize: '0.88rem',
              }}
            >
              <option value="">Select type…</option>
              <option value="CUTTINGS_OVERRIDE">Cuttings override — cuttings physically available, entry pending</option>
              <option value="READY_STOCK_OVERRIDE">Ready stock override — ready stock physically available, entry pending</option>
              <option value="VELVET_OVERRIDE">Velvet override — velvet physically available, receipt entry pending</option>
              <option value="GENERAL_OVERRIDE">General override — free reason</option>
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.88rem' }}>
            Reason (required)
            <textarea
              name="reason"
              required
              rows={3}
              placeholder="Describe why this override is being applied…"
              style={{
                ...inputStyle,
                fontSize: '0.88rem',
                resize: 'vertical',
              }}
            />
          </label>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button type="submit" variant="primary">
              Create Override
            </Button>
            <Link
              href="/planning/allocation"
              style={{
                fontSize: '0.88rem',
                padding: '0.4rem 1rem',
                color: 'var(--text-primary)',
                textDecoration: 'none',
                border: '1px solid var(--border)',
                borderRadius: '3px',
              }}
            >
              Cancel
            </Link>
          </div>
        </form>
      )}
    </main>
  )
}
