'use client'

import { useState, useMemo } from 'react'
import { MatrixGrid } from '@/components/matrix/MatrixGrid'
import { MatrixFilterBar } from '@/components/matrix/MatrixFilterBar'
import { buildMatrixFromStockBalances, filterMatrixData } from '@stock-brain/domain'
import type { SizeMasterRow, DesignMasterRow, ColourMasterRow, StockBalanceRow } from '@stock-brain/domain'
import type { FilterConfig, ActiveFilters } from '@stock-brain/types'
import { tableTh, tableTd } from '@/lib/ui'
import type { CSSProperties } from 'react'

type BalanceRowForDisplay = {
  id: string
  shape_design_id: string
  bindi_colour_id: string
  size_id: string
  gross_qty: number
  committed_qty: number
  available_qty: number
}

export type CuttingsHistoryRow = {
  id: string
  corrected_at: string
  source: string
  shape_name: string
  colour_code: string
  size_code: string
  delta_qty: number
  reason: string
}

type Props = {
  balances: BalanceRowForDisplay[]
  sizeMaster: SizeMasterRow[]
  designMaster: DesignMasterRow[]
  colourMaster: ColourMasterRow[]
  reportDate: string
  historyRows: CuttingsHistoryRow[]
}

export function CuttingsStockClient({
  balances,
  sizeMaster,
  designMaster,
  colourMaster,
  reportDate,
  historyRows,
}: Props) {
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({})
  const [historyOpen, setHistoryOpen] = useState(false)
  const [nonZeroOnly, setNonZeroOnly] = useState(true)

  const stockRows: StockBalanceRow[] = balances.map((b) => ({
    shape_design_id: b.shape_design_id,
    bindi_colour_id: b.bindi_colour_id,
    size_id: b.size_id,
    gross_qty: b.available_qty,
    available_qty: b.available_qty,
    committed_qty: b.committed_qty,
  }))

  const fullMatrix = useMemo(
    () =>
      buildMatrixFromStockBalances(
        nonZeroOnly ? stockRows.filter((r) => r.gross_qty > 0) : stockRows,
        sizeMaster,
        designMaster,
        colourMaster,
        { showAllRows: !nonZeroOnly },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nonZeroOnly, balances],
  )

  const filterConfig: FilterConfig = useMemo(() => {
    const designsSeen = new Map<string, string>()
    const coloursSeen = new Map<string, string>()
    for (const row of fullMatrix.rows) {
      designsSeen.set(row.design_id, row.design_name)
      coloursSeen.set(row.colour_id, row.colour_code)
    }
    return {
      fields: [
        {
          key: 'design',
          label: 'Design',
          options: [...designsSeen.entries()].map(([id, label]) => ({ id, label })),
        },
        {
          key: 'colour',
          label: 'CLR',
          options: [...coloursSeen.entries()].map(([id, label]) => ({ id, label })),
        },
      ],
    }
  }, [fullMatrix])

  const filteredMatrix = useMemo(
    () => filterMatrixData(fullMatrix, activeFilters, { design: 'design', colour: 'colour' }),
    [fullMatrix, activeFilters],
  )

  const totalAvailable = balances.reduce((s, b) => s + b.available_qty, 0)

  function handlePrint() {
    window.print()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', alignItems: 'center' }}>
        <span>
          <strong style={{ color: 'var(--text-primary)' }}>{balances.length}</strong> SKU{balances.length !== 1 ? 's' : ''}
        </span>
        <span>
          <strong style={{ color: 'var(--text-primary)' }}>{totalAvailable % 1 === 0 ? totalAvailable : totalAvailable.toFixed(3)}</strong> gross available
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
          <input
            type="checkbox"
            checked={nonZeroOnly}
            onChange={(e) => setNonZeroOnly(e.target.checked)}
          />
          Non-zero only
        </label>
        <button
          onClick={handlePrint}
          style={{ marginLeft: 'auto', fontSize: 'var(--text-sm)', padding: '0.3rem 0.75rem', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}
        >
          Print — Cuttings Stock Position — {reportDate}
        </button>
      </div>

      <MatrixFilterBar
        filterConfig={filterConfig}
        activeFilters={activeFilters}
        onFilterChange={setActiveFilters}
      />

      <div style={{ overflowX: 'auto', marginTop: '0.75rem' }}>
        <MatrixGrid data={filteredMatrix} mode="view" />
      </div>

      {historyRows.length > 0 && (
        <section style={{ marginTop: '2.5rem' }}>
          <button
            onClick={() => setHistoryOpen((o) => !o)}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            {historyOpen ? '▾' : '▸'} Stock Entry History ({historyRows.length})
          </button>

          {historyOpen && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '700px' }}>
                <thead>
                  <tr>
                    <th style={tableTh}>Date</th>
                    <th style={tableTh}>Source</th>
                    <th style={tableTh}>SKU</th>
                    <th style={{ ...tableTh, textAlign: 'right' } as CSSProperties}>Qty Changed</th>
                    <th style={tableTh}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((row) => (
                    <tr key={row.id}>
                      <td style={tableTd}>
                        {new Date(row.corrected_at).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td style={tableTd}>{row.source}</td>
                      <td style={tableTd}>
                        {row.shape_name} / {row.colour_code} / {row.size_code}
                      </td>
                      <td
                        style={{
                          ...tableTd,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          color: row.delta_qty >= 0 ? 'var(--success)' : 'var(--danger)',
                        } as CSSProperties}
                      >
                        {row.delta_qty > 0 ? '+' : ''}
                        {row.delta_qty % 1 === 0 ? row.delta_qty : row.delta_qty.toFixed(3)}
                      </td>
                      <td style={{ ...tableTd, color: 'var(--text-secondary)', maxWidth: '320px' } as CSSProperties}>
                        {row.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
