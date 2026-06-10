import { createServerSupabaseClient } from '@/lib/supabase/server'
import { DispatchForm } from './Form'
import type { OpenOrderLine, StockOption, ExtraStockOption, DabbiMasterRow, BrandMasterRow } from './Form'
import { tableTh, tableTd } from '@/lib/ui'
import { PageHeader } from '@/components/ui/PageHeader'
import type { SizeMasterRow, DesignMasterRow, ColourMasterRow } from '@stock-brain/domain'
import Link from 'next/link'

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

// ── page ──────────────────────────────────────────────────────

export default async function NewDispatchPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string; customer_id?: string }>
}) {
  const { order_id, customer_id } = await searchParams
  const supabase = createServerSupabaseClient()

  // Master data always needed for the dispatch form matrix view
  const [
    { data: sizesRaw },
    { data: shapesRaw },
    { data: bindiColoursRaw },
    { data: dabbiColoursRaw },
    { data: brandsRaw },
  ] = await Promise.all([
    supabase.from('sizes').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('shape_designs').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('bindi_colours').select('id, code, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('dabbi_colours').select('id, code, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('brands').select('id, code, name').eq('is_active', true).order('name'),
  ])

  const sizeMaster: SizeMasterRow[] = (sizesRaw ?? []).map((s) => ({
    id: s.id as string,
    code: s.code as string,
    name: ((s as { name?: string | null }).name ?? s.code) as string,
    sort_order: Number((s as { sort_order?: number | null }).sort_order ?? 0),
  }))
  const designMaster: DesignMasterRow[] = (shapesRaw ?? []).map((s) => ({
    id: s.id as string,
    name: ((s as { name?: string | null }).name ?? s.code) as string,
    sort_order: Number((s as { sort_order?: number | null }).sort_order ?? 0),
  }))
  const colourMaster: ColourMasterRow[] = (bindiColoursRaw ?? []).map((c) => ({
    id: c.id as string,
    code: c.code as string,
    name: ((c as { name?: string | null }).name ?? c.code) as string,
    sort_order: Number((c as { sort_order?: number | null }).sort_order ?? 0),
  }))
  const dabbiMaster: DabbiMasterRow[] = (dabbiColoursRaw ?? []).map((d) => ({
    id: d.id as string,
    code: d.code as string,
    sort_order: Number((d as { sort_order?: number | null }).sort_order ?? 0),
  }))
  const brandMaster: BrandMasterRow[] = (brandsRaw ?? []).map((b) => ({
    id: b.id as string,
    code: b.code as string,
    name: ((b as { name?: string | null }).name ?? b.code) as string,
  }))

  // ── No params: show open orders list ─────────────────────────
  if (!order_id && !customer_id) {
    type OpenOrderListRow = {
      id: string
      order_date: string
      reference: string | null
      customer: { name: string } | { name: string }[] | null
      order_lines: { id: string; ordered_qty: string | number; closed_qty: string | number }[]
    }

    const { data: openOrdersRaw } = await supabase
      .from('orders')
      .select('id, order_date, reference, customer:customers(name), order_lines(id, ordered_qty, closed_qty)')
      .in('status', ['open', 'partially_dispatched'])
      .order('order_date')

    const openOrderRows = (openOrdersRaw ?? []) as unknown as OpenOrderListRow[]
    const allLineIds = openOrderRows.flatMap((o) => o.order_lines.map((l) => l.id))
    const dispatchedByLineId = new Map<string, number>()

    if (allLineIds.length > 0) {
      const { data: confirmedEvents } = await supabase
        .from('dispatch_events').select('id').eq('status', 'confirmed')
      const confirmedIds = (confirmedEvents ?? []).map((e) => e.id as string)
      if (confirmedIds.length > 0) {
        const { data: dLines } = await supabase
          .from('dispatch_lines').select('order_line_id, quantity_dispatched')
          .in('order_line_id', allLineIds).in('dispatch_event_id', confirmedIds)
        for (const dl of dLines ?? []) {
          const lid = dl.order_line_id as string
          dispatchedByLineId.set(lid, (dispatchedByLineId.get(lid) ?? 0) + Number(dl.quantity_dispatched))
        }
      }
    }

    return (
      <main style={{ padding: '1.5rem 2rem', maxWidth: '900px' }}>
        <PageHeader
          title="New Dispatch"
          backHref="/dispatch"
          subtitle="Select an order to dispatch"
        />
        {openOrderRows.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            No open orders ready for dispatch.
          </p>
        ) : (
          <div className="table-card" style={{ overflowX: 'auto' }}>
            <table className="stock-table">
              <thead>
                <tr>
                  <th style={tableTh}>Customer</th>
                  <th style={tableTh}>Date</th>
                  <th style={tableTh}>Reference</th>
                  <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1rem' }}>Open Qty</th>
                  <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1rem' }}>Age</th>
                  <th style={tableTh}></th>
                </tr>
              </thead>
              <tbody>
                {openOrderRows.map((o) => {
                  const customer = Array.isArray(o.customer) ? o.customer[0] : o.customer
                  const totalOrdered = o.order_lines.reduce((s, l) => s + Number(l.ordered_qty), 0)
                  const totalClosed = o.order_lines.reduce((s, l) => s + Number(l.closed_qty), 0)
                  const totalDispatched = o.order_lines.reduce(
                    (s, l) => s + (dispatchedByLineId.get(l.id) ?? 0),
                    0,
                  )
                  const openQty = Math.max(0, totalOrdered - totalClosed - totalDispatched)
                  if (openQty === 0) return null
                  const daysOld = daysSince(o.order_date)
                  return (
                    <tr key={o.id}>
                      <td style={{ ...tableTd, fontWeight: 600 }}>
                        {(customer as { name: string } | null)?.name ?? '—'}
                      </td>
                      <td style={{ ...tableTd, color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
                        {o.order_date}
                      </td>
                      <td style={{ ...tableTd, color: o.reference ? 'var(--text-secondary)' : 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                        {o.reference ?? '—'}
                      </td>
                      <td style={{ ...tableTd, textAlign: 'right', paddingRight: '1rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                        {fmt(openQty)}
                      </td>
                      <td style={{ ...tableTd, textAlign: 'right', paddingRight: '1rem', color: daysOld > 14 ? 'var(--danger)' : 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
                        {daysOld}d
                      </td>
                      <td style={{ ...tableTd, paddingRight: '0.75rem' }}>
                        <Link
                          href={`/dispatch/new?order_id=${o.id}`}
                          style={{
                            padding: '0.25rem 0.7rem',
                            fontSize: 'var(--text-xs)',
                            fontWeight: 600,
                            background: 'var(--accent)',
                            color: 'white',
                            borderRadius: 'var(--radius-sm)',
                          }}
                        >
                          Dispatch →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    )
  }

  // ── Resolve order_id or customer_id → common dispatch data ───
  type OrderMeta = { id: string; order_date: string; reference: string | null }
  let resolvedCustomerId: string
  let resolvedCustomerName: string
  let openOrderList: OrderMeta[] = []
  let backHref = '/dispatch'

  if (order_id) {
    type OrderWithCustomer = {
      id: string
      customer_id: string
      order_date: string
      reference: string | null
      customers: { name: string } | { name: string }[] | null
    }
    const { data: orderRaw } = await supabase
      .from('orders')
      .select('id, customer_id, order_date, reference, customers(name)')
      .eq('id', order_id)
      .single()

    if (!orderRaw) {
      return (
        <main style={{ padding: '1.5rem 2rem' }}>
          <PageHeader title="Order not found" backHref="/dispatch/new" />
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            This order could not be found.{' '}
            <Link href="/dispatch/new" style={{ color: 'var(--info)' }}>Back to open orders.</Link>
          </p>
        </main>
      )
    }

    const ord = orderRaw as unknown as OrderWithCustomer
    const custData = Array.isArray(ord.customers) ? ord.customers[0] : ord.customers
    resolvedCustomerId = ord.customer_id
    resolvedCustomerName = (custData as { name: string } | null)?.name ?? '?'
    openOrderList = [{ id: ord.id, order_date: ord.order_date, reference: ord.reference }]
    backHref = `/orders/${order_id}`
  } else {
    // Legacy customer_id path
    const { data: custRaw } = await supabase
      .from('customers').select('id, name').eq('id', customer_id!).single()

    if (!custRaw) {
      return (
        <main style={{ padding: '1.5rem 2rem' }}>
          <PageHeader title="Customer not found" backHref="/dispatch/new" />
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
            <Link href="/dispatch/new" style={{ color: 'var(--info)' }}>Back to open orders.</Link>
          </p>
        </main>
      )
    }

    resolvedCustomerId = customer_id!
    resolvedCustomerName = custRaw.name as string

    const { data: openOrdersRaw } = await supabase
      .from('orders')
      .select('id, order_date, reference')
      .eq('customer_id', customer_id!)
      .in('status', ['open', 'partially_dispatched'])
      .order('order_date')

    openOrderList = (openOrdersRaw ?? []).map((o) => ({
      id: o.id as string,
      order_date: o.order_date as string,
      reference: o.reference as string | null,
    }))
  }

  const openOrderIds = openOrderList.map((o) => o.id)
  const orderMap = new Map(openOrderList.map((o) => [o.id, o]))

  // ── Fetch open lines ─────────────────────────────────────────
  type OpenLineRow = {
    id: string
    order_id: string
    shape_design_id: string
    bindi_colour_id: string
    size_id: string
    dabbi_colour_id: string
    ordered_qty: string | number
    closed_qty: string | number
    shape_designs: { code: string; name: string | null } | null
    bindi_colours: { code: string } | null
    sizes: { code: string } | null
    dabbi_colours: { code: string } | null
  }

  let openLineRows: OpenLineRow[] = []
  if (openOrderIds.length > 0) {
    const { data } = await supabase
      .from('order_lines')
      .select(`
        id, order_id, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id,
        ordered_qty, closed_qty,
        shape_designs(code, name),
        bindi_colours(code),
        sizes(code),
        dabbi_colours(code)
      `)
      .in('order_id', openOrderIds)
      .in('status', ['open', 'partially_dispatched'])
      .order('created_at')
    openLineRows = (data ?? []) as unknown as OpenLineRow[]
  }

  // ── Compute dispatched qty per line ──────────────────────────
  const lineIds = openLineRows.map((l) => l.id)
  const dispatchedByLineId = new Map<string, number>()

  if (lineIds.length > 0) {
    const { data: confirmedEvents } = await supabase
      .from('dispatch_events').select('id').eq('status', 'confirmed')
    const confirmedIds = (confirmedEvents ?? []).map((e) => e.id as string)
    if (confirmedIds.length > 0) {
      const { data: existingDispatch } = await supabase
        .from('dispatch_lines').select('order_line_id, quantity_dispatched')
        .in('order_line_id', lineIds).in('dispatch_event_id', confirmedIds)
      for (const d of existingDispatch ?? []) {
        dispatchedByLineId.set(
          d.order_line_id as string,
          (dispatchedByLineId.get(d.order_line_id as string) ?? 0) + Number(d.quantity_dispatched),
        )
      }
    }
  }

  // ── Fetch ready stock ────────────────────────────────────────
  const readyStockMap = new Map<string, StockOption[]>()
  const allExtraStockOptions: ExtraStockOption[] = []

  const { data: readyStock } = await supabase
    .from('ready_stock_balance')
    .select(`
      id, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id, brand_id,
      gross_qty, available_qty, committed_qty,
      shape_designs(code, name),
      bindi_colours(code),
      sizes(code),
      dabbi_colours(code),
      brands(code, name)
    `)
    .gt('gross_qty', 0)

  for (const rs of readyStock ?? []) {
    const key = `${rs.shape_design_id}|${rs.bindi_colour_id}|${rs.size_id}|${rs.dabbi_colour_id}`
    const brand = Array.isArray(rs.brands) ? rs.brands[0] : rs.brands
    const brandName =
      (brand as { code: string; name: string | null } | null)?.name ??
      (brand as { code: string; name: string | null } | null)?.code ?? '—'

    const option: StockOption = {
      id: rs.id as string,
      brand: brandName,
      available_qty: Number(rs.available_qty),
      shape_design_id: rs.shape_design_id as string,
      bindi_colour_id: rs.bindi_colour_id as string,
      size_id: rs.size_id as string,
      dabbi_colour_id: rs.dabbi_colour_id as string,
    }
    const existing = readyStockMap.get(key) ?? []
    existing.push(option)
    readyStockMap.set(key, existing)

    const getCode = (raw: unknown) => {
      if (!raw) return '?'
      const r = Array.isArray(raw) ? raw[0] : raw
      return (
        (r as { code?: string; name?: string | null } | null)?.name ??
        (r as { code?: string } | null)?.code ?? '?'
      )
    }
    const grossQty = Number(rs.gross_qty)
    const committedQty = Number(rs.committed_qty)
    const skuBase = `${getCode(rs.shape_designs)} / ${getCode(rs.bindi_colours)} / ${getCode(rs.sizes)} / ${getCode(rs.dabbi_colours)} / ${brandName}`
    const commitment = committedQty > 0
      ? `${fmt(committedQty)} committed to other orders`
      : 'fully available'
    allExtraStockOptions.push({
      id: rs.id as string,
      label: `${skuBase} — ${fmt(grossQty)} gross (${commitment})`,
      available_qty: Number(rs.available_qty),
      gross_qty: grossQty,
      committed_qty: committedQty,
      shape_design_id: rs.shape_design_id as string,
      bindi_colour_id: rs.bindi_colour_id as string,
      size_id: rs.size_id as string,
      dabbi_colour_id: rs.dabbi_colour_id as string,
      brand_id: rs.brand_id as string,
      brand_name: brandName,
    })
  }

  // ── Own allocations for open lines (Step 1–2) ────────────────
  const ownAllocMap = new Map<string, number>()
  if (lineIds.length > 0) {
    const { data: ownAllocs } = await supabase
      .from('stock_allocations')
      .select('order_line_id, ready_stock_balance_id, allocated_qty')
      .in('order_line_id', lineIds)
      .eq('is_active', true)
      .eq('stock_stage', 'ready')
    for (const a of ownAllocs ?? []) {
      const key = `${a.ready_stock_balance_id as string}|${a.order_line_id as string}`
      ownAllocMap.set(key, Number(a.allocated_qty))
    }
  }

  // ── Build OpenOrderLine[] ────────────────────────────────────
  const resolveRef = <T,>(raw: T | T[] | null): T | null => {
    if (!raw) return null
    if (Array.isArray(raw)) return raw[0] ?? null
    return raw
  }

  const openLines: OpenOrderLine[] = openLineRows.map((l) => {
    const shape = resolveRef(l.shape_designs)
    const bindi = resolveRef(l.bindi_colours)
    const size = resolveRef(l.sizes)
    const dabbi = resolveRef(l.dabbi_colours)
    const orderedQty = Number(l.ordered_qty)
    const closedQty = Number(l.closed_qty)
    const dispatched = dispatchedByLineId.get(l.id) ?? 0
    const openQty = Math.max(0, orderedQty - closedQty - dispatched)
    const stockKey = `${l.shape_design_id}|${l.bindi_colour_id}|${l.size_id}|${l.dabbi_colour_id}`
    const order = orderMap.get(l.order_id)

    return {
      id: l.id,
      order_id: l.order_id,
      order_date: order?.order_date ?? '',
      order_reference: order?.reference ?? null,
      shape:
        (shape as { code: string; name: string | null } | null)?.name ??
        (shape as { code: string; name: string | null } | null)?.code ?? '—',
      bindi_colour: (bindi as { code: string } | null)?.code ?? '—',
      size: (size as { code: string } | null)?.code ?? '—',
      dabbi_colour: (dabbi as { code: string } | null)?.code ?? '—',
      shape_design_id: l.shape_design_id,
      bindi_colour_id: l.bindi_colour_id,
      size_id: l.size_id,
      dabbi_colour_id: l.dabbi_colour_id,
      ordered_qty: orderedQty,
      open_qty: openQty,
      stock_options: (readyStockMap.get(stockKey) ?? [])
        .map((opt) => {
          const ownReserved = ownAllocMap.get(`${opt.id}|${l.id}`) ?? 0
          if (ownReserved === 0) return opt
          return {
            ...opt,
            available_qty: opt.available_qty + ownReserved,
            reserved_for_this_order: opt.available_qty === 0,
          }
        })
        .filter((opt) => opt.available_qty > 0),
    }
  })

  const orderRef = order_id ? openOrderList[0]?.reference : null
  const pageTitle = orderRef
    ? `New Dispatch — ${resolvedCustomerName} (${orderRef})`
    : `New Dispatch — ${resolvedCustomerName}`

  return (
    <main className="dispatch-new-page" style={{ padding: '1.5rem 2rem', maxWidth: '1200px' }}>
      <PageHeader
        title={pageTitle}
        backHref={backHref}
        subtitle={`${openLines.length} open order line${openLines.length !== 1 ? 's' : ''}`}
      />

      {openLines.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          No open order lines for this order. Orders must have status open or partially dispatched.
        </p>
      ) : (
        <DispatchForm
          customerId={resolvedCustomerId}
          customerName={resolvedCustomerName}
          openLines={openLines}
          sizeMaster={sizeMaster}
          designMaster={designMaster}
          colourMaster={colourMaster}
          extraStockOptions={allExtraStockOptions}
          dabbiMaster={dabbiMaster}
          brandMaster={brandMaster}
        />
      )}
    </main>
  )
}
