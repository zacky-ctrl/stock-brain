import { createServerSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { tableTh, tableTd } from '@/lib/ui'
import { confirmSessionAction, voidSessionAction, editDraftSessionAction, adminVoidConfirmedAction } from './actions'
import { ConfirmSessionButton, VoidSessionForm, EditDraftForm, AdminVoidForm } from './SessionActions'
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { SectionHeader } from '@/components/ui/SectionHeader'
import type { MachineOption } from './SessionActions'
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
  confirmed_at: string | null
  created_at: string
  machines: { code: string; name: string } | null
}

type LineRow = {
  id: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  quantity_gross: string | number
  shape_designs: { code: string; name: string | null } | null
  bindi_colours: { code: string } | null
  sizes: { code: string } | null
}

function resolveRef<T>(raw: T | T[] | null): T | null {
  if (!raw) return null
  if (Array.isArray(raw)) return raw[0] ?? null
  return raw
}

export default async function CuttingSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createServerSupabaseClient()

  const { data: sessionRaw, error: sessionErr } = await supabase
    .from('cutting_sessions')
    .select(`
      id, session_date, status, velvet_bundles_consumed, notes, confirmed_at, created_at,
      machines(code, name)
    `)
    .eq('id', id)
    .single()

  if (sessionErr || !sessionRaw) notFound()

  const session = sessionRaw as unknown as SessionRow
  const machine = resolveRef(session.machines)

  const { data: linesRaw } = await supabase
    .from('cutting_session_lines')
    .select(`
      id, shape_design_id, bindi_colour_id, size_id, quantity_gross,
      shape_designs(code, name),
      bindi_colours(code),
      sizes(code)
    `)
    .eq('cutting_session_id', id)
    .order('created_at')

  const lines = (linesRaw ?? []) as unknown as LineRow[]
  const totalCut = lines.reduce((s, l) => s + Number(l.quantity_gross), 0)

  const { data: machinesRaw } = await supabase
    .from('machines')
    .select('id, code, name')
    .eq('is_active', true)
    .order('code')
  const machines: MachineOption[] = (machinesRaw ?? []).map((m) => ({
    id: m.id as string, code: m.code as string, name: m.name as string,
  }))

  const metaLabel: CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', width: '160px', flexShrink: 0 }
  const metaValue: CSSProperties = { fontSize: 'var(--text-sm)' }
  const metaRow: CSSProperties = { display: 'flex', gap: '0.5rem', marginBottom: '0.3rem' }

  const tdNum: CSSProperties = {
    ...tableTd,
    textAlign: 'right',
    paddingRight: '1.5rem',
    fontVariantNumeric: 'tabular-nums',
  }
  const thNum: CSSProperties = { ...tableTh, textAlign: 'right', paddingRight: '1.5rem' }

  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1100px' }}>
      <PageHeader
        title={`Cutting Session — ${machine ? `${machine.code} — ${machine.name}` : '—'}`}
        backHref="/operations/cutting-sessions"
        badge={<Badge variant={statusBadgeVariant(session.status)} label={session.status} />}
        subtitle={session.id}
      />

      <Card style={{ marginBottom: '1.5rem' }}>
        <div style={metaRow}>
          <span style={metaLabel}>Session Date</span>
          <span style={metaValue}>{session.session_date}</span>
        </div>
        <div style={metaRow}>
          <span style={metaLabel}>Machine</span>
          <span style={metaValue}>{machine ? `${machine.code} — ${machine.name}` : '—'}</span>
        </div>
        <div style={metaRow}>
          <span style={metaLabel}>Velvet Bundles Used</span>
          {Number(session.velvet_bundles_consumed) > 0 ? (
            <span style={metaValue}>{fmt(Number(session.velvet_bundles_consumed))}</span>
          ) : (
            <span style={{ ...metaValue, color: 'var(--text-secondary)' }}>—</span>
          )}
        </div>
        <div style={metaRow}>
          <span style={metaLabel}>Velvet Deducted</span>
          {Number(session.velvet_bundles_consumed) > 0 ? (
            <span style={{ ...metaValue, color: 'var(--success)' }}>Yes</span>
          ) : (
            <span style={{ ...metaValue, color: 'var(--warning)' }}>No (skipped)</span>
          )}
        </div>
        <div style={metaRow}>
          <span style={metaLabel}>Total Qty Cut</span>
          <span style={{ ...metaValue, fontWeight: 'bold' }}>{fmt(totalCut)} gross</span>
        </div>
        {session.confirmed_at && (
          <div style={metaRow}>
            <span style={metaLabel}>Confirmed At</span>
            <span style={metaValue}>{new Date(session.confirmed_at).toLocaleString()}</span>
          </div>
        )}
        {session.notes && (
          <div style={metaRow}>
            <span style={metaLabel}>Notes</span>
            <span style={{ ...metaValue, color: 'var(--text-secondary)' }}>{session.notes}</span>
          </div>
        )}
      </Card>

      <SectionHeader title="Lines Cut" count={lines.length} />
      {lines.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>No lines recorded for this session.</p>
      ) : (
        <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '500px' }}>
            <thead>
              <tr>
                <th style={tableTh}>Shape</th>
                <th style={tableTh}>Bindi CLR</th>
                <th style={tableTh}>Size</th>
                <th style={thNum}>Qty (gross)</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const shape = resolveRef(l.shape_designs)
                const bindi = resolveRef(l.bindi_colours)
                const size = resolveRef(l.sizes)
                return (
                  <tr key={l.id}>
                    <td style={tableTd}>{shape?.name ?? shape?.code ?? '—'}</td>
                    <td style={tableTd}>{bindi?.code ?? '—'}</td>
                    <td style={tableTd}>{size?.code ?? '—'}</td>
                    <td style={tdNum}>{fmt(Number(l.quantity_gross))}</td>
                  </tr>
                )
              })}
              <tr>
                <td colSpan={3} style={{ ...tableTd, fontWeight: 'bold', borderTop: '2px solid var(--border)' }}>
                  Total
                </td>
                <td style={{ ...tdNum, fontWeight: 'bold', borderTop: '2px solid var(--border)' }}>
                  {fmt(totalCut)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {session.status === 'draft' && (
        <div style={{ marginBottom: '1.5rem' }}>
          <EditDraftForm
            action={editDraftSessionAction}
            sessionId={id}
            currentDate={session.session_date}
            currentMachineId={(session as unknown as { machine_id?: string | null }).machine_id ?? null}
            currentVelvet={Number(session.velvet_bundles_consumed)}
            currentNotes={session.notes}
            machines={machines}
          />
          <Card style={{ background: 'var(--warning-subtle)', borderColor: 'rgba(245,158,11,0.25)' }}>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <p style={{ margin: '0 0 0.4rem', fontSize: 'var(--text-sm)', fontWeight: 'bold' }}>Confirm this session to credit cuttings stock</p>
                <p style={{ margin: '0 0 0.75rem', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>Once confirmed, stock is credited and the session is locked.</p>
                <ConfirmSessionButton action={confirmSessionAction} sessionId={id} />
              </div>
              <div style={{ borderLeft: '1px solid rgba(245,158,11,0.25)', paddingLeft: '1.5rem' }}>
                <VoidSessionForm action={voidSessionAction} sessionId={id} />
              </div>
            </div>
          </Card>
        </div>
      )}

      {session.status === 'confirmed' && (
        <div style={{ marginBottom: '1rem' }}>
          <Card style={{ background: 'var(--success-subtle)', borderColor: 'rgba(16,185,129,0.25)', marginBottom: '0.75rem' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--success)' }}>
              Session confirmed — stock credited. Notes can be edited; voiding requires admin void below.
            </p>
          </Card>
          {Number(session.velvet_bundles_consumed) === 0 && (
            <Card style={{ background: 'var(--warning-subtle)', borderColor: 'rgba(245,158,11,0.25)', marginBottom: '0.75rem' }}>
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--warning)' }}>
                ⚠ Velvet was not deducted for this session. Track manually if required.
              </p>
            </Card>
          )}
          <AdminVoidForm action={adminVoidConfirmedAction} sessionId={id} />
        </div>
      )}

      {session.status === 'voided' && (
        <Card style={{ background: 'var(--bg-elevated)' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            Session voided — no stock effect.
          </p>
        </Card>
      )}
    </main>
  )
}
