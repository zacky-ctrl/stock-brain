'use client'

import { useState, useTransition } from 'react'
import { generateAiStrategyReport } from './actions'
import type { ReportHistoryItem } from './actions'

type Props = {
  initialHistory: ReportHistoryItem[]
}

type ParsedSections = {
  healthScore: number | null
  healthReason: string
  urgentActions: string[]
  minStockLevels: string
  customerAlerts: string
  productionRecommendation: string
  riskFlag: string
  raw: string
}

function parseSections(text: string): ParsedSections {
  const sections: Record<string, string> = {}
  const lines = text.split('\n')
  let currentKey = ''
  let currentContent: string[] = []

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentKey) sections[currentKey] = currentContent.join('\n').trim()
      currentKey = line.slice(3).trim()
      currentContent = []
    } else {
      currentContent.push(line)
    }
  }
  if (currentKey) sections[currentKey] = currentContent.join('\n').trim()

  // Parse health score
  const healthRaw = sections['BUSINESS HEALTH SCORE'] ?? ''
  const scoreMatch = healthRaw.match(/(\d+)/)
  const healthScore = scoreMatch ? parseInt(scoreMatch[1]!, 10) : null
  const healthReason = healthRaw.replace(/^\d+\s*[—–-]\s*/, '').trim()

  // Parse urgent actions (numbered list)
  const urgentRaw = sections['URGENT ACTIONS THIS WEEK'] ?? ''
  const urgentActions = urgentRaw
    .split('\n')
    .filter((l) => /^\d+\./.test(l.trim()))
    .map((l) => l.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean)

  return {
    healthScore,
    healthReason,
    urgentActions,
    minStockLevels:          sections['MINIMUM STOCK LEVELS']          ?? '',
    customerAlerts:          sections['CUSTOMER ALERTS']               ?? '',
    productionRecommendation: sections['PRODUCTION RECOMMENDATION (NEXT 7 DAYS)'] ?? sections['PRODUCTION RECOMMENDATION'] ?? '',
    riskFlag:                sections['RISK FLAG']                     ?? '',
    raw: text,
  }
}

function healthColor(score: number | null): string {
  if (score === null) return 'var(--text-primary)'
  if (score >= 80)   return 'var(--success)'
  if (score >= 60)   return 'var(--warning)'
  return 'var(--danger)'
}

export function AiStrategyClient({ initialHistory }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [reportText, setReportText] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [history, setHistory] = useState<ReportHistoryItem[]>(initialHistory)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const parsed = reportText ? parseSections(reportText) : null

  const handleGenerate = () => {
    setError(null)
    setSelectedId(null)
    startTransition(async () => {
      const result = await generateAiStrategyReport()
      if (!result.ok) { setError(result.error); return }
      setReportText(result.reportText)
      setGeneratedAt(result.generatedAt)
      if (result.reportId) {
        setHistory((prev) => [
          { id: result.reportId, generated_at: result.generatedAt, report_text: result.reportText },
          ...prev.slice(0, 4),
        ])
      }
    })
  }

  const viewHistorical = (item: ReportHistoryItem) => {
    setReportText(item.report_text)
    setGeneratedAt(item.generated_at)
    setSelectedId(item.id)
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const cardStyle = (accentColor?: string) => ({
    background: 'var(--bg-elevated)',
    border: `1px solid var(--border-strong)`,
    borderLeft: `4px solid ${accentColor ?? 'var(--border-strong)'}`,
    borderRadius: 'var(--radius-md)',
    padding: '1rem 1.25rem',
    marginBottom: '1rem',
  })

  return (
    <div>
      {/* Generate button */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          onClick={handleGenerate}
          disabled={isPending}
          style={{
            fontSize: 'var(--text-sm)',
            padding: '0.5rem 1.25rem',
            border: '1px solid var(--accent)',
            color: isPending ? 'var(--text-secondary)' : 'var(--accent)',
            background: isPending ? 'var(--bg-elevated)' : 'var(--accent-subtle)',
            cursor: isPending ? 'not-allowed' : 'pointer',
            borderRadius: 'var(--radius-sm)',
            fontWeight: 600,
          }}
        >
          {isPending ? '⟳ Analysing your data…' : 'Generate Report'}
        </button>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          Analyses last 60 days · Takes 15–30 seconds
        </span>
        {reportText && (
          <button
            onClick={() => window.print()}
            style={{ fontSize: 'var(--text-xs)', padding: '0.35rem 0.75rem', border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-elevated)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}
          >
            Print
          </button>
        )}
      </div>

      {error && (
        <div style={{ ...cardStyle('var(--danger)'), background: 'var(--danger-subtle)', marginBottom: '1.25rem' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--danger)' }}>✗ {error}</p>
        </div>
      )}

      {/* Structured report display */}
      {parsed && generatedAt && (
        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            {selectedId ? 'Historical report' : 'Report'} — Generated: {formatDate(generatedAt)} &nbsp;|&nbsp; AI-generated. Review before acting.
          </div>

          {/* Health score */}
          {parsed.healthScore !== null && (
            <div style={cardStyle(healthColor(parsed.healthScore))}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.35rem' }}>
                Business Health Score
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
                <span style={{ fontSize: '3.5rem', fontWeight: 800, color: healthColor(parsed.healthScore), lineHeight: 1 }}>
                  {parsed.healthScore}
                </span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>/100</span>
              </div>
              {parsed.healthReason && (
                <p style={{ margin: '0.5rem 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  {parsed.healthReason}
                </p>
              )}
            </div>
          )}

          {/* Urgent actions */}
          {parsed.urgentActions.length > 0 && (
            <div style={cardStyle('var(--accent)')}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                Urgent Actions This Week
              </div>
              {parsed.urgentActions.map((action, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '1.4rem', height: '1.4rem', background: 'var(--accent)', color: '#fff', borderRadius: '50%', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>{action}</span>
                </div>
              ))}
            </div>
          )}

          {/* Minimum stock levels */}
          {parsed.minStockLevels && (
            <div style={cardStyle('var(--info)')}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                Minimum Stock Levels (95% Fulfilment)
              </div>
              <pre style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
                {parsed.minStockLevels}
              </pre>
            </div>
          )}

          {/* Customer alerts */}
          {parsed.customerAlerts && (
            <div style={cardStyle('var(--warning)')}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                Customer Alerts
              </div>
              <pre style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
                {parsed.customerAlerts}
              </pre>
            </div>
          )}

          {/* Production recommendation */}
          {parsed.productionRecommendation && (
            <div style={cardStyle('var(--success)')}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                Production Recommendation (Next 7 Days)
              </div>
              <pre style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
                {parsed.productionRecommendation}
              </pre>
            </div>
          )}

          {/* Risk flag */}
          {parsed.riskFlag && (
            <div style={{ ...cardStyle('var(--danger)'), background: 'var(--danger-subtle)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                ⚠ Risk Flag
              </div>
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 500 }}>
                {parsed.riskFlag}
              </p>
            </div>
          )}

          {/* Fallback: show raw if no sections parsed */}
          {parsed.urgentActions.length === 0 && !parsed.riskFlag && (
            <div style={cardStyle()}>
              <pre style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-primary)' }}>
                {parsed.raw}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Report history */}
      {history.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, margin: '0 0 0.5rem' }}>Previous Reports</h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {history.map((item) => (
              <button
                key={item.id}
                onClick={() => viewHistorical(item)}
                style={{
                  fontSize: 'var(--text-xs)',
                  padding: '0.25rem 0.65rem',
                  border: `1px solid ${selectedId === item.id ? 'var(--accent)' : 'var(--border)'}`,
                  color: selectedId === item.id ? 'var(--accent)' : 'var(--text-secondary)',
                  background: selectedId === item.id ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                {formatDate(item.generated_at)}
              </button>
            ))}
          </div>
        </div>
      )}

      {history.length === 0 && !reportText && !isPending && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
          No reports generated yet. Click &ldquo;Generate Report&rdquo; to create the first one.
        </p>
      )}
    </div>
  )
}
