import type { CSSProperties } from 'react'

export type ReportFilterSummaryItem = {
  label: string
  value: string
}

type ReportHeaderProps = {
  reportName: string
  filters: ReportFilterSummaryItem[]
  generatedAt?: Date
}

export function ReportHeader({ reportName, filters, generatedAt = new Date() }: ReportHeaderProps) {
  const dateStr = generatedAt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const activeParts = filters.filter((f) => f.value && f.value !== 'All').map((f) => f.value)
  const filterSummary = activeParts.length > 0 ? activeParts.join(' — ') : 'All'
  const printTitle = activeParts.length > 0 ? `${reportName} — ${filterSummary}` : reportName

  const screenWrap: CSSProperties = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-strong)',
    borderLeft: '4px solid var(--accent)',
    borderRadius: 'var(--radius-md)',
    padding: '1.25rem 1.5rem',
    marginBottom: '1.5rem',
  }

  return (
    <>
      {/* Screen header */}
      <div className="report-header-screen" style={screenWrap}>
        <div
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            color: 'var(--accent-bright)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: '0.2rem',
          }}
        >
          NIRANKARI BINDI
        </div>
        <h1
          style={{
            fontSize: 'var(--text-2xl)',
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {reportName}
        </h1>
        <div
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
            marginTop: '0.35rem',
            display: 'flex',
            gap: '0.5rem',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <span>{filterSummary}</span>
          <span style={{ color: 'var(--border-strong)' }}>|</span>
          <span>Generated: {dateStr}</span>
        </div>
      </div>

      {/* Print header — hidden on screen, shown on print via @media print */}
      <div className="report-header-print" style={{ display: 'none' }}>
        <div style={{ textAlign: 'center', paddingBottom: '8px', borderBottom: '2px solid black', marginBottom: '12px' }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>NIRANKARI BINDI</div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', textDecoration: 'underline', marginTop: '2px' }}>
            {printTitle}
          </div>
          <div style={{ fontSize: '11px', marginTop: '4px' }}>
            {filterSummary} | Generated: {dateStr}
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .report-header-screen { display: none !important; }
          .report-header-print { display: block !important; }
          .report-filter-bar, .no-print { display: none !important; }
          .app-sidebar, .app-topnav, .app-bottomtabs { display: none !important; }
          .app-content { margin-left: 0 !important; padding: 0 !important; }
          main { max-width: 100% !important; padding: 0 !important; }
          table { border-collapse: collapse !important; width: 100% !important; }
          th, td { border: 1px solid black !important; font-size: 11px !important; padding: 4px 6px !important; color: black !important; background: white !important; }
          th { background: #f0f0f0 !important; font-weight: bold !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </>
  )
}
