'use client'

import { useState, useMemo } from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { Badge, statusBadgeVariant } from '@/components/ui/Badge'
import type { SizeMasterRow, DesignMasterRow, ColourMasterRow } from '@stock-brain/domain'
import type { OrderStatus } from '@stock-brain/domain'
import { CloseOrderButton } from './CloseOrderButton'
import { LinesTab } from './tabs/LinesTab'
import { PlanningTab } from './tabs/PlanningTab'
import { HistoryTab } from './tabs/HistoryTab'
import { MoreTab } from './tabs/MoreTab'
import type { OrderDetailClientProps, OrderLineForDisplay, EngineRow, DispatchEventFull, DispatchLine, ChallanCellEntry, LineAmendmentRecord, HeaderAmendmentRecord, ExtraSkuOption } from './types'
import type { PlanningLineStatus } from '@stock-brain/types'

type Tab = 'lines' | 'planning' | 'history' | 'more'
const TAB_LABELS: Record<Tab, string> = { lines: 'Lines', planning: 'Planning', history: 'History', more: 'More' }

function fmt(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(3)
}

// ── Planning print helpers ────────────────────────────────────

const STATUS_LABEL_PRINT: Partial<Record<PlanningLineStatus, string>> = {
  ready_to_dispatch: 'Ready', ready_to_dispatch_override: '⚠ Ready (Override)',
  covered_by_wip: 'WIP Covers', give_to_labour: 'Issue to Labour',
  give_to_labour_override: '⚠ Labour (Override)', cut_on_machine: 'Cut on Machine',
  cut_on_machine_override: '⚠ Cut (Override)', procure_velvet: 'Procure Velvet',
  fully_dispatched: 'Dispatched', closed: 'Closed',
}

// ── OrderDetailClient ─────────────────────────────────────────

export function OrderDetailClient(props: OrderDetailClientProps) {
  const {
    orderId, orderStatus, orderCustomerId, orderDate, orderReference, orderNotes,
    customerName, customerBrandRule, displayStatus, linesForDisplay,
    engineRows, activeAllocations,
    totalOrdered, totalOrderedDispatched, totalExtrasSent, totalOpen, totalClosed, fulfilmentPct,
    totalReadyCovers, totalType1, totalType2, totalType3, totalRecommendedCut,
    labourDabbiBreakdown, dispatchHistory, headerAmendments,
    sizeMaster, designMaster, colourMaster, dabbiMaster, brandMaster, customerOptions, extraStockOptions,
    priorityBadgeText, hasAnyOverride, dayCount, isOrderClosed, canCloseOrder,
    openLineCount, totalReservedQty,
    challanSizesArr, challanRowKeys, challanCellTotalsArr, printedAt,
  } = props

  const [activeTab, setActiveTab] = useState<Tab>('lines')

  const challanCellTotals = useMemo(() => {
    const m = new Map<string, ChallanCellEntry>()
    for (const e of challanCellTotalsArr) m.set(e.key, e)
    return m
  }, [challanCellTotalsArr])

  const engineByLineId = useMemo(() => new Map(engineRows.map((r) => [r.order_line_id, r])), [engineRows])

  const dayColor = dayCount > 14 ? 'var(--danger)' : dayCount > 7 ? 'var(--warning)' : 'var(--text-muted)'
  const title = orderReference ? `Order — ${orderReference}` : 'Order'

  const headerBtn: CSSProperties = {
    fontSize: 'var(--text-sm)', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-sm)',
    cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--bg-elevated)',
    color: 'var(--text-secondary)', whiteSpace: 'nowrap',
  }

  return (
    <>
      {/* ── Responsive + print styles ──────────────────────────── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body:not([data-print-plan]) #challan { display: block !important; }
          body:not([data-print-plan]) #planning-sheet { display: none !important; }
          body[data-print-plan] #challan { display: none !important; }
          body[data-print-plan] #planning-sheet { display: block !important; }
          body { margin: 0; background: white; color: black; }
          @page { size: A4 landscape; margin: 15mm; }
        }
        @media screen {
          #challan { display: none; }
          #planning-sheet { display: none; }
        }
        @media (max-width: 767px) {
          .order-header-row { flex-direction: column !important; gap: 0.6rem !important; }
          .order-header-actions { flex-wrap: wrap !important; }
          .print-only-desktop { display: none !important; }
          .order-kpi-row { flex-wrap: wrap !important; gap: 0.35rem 1rem !important; }
        }
      `}</style>

      <main className="no-print" style={{ padding: '1.25rem 1.5rem', maxWidth: '1300px' }}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="order-header-row" style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.75rem' }}>
          {/* Left: back + title + badges */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link href="/orders" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              ← Orders
            </Link>
            <span style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>
              {customerName}
              {orderReference && <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '0.35rem' }}>— {orderReference}</span>}
            </span>
            <Badge variant={statusBadgeVariant(displayStatus)} label={displayStatus.replace(/_/g, ' ')} size="sm" />
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, padding: '0.1rem 0.45rem', border: `1px solid ${hasAnyOverride ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', color: hasAnyOverride ? 'var(--accent)' : 'var(--text-secondary)' }}>
              {priorityBadgeText}
            </span>
            {dayCount > 0 && (
              <span style={{ fontSize: 'var(--text-xs)', color: dayColor, fontWeight: dayCount > 7 ? 700 : 400 }}>
                {dayCount}d old
              </span>
            )}
          </div>

          {/* Right: action buttons */}
          <div className="order-header-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
            {!isOrderClosed && (
              <button className="print-only-desktop" type="button"
                onClick={() => { document.body.setAttribute('data-print-plan', ''); window.print(); setTimeout(() => document.body.removeAttribute('data-print-plan'), 1000) }}
                style={{ ...headerBtn, color: 'var(--accent)', borderColor: 'var(--accent)' }}>
                Print Plan
              </button>
            )}
            {!isOrderClosed && (
              <Link href={`/dispatch/new?order_id=${orderId}`} style={{ ...headerBtn, background: 'var(--accent)', color: 'white', border: 'none', fontWeight: 600, textDecoration: 'none', display: 'inline-block', padding: '0.35rem 0.75rem' }}>
                + Dispatch
              </Link>
            )}
            {dispatchHistory.length > 0 && (
              <button className="print-only-desktop" type="button" onClick={() => window.print()} style={headerBtn}>
                Print Challan
              </button>
            )}
            {canCloseOrder && (
              <CloseOrderButton orderId={orderId} totalOpenQty={totalOpen} openLineCount={openLineCount} reservedQty={totalReservedQty} />
            )}
          </div>
        </div>

        {/* ── Key numbers row ───────────────────────────────────── */}
        <div className="order-kpi-row" style={{ display: 'flex', gap: '0.5rem 1.5rem', marginBottom: '1rem', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Ordered <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalOrdered)}</strong></span>
          <span>Dispatched <strong style={{ color: totalOrderedDispatched > 0 ? 'var(--success)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalOrderedDispatched)}</strong></span>
          <span>Pending <strong style={{ color: totalOpen > 0 ? 'var(--warning)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalOpen)}</strong></span>
          <span>Fulfilment <strong style={{ color: fulfilmentPct === 100 ? 'var(--success)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fulfilmentPct}%</strong></span>
          {totalExtrasSent > 0 && (
            <span style={{ color: 'var(--text-muted)' }}>Extras <strong style={{ color: 'var(--info)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalExtrasSent)}</strong></span>
          )}
        </div>

        {/* ── Closed banner ─────────────────────────────────────── */}
        {isOrderClosed && (
          <div style={{ padding: '0.65rem 1rem', marginBottom: '1rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderLeft: '3px solid var(--text-muted)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            This order is closed. All remaining open qty has been marked as closed and reservations have been released.
          </div>
        )}

        {/* ── Tab navigation ────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: '1.25rem', overflowX: 'auto' }}>
          {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '0.5rem 1.1rem', fontSize: 'var(--text-sm)', fontWeight: activeTab === tab ? 700 : 400,
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
                background: 'transparent', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                borderBottom: `2px solid ${activeTab === tab ? 'var(--accent)' : 'transparent'}`,
                marginBottom: '-1px',
              }}
            >
              {TAB_LABELS[tab]}
              {tab === 'planning' && totalOpen > 0 && (
                <span style={{ marginLeft: '0.35rem', fontSize: '0.7rem', padding: '0.05rem 0.3rem', background: 'var(--warning-subtle)', color: 'var(--warning)', borderRadius: '9999px', fontWeight: 700 }}>
                  {openLineCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab content ───────────────────────────────────────── */}
        {activeTab === 'lines' && (
          <LinesTab
            orderId={orderId}
            lines={linesForDisplay}
            sizes={sizeMaster}
            designs={designMaster}
            colours={colourMaster}
            dabbis={dabbiMaster}
            brands={brandMaster}
            isClosed={isOrderClosed}
          />
        )}

        {activeTab === 'planning' && (
          <PlanningTab
            orderId={orderId}
            lines={linesForDisplay}
            engineRows={engineRows}
            activeAllocations={activeAllocations}
            totalReadyCovers={totalReadyCovers}
            totalType1={totalType1}
            totalType2={totalType2}
            totalType3={totalType3}
            totalRecommendedCut={totalRecommendedCut}
            labourDabbiBreakdown={labourDabbiBreakdown}
          />
        )}

        {activeTab === 'history' && (
          <HistoryTab
            dispatchHistory={dispatchHistory}
            headerAmendments={headerAmendments}
            linesForDisplay={linesForDisplay}
          />
        )}

        {activeTab === 'more' && (
          <MoreTab
            orderId={orderId}
            orderCustomerId={orderCustomerId}
            orderDate={orderDate}
            orderReference={orderReference}
            orderNotes={orderNotes}
            customerName={customerName}
            customerBrandRule={customerBrandRule}
            customerOptions={customerOptions}
            extraStockOptions={extraStockOptions}
            totalOrdered={totalOrdered}
            linesCount={linesForDisplay.length}
            totalOrderedDispatched={totalOrderedDispatched}
            totalExtrasSent={totalExtrasSent}
            totalOpen={totalOpen}
            totalClosed={totalClosed}
            fulfilmentPct={fulfilmentPct}
            openLineCount={openLineCount}
          />
        )}
      </main>

      {/* ── Printable Dispatch Challan ─────────────────────────── */}
      <div id="challan" style={{ fontFamily: 'Arial, sans-serif', fontSize: '10pt', color: 'black' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', borderBottom: '2px solid black', paddingBottom: '0.75rem' }}>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>Stock Brain — Dispatch Challan</div>
            <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Customer: {customerName}</div>
            {orderReference && <div style={{ fontSize: '0.85rem' }}>Order Ref: {orderReference}</div>}
          </div>
          <div style={{ textAlign: 'right', fontSize: '0.85rem' }}>
            <div>Printed: {new Date().toISOString().split('T')[0]}</div>
            {dispatchHistory.length > 0 && (
              <div>Dispatches: {dispatchHistory.map((e) => e.dispatch_date).join(', ')}</div>
            )}
          </div>
        </div>

        {challanSizesArr.length > 0 && (
          <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '1rem', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid lightgray', padding: '0.35rem 0.5rem', textAlign: 'left', background: 'white', color: 'black' }}>Shape</th>
                <th style={{ border: '1px solid lightgray', padding: '0.35rem 0.5rem', textAlign: 'left', background: 'white', color: 'black' }}>CLR</th>
                {challanSizesArr.map((s) => (
                  <th key={s.id} style={{ border: '1px solid lightgray', padding: '0.35rem 0.5rem', textAlign: 'right', whiteSpace: 'nowrap', background: 'white', color: 'black' }}>{s.code}</th>
                ))}
                <th style={{ border: '1px solid lightgray', padding: '0.35rem 0.5rem', textAlign: 'right', fontWeight: 'bold', background: 'white', color: 'black' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {challanRowKeys.map((rowKey) => {
                const [designId, colourId] = rowKey.split('|')
                const sample = [...challanCellTotals.entries()].find(([k]) => k.startsWith(rowKey))?.[1]
                const rowTotal = challanSizesArr.reduce((s, sz) => s + (challanCellTotals.get(`${designId}|${colourId}|${sz.id}`)?.qty ?? 0), 0)
                if (rowTotal === 0) return null
                return (
                  <tr key={rowKey}>
                    <td style={{ border: '1px solid lightgray', padding: '0.35rem 0.5rem', background: 'white', color: 'black' }}>{sample?.shape ?? '—'}</td>
                    <td style={{ border: '1px solid lightgray', padding: '0.35rem 0.5rem', background: 'white', color: 'black' }}>{sample?.bindi_colour ?? '—'}</td>
                    {challanSizesArr.map((sz) => {
                      const cell = challanCellTotals.get(`${designId}|${colourId}|${sz.id}`)
                      return (
                        <td key={sz.id} style={{ border: '1px solid lightgray', padding: '0.35rem 0.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', background: 'white', color: 'black' }}>
                          {cell && cell.qty > 0 ? fmt(cell.qty) : ''}
                        </td>
                      )
                    })}
                    <td style={{ border: '1px solid lightgray', padding: '0.35rem 0.5rem', textAlign: 'right', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums', background: 'white', color: 'black' }}>
                      {fmt(rowTotal)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2 + challanSizesArr.length} style={{ border: '1px solid lightgray', padding: '0.35rem 0.5rem', textAlign: 'right', fontWeight: 'bold', background: 'white', color: 'black' }}>Grand Total</td>
                <td style={{ border: '1px solid lightgray', padding: '0.35rem 0.5rem', textAlign: 'right', fontWeight: 'bold', fontVariantNumeric: 'tabular-nums', background: 'white', color: 'black' }}>{fmt(totalOrderedDispatched)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        {dispatchHistory.map((ev) => (
          <div key={ev.id} style={{ marginBottom: '1rem', fontSize: '0.82rem' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', color: 'black' }}>
              {ev.dispatch_date}{ev.reference ? ` — Ref: ${ev.reference}` : ''}{ev.notes ? ` — ${ev.notes}` : ''}
            </div>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  {['Shape', 'CLR', 'Size', 'Dabbi', 'Qty'].map((h) => (
                    <th key={h} style={{ border: '1px solid lightgray', padding: '0.25rem 0.4rem', textAlign: h === 'Qty' ? 'right' : 'left', background: 'white', color: 'black' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ev.lines.map((l) => (
                  <tr key={l.key}>
                    <td style={{ border: '1px solid lightgray', padding: '0.25rem 0.4rem', background: 'white', color: 'black' }}>{l.shape}</td>
                    <td style={{ border: '1px solid lightgray', padding: '0.25rem 0.4rem', background: 'white', color: 'black' }}>{l.bindi_colour}</td>
                    <td style={{ border: '1px solid lightgray', padding: '0.25rem 0.4rem', background: 'white', color: 'black' }}>{l.size}</td>
                    <td style={{ border: '1px solid lightgray', padding: '0.25rem 0.4rem', background: 'white', color: 'black' }}>{l.dabbi}</td>
                    <td style={{ border: '1px solid lightgray', padding: '0.25rem 0.4rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', background: 'white', color: 'black' }}>{fmt(l.quantity_dispatched)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        <div style={{ marginTop: '1.5rem', borderTop: '1px solid lightgray', paddingTop: '0.75rem', fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between', color: 'black' }}>
          <span>Total gross qty dispatched: <strong>{fmt(totalOrderedDispatched)}</strong></span>
          {orderNotes && <span>Order notes: {orderNotes}</span>}
        </div>
        <div style={{ marginTop: '0.75rem', fontSize: '0.72rem', color: 'gray', textAlign: 'center' }}>Stock Brain — Confidential</div>
      </div>

      {/* ── Printable Planning Sheet ───────────────────────────── */}
      <div id="planning-sheet" style={{ fontFamily: 'Arial, sans-serif', fontSize: '9pt', color: 'black' }}>
        <div style={{ borderBottom: '2px solid black', paddingBottom: '0.6rem', marginBottom: '0.75rem' }}>
          <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>NIRANKARI BINDI</div>
          <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginTop: '0.15rem' }}>ORDER PLANNING SHEET</div>
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.4rem', fontSize: '0.8rem', flexWrap: 'wrap' }}>
            <span>Customer: <strong>{customerName}</strong></span>
            <span>Order ref: <strong>{orderReference ?? orderId.slice(0, 8)}</strong></span>
            <span>Order date: <strong>{orderDate}</strong></span>
            <span>Priority: <strong>{priorityBadgeText}</strong></span>
            <span style={{ marginLeft: 'auto' }}>Printed: {printedAt}</span>
          </div>
        </div>

        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '0.3rem', borderBottom: '1px solid #ccc', paddingBottom: '0.2rem' }}>SUMMARY</div>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.8rem' }}>
            <thead>
              <tr>
                {['Action', 'Gross', 'Notes'].map((h) => (
                  <th key={h} style={{ border: '1px solid #ccc', padding: '0.25rem 0.4rem', textAlign: h === 'Gross' ? 'right' : 'left', background: '#f5f5f5' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {([
                ['Ready to Dispatch', totalReadyCovers, 'Dispatch immediately'],
                ['Issue to Labour', totalType1, labourDabbiBreakdown.map(({ code, qty }) => `${code}: ${fmt(qty)}`).join(' | ') || '—'],
                ['Cut on Machine', totalType2, totalRecommendedCut > 0 ? `Rec. cut: ${fmt(totalRecommendedCut)} gross` : 'Cutting session needed'],
                ['Procure Velvet', totalType3, 'Purchase required'],
              ] as [string, number, string][]).map(([action, gross, notes]) => (
                <tr key={action}>
                  <td style={{ border: '1px solid #ccc', padding: '0.25rem 0.4rem' }}>{action}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.25rem 0.4rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(gross)}</td>
                  <td style={{ border: '1px solid #ccc', padding: '0.25rem 0.4rem', color: '#555' }}>{notes}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 'bold' }}>
                <td style={{ border: '1px solid #ccc', padding: '0.25rem 0.4rem', background: '#f5f5f5' }}>Total Pending</td>
                <td style={{ border: '1px solid #ccc', padding: '0.25rem 0.4rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', background: '#f5f5f5' }}>{fmt(totalOpen)}</td>
                <td style={{ border: '1px solid #ccc', padding: '0.25rem 0.4rem', background: '#f5f5f5' }}></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <div style={{ fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '0.3rem', borderBottom: '1px solid #ccc', paddingBottom: '0.2rem' }}>PER LINE DETAIL</div>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.78rem' }}>
            <thead>
              <tr>
                {['Shape', 'CLR', 'Size', 'Dabbi', 'Ordered', 'Dispatched', 'Pending', 'Ready', 'WIP', 'Cut Avail', 'Issue Qty', 'Still Short', 'Status'].map((h) => (
                  <th key={h} style={{ border: '1px solid #ccc', padding: '0.2rem 0.35rem', textAlign: ['Ordered', 'Dispatched', 'Pending', 'Ready', 'WIP', 'Cut Avail', 'Issue Qty', 'Still Short'].includes(h) ? 'right' : 'left', background: '#f5f5f5' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linesForDisplay.filter((l) => l.open_qty > 0).map((line) => {
                const er = engineByLineId.get(line.id)
                return (
                  <tr key={line.id}>
                    <td style={{ border: '1px solid #ccc', padding: '0.2rem 0.35rem' }}>{line.shape}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.2rem 0.35rem' }}>{line.bindi_colour}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.2rem 0.35rem' }}>{line.size}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.2rem 0.35rem', fontWeight: 'bold' }}>{line.dabbi}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.2rem 0.35rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(line.ordered_qty)}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.2rem 0.35rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(line.dispatched_qty)}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.2rem 0.35rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 'bold' }}>{fmt(line.open_qty)}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.2rem 0.35rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(er?.ready_allocated_qty ?? 0) > 0 ? fmt(er!.ready_allocated_qty) : ''}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.2rem 0.35rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(er?.wip_allocated_qty ?? 0) > 0 ? fmt(er!.wip_allocated_qty) : ''}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.2rem 0.35rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(er?.cuttings_available_qty ?? 0) > 0 ? fmt(er!.cuttings_available_qty) : ''}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.2rem 0.35rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: (er?.cuttings_allocated_qty ?? 0) > 0 ? 'bold' : undefined }}>{(er?.cuttings_allocated_qty ?? 0) > 0 ? fmt(er!.cuttings_allocated_qty) : ''}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.2rem 0.35rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 'bold' }}>{er ? ((er.shortage_qty ?? 0) > 0 ? fmt(er.shortage_qty) : '') : fmt(line.open_qty)}</td>
                    <td style={{ border: '1px solid #ccc', padding: '0.2rem 0.35rem' }}>{er ? (STATUS_LABEL_PRINT[er.planning_status] ?? er.planning_status) : 'NO STOCK'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ borderTop: '1px solid #ccc', paddingTop: '0.75rem', marginTop: '1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
          <span>Authorised by: ___________________________</span>
          <span>Date: ___________________</span>
        </div>
        <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: '#aaa', textAlign: 'center' }}>Stock Brain — Confidential</div>
      </div>
    </>
  )
}
