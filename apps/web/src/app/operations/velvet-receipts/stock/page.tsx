import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createSupabaseVelvetReceiptStore } from '@/lib/velvet-receipt-store'
import { getVelvetStockBalance, METRES_PER_BUNDLE } from '@stock-brain/domain'
import { tableTh, tableTd } from '@/lib/ui'
import { PrintButton } from './PrintButton'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import type { CSSProperties } from 'react'

type ReceiptRow = {
  id: string
  receipt_date: string
  metres_received: string | number | null
  bundles_received: string | number | null
  supplier: string | null
  reference: string | null
  created_at: string
  bindi_colour_id: string | null
  bindi_colours: { code: string; name: string | null } | null
}

type BalanceRow = {
  velvet_type: string
  bindi_colour_id: string | null
  metres_on_hand: string | number
  last_updated_at: string
  bindi_colours: { code: string; name: string | null } | null
}

function fmt3(n: number) { return n % 1 === 0 ? String(n) : n.toFixed(3) }
function fmt1(n: number) { return n.toFixed(1) }
function fmtBalance(m: number) { return `${fmt1(m)} m (${fmt3(m / METRES_PER_BUNDLE)} bundles)` }

function colourLabel(row: { bindi_colour_id: string | null; bindi_colours: { code: string; name: string | null } | null }) {
  if (!row.bindi_colour_id) return '—'
  return row.bindi_colours?.name ?? row.bindi_colours?.code ?? row.bindi_colour_id
}

export default async function VelvetStockPage() {
  const supabase = createServerSupabaseClient()
  const store = createSupabaseVelvetReceiptStore(supabase)

  const [balance, { data: receiptsRaw }, { data: balanceRowsRaw }] = await Promise.all([
    getVelvetStockBalance(store),
    supabase
      .from('velvet_receipts')
      .select('id, receipt_date, metres_received, bundles_received, supplier, reference, created_at, bindi_colour_id, bindi_colours(code, name)')
      .order('created_at', { ascending: true })
      .limit(500),
    supabase
      .from('velvet_stock_balance')
      .select('velvet_type, bindi_colour_id, metres_on_hand, last_updated_at, bindi_colours(code, name)')
      .eq('velvet_type', 'standard')
      .order('bindi_colour_id', { ascending: true, nullsFirst: true }),
  ])

  const receipts = (receiptsRaw ?? []) as unknown as ReceiptRow[]
  const balanceRows = (balanceRowsRaw ?? []) as unknown as BalanceRow[]

  let running = 0
  const rowsWithRunning = receipts.map((r) => {
    const metres = r.metres_received != null
      ? Number(r.metres_received)
      : Number(r.bundles_received ?? 0) * METRES_PER_BUNDLE
    running += metres
    return { ...r, running_total: running }
  })
  const displayRows = [...rowsWithRunning].reverse()

  const tdNum: CSSProperties = {
    ...tableTd,
    textAlign: 'right',
    paddingRight: '1.5rem',
    fontVariantNumeric: 'tabular-nums',
  }
  const thNum: CSSProperties = { ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1100px' }}>
      <style>{`@media print { .no-print { display: none !important; } @page { size: A4 landscape; margin: 15mm; } }`}</style>

      <PageHeader
        title="Velvet Stock Position"
        backHref="/operations/velvet-receipts"
        actions={<div className="no-print"><PrintButton /></div>}
      />

      {/* Total balance card */}
      <Card style={{ marginBottom: '1rem', background: 'var(--success-subtle)', borderColor: 'rgba(16,185,129,0.25)' }}>
        {balance ? (
          <>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'bold', color: 'var(--success)', marginBottom: '0.25rem' }}>
              {fmtBalance(balance.bundles_on_hand)} on hand (total all colours)
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              Last updated: {new Date(balance.last_updated_at).toLocaleString()}
            </div>
          </>
        ) : (
          <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>Balance not available</span>
        )}
        <p style={{ margin: '0.75rem 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          Corrections go through Admin → Stock Correction.
        </p>
      </Card>

      {/* Per-colour balance breakdown */}
      {balanceRows.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: '600px' }}>
            <thead>
              <tr>
                <th style={tableTh}>Colour</th>
                <th style={thNum}>Metres on Hand</th>
                <th style={thNum}>Bundles</th>
                <th style={tableTh}>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {balanceRows.map((br, i) => {
                const metres = Number(br.metres_on_hand)
                const label = br.bindi_colour_id
                  ? (br.bindi_colours?.name ?? br.bindi_colours?.code ?? br.bindi_colour_id)
                  : 'Generic (no colour)'
                return (
                  <tr key={i}>
                    <td style={tableTd}>{label}</td>
                    <td style={tdNum}>{fmt1(metres)}</td>
                    <td style={tdNum}>{fmt3(metres / METRES_PER_BUNDLE)}</td>
                    <td style={{ ...tableTd, color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
                      {new Date(br.last_updated_at).toLocaleString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Receipts table */}
      {receipts.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>No receipts recorded yet.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={tableTh}>Date</th>
              <th style={{ ...tableTh, fontWeight: 700 }}>Colour</th>
              <th style={thNum}>Metres In</th>
              <th style={thNum}>Bundles (ref)</th>
              <th style={tableTh}>Supplier</th>
              <th style={tableTh}>Reference</th>
              <th style={thNum}>Cumul. Metres</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r) => {
              const metres = r.metres_received != null
                ? Number(r.metres_received)
                : Number(r.bundles_received ?? 0) * METRES_PER_BUNDLE
              const bundlesRef = r.bundles_received != null ? Number(r.bundles_received) : null
              return (
                <tr key={r.id}>
                  <td style={tableTd}>{r.receipt_date}</td>
                  <td style={{ ...tableTd, fontWeight: 600, color: r.bindi_colour_id ? undefined : 'var(--text-muted)' }}>
                    {colourLabel(r)}
                  </td>
                  <td style={tdNum}>{fmt1(metres)}</td>
                  <td style={{ ...tdNum, color: bundlesRef != null ? undefined : 'var(--text-muted)' }}>
                    {bundlesRef != null ? fmt3(bundlesRef) : '—'}
                  </td>
                  <td style={{ ...tableTd, color: r.supplier ? undefined : 'var(--text-muted)' }}>{r.supplier ?? '—'}</td>
                  <td style={{ ...tableTd, color: r.reference ? undefined : 'var(--text-muted)' }}>{r.reference ?? '—'}</td>
                  <td style={{ ...tdNum, color: 'var(--text-secondary)' }}>{fmt1(r.running_total)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} style={{ ...tableTd, fontWeight: 'bold', borderTop: '2px solid var(--border)' }}>
                Total receipts
              </td>
              <td style={{ ...tdNum, fontWeight: 'bold', borderTop: '2px solid var(--border)' }}>
                {fmt1(running)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}

      <p style={{ marginTop: '1rem', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
        * Cumulative metres column shows a running total of metres received across all colours.
        Actual on-hand balance is lower due to cutting session consumption.
      </p>
    </main>
  )
}
