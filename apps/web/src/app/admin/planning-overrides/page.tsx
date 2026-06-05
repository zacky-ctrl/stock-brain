import { createServerSupabaseClient } from '@/lib/supabase/server'
import { resolveOverrideAction } from './actions'
import { tableTh, tableTd } from '@/lib/ui'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import Link from 'next/link'
import type { CSSProperties } from 'react'

type OverrideRow = {
  id: string
  order_line_id: string
  override_type: string
  reason: string
  created_by: string
  created_at: string
  // enriched
  customer_name: string | null
  shape_name: string | null
  bindi_code: string | null
  size_code: string | null
  open_qty: number | null
}

const OVERRIDE_TYPE_LABEL: Record<string, string> = {
  CUTTINGS_OVERRIDE:    'Cuttings override',
  READY_STOCK_OVERRIDE: 'Ready stock override',
  VELVET_OVERRIDE:      'Velvet override',
  GENERAL_OVERRIDE:     'General override',
}

export default async function PlanningOverridesPage() {
  const supabase = createServerSupabaseClient()

  // Load active overrides with order line context
  const { data: overrides, error } = await supabase
    .from('planning_overrides')
    .select(`
      id, order_line_id, override_type, reason, created_by, created_at,
      order_lines(
        ordered_qty, closed_qty,
        shape_designs(name),
        bindi_colours(code),
        sizes(code),
        orders(customers(name))
      )
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  const rows: OverrideRow[] = (overrides ?? []).map((ov: Record<string, unknown>) => {
    const lineRaw = Array.isArray(ov['order_lines']) ? (ov['order_lines'] as Record<string, unknown>[])[0] : (ov['order_lines'] as Record<string, unknown> | null)
    const orderRaw = lineRaw
      ? (Array.isArray(lineRaw['orders']) ? (lineRaw['orders'] as Record<string, unknown>[])[0] : (lineRaw['orders'] as Record<string, unknown> | null))
      : null
    const customerRaw = orderRaw
      ? (Array.isArray(orderRaw['customers']) ? (orderRaw['customers'] as Record<string, unknown>[])[0] : (orderRaw['customers'] as Record<string, unknown> | null))
      : null

    const designRaw = lineRaw
      ? (Array.isArray(lineRaw['shape_designs']) ? (lineRaw['shape_designs'] as Record<string, unknown>[])[0] : (lineRaw['shape_designs'] as Record<string, unknown> | null))
      : null
    const bindiRaw = lineRaw
      ? (Array.isArray(lineRaw['bindi_colours']) ? (lineRaw['bindi_colours'] as Record<string, unknown>[])[0] : (lineRaw['bindi_colours'] as Record<string, unknown> | null))
      : null
    const sizeRaw = lineRaw
      ? (Array.isArray(lineRaw['sizes']) ? (lineRaw['sizes'] as Record<string, unknown>[])[0] : (lineRaw['sizes'] as Record<string, unknown> | null))
      : null

    const ordered = lineRaw ? Number(lineRaw['ordered_qty']) : 0
    const closed = lineRaw ? Number(lineRaw['closed_qty']) : 0

    return {
      id: ov['id'] as string,
      order_line_id: ov['order_line_id'] as string,
      override_type: ov['override_type'] as string,
      reason: ov['reason'] as string,
      created_by: ov['created_by'] as string,
      created_at: ov['created_at'] as string,
      customer_name: customerRaw ? (customerRaw['name'] as string) : null,
      shape_name: designRaw ? (designRaw['name'] as string) : null,
      bindi_code: bindiRaw ? (bindiRaw['code'] as string) : null,
      size_code: sizeRaw ? (sizeRaw['code'] as string) : null,
      open_qty: lineRaw ? Math.max(0, ordered - closed) : null,
    }
  })

  const tdNum: CSSProperties = {
    ...tableTd,
    textAlign: 'right',
    paddingRight: '1rem',
    fontVariantNumeric: 'tabular-nums',
  }

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1200px' }}>
      <PageHeader
        title="Planning Overrides"
        actions={
          <Link href="/planning/allocation" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
            ← Plan
          </Link>
        }
        subtitle="Active overrides allow an action despite a system block (stock physically available, entry pending). Resolve an override once the underlying data has been entered correctly."
      />

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: '0.88rem' }}>✗ {error.message}</p>
      )}

      {rows.length === 0 && !error && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>No active planning overrides.</p>
      )}

      {rows.length > 0 && (
        <div className="table-card" style={{ overflowX: 'auto' }}>
          <table className="stock-table" style={{ minWidth: '900px' }}>
            <thead>
              <tr>
                <th style={tableTh}>Customer</th>
                <th style={tableTh}>SKU</th>
                <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1rem' }}>Open Qty</th>
                <th style={tableTh}>Override Type</th>
                <th style={tableTh}>Reason</th>
                <th style={tableTh}>Created At</th>
                <th style={tableTh}>Resolve</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} style={{ background: 'var(--warning-subtle)' }}>
                  <td style={tableTd}>{row.customer_name ?? '—'}</td>
                  <td style={tableTd}>
                    {[row.shape_name, row.bindi_code, row.size_code].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td style={tdNum}>{row.open_qty !== null ? String(row.open_qty) : '—'}</td>
                  <td style={tableTd}>
                    <Badge
                      variant="warning"
                      label={OVERRIDE_TYPE_LABEL[row.override_type] ?? row.override_type}
                      size="sm"
                    />
                  </td>
                  <td style={{ ...tableTd, maxWidth: '300px', wordBreak: 'break-word' }}>
                    {row.reason}
                  </td>
                  <td style={{ ...tableTd, color: 'var(--text-secondary)', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                    {new Date(row.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={tableTd}>
                    <form action={resolveOverrideAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <Button type="submit" variant="secondary" size="sm">
                        Resolve
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create override form — accessible via query param order_line_id */}
      <CreateOverridePanel />
    </main>
  )
}

// ── Create override inline form ───────────────────────────────

function CreateOverridePanel() {
  // This panel is rendered for the /admin/planning-overrides/new?order_line_id=... pattern
  // via a separate route, but we also expose it here for direct admin entry.
  return null
}
