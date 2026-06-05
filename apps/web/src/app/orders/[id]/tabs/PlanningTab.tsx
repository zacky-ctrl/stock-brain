'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import type { PlanningLineStatus } from '@stock-brain/types'
import type { OrderLineForDisplay, EngineRow } from '../types'

type Props = {
  orderId: string
  lines: OrderLineForDisplay[]
  engineRows: EngineRow[]
  activeAllocations: { order_line_id: string; allocated_qty: number }[]
  totalReadyCovers: number
  totalType1: number
  totalType2: number
  totalType3: number
  totalRecommendedCut: number
  labourDabbiBreakdown: { code: string; qty: number }[]
}

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

const STATUS_LABEL: Partial<Record<PlanningLineStatus, string>> = {
  ready_to_dispatch:          'Ready',
  ready_to_dispatch_override: '⚠ Ready (Override)',
  covered_by_wip:             'WIP Covers',
  give_to_labour:             'Issue to Labour',
  give_to_labour_override:    '⚠ Labour (Override)',
  cut_on_machine:             'Cut on Machine',
  cut_on_machine_override:    '⚠ Cut (Override)',
  procure_velvet:             'Procure Velvet',
  fully_dispatched:           'Dispatched',
  closed:                     'Closed',
}

function planningBadgeStyle(status: PlanningLineStatus): CSSProperties {
  const base: CSSProperties = {
    display: 'inline-block', padding: '0.1rem 0.4rem', fontSize: 'var(--text-xs)',
    fontWeight: 700, borderRadius: 'var(--radius-sm)', border: '1px solid', whiteSpace: 'nowrap',
  }
  switch (status) {
    case 'ready_to_dispatch':
    case 'ready_to_dispatch_override':
      return { ...base, color: 'var(--success)', borderColor: 'rgba(16,185,129,0.25)', background: 'rgba(16,185,129,0.08)' }
    case 'covered_by_wip':
      return { ...base, color: 'var(--info)', borderColor: 'rgba(99,102,241,0.25)', background: 'rgba(99,102,241,0.08)' }
    case 'give_to_labour':
    case 'give_to_labour_override':
      return { ...base, color: 'var(--warning)', borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.08)' }
    case 'cut_on_machine':
    case 'cut_on_machine_override':
    case 'procure_velvet':
      return { ...base, color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)', background: 'var(--danger-subtle)' }
    default:
      return { ...base, color: 'var(--text-muted)', borderColor: 'var(--border)', background: 'transparent' }
  }
}

const card: CSSProperties = {
  flex: '1 1 180px', minWidth: '160px', padding: '1rem 1.25rem',
  borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-elevated)',
}

export function PlanningTab({
  orderId, lines, engineRows, activeAllocations,
  totalReadyCovers, totalType1, totalType2, totalType3,
  totalRecommendedCut, labourDabbiBreakdown,
}: Props) {
  const openLines = lines.filter((l) => l.open_qty > 0)

  const engineByLineId = new Map(engineRows.map((r) => [r.order_line_id, r]))
  const allocByLineId = new Map(activeAllocations.map((a) => [a.order_line_id, a.allocated_qty]))

  const totalOpen = openLines.reduce((s, l) => s + l.open_qty, 0)

  if (openLines.length === 0) {
    return (
      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
        No open lines — nothing to plan.
      </p>
    )
  }

  return (
    <div>
      {/* ── 4 action cards ────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>

        {/* Card 1: Ready to Dispatch */}
        <div style={{ ...card, borderColor: totalReadyCovers > 0 ? 'rgba(16,185,129,0.3)' : 'var(--border)', background: totalReadyCovers > 0 ? 'rgba(16,185,129,0.06)' : 'var(--bg-elevated)' }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
            Ready to Dispatch
          </div>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: totalReadyCovers > 0 ? 'var(--success)' : 'var(--text-muted)', marginBottom: '0.5rem' }}>
            {fmt(totalReadyCovers)} gross
          </div>
          {totalReadyCovers > 0 && (
            <Link href={`/dispatch/new?order_id=${orderId}`} style={{ display: 'inline-block', fontSize: 'var(--text-xs)', padding: '0.2rem 0.6rem', background: 'var(--success)', color: 'white', borderRadius: 'var(--radius-sm)', fontWeight: 600 }}>
              Dispatch Now
            </Link>
          )}
        </div>

        {/* Card 2: Issue to Labour */}
        <div style={{ ...card, borderColor: totalType1 > 0 ? 'rgba(245,158,11,0.3)' : 'var(--border)', background: totalType1 > 0 ? 'rgba(245,158,11,0.05)' : 'var(--bg-elevated)' }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
            Issue to Labour
          </div>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: totalType1 > 0 ? 'var(--warning)' : 'var(--text-muted)', marginBottom: '0.4rem' }}>
            {fmt(totalType1)} gross
          </div>
          {totalType1 > 0 && labourDabbiBreakdown.length > 0 && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '0.4rem' }}>
              {labourDabbiBreakdown.map(({ code, qty }) => (
                <span key={code} style={{ marginRight: '0.5rem' }}>
                  <strong>{code}</strong>: {fmt(qty)}
                </span>
              ))}
            </div>
          )}
          {totalType1 > 0 && (
            <Link href="/reports/labour-issue" style={{ display: 'inline-block', fontSize: 'var(--text-xs)', padding: '0.2rem 0.6rem', background: 'var(--warning)', color: 'white', borderRadius: 'var(--radius-sm)', fontWeight: 600 }}>
              Labour Issue Sheet
            </Link>
          )}
        </div>

        {/* Card 3: Cut on Machine */}
        <div style={{ ...card, borderColor: totalType2 > 0 ? 'rgba(239,68,68,0.25)' : 'var(--border)', background: totalType2 > 0 ? 'var(--danger-subtle)' : 'var(--bg-elevated)' }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
            Cut on Machine
          </div>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: totalType2 > 0 ? 'var(--danger)' : 'var(--text-muted)', marginBottom: '0.4rem' }}>
            {fmt(totalType2)} gross
          </div>
          {totalType2 > 0 && totalRecommendedCut > 0 && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
              Rec. cut: {fmt(totalRecommendedCut)} gross
            </div>
          )}
          {totalType2 > 0 && (
            <Link href="/reports/cutting-required" style={{ display: 'inline-block', fontSize: 'var(--text-xs)', padding: '0.2rem 0.6rem', background: 'var(--danger)', color: 'white', borderRadius: 'var(--radius-sm)', fontWeight: 600 }}>
              Plan Cutting
            </Link>
          )}
        </div>

        {/* Card 4: Procure Velvet */}
        <div style={{ ...card, borderColor: totalType3 > 0 ? 'rgba(239,68,68,0.25)' : 'var(--border)', background: totalType3 > 0 ? 'var(--danger-subtle)' : 'var(--bg-elevated)' }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
            Procure Velvet
          </div>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: totalType3 > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
            {fmt(totalType3)} gross
          </div>
        </div>
      </div>

      {/* ── Per-line planning table ───────────────────────────── */}
      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
        Per-Line Planning
        <span style={{ fontWeight: 400, marginLeft: '0.5rem', color: 'var(--text-muted)' }}>({openLines.length} lines · {fmt(totalOpen)} pending)</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px', fontSize: 'var(--text-xs)' }}>
          <thead>
            <tr>
              {(['Shape', 'CLR', 'Size', 'Dabbi', 'Pending', 'Ready', 'WIP', 'Issue Qty', 'Still Short', 'Status', 'Reserved'] as const).map((h) => (
                <th key={h} style={{
                  padding: '0.4rem 0.65rem',
                  textAlign: ['Pending', 'Ready', 'WIP', 'Issue Qty', 'Still Short', 'Reserved'].includes(h) ? 'right' : 'left',
                  color: h === 'Issue Qty' ? 'var(--warning)' : h === 'Still Short' ? 'var(--danger)' : 'var(--text-secondary)',
                  fontWeight: 700, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {openLines.map((line) => {
              const er = engineByLineId.get(line.id)
              const reservedQty = allocByLineId.get(line.id)
              return (
                <tr key={line.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '0.35rem 0.65rem', color: 'var(--text-primary)' }}>{line.shape}</td>
                  <td style={{ padding: '0.35rem 0.65rem', color: 'var(--text-secondary)' }}>{line.bindi_colour}</td>
                  <td style={{ padding: '0.35rem 0.65rem', color: 'var(--text-secondary)' }}>{line.size}</td>
                  <td style={{ padding: '0.35rem 0.65rem', fontWeight: 700, color: 'var(--accent)' }}>{line.dabbi}</td>
                  <td style={{ padding: '0.35rem 0.65rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmt(line.open_qty)}</td>
                  <td style={{ padding: '0.35rem 0.65rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: (er?.ready_allocated_qty ?? 0) > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                    {(er?.ready_allocated_qty ?? 0) > 0 ? fmt(er!.ready_allocated_qty) : '—'}
                  </td>
                  <td style={{ padding: '0.35rem 0.65rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: (er?.wip_allocated_qty ?? 0) > 0 ? 'var(--info)' : 'var(--text-muted)' }}>
                    {(er?.wip_allocated_qty ?? 0) > 0 ? fmt(er!.wip_allocated_qty) : '—'}
                  </td>
                  <td style={{ padding: '0.35rem 0.65rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {(er?.cuttings_allocated_qty ?? 0) > 0
                      ? <strong style={{ color: 'var(--warning)' }}>{fmt(er!.cuttings_allocated_qty)}</strong>
                      : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={{ padding: '0.35rem 0.65rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: (er?.shortage_qty ?? 0) > 0 || !er ? 700 : undefined, color: (er?.shortage_qty ?? 0) > 0 || !er ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {er ? ((er.shortage_qty ?? 0) > 0 ? fmt(er.shortage_qty) : '—') : fmt(line.open_qty)}
                  </td>
                  <td style={{ padding: '0.35rem 0.65rem' }}>
                    {er
                      ? <span style={planningBadgeStyle(er.planning_status)}>{STATUS_LABEL[er.planning_status] ?? er.planning_status}</span>
                      : <Badge variant="danger" label="NO STOCK" size="sm" />}
                  </td>
                  <td style={{ padding: '0.35rem 0.65rem', textAlign: 'right' }}>
                    {reservedQty
                      ? <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--warning)', whiteSpace: 'nowrap' }}>🔒 {fmt(reservedQty)}</span>
                      : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
