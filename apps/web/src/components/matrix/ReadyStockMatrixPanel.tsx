'use client'

import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { MatrixViewToggle } from './MatrixViewToggle'
import { MatrixGrid, PrintButton } from './MatrixGrid'
import { MatrixFilterBar } from './MatrixFilterBar'
import { buildMatrixFromStockBalances, filterMatrixData } from '@stock-brain/domain'
import type { SizeMasterRow, DesignMasterRow, ColourMasterRow, StockBalanceRow } from '@stock-brain/domain'
import type { FilterConfig, ActiveFilters } from '@stock-brain/types'
import type { CSSProperties } from 'react'

export type ReadyStockMatrixPanelProps = {
  stockRows: StockBalanceRow[]
  sizeMaster: SizeMasterRow[]
  designMaster: DesignMasterRow[]
  colourMaster: ColourMasterRow[]
  printTitle: string
  children: ReactNode
}

export function ReadyStockMatrixPanel({
  stockRows,
  sizeMaster,
  designMaster,
  colourMaster,
  printTitle,
  children,
}: ReadyStockMatrixPanelProps) {
  const [view, setView] = useState<'list' | 'matrix'>('list')
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({})

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  // Build full matrix (unfiltered)
  const fullMatrixData = useMemo(() => {
    if (sizeMaster.length === 0 || designMaster.length === 0 || colourMaster.length === 0) return null
    return buildMatrixFromStockBalances(stockRows, sizeMaster, designMaster, colourMaster, {
      context_label: 'Ready Stock Position',
      date_label: today,
    })
  }, [stockRows, sizeMaster, designMaster, colourMaster, today])

  // Filter options — only designs/colours present in stock data
  const filterConfig: FilterConfig = useMemo(() => {
    if (!fullMatrixData) return { fields: [] }
    const designsSeen = new Map<string, string>()
    const coloursSeen = new Map<string, string>()
    for (const row of fullMatrixData.rows) {
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
        {
          key: 'show',
          label: 'Show',
          options: [{ id: 'nonzero', label: 'Non-zero only' }],
        },
      ],
    }
  }, [fullMatrixData])

  // Apply filters to matrix
  const matrixData = useMemo(
    () => fullMatrixData
      ? filterMatrixData(fullMatrixData, activeFilters, { design: 'design', colour: 'colour', nonZeroOnly: 'show' })
      : null,
    [fullMatrixData, activeFilters],
  )

  const toggleBarStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '0.75rem',
  }

  return (
    <div>
      <div style={toggleBarStyle} className="no-print">
        <MatrixViewToggle view={view} onViewChange={setView} />
        {view === 'matrix' && <PrintButton label="Print" />}
      </div>

      {view === 'list' && children}

      {view === 'matrix' && (
        <>
          <MatrixFilterBar
            filterConfig={filterConfig}
            activeFilters={activeFilters}
            onFilterChange={setActiveFilters}
          />
          {matrixData && matrixData.rows.length > 0 ? (
            <MatrixGrid data={matrixData} mode="view" printTitle={printTitle} />
          ) : (
            <p style={{ fontFamily: 'monospace', fontSize: '0.88rem', color: '#888' }}>
              No data matching current filters.
            </p>
          )}
        </>
      )}
    </div>
  )
}
