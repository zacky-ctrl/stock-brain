import { createServerSupabaseClient } from '@/lib/supabase/server'
import { fetchPlanningAllocation } from './planning/allocation/fetchers'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { SectionHeader } from '@/components/ui/SectionHeader'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ClipboardList,
  PackageX,
  Plus,
  Scissors,
  Truck,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { PlanningAllocationRow } from '@stock-brain/types'

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}

type LookupRow = { id: string; code: string; name?: string | null }

function buildLookup(rows: LookupRow[] | null, preferName = false): Map<string, string> {
  return new Map((rows ?? []).map((row) => [row.id, preferName && row.name ? row.name : row.code]))
}

type OrderBucket = {
  orderId: string
  customerId: string
  customerName: string
  openQty: number
  actionQty: number
  lineCount: number
  priorityRank: number
  promisedDate: string | null
}

type SkuBucket = {
  key: string
  shape: string
  colour: string
  size: string
  qty: number
  demandQty: number
  customerCount: number
  priorityRank: number
  conversionRateMissing: boolean
}

type RecentActivity = {
  label: string
  href: string
  meta: string
}

type DispatchEventRow = {
  id: string
  dispatch_date: string
  customers: { name: string } | { name: string }[] | null
}

type LabourJobRow = {
  id: string
  assigned_date: string
  labour_units: { name: string } | { name: string }[] | null
}

type CuttingSessionRow = {
  id: string
  session_date: string
  machines: { code: string; name: string | null } | { code: string; name: string | null }[] | null
}

function addOrderQty(
  map: Map<string, OrderBucket>,
  row: PlanningAllocationRow,
  qty: number,
): void {
  const existing = map.get(row.order_id)
  if (existing) {
    existing.openQty += row.open_qty
    existing.actionQty += qty
    existing.lineCount += 1
    existing.priorityRank = Math.min(existing.priorityRank, row.priority_rank)
    existing.promisedDate = existing.promisedDate ?? row.promised_date
    return
  }

  map.set(row.order_id, {
    orderId: row.order_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    openQty: row.open_qty,
    actionQty: qty,
    lineCount: 1,
    priorityRank: row.priority_rank,
    promisedDate: row.promised_date,
  })
}

function addSkuQty(
  map: Map<string, SkuBucket>,
  row: PlanningAllocationRow,
  qty: number,
  shapeMap: Map<string, string>,
  colourMap: Map<string, string>,
  sizeMap: Map<string, string>,
): void {
  const key = `${row.shape_design_id}|${row.bindi_colour_id}|${row.size_id}`
  const existing = map.get(key)
  if (existing) {
    existing.qty += qty
    existing.demandQty += row.shortage_qty
    existing.customerCount += 1
    existing.priorityRank = Math.min(existing.priorityRank, row.priority_rank)
    existing.conversionRateMissing = existing.conversionRateMissing || row.conversion_rate_missing
    return
  }

  map.set(key, {
    key,
    shape: shapeMap.get(row.shape_design_id) ?? row.shape_design_id,
    colour: colourMap.get(row.bindi_colour_id) ?? row.bindi_colour_id,
    size: sizeMap.get(row.size_id) ?? row.size_id,
    qty,
    demandQty: row.shortage_qty,
    customerCount: 1,
    priorityRank: row.priority_rank,
    conversionRateMissing: row.conversion_rate_missing,
  })
}

function sortedOrderBuckets(map: Map<string, OrderBucket>): OrderBucket[] {
  return [...map.values()].sort((a, b) => a.priorityRank - b.priorityRank || b.actionQty - a.actionQty)
}

function sortedSkuBuckets(map: Map<string, SkuBucket>): SkuBucket[] {
  return [...map.values()].sort((a, b) => a.priorityRank - b.priorityRank || b.qty - a.qty)
}

function firstRelationName<T extends { name: string }>(relation: T | T[] | null): string {
  const resolved = Array.isArray(relation) ? relation[0] : relation
  return resolved?.name ?? 'Unknown'
}

function firstMachineName(
  relation: { code: string; name: string | null } | { code: string; name: string | null }[] | null,
): string {
  const resolved = Array.isArray(relation) ? relation[0] : relation
  if (!resolved) return 'Unknown machine'
  return resolved.name ? `${resolved.code} / ${resolved.name}` : resolved.code
}

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient()

  const [
    allocationResult,
    shapesResult,
    bindiResult,
    sizesResult,
    dispatchResult,
    labourResult,
    cuttingResult,
  ] = await Promise.allSettled([
    fetchPlanningAllocation(supabase),
    supabase.from('shape_designs').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('bindi_colours').select('id, code, name, sort_order').order('sort_order'),
    supabase.from('sizes').select('id, code, name, sort_order').order('sort_order'),
    supabase
      .from('dispatch_events')
      .select('id, dispatch_date, customers(name)')
      .eq('status', 'confirmed')
      .order('dispatch_date', { ascending: false })
      .limit(1),
    supabase
      .from('labour_jobs')
      .select('id, assigned_date, labour_units(name)')
      .order('assigned_date', { ascending: false })
      .limit(1),
    supabase
      .from('cutting_sessions')
      .select('id, session_date, machines(code, name)')
      .eq('status', 'confirmed')
      .order('session_date', { ascending: false })
      .limit(1),
  ])

  const rows: PlanningAllocationRow[] =
    allocationResult.status === 'fulfilled' ? allocationResult.value : []

  const shapes = shapesResult.status === 'fulfilled' ? (shapesResult.value.data ?? []) as LookupRow[] : []
  const bindis = bindiResult.status === 'fulfilled' ? (bindiResult.value.data ?? []) as LookupRow[] : []
  const sizes = sizesResult.status === 'fulfilled' ? (sizesResult.value.data ?? []) as LookupRow[] : []
  const shapeMap = buildLookup(shapes, true)
  const colourMap = buildLookup(bindis)
  const sizeMap = buildLookup(sizes)

  const dispatchMap = new Map<string, OrderBucket>()
  const labourMap = new Map<string, OrderBucket>()
  const cutMap = new Map<string, SkuBucket>()
  const procureMap = new Map<string, SkuBucket>()

  for (const row of rows) {
    if (row.ready_allocated_qty > 0) {
      addOrderQty(dispatchMap, row, row.ready_allocated_qty)
    }

    if (row.cuttings_allocated_qty > 0) {
      addOrderQty(labourMap, row, row.cuttings_allocated_qty)
    }

    if (row.planning_status === 'cut_on_machine' || row.planning_status === 'cut_on_machine_override') {
      addSkuQty(cutMap, row, row.recommended_cut_qty || row.shortage_qty, shapeMap, colourMap, sizeMap)
    }

    if (row.planning_status === 'procure_velvet') {
      addSkuQty(procureMap, row, row.shortage_qty, shapeMap, colourMap, sizeMap)
    }
  }

  const dispatchOrders = sortedOrderBuckets(dispatchMap)
  const labourOrders = sortedOrderBuckets(labourMap)
  const cutSkus = sortedSkuBuckets(cutMap)
  const procureSkus = sortedSkuBuckets(procureMap)

  const recentActivity: RecentActivity[] = []
  if (dispatchResult.status === 'fulfilled') {
    const event = ((dispatchResult.value.data ?? []) as unknown as DispatchEventRow[])[0]
    if (event) {
      recentActivity.push({
        label: `Dispatch / ${firstRelationName(event.customers)}`,
        href: `/dispatch/${event.id}`,
        meta: event.dispatch_date,
      })
    }
  }
  if (labourResult.status === 'fulfilled') {
    const job = ((labourResult.value.data ?? []) as unknown as LabourJobRow[])[0]
    if (job) {
      recentActivity.push({
        label: `Labour / ${firstRelationName(job.labour_units)}`,
        href: `/operations/labour-jobs/${job.id}`,
        meta: job.assigned_date,
      })
    }
  }
  if (cuttingResult.status === 'fulfilled') {
    const session = ((cuttingResult.value.data ?? []) as unknown as CuttingSessionRow[])[0]
    if (session) {
      recentActivity.push({
        label: `Cutting / ${firstMachineName(session.machines)}`,
        href: `/operations/cutting-sessions/${session.id}`,
        meta: session.session_date,
      })
    }
  }

  const totalReadyQty = dispatchOrders.reduce((sum, order) => sum + order.actionQty, 0)
  const totalLabourQty = labourOrders.reduce((sum, order) => sum + order.actionQty, 0)
  const totalCutQty = cutSkus.reduce((sum, sku) => sum + sku.qty, 0)
  const totalProcureQty = procureSkus.reduce((sum, sku) => sum + sku.qty, 0)

  return (
    <main className="dashboard-page">
      <section className="dashboard-hero">
        <div>
          <span className="dashboard-eyebrow">Today&apos;s command center</span>
          <h1>Stock Brain</h1>
          <p>
            Dispatch what is ready, issue cuttings to labour, cut what is short,
            and catch raw material gaps before they slow the parcel.
          </p>
        </div>
        <div className="dashboard-hero-actions">
          <Link href="/orders/new">New Order</Link>
          <Link href="/dispatch/new">New Dispatch</Link>
        </div>
      </section>

      <section className="dashboard-command-grid">
        <CommandSummary
          href="/dispatch"
          icon={Truck}
          label="Ready To Dispatch"
          value={dispatchOrders.length}
          sub={`${fmt(totalReadyQty)} gross ready`}
          tone="success"
        />
        <CommandSummary
          href="/planning/labour-issue"
          icon={Users}
          label="Give To Labour"
          value={labourOrders.length}
          sub={`${fmt(totalLabourQty)} gross issue`}
          tone="warning"
        />
        <CommandSummary
          href="/planning/cutting-required"
          icon={Scissors}
          label="Cut On Machine"
          value={cutSkus.length}
          sub={`${fmt(totalCutQty)} gross cut`}
          tone="info"
        />
        <CommandSummary
          href="/planning/cutting-required"
          icon={PackageX}
          label="Procure Velvet"
          value={procureSkus.length}
          sub={`${fmt(totalProcureQty)} gross blocked`}
          tone={procureSkus.length > 0 ? 'danger' : 'default'}
        />
      </section>

      {allocationResult.status === 'rejected' && (
        <Card className="dashboard-alert" style={{ borderColor: 'var(--danger)' }}>
          <AlertTriangle size={18} />
          <span>Planning engine data could not be loaded. Dashboard actions may be incomplete.</span>
        </Card>
      )}

      <section className="dashboard-work-grid">
        <DashboardPanel
          title="Ready To Dispatch"
          count={dispatchOrders.length}
          color="var(--success)"
          href="/dispatch"
          actionLabel="Open Dispatch"
        >
          <OrderList
            emptyText="No orders have ready stock allocated right now."
            orders={dispatchOrders.slice(0, 6)}
            qtyLabel="Ready"
            hrefFor={(order) => `/dispatch/new?order_id=${order.orderId}`}
            cta="Dispatch"
            tone="success"
          />
        </DashboardPanel>

        <DashboardPanel
          title="Give To Labour"
          count={labourOrders.length}
          color="var(--warning)"
          href="/planning/labour-issue"
          actionLabel="Open Labour Issue"
        >
          <OrderList
            emptyText="No cuttings are waiting to be issued to labour."
            orders={labourOrders.slice(0, 6)}
            qtyLabel="Issue"
            hrefFor={() => '/planning/labour-issue'}
            cta="Issue"
            tone="warning"
          />
        </DashboardPanel>

        <DashboardPanel
          title="Cut On Machine"
          count={cutSkus.length}
          color="var(--info)"
          href="/planning/cutting-required"
          actionLabel="Cutting Required"
        >
          <SkuList
            emptyText="No machine cutting is needed from current planning."
            skus={cutSkus.slice(0, 6)}
            qtyLabel="Cut"
            tone="info"
          />
        </DashboardPanel>

        <DashboardPanel
          title="Procure Velvet"
          count={procureSkus.length}
          color={procureSkus.length > 0 ? 'var(--danger)' : 'var(--text-secondary)'}
          href="/planning/cutting-required"
          actionLabel="Review"
        >
          <SkuList
            emptyText="No velvet procurement block is showing right now."
            skus={procureSkus.slice(0, 6)}
            qtyLabel="Blocked"
            tone="danger"
          />
        </DashboardPanel>
      </section>

      <section className="dashboard-lower-grid">
        <div>
          <SectionHeader title="Quick Actions" />
          <div className="dashboard-quick-actions">
            <QuickAction href="/orders/new" icon={<Plus size={24} />} label="New Order" />
            <QuickAction href="/operations/cutting-sessions/new" icon={<Scissors size={24} />} label="Cutting Session" />
            <QuickAction href="/planning/labour-issue" icon={<Users size={24} />} label="Issue to Labour" />
            <QuickAction href="/dispatch/new" icon={<Truck size={24} />} label="New Dispatch" />
          </div>
        </div>

        <div>
          <SectionHeader title="Recent Activity" />
          <Card padding="sm">
            {recentActivity.length === 0 ? (
              <p className="dashboard-empty">No recent activity found.</p>
            ) : (
              <div className="dashboard-activity-list">
                {recentActivity.map((activity) => (
                  <Link key={activity.href} href={activity.href} className="dashboard-activity-item">
                    <span>{activity.label}</span>
                    <small>{activity.meta}</small>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </section>
    </main>
  )
}

function CommandSummary({
  href,
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  href: string
  icon: LucideIcon
  label: string
  value: number
  sub: string
  tone: 'success' | 'warning' | 'info' | 'danger' | 'default'
}) {
  return (
    <Link href={href} className={`dashboard-command-card dashboard-command-${tone}`}>
      <span className="dashboard-command-icon"><Icon size={20} /></span>
      <span className="dashboard-command-label">{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </Link>
  )
}

function DashboardPanel({
  title,
  count,
  color,
  href,
  actionLabel,
  children,
}: {
  title: string
  count: number
  color: string
  href: string
  actionLabel: string
  children: ReactNode
}) {
  return (
    <Card className="dashboard-panel">
      <SectionHeader
        title={title}
        count={count}
        color={color}
        actions={
          <Link href={href} className="dashboard-panel-link">
            {actionLabel} <ArrowRight size={12} />
          </Link>
        }
      />
      {children}
    </Card>
  )
}

function OrderList({
  orders,
  emptyText,
  qtyLabel,
  hrefFor,
  cta,
  tone,
}: {
  orders: OrderBucket[]
  emptyText: string
  qtyLabel: string
  hrefFor: (order: OrderBucket) => string
  cta: string
  tone: 'success' | 'warning'
}) {
  if (orders.length === 0) {
    return <p className="dashboard-empty">{emptyText}</p>
  }

  return (
    <div className="dashboard-list">
      {orders.map((order) => (
        <Link key={order.orderId} href={hrefFor(order)} className="dashboard-order-item">
          <span>
            <strong>{order.customerName}</strong>
            <small>
              Open {fmt(order.openQty)} / {qtyLabel} {fmt(order.actionQty)} / {order.lineCount} line{order.lineCount === 1 ? '' : 's'}
            </small>
          </span>
          <Badge variant={tone === 'success' ? 'success' : 'warning'} label={cta} size="sm" />
        </Link>
      ))}
    </div>
  )
}

function SkuList({
  skus,
  emptyText,
  qtyLabel,
  tone,
}: {
  skus: SkuBucket[]
  emptyText: string
  qtyLabel: string
  tone: 'info' | 'danger'
}) {
  if (skus.length === 0) {
    return <p className="dashboard-empty">{emptyText}</p>
  }

  return (
    <div className="dashboard-list">
      {skus.map((sku) => (
        <Link key={sku.key} href="/planning/cutting-required" className="dashboard-order-item">
          <span>
            <strong>{sku.shape} / {sku.colour} / {sku.size}</strong>
            <small>
              {qtyLabel} {fmt(sku.qty)} gross / {sku.customerCount} customer{sku.customerCount === 1 ? '' : 's'}
            </small>
          </span>
          <Badge
            variant={tone === 'info' ? 'info' : 'danger'}
            label={sku.conversionRateMissing ? 'Rate Missing' : qtyLabel}
            size="sm"
          />
        </Link>
      ))}
    </div>
  )
}

function QuickAction({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link href={href} className="dashboard-quick-action">
      <span>{icon}</span>
      {label}
    </Link>
  )
}
