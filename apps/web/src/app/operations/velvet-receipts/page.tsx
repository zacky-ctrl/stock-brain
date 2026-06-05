import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createSupabaseVelvetReceiptStore } from '@/lib/velvet-receipt-store'
import { getVelvetStockBalance, METRES_PER_BUNDLE } from '@stock-brain/domain'
import { tableTh, tableTd } from '@/lib/ui'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import Link from 'next/link'
import type { CSSProperties } from 'react'

type ReceiptRow = {
  id: string
  receipt_date: string
  metres_received: string | number | null
  bundles_received: string | number | null
  supplier: string | null
  reference: string | null
  notes: string | null
  created_at: string
  bindi_colour_id: string | null
  bindi_colours: { code: string; name: string | null } | null
}

function fmt3(n: number) { return n % 1 === 0 ? String(n) : n.toFixed(3) }
function fmt1(n: number) { return n.toFixed(1) }

function fmtBalance(metres: number) {
  return `${fmt1(metres)} m (${fmt3(metres / METRES_PER_BUNDLE)} bundles)`
}

export default async function VelvetReceiptsPage() {
  const supabase = createServerSupabaseClient()
  const store = createSupabaseVelvetReceiptStore(supabase)

  const [balance, { data: receiptsRaw }] = await Promise.all([
    getVelvetStockBalance(store),
    supabase
      .from('velvet_receipts')
      .select('id, receipt_date, metres_received, bundles_received, supplier, reference, notes, created_at, bindi_colour_id, bindi_colours(code, name)')
      .order('receipt_date', { ascending: false })
      .limit(500),
  ])

  const receipts = (receiptsRaw ?? []) as unknown as ReceiptRow[]

  const tdNum: CSSProperties = {
    ...tableTd,
    textAlign: 'right',
    paddingRight: '1.5rem',
    fontVariantNumeric: 'tabular-nums',
  }

  return (
    <main style={{ padding: '1.5rem 2rem' }}>
      <PageHeader
        title="Velvet Receipts"
        actions={
          <>
            <Link href="/operations/velvet-receipts/stock" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
              View stock position
            </Link>
            <Link href="/operations/velvet-receipts/new">
              <Button variant="primary">+ Record Receipt</Button>
            </Link>
          </>
        }
      />

      {/* Current balance summary */}
      <Card style={{ marginBottom: '1.5rem', background: 'var(--success-subtle)', borderColor: 'rgba(16, 185, 129, 0.25)' }}>
        {balance ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--success)' }}>Current velvet stock: </span>
            <strong style={{ fontSize: '0.95rem', color: 'var(--success)' }}>
              {fmtBalance(balance.bundles_on_hand)}
            </strong>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              last updated {new Date(balance.last_updated_at).toLocaleString()}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Velvet balance not available</span>
        )}
      </Card>

      {receipts.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          No receipts recorded yet.{' '}
          <Link href="/operations/velvet-receipts/new" style={{ color: 'var(--info)' }}>
            Record the first receipt.
          </Link>
        </p>
      ) : (
        <>
        <div className="table-card desktop-table-card">
        <table className="stock-table">
          <thead>
            <tr>
              <th style={tableTh}>Date</th>
              <th style={{ ...tableTh, fontWeight: 700 }}>Colour</th>
              <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }}>Metres</th>
              <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }}>Bundles (ref)</th>
              <th style={tableTh}>Supplier</th>
              <th style={tableTh}>Reference</th>
              <th style={tableTh}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((r) => {
              const metres = r.metres_received != null
                ? Number(r.metres_received)
                : Number(r.bundles_received ?? 0) * METRES_PER_BUNDLE
              const bundlesRef = r.bundles_received != null ? Number(r.bundles_received) : null
              return (
                <tr key={r.id}>
                  <td style={tableTd}>{r.receipt_date}</td>
                  <td style={{ ...tableTd, fontWeight: 600, color: r.bindi_colour_id ? undefined : 'var(--text-muted)' }}>
                    {r.bindi_colour_id
                      ? (r.bindi_colours?.name ?? r.bindi_colours?.code ?? '—')
                      : '—'}
                  </td>
                  <td style={tdNum}>{fmt1(metres)}</td>
                  <td style={{ ...tdNum, color: bundlesRef != null ? undefined : 'var(--text-muted)' }}>
                    {bundlesRef != null ? fmt3(bundlesRef) : '—'}
                  </td>
                  <td style={{ ...tableTd, color: r.supplier ? undefined : 'var(--text-secondary)' }}>{r.supplier ?? '—'}</td>
                  <td style={{ ...tableTd, color: r.reference ? undefined : 'var(--text-secondary)' }}>{r.reference ?? '—'}</td>
                  <td style={{ ...tableTd, color: r.notes ? undefined : 'var(--text-secondary)', maxWidth: '200px' }}>{r.notes ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        <div className="mobile-card-list">
          {receipts.map((r) => {
            const metres = r.metres_received != null
              ? Number(r.metres_received)
              : Number(r.bundles_received ?? 0) * METRES_PER_BUNDLE
            const bundlesRef = r.bundles_received != null ? Number(r.bundles_received) : null
            const colour = r.bindi_colour_id
              ? (r.bindi_colours?.name ?? r.bindi_colours?.code ?? '-')
              : '-'

            return (
              <article key={r.id} className="mobile-data-card">
                <div className="mobile-card-top">
                  <div style={{ minWidth: 0 }}>
                    <div className="mobile-card-title">{r.receipt_date}</div>
                    <div className="mobile-card-meta">{r.supplier ?? 'No supplier'} {r.reference ? `/ ${r.reference}` : ''}</div>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: r.bindi_colour_id ? 'var(--accent-bright)' : 'var(--text-muted)' }}>
                    {colour}
                  </div>
                </div>
                <div className="mobile-card-grid">
                  <div><span className="mobile-card-label">Metres</span><strong className="mobile-card-value">{fmt1(metres)}</strong></div>
                  <div><span className="mobile-card-label">Bundles</span><strong className="mobile-card-value">{bundlesRef != null ? fmt3(bundlesRef) : '-'}</strong></div>
                  <div><span className="mobile-card-label">Reference</span><strong className="mobile-card-value">{r.reference ?? '-'}</strong></div>
                  <div><span className="mobile-card-label">Notes</span><strong className="mobile-card-value">{r.notes ?? '-'}</strong></div>
                </div>
              </article>
            )
          })}
        </div>
        </>
      )}
    </main>
  )
}
