import { createServerSupabaseClient } from '@/lib/supabase/server'
import { tableTh, tableTd } from '@/lib/ui'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import Link from 'next/link'
import type { CSSProperties } from 'react'

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

type SessionRow = {
  id: string
  session_date: string
  status: string
  velvet_bundles_consumed: string | number
  notes: string | null
  created_at: string
  machines: { name: string; code: string } | null
  cutting_session_lines: { quantity_gross: string | number }[]
}

export default async function CuttingSessionsPage() {
  const supabase = createServerSupabaseClient()

  const [{ data, error }, { count: ratesCount }] = await Promise.all([
    supabase
      .from('cutting_sessions')
      .select(`
        id, session_date, status, velvet_bundles_consumed, notes, created_at,
        machines(name, code),
        cutting_session_lines(quantity_gross)
      `)
      .order('session_date', { ascending: false })
      .limit(300),
    supabase.from('velvet_conversion_rates').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ])

  const sessions = (data ?? []) as unknown as SessionRow[]

  const tdNum: CSSProperties = {
    ...tableTd,
    textAlign: 'right',
    paddingRight: '1.5rem',
    fontVariantNumeric: 'tabular-nums',
  }

  return (
    <main style={{ padding: '1.5rem 2rem' }}>
      <PageHeader
        title="Cutting Sessions"
        subtitle={
          <>
            Each confirmed session credits cuttings stock.{' '}
            <Link href="/operations/cutting-sessions/stock" style={{ color: 'var(--info)' }}>View stock position</Link>
          </>
        }
        actions={
          <Link href="/operations/cutting-sessions/new">
            <Button variant="primary">+ New Session</Button>
          </Link>
        }
      />

      {(ratesCount ?? 0) === 0 && (
        <div style={{ background: 'var(--warning-subtle)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
          <span style={{ fontWeight: 600, color: 'var(--warning)' }}>⚠ Velvet conversion rates not set up. </span>
          Velvet is not being automatically deducted from cutting sessions.{' '}
          <a href="/masters/velvet-rates" style={{ color: 'var(--info)' }}>Set up rates → Masters → Velvet Rates</a>.
          This banner will disappear once rates are entered.
        </div>
      )}

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: '0.88rem' }}>Error: {error.message}</p>
      )}

      {!error && sessions.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          No cutting sessions yet.{' '}
          <Link href="/operations/cutting-sessions/new" style={{ color: 'var(--info)' }}>Record the first session.</Link>
        </p>
      )}

      {sessions.length > 0 && (
        <>
        <div className="table-card desktop-table-card">
        <table className="stock-table">
          <thead>
            <tr>
              <th style={tableTh}>Session</th>
              <th style={tableTh}>Date</th>
              <th style={tableTh}>Machine</th>
              <th style={tableTh}>Status</th>
              <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }}>Lines</th>
              <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }}>Total Cut</th>
              <th style={{ ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }}>Velvet Bundles</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s, idx) => {
              const machine = Array.isArray(s.machines) ? s.machines[0] : s.machines
              const lines = s.cutting_session_lines ?? []
              const totalCut = lines.reduce((sum, l) => sum + Number(l.quantity_gross), 0)
              const sessionNum = sessions.length - idx
              const sessionDate = s.session_date
                ? new Date(s.session_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                : ''
              const machineCode = (Array.isArray(s.machines) ? s.machines[0] : s.machines)?.code
              const sessionLabel = machineCode
                ? `${sessionDate} — ${machineCode}`
                : `Session #${sessionNum}`
              return (
                <tr key={s.id} style={{ opacity: s.status === 'voided' ? 0.5 : 1, minHeight: '56px' }}>
                  <td style={tableTd}>
                    <Link
                      href={`/operations/cutting-sessions/${s.id}`}
                      style={{ color: 'var(--info)', textDecoration: 'none', fontWeight: 600 }}
                    >
                      {sessionLabel}
                    </Link>
                  </td>
                  <td style={tableTd}>{s.session_date}</td>
                  <td style={tableTd}>
                    {machine ? `${machine.code} — ${machine.name}` : '—'}
                  </td>
                  <td style={tableTd}>
                    <Badge variant={statusBadgeVariant(s.status)} label={s.status} size="sm" />
                  </td>
                  <td style={tdNum}>{lines.length}</td>
                  <td style={tdNum}>{fmt(totalCut)}</td>
                  <td style={tdNum}>{fmt(Number(s.velvet_bundles_consumed))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
        <div className="mobile-card-list">
          {sessions.map((s, idx) => {
            const machine = Array.isArray(s.machines) ? s.machines[0] : s.machines
            const lines = s.cutting_session_lines ?? []
            const totalCut = lines.reduce((sum, l) => sum + Number(l.quantity_gross), 0)
            const sessionNum = sessions.length - idx
            const sessionDate = s.session_date
              ? new Date(s.session_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
              : ''
            const machineCode = machine?.code
            const sessionLabel = machineCode
              ? `${sessionDate} / ${machineCode}`
              : `Session #${sessionNum}`

            return (
              <article key={s.id} className="mobile-data-card" style={{ opacity: s.status === 'voided' ? 0.5 : 1 }}>
                <div className="mobile-card-top">
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/operations/cutting-sessions/${s.id}`} className="mobile-card-title" style={{ color: 'var(--info)' }}>
                      {sessionLabel}
                    </Link>
                    <div className="mobile-card-meta">{s.session_date}</div>
                  </div>
                  <Badge variant={statusBadgeVariant(s.status)} label={s.status} size="sm" />
                </div>
                <div className="mobile-card-grid">
                  <div><span className="mobile-card-label">Machine</span><strong className="mobile-card-value">{machine ? `${machine.code} / ${machine.name}` : '-'}</strong></div>
                  <div><span className="mobile-card-label">Lines</span><strong className="mobile-card-value">{lines.length}</strong></div>
                  <div><span className="mobile-card-label">Total Cut</span><strong className="mobile-card-value">{fmt(totalCut)}</strong></div>
                  <div><span className="mobile-card-label">Velvet</span><strong className="mobile-card-value">{fmt(Number(s.velvet_bundles_consumed))}</strong></div>
                </div>
                <div className="mobile-card-actions">
                  <Link href={`/operations/cutting-sessions/${s.id}`} style={{ padding: '0.35rem 0.7rem', fontSize: 'var(--text-xs)', fontWeight: 700, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)' }}>
                    View
                  </Link>
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
