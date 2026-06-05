/**
 * Scratch test for getPlanningSnapshotForReadyStock.
 *
 * Run from repo root:
 *   pnpm test:planning
 *
 * Or directly (Node 20+ --env-file flag loads .env.local):
 *   node_modules/.bin/tsx --env-file .env.local scripts/test-planning-snapshot.ts
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Node 20+ required for --env-file flag.
 *
 * Expected output with migrations applied + no ready stock:
 *   Planning Snapshot — Ready Stock (0 SKUs)
 *
 * After receiving goods and recording ready stock:
 *   Planning Snapshot — Ready Stock (N SKUs)
 *   <one line per balance row showing qty and open demand>
 */

import { createClient } from '@supabase/supabase-js'
import { getPlanningSnapshotForReadyStock } from '../packages/domain/src/index.ts'
import type { ReadyStockSnapshotFetchers } from '../packages/domain/src/index.ts'
import type {
  RawReadyStockRow,
  RawOpenOrderLineRow,
  RawConfirmedDispatchRow,
} from '../packages/types/src/index.ts'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error(
    'Missing env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.',
  )
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Supabase returns NUMERIC(10,3) columns as strings — coerce here,
// not in the domain function, to keep domain free of DB quirks.
const fetchers: ReadyStockSnapshotFetchers = {
  async fetchReadyStock(): Promise<RawReadyStockRow[]> {
    const { data, error } = await supabase
      .from('ready_stock_balance')
      .select(
        'id, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id, brand_id, gross_qty, committed_qty, available_qty',
      )
    if (error) throw new Error(`fetchReadyStock: ${error.message}`)
    return (data ?? []).map((r) => ({
      id: r.id as string,
      shape_design_id: r.shape_design_id as string,
      bindi_colour_id: r.bindi_colour_id as string,
      size_id: r.size_id as string,
      dabbi_colour_id: r.dabbi_colour_id as string,
      brand_id: r.brand_id as string,
      gross_qty: Number(r.gross_qty),
      committed_qty: Number(r.committed_qty),
      available_qty: Number(r.available_qty),
    }))
  },

  async fetchOpenOrderLines(): Promise<RawOpenOrderLineRow[]> {
    const { data, error } = await supabase
      .from('order_lines')
      .select(
        'id, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id, ordered_qty, closed_qty',
      )
      .in('status', ['open', 'partially_dispatched'])
    if (error) throw new Error(`fetchOpenOrderLines: ${error.message}`)
    return (data ?? []).map((r) => ({
      id: r.id as string,
      shape_design_id: r.shape_design_id as string,
      bindi_colour_id: r.bindi_colour_id as string,
      size_id: r.size_id as string,
      dabbi_colour_id: r.dabbi_colour_id as string,
      ordered_qty: Number(r.ordered_qty),
      closed_qty: Number(r.closed_qty),
    }))
  },

  async fetchConfirmedDispatch(orderLineIds: string[]): Promise<RawConfirmedDispatchRow[]> {
    if (orderLineIds.length === 0) return []

    // Two-step: confirmed event IDs first, then dispatch_lines for those events.
    // Done in two queries because Supabase's JS builder doesn't reliably filter
    // on embedded table columns (e.g. .eq('dispatch_events.status', 'confirmed')).
    const { data: events, error: eventsError } = await supabase
      .from('dispatch_events')
      .select('id')
      .eq('status', 'confirmed')
    if (eventsError) throw new Error(`fetchConfirmedDispatch (events): ${eventsError.message}`)

    const confirmedEventIds = (events ?? []).map((e) => e.id as string)
    if (confirmedEventIds.length === 0) return []

    const { data: lines, error: linesError } = await supabase
      .from('dispatch_lines')
      .select('order_line_id, quantity_dispatched')
      .in('order_line_id', orderLineIds)
      .in('dispatch_event_id', confirmedEventIds)
    if (linesError) throw new Error(`fetchConfirmedDispatch (lines): ${linesError.message}`)

    return (lines ?? []).map((r) => ({
      order_line_id: r.order_line_id as string,
      quantity_dispatched: Number(r.quantity_dispatched),
    }))
  },
}

async function main() {
  const snapshot = await getPlanningSnapshotForReadyStock(fetchers)

  console.log(`\nPlanning Snapshot — Ready Stock (${snapshot.length} SKUs)\n`)

  if (snapshot.length === 0) {
    console.log(
      'No ready stock rows found.\n' +
        'Confirm: migrations applied, and goods have been received through the labour return flow.',
    )
    return
  }

  const header = [
    'shape_design_id'.padEnd(36),
    'bindi_col'.padEnd(36),
    'size'.padEnd(36),
    'dabbi'.padEnd(36),
    'brand'.padEnd(36),
    'ready'.padStart(8),
    'committed'.padStart(10),
    'available'.padStart(10),
    'open_ord'.padStart(9),
  ].join('  ')
  console.log(header)
  console.log('-'.repeat(header.length))

  for (const row of snapshot) {
    console.log(
      [
        row.shape_design_id.padEnd(36),
        row.bindi_colour_id.padEnd(36),
        row.size_id.padEnd(36),
        row.dabbi_colour_id.padEnd(36),
        row.brand_id.padEnd(36),
        String(row.ready_qty).padStart(8),
        String(row.committed_ready_qty).padStart(10),
        String(row.available_ready_qty).padStart(10),
        String(row.open_order_qty).padStart(9),
      ].join('  '),
    )
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
