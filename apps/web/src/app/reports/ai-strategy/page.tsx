import { getReportHistory } from './actions'
import { AiStrategyClient } from './AiStrategyClient'
import { ReportHeader } from '@/components/reports/ReportHeader'

export default async function AiStrategyPage() {
  const history = await getReportHistory()
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <main className="print-portrait" style={{ padding: '1.5rem 2rem', maxWidth: '1000px' }}>
      <ReportHeader
        reportName="AI STRATEGY REPORT"
        filters={[
          { label: 'Note', value: 'AI-generated. Review before acting.' },
          { label: 'Date', value: today },
        ]}
      />
      <AiStrategyClient initialHistory={history} />

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 1cm; }
        }
      `}</style>
    </main>
  )
}
