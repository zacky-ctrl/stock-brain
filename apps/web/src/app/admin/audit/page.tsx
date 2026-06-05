import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'
import { tableTh, tableTd, selectStyle, inputStyle } from '@/lib/ui'
import Link from 'next/link'
import type { CSSProperties } from 'react'

type Category = 'stock' | 'order' | 'dispatch' | 'labour' | 'cutting' | 'velvet' | 'system'

type AuditEvent = {
  id: string
  timestamp: string
  event_type: string
  actor_id: string | null
  actor_email: string | null
  summary: string
  detail: string | null
  category: Category
}

const CATEGORY_BADGE: Record<Category, BadgeVariant> = {
  stock:    'warning',
  order:    'accent',
  dispatch: 'success',
  labour:   'info',
  cutting:  'danger',
  velvet:   'neutral',
  system:   'neutral',
}

function fmtTs(ts: string): string {
  const d = new Date(ts)
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh   = String(d.getHours()).padStart(2, '0')
  const min  = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`
}

function actorDisplay(id: string | null, email: string | null): string {
  if (email) return email
  if (id)    return id.slice(0, 8)
  return '—'
}

export default async function AuditTrailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params    = await searchParams
  const dateFrom  = typeof params.dateFrom  === 'string' ? params.dateFrom  : ''
  const dateTo    = typeof params.dateTo    === 'string' ? params.dateTo    : ''
  const eventType = typeof params.eventType === 'string' ? params.eventType : ''
  const userId    = typeof params.userId    === 'string' ? params.userId    : ''

  const supabase = createServerSupabaseClient()

  const [
    correctionsRes,
    amendmentsRes,
    overridesRes,
    allocationsRes,
    dispatchRes,
    labourHistoryRes,
    cuttingSessionsRes,
    velvetReceiptsRes,
  ] = await Promise.all([
    supabase
      .from('stock_corrections')
      .select('id, corrected_at, corrected_by, stock_stage, field_corrected, old_value, new_value, reason')
      .order('corrected_at', { ascending: false })
      .limit(500),

    supabase
      .from('order_line_amendments')
      .select('id, amended_at, amended_by, order_line_id, field_amended, old_value, new_value, reason')
      .order('amended_at', { ascending: false })
      .limit(500),

    supabase
      .from('priority_overrides')
      .select('id, overridden_at, overridden_by, order_line_id, priority_value, previous_priority_value, reason')
      .eq('is_active', true)
      .order('overridden_at', { ascending: false })
      .limit(500),

    supabase
      .from('stock_allocations')
      .select('id, allocated_at, allocated_by, is_active, allocated_qty, stock_stage, deactivation_reason, deactivated_at, deactivated_by')
      .order('allocated_at', { ascending: false })
      .limit(500),

    supabase
      .from('dispatch_events')
      .select('id, created_at, dispatched_by, status, dispatch_date, reference, customers(name)')
      .order('created_at', { ascending: false })
      .limit(500),

    supabase
      .from('labour_job_status_history')
      .select('id, changed_at, changed_by, from_status, to_status, reason, labour_job_id')
      .order('changed_at', { ascending: false })
      .limit(500),

    supabase
      .from('cutting_sessions')
      .select('id, created_at, created_by, confirmed_at, confirmed_by, status, session_date')
      .in('status', ['confirmed', 'voided'])
      .order('created_at', { ascending: false })
      .limit(500),

    supabase
      .from('velvet_receipts')
      .select('id, created_at, created_by, receipt_date, bundles_received, supplier, bindi_colour_id, bindi_colours(code)')
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  // user_roles has email only — no UUID mapping available; actor displays fall back to UUID slice
  const userMap = new Map<string, string>()

  function resolveActor(id: string | null | undefined): { id: string | null; email: string | null } {
    if (!id) return { id: null, email: null }
    return { id, email: userMap.get(id) ?? null }
  }

  const events: AuditEvent[] = []

  // stock_corrections
  for (const r of (correctionsRes.data ?? [])) {
    const actor = resolveActor(r.corrected_by as string | null)
    events.push({
      id:         r.id as string,
      timestamp:  r.corrected_at as string,
      event_type: 'Stock Correction',
      actor_id:   actor.id,
      actor_email: actor.email,
      summary:    `${r.stock_stage} — ${r.field_corrected}: ${r.old_value} → ${r.new_value}`,
      detail:     r.reason as string | null,
      category:   'stock',
    })
  }

  // order_line_amendments
  for (const r of (amendmentsRes.data ?? [])) {
    const actor  = resolveActor(r.amended_by as string | null)
    const lineId = (r.order_line_id as string).slice(0, 8)
    events.push({
      id:          r.id as string,
      timestamp:   r.amended_at as string,
      event_type:  'Order Amendment',
      actor_id:    actor.id,
      actor_email: actor.email,
      summary:     `${r.field_amended}: ${r.old_value} → ${r.new_value}`,
      detail:      `${r.reason} (order line: ${lineId})`,
      category:    'order',
    })
  }

  // priority_overrides
  for (const r of (overridesRes.data ?? [])) {
    const actor = resolveActor(r.overridden_by as string | null)
    events.push({
      id:          r.id as string,
      timestamp:   r.overridden_at as string,
      event_type:  'Priority Override',
      actor_id:    actor.id,
      actor_email: actor.email,
      summary:     `Priority set to P${r.priority_value}`,
      detail:      r.reason as string | null,
      category:    'order',
    })
  }

  // stock_allocations — active rows
  for (const r of (allocationsRes.data ?? [])) {
    if (r.is_active) {
      const actor = resolveActor(r.allocated_by as string | null)
      events.push({
        id:          `alloc-active-${r.id as string}`,
        timestamp:   r.allocated_at as string,
        event_type:  'Stock Reserved',
        actor_id:    actor.id,
        actor_email: actor.email,
        summary:     `${r.allocated_qty} gross reserved (${r.stock_stage})`,
        detail:      null,
        category:    'stock',
      })
    } else {
      // released / deactivated
      const actor = resolveActor(r.deactivated_by as string | null)
      const ts    = (r.deactivated_at ?? r.allocated_at) as string
      events.push({
        id:          `alloc-released-${r.id as string}`,
        timestamp:   ts,
        event_type:  'Reservation Released',
        actor_id:    actor.id,
        actor_email: actor.email,
        summary:     `${r.allocated_qty} gross released`,
        detail:      r.deactivation_reason as string | null,
        category:    'stock',
      })
    }
  }

  // dispatch_events
  for (const r of (dispatchRes.data ?? [])) {
    const custRaw    = Array.isArray(r.customers) ? r.customers[0] : r.customers as { name: string } | null
    const customerName = custRaw?.name ?? '—'
    const actor      = resolveActor(r.dispatched_by as string | null)
    events.push({
      id:          r.id as string,
      timestamp:   r.created_at as string,
      event_type:  `Dispatch ${r.status}`,
      actor_id:    actor.id,
      actor_email: actor.email,
      summary:     `Dispatch for ${customerName} on ${r.dispatch_date}`,
      detail:      (r.reference as string | null) ?? null,
      category:    'dispatch',
    })
  }

  // labour_job_status_history
  for (const r of (labourHistoryRes.data ?? [])) {
    const actor = resolveActor(r.changed_by as string | null)
    events.push({
      id:          r.id as string,
      timestamp:   r.changed_at as string,
      event_type:  'Labour Job Update',
      actor_id:    actor.id,
      actor_email: actor.email,
      summary:     `${r.from_status ?? 'initial'} → ${r.to_status}`,
      detail:      r.reason as string | null,
      category:    'labour',
    })
  }

  // cutting_sessions
  for (const r of (cuttingSessionsRes.data ?? [])) {
    if (r.status === 'confirmed') {
      const actor = resolveActor(r.confirmed_by as string | null)
      const ts    = (r.confirmed_at ?? r.created_at) as string
      events.push({
        id:          `cut-confirmed-${r.id as string}`,
        timestamp:   ts,
        event_type:  'Cutting Session Confirmed',
        actor_id:    actor.id,
        actor_email: actor.email,
        summary:     `Session on ${r.session_date} confirmed`,
        detail:      null,
        category:    'cutting',
      })
    } else {
      const actor = resolveActor(r.created_by as string | null)
      events.push({
        id:          `cut-voided-${r.id as string}`,
        timestamp:   r.created_at as string,
        event_type:  'Cutting Session Voided',
        actor_id:    actor.id,
        actor_email: actor.email,
        summary:     `Session on ${r.session_date} voided`,
        detail:      null,
        category:    'cutting',
      })
    }
  }

  // velvet_receipts
  for (const r of (velvetReceiptsRes.data ?? [])) {
    const clrRaw   = Array.isArray(r.bindi_colours) ? r.bindi_colours[0] : r.bindi_colours as { code: string } | null
    const colourCode = clrRaw?.code ?? 'unknown'
    const actor    = resolveActor(r.created_by as string | null)
    events.push({
      id:          r.id as string,
      timestamp:   r.created_at as string,
      event_type:  'Velvet Receipt',
      actor_id:    actor.id,
      actor_email: actor.email,
      summary:     `${r.bundles_received} bundles received — ${colourCode} (${(r.supplier as string | null) ?? 'no supplier'})`,
      detail:      null,
      category:    'velvet',
    })
  }

  // Sort newest first
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  // Apply filters
  let filtered = events

  if (dateFrom) {
    const from = new Date(dateFrom + 'T00:00:00')
    filtered = filtered.filter((e) => new Date(e.timestamp) >= from)
  }
  if (dateTo) {
    const to = new Date(dateTo + 'T23:59:59')
    filtered = filtered.filter((e) => new Date(e.timestamp) <= to)
  }
  if (eventType && eventType !== 'all') {
    filtered = filtered.filter((e) => e.category === eventType)
  }
  if (userId) {
    filtered = filtered.filter(
      (e) => e.actor_id === userId || (e.actor_email ?? '').includes(userId),
    )
  }

  const shown     = filtered.slice(0, 200)
  const hasFilters = dateFrom || dateTo || (eventType && eventType !== 'all') || userId

  const tdBase: CSSProperties = { ...tableTd, verticalAlign: 'top' }
  const thBase: CSSProperties = tableTh

  const CATEGORIES = ['all', 'stock', 'order', 'dispatch', 'labour', 'cutting', 'velvet'] as const

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1400px' }}>
      <PageHeader
        title="Audit Trail"
        subtitle="All system events — stock, orders, dispatch, labour, cutting. Newest first."
      />

      {/* Filter bar */}
      <form
        method="get"
        style={{
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          marginBottom: '1rem',
          padding: '0.75rem 1rem',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>
            Date From
          </label>
          <input
            type="date"
            name="dateFrom"
            defaultValue={dateFrom}
            style={{ ...inputStyle, width: '140px' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>
            Date To
          </label>
          <input
            type="date"
            name="dateTo"
            defaultValue={dateTo}
            style={{ ...inputStyle, width: '140px' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>
            Category
          </label>
          <select
            name="eventType"
            defaultValue={eventType || 'all'}
            style={{ ...selectStyle, width: '160px' }}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === 'all' ? 'All categories' : c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          style={{
            padding: '0.45rem 1.1rem',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--accent)',
            color: '#fff',
            alignSelf: 'flex-end',
          }}
        >
          Apply
        </button>

        {hasFilters && (
          <Link
            href="/admin/audit"
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              alignSelf: 'flex-end',
              paddingBottom: '0.45rem',
            }}
          >
            Clear filters
          </Link>
        )}
      </form>

      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        {shown.length} event{shown.length !== 1 ? 's' : ''} shown
        {filtered.length > 200 && ` (limited to 200 of ${filtered.length})`}
      </p>

      {shown.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          No events match the current filters.
        </p>
      ) : (
        <div className="table-card" style={{ overflowX: 'auto' }}>
          <table className="stock-table" style={{ width: '100%', minWidth: '820px' }}>
            <thead>
              <tr>
                <th style={thBase}>Timestamp</th>
                <th style={thBase}>Category</th>
                <th style={thBase}>Event</th>
                <th style={thBase}>Summary / Detail</th>
                <th style={thBase}>Actor</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id}>
                  <td style={{ ...tdBase, whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtTs(e.timestamp)}
                  </td>

                  <td style={{ ...tdBase, whiteSpace: 'nowrap' }}>
                    <Badge variant={CATEGORY_BADGE[e.category]} size="sm" label={e.category} />
                  </td>

                  <td style={{ ...tdBase, fontSize: 'var(--text-sm)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    {e.event_type}
                  </td>

                  <td style={{ ...tdBase, maxWidth: '420px' }}>
                    {e.detail ? (
                      <details style={{ cursor: 'pointer' }}>
                        <summary
                          style={{
                            listStyle: 'none',
                            fontSize: 'var(--text-sm)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {e.summary}
                          <span style={{ marginLeft: '0.35rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>▶</span>
                        </summary>
                        <p style={{ margin: '0.35rem 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', paddingLeft: '0.5rem', borderLeft: '2px solid var(--border-subtle)' }}>
                          {e.detail}
                        </p>
                      </details>
                    ) : (
                      <span style={{ fontSize: 'var(--text-sm)' }}>{e.summary}</span>
                    )}
                  </td>

                  <td style={{ ...tdBase, color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap' }}>
                    {actorDisplay(e.actor_id, e.actor_email)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
