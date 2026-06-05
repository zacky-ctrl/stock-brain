import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ReleaseForm, PartialReleaseForm, ReassignForm } from './Forms'
import { ReservationFilterBar } from './ReservationFilterBar'
import { tableTh, tableTd } from '@/lib/ui'
import { PageHeader } from '@/components/ui/PageHeader'
import Link from 'next/link'
import type { CSSProperties } from 'react'

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const customerFilter = typeof params.customer === 'string' ? params.customer : ''
  const designFilter   = typeof params.design   === 'string' ? params.design   : ''
  const clrFilter      = typeof params.clr      === 'string' ? params.clr      : ''
  const dabbiFilter    = typeof params.dabbi    === 'string' ? params.dabbi    : ''

  const supabase = createServerSupabaseClient()

  const [
    allocationsResult,
    shapesResult,
    bindisResult,
    sizesResult,
    dabbisResult,
    brandsResult,
    openLinesResult,
  ] = await Promise.all([
    supabase
      .from('stock_allocations')
      .select(`
        id, order_line_id, ready_stock_balance_id, allocated_qty, allocated_at, allocated_by,
        ready_stock_balance(shape_design_id, bindi_colour_id, size_id, dabbi_colour_id, brand_id),
        order_lines(order_id, orders(customers(name)))
      `)
      .eq('status', 'active')
      .eq('stock_stage', 'ready')
      .order('allocated_at', { ascending: false }),

    supabase.from('shape_designs').select('id, code, name').order('sort_order'),
    supabase.from('bindi_colours').select('id, code').order('sort_order'),
    supabase.from('sizes').select('id, code').order('sort_order'),
    supabase.from('dabbi_colours').select('id, code').order('code'),
    supabase.from('brands').select('id, code, name').order('code'),

    supabase
      .from('order_lines')
      .select(`
        id, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id,
        orders(customers(name))
      `)
      .in('status', ['open', 'partially_dispatched']),
  ])

  const shapeMap = new Map((shapesResult.data ?? []).map((r) => [r.id as string, (r.name ?? r.code) as string]))
  const bindiMap = new Map((bindisResult.data ?? []).map((r) => [r.id as string, r.code as string]))
  const sizeMap  = new Map((sizesResult.data ?? []).map((r) => [r.id as string, r.code as string]))
  const dabbiMap = new Map((dabbisResult.data ?? []).map((r) => [r.id as string, r.code as string]))
  const brandMap = new Map((brandsResult.data ?? []).map((r) => [r.id as string, (r.name ?? r.code) as string]))

  const allocations = allocationsResult.data ?? []

  // Resolve nested types once per allocation — used for filtering and table rendering
  type ResolvedMeta = {
    customerName: string
    shapeId: string | null
    bindiId: string | null
    dabbiId: string | null
    rsb: { shape_design_id: string; bindi_colour_id: string; size_id: string; dabbi_colour_id: string; brand_id: string } | null
  }
  const resolvedMeta = new Map<string, ResolvedMeta>()

  for (const alloc of allocations) {
    const rsbRaw = Array.isArray(alloc.ready_stock_balance)
      ? alloc.ready_stock_balance[0]
      : alloc.ready_stock_balance as Record<string, string> | null
    const rsb = rsbRaw as {
      shape_design_id: string; bindi_colour_id: string; size_id: string
      dabbi_colour_id: string; brand_id: string
    } | null

    const olRaw = Array.isArray(alloc.order_lines)
      ? alloc.order_lines[0]
      : alloc.order_lines as Record<string, unknown> | null
    const orderRaw = olRaw
      ? (Array.isArray(olRaw['orders'])
          ? (olRaw['orders'] as Record<string, unknown>[])[0]
          : olRaw['orders'] as Record<string, unknown> | null)
      : null
    const customerRaw = orderRaw
      ? (Array.isArray(orderRaw['customers'])
          ? (orderRaw['customers'] as Record<string, unknown>[])[0]
          : orderRaw['customers'] as Record<string, unknown> | null)
      : null
    const customerName = (customerRaw?.['name'] as string | undefined) ?? '—'

    resolvedMeta.set(alloc.id as string, {
      customerName,
      shapeId: rsb?.shape_design_id ?? null,
      bindiId: rsb?.bindi_colour_id ?? null,
      dabbiId: rsb?.dabbi_colour_id ?? null,
      rsb,
    })
  }

  // Build filter option lists from the full unfiltered set
  const uniqueCustomers = [...new Set(
    [...resolvedMeta.values()].map((m) => m.customerName).filter((n) => n !== '—'),
  )].sort()

  const uniqueShapeIds = [...new Set(
    [...resolvedMeta.values()].map((m) => m.shapeId).filter((id): id is string => id !== null),
  )]

  const uniqueBindiIds = [...new Set(
    [...resolvedMeta.values()].map((m) => m.bindiId).filter((id): id is string => id !== null),
  )]

  const uniqueDabbiIds = [...new Set(
    [...resolvedMeta.values()].map((m) => m.dabbiId).filter((id): id is string => id !== null),
  )]

  const customerOptions = uniqueCustomers.map((name) => ({ id: name, label: name }))
  const designOptions   = uniqueShapeIds.map((id) => ({ id, label: shapeMap.get(id) ?? id })).sort((a, b) => a.label.localeCompare(b.label))
  const clrOptions      = uniqueBindiIds.map((id) => ({ id, label: bindiMap.get(id) ?? id })).sort((a, b) => a.label.localeCompare(b.label))
  const dabbiOptions    = uniqueDabbiIds.map((id) => ({ id, label: dabbiMap.get(id) ?? id })).sort((a, b) => a.label.localeCompare(b.label))

  // Apply in-memory filters
  const isFiltered = Boolean(customerFilter || designFilter || clrFilter || dabbiFilter)
  const filtered = isFiltered
    ? allocations.filter((alloc) => {
        const meta = resolvedMeta.get(alloc.id as string)
        if (!meta) return false
        if (customerFilter && meta.customerName !== customerFilter) return false
        if (designFilter && meta.shapeId !== designFilter) return false
        if (clrFilter && meta.bindiId !== clrFilter) return false
        if (dabbiFilter && meta.dabbiId !== dabbiFilter) return false
        return true
      })
    : allocations

  const totalGross = filtered.reduce((s, a) => s + Number(a.allocated_qty), 0)
  const summaryText = isFiltered
    ? `Showing ${filtered.length} of ${allocations.length} reservations`
    : `${allocations.length} active reservation${allocations.length !== 1 ? 's' : ''} · ${fmt(totalGross)} gross reserved`

  // Build open line options for reassign dropdowns
  const openLineOptions = (openLinesResult.data ?? []).map((ol) => {
    const orderRaw = Array.isArray(ol.orders) ? ol.orders[0] : ol.orders as Record<string, unknown> | null
    const customerRaw = orderRaw
      ? (Array.isArray(orderRaw['customers'])
          ? (orderRaw['customers'] as Record<string, unknown>[])[0]
          : orderRaw['customers'] as Record<string, unknown> | null)
      : null
    const customerName = (customerRaw?.['name'] as string | undefined) ?? '?'
    const shape = shapeMap.get(ol.shape_design_id as string) ?? '?'
    const bindi = bindiMap.get(ol.bindi_colour_id as string) ?? '?'
    const size  = sizeMap.get(ol.size_id as string) ?? '?'
    const dabbi = dabbiMap.get(ol.dabbi_colour_id as string) ?? '?'
    return {
      id: ol.id as string,
      shape_design_id: ol.shape_design_id as string,
      bindi_colour_id: ol.bindi_colour_id as string,
      size_id: ol.size_id as string,
      dabbi_colour_id: ol.dabbi_colour_id as string,
      label: `${customerName} · ${shape} ${bindi} ${size} ${dabbi}`,
    }
  })

  const tdStyle: CSSProperties = { ...tableTd, verticalAlign: 'top' }

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1500px' }}>
      <PageHeader
        title="Stock Reservations"
        backHref="/planning/allocation"
        subtitle="Hard-committed ready stock reservations. Each reservation increments committed_qty on the balance row, reducing available_qty for others. Release to return stock to general availability. Reassign to move a reservation to a different order line (committed_qty unchanged)."
      />

      <ReservationFilterBar
        customerOptions={customerOptions}
        designOptions={designOptions}
        clrOptions={clrOptions}
        dabbiOptions={dabbiOptions}
        customerFilter={customerFilter}
        designFilter={designFilter}
        clrFilter={clrFilter}
        dabbiFilter={dabbiFilter}
      />

      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        {summaryText}
      </p>

      {filtered.length === 0 ? (
        allocations.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            No active reservations. Use the Reserve button on the{' '}
            <Link href="/planning/allocation" style={{ color: 'var(--info)' }}>Planning page</Link> to create one.
          </p>
        ) : (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            No reservations match the current filters.
          </p>
        )
      ) : (
        <div className="table-card" style={{ overflowX: 'auto' }}>
          <table className="stock-table" style={{ minWidth: '1100px' }}>
            <thead>
              <tr>
                <th style={tableTh}>ID</th>
                <th style={tableTh}>Customer</th>
                <th style={tableTh}>SKU</th>
                <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1rem' }}>Reserved Qty</th>
                <th style={tableTh}>Reserved At</th>
                <th style={tableTh}>Reserved By</th>
                <th style={tableTh}>Full Release</th>
                <th style={tableTh}>Partial Release (Path 1)</th>
                <th style={tableTh}>Reassign</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((alloc) => {
                const meta = resolvedMeta.get(alloc.id as string)!
                const { rsb } = meta

                const skuLabel = rsb ? [
                  shapeMap.get(rsb.shape_design_id) ?? '?',
                  bindiMap.get(rsb.bindi_colour_id) ?? '?',
                  sizeMap.get(rsb.size_id) ?? '?',
                  dabbiMap.get(rsb.dabbi_colour_id) ?? '?',
                  brandMap.get(rsb.brand_id) ?? '?',
                ].join(' / ') : '—'

                // Reassign candidates: same 4-part SKU, different order line
                const sameSkuLines = rsb
                  ? openLineOptions.filter((l) =>
                      l.shape_design_id === rsb.shape_design_id &&
                      l.bindi_colour_id === rsb.bindi_colour_id &&
                      l.size_id === rsb.size_id &&
                      l.dabbi_colour_id === rsb.dabbi_colour_id &&
                      l.id !== (alloc.order_line_id as string),
                    )
                  : []

                return (
                  <tr key={alloc.id as string}>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{(alloc.id as string).slice(0, 8)}</td>
                    <td style={tdStyle}>{meta.customerName}</td>
                    <td style={{ ...tdStyle, fontSize: '0.82rem' }}>{skuLabel}</td>
                    <td style={{
                      ...tdStyle,
                      textAlign: 'right',
                      paddingRight: '1rem',
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 'bold',
                    }}>
                      {fmt(Number(alloc.allocated_qty))}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {new Date(alloc.allocated_at as string).toLocaleString()}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                      {(alloc.allocated_by as string | null)?.slice(0, 8) ?? '—'}
                    </td>
                    <td style={tdStyle}>
                      <ReleaseForm allocationId={alloc.id as string} />
                    </td>
                    <td style={tdStyle}>
                      <PartialReleaseForm
                        allocationId={alloc.id as string}
                        allocatedQty={Number(alloc.allocated_qty)}
                      />
                    </td>
                    <td style={tdStyle}>
                      <ReassignForm
                        allocationId={alloc.id as string}
                        openLines={sameSkuLines.map((l) => ({ id: l.id, label: l.label }))}
                      />
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
