import { createServerSupabaseClient } from '@/lib/supabase/server'
import { fetchPlanningAllocation } from './planning/allocation/fetchers'
import { StatCard } from '@/components/ui/StatCard'
import { Card } from '@/components/ui/Card'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import {
  ShoppingCart,
  Truck,
  AlertTriangle,
  Clock,
  Package,
  CheckCircle,
  Plus,
  Scissors,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import type { PlanningAllocationRow } from '@stock-brain/types'

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}

const STATUS_LABEL: Record<string, string> = {
  ready_to_dispatch: 'Ready',
  give_to_labour: 'Give to Labour',
  cut_on_machine: 'Cut on Machine',
  procure_velvet: 'Procure Velvet',
  covered_by_wip: 'Covered by WIP',
  ready_to_dispatch_override: '⚠ Ready (Override)',
  give_to_labour_override: '⚠ Labour (Override)',
  cut_on_machine_override: '⚠ Cut (Override)',
}

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient()

  const [planningResult, labourResult, readyStockResult, velvetResult] = await Promise.allSettled([
    fetchPlanningAllocation(supabase),
    supabase.from('labour_jobs').select('id, status').eq('status', 'open'),
    supabase.from('ready_stock_balance').select('available_qty').gt('available_qty', 0),
    supabase.from('velvet_stock_balance').select('available_qty, bundles').gt('available_qty', 0),
  ])

  const planningRows: PlanningAllocationRow[] =
    planningResult.status === 'fulfilled' ? planningResult.value : []

  const activeLabourJobs =
    labourResult.status === 'fulfilled' ? (labourResult.value.data ?? []).length : 0

  const totalReadyQty =
    readyStockResult.status === 'fulfilled'
      ? (readyStockResult.value.data ?? []).reduce((s, r) => s + Number(r.available_qty), 0)
      : 0

  const velvetBundles =
    velvetResult.status === 'fulfilled'
      ? (velvetResult.value.data ?? []).reduce((s, r) => s + Number(r.bundles ?? 0), 0)
      : 0

  // Derive stats from planning rows
  const openOrderIds = new Set(planningRows.map((r) => r.order_id))
  const totalOpenQty = planningRows.reduce((s, r) => s + r.open_qty, 0)
  const readyToDispatch = planningRows.filter(
    (r) => r.planning_status === 'ready_to_dispatch' || r.planning_status === 'ready_to_dispatch_override',
  )
  const shortageRows = planningRows.filter(
    (r) =>
      r.planning_status === 'cut_on_machine' ||
      r.planning_status === 'cut_on_machine_override' ||
      r.planning_status === 'procure_velvet',
  )
  const totalWipQty = planningRows.reduce((s, r) => s + r.wip_allocated_qty, 0)

  // Top 5 ready to dispatch
  const topReadyLines = readyToDispatch.slice(0, 5)

  // Top 5 needs attention (shortages + give_to_labour)
  const attentionRows = planningRows
    .filter(
      (r) =>
        r.planning_status === 'cut_on_machine' ||
        r.planning_status === 'procure_velvet' ||
        r.planning_status === 'cut_on_machine_override' ||
        r.planning_status === 'give_to_labour' ||
        r.planning_status === 'give_to_labour_override',
    )
    .slice(0, 5)

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1400px' }}>
      {/* Stats row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <StatCard
          label="Open Orders"
          value={openOrderIds.size}
          sub={`${fmt(totalOpenQty)} gross open`}
          icon={ShoppingCart}
        />
        <StatCard
          label="Ready to Dispatch"
          value={readyToDispatch.length}
          sub="lines ready"
          icon={CheckCircle}
          variant={readyToDispatch.length > 0 ? 'success' : 'default'}
        />
        <StatCard
          label="Shortages"
          value={shortageRows.length}
          sub="lines need production"
          icon={AlertTriangle}
          variant={shortageRows.length > 0 ? 'danger' : 'default'}
        />
        <StatCard
          label="In Labour (WIP)"
          value={activeLabourJobs}
          sub={`${fmt(totalWipQty)} gross`}
          icon={Clock}
          variant="info"
        />
        <StatCard
          label="Velvet Stock"
          value={velvetBundles > 0 ? `${velvetBundles} bdl` : fmt(totalReadyQty)}
          sub={velvetBundles > 0 ? undefined : 'gross ready stock'}
          icon={Package}
          variant={velvetBundles > 0 && velvetBundles < 5 ? 'warning' : 'default'}
        />
      </div>

      {/* Panels row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        {/* Ready to Dispatch */}
        <Card style={{ borderLeft: '3px solid var(--success)' }}>
          <SectionHeader title="Ready to Dispatch" count={readyToDispatch.length} color="var(--success)" />
          {topReadyLines.length === 0 ? (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '0.75rem 0' }}>
              No lines ready to dispatch.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {topReadyLines.map((row) => (
                <div
                  key={row.order_line_id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem 0.65rem',
                    background: 'var(--bg-elevated)',
                    borderRadius: 'var(--radius-sm)',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.customer_name}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                      Open: <strong style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{row.open_qty}</strong>
                    </div>
                  </div>
                  <Link
                    href={`/dispatch/new?customer_id=${row.customer_id}`}
                    style={{
                      fontSize: 'var(--text-xs)',
                      padding: '0.25rem 0.6rem',
                      background: 'var(--success-subtle)',
                      color: 'var(--success)',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    Dispatch
                  </Link>
                </div>
              ))}
            </div>
          )}
          <Link
            href="/planning/allocation"
            style={{ display: 'block', marginTop: '0.75rem', fontSize: 'var(--text-xs)', color: 'var(--accent)' }}
          >
            View all in Plan →
          </Link>
        </Card>

        {/* Needs Attention */}
        <Card style={{ borderLeft: `3px solid ${attentionRows.length > 0 ? 'var(--warning)' : 'var(--border)'}` }}>
          <SectionHeader title="Needs Attention" count={attentionRows.length} color={attentionRows.length > 0 ? 'var(--warning)' : undefined} />
          {attentionRows.length === 0 ? (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: '0.75rem 0' }}>
              No urgent lines. All demand is covered.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {attentionRows.map((row) => (
                <div
                  key={row.order_line_id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem 0.65rem',
                    background: 'var(--bg-elevated)',
                    borderRadius: 'var(--radius-sm)',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.customer_name}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                      Open: <strong style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{row.open_qty}</strong>
                    </div>
                  </div>
                  <Badge
                    variant={statusBadgeVariant(row.planning_status)}
                    label={STATUS_LABEL[row.planning_status] ?? row.planning_status.replace(/_/g, ' ')}
                    size="sm"
                  />
                </div>
              ))}
            </div>
          )}
          <Link
            href="/planning/allocation"
            style={{ display: 'block', marginTop: '0.75rem', fontSize: 'var(--text-xs)', color: 'var(--accent)' }}
          >
            View all in Plan →
          </Link>
        </Card>
      </div>

      {/* Quick Actions */}
      <div>
        <SectionHeader title="Quick Actions" />
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
          <QuickAction href="/orders/new" icon={<Plus size={24} />} label="New Order" />
          <QuickAction href="/operations/cutting-sessions/new" icon={<Scissors size={24} />} label="Cutting Session" />
          <QuickAction href="/planning/labour-issue" icon={<Users size={24} />} label="Issue to Labour" />
          <QuickAction href="/dispatch/new" icon={<Truck size={24} />} label="New Dispatch" />
        </div>
      </div>
    </main>
  )
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '1.25rem 1.5rem',
        minHeight: '80px',
        minWidth: '120px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderBottom: '3px solid var(--accent)',
        borderRadius: 'var(--radius-md)',
        fontSize: 'var(--text-sm)',
        fontWeight: 600,
        color: 'var(--text-primary)',
        transition: 'box-shadow 200ms ease, transform 200ms ease, border-color 200ms ease',
        boxShadow: 'var(--shadow-sm)',
        textAlign: 'center',
      }}
    >
      <span style={{ color: 'var(--accent)', display: 'flex' }}>{icon}</span>
      {label}
    </Link>
  )
}
