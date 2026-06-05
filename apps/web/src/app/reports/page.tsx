'use client'

import Link from 'next/link'
import { Printer } from 'lucide-react'

type ReportCard = {
  href: string
  name: string
  description: string
  filterTags: string[]
  isKeyReport?: boolean
}

type ReportGroup = {
  title: string
  subtitle: string
  reports: ReportCard[]
}

const REPORT_GROUPS: ReportGroup[] = [
  {
    title: 'DAILY OPERATIONS',
    subtitle: 'Run every morning before production starts',
    reports: [
      {
        href: '/reports/labour-issue',
        name: 'Labour Issue Sheet',
        description: 'Cuttings ready to issue to labour today. Sorted by customer priority.',
        filterTags: ['Customer', 'Design', 'CLR', 'Size', 'Date'],
      },
      {
        href: '/reports/cutting-required',
        name: 'Machine Cutting Required',
        description: 'SKUs with no cuttings needing machine cutting. Includes velvet requirement per design.',
        filterTags: ['Design', 'CLR', 'Date Range', 'Machine'],
      },
      {
        href: '/reports/stock-position',
        name: 'Daily Stock Position',
        description: 'Full stock snapshot across Velvet, Cuttings, WIP, and Ready.',
        filterTags: ['Stage', 'Design', 'CLR', 'Snapshot Date'],
      },
    ],
  },
  {
    title: 'WEEKLY REVIEW',
    subtitle: 'Review weekly to manage orders and production flow',
    reports: [
      {
        href: '/reports/orders-aging',
        name: 'Open Orders Aging',
        description: 'All open and partially-dispatched orders with age and fulfilment percentage.',
        filterTags: ['Customer', 'Age Bucket', 'Status', 'Date Range'],
      },
      {
        href: '/reports/production-pipeline',
        name: 'Production Pipeline',
        description: 'End-to-end view: cuttings → labour → ready → open demand.',
        filterTags: ['Design', 'CLR', 'Stage', 'Date Range'],
      },
      {
        href: '/reports/labour-performance',
        name: 'Labour Performance',
        description: 'Labour unit stats: jobs completed, avg return days, issued vs returned, overdue.',
        filterTags: ['Labour Unit', 'Status', 'Date Range'],
      },
      {
        href: '/reports/customer-summary',
        name: 'Customer Order Summary',
        description: 'Order history and fulfilment rates. Single customer or cross-customer view.',
        filterTags: ['Customer', 'Status', 'Date Range'],
      },
      {
        href: '/reports/dispatch-history',
        name: 'Dispatch History',
        description: 'All confirmed dispatches with totals and substitution/extra/short counts.',
        filterTags: ['Customer', 'Date Range', 'Reference'],
      },
    ],
  },
  {
    title: 'BUSINESS INTELLIGENCE',
    subtitle: 'Strategic reports for planning and decision-making',
    reports: [
      {
        href: '/reports/shortage-summary',
        name: 'Shortage Summary',
        description: 'All SKUs with unmet demand, action required, and velvet requirements for cutting.',
        filterTags: ['Customer', 'Design', 'CLR', 'Size', 'Shortage Type'],
        isKeyReport: true,
      },
      {
        href: '/reports/stock-movement',
        name: 'Stock Movement',
        description: 'Movement log across all stages: receipts, cuts, labour issues, and dispatches.',
        filterTags: ['Stage', 'Design', 'CLR', 'Date Range'],
      },
      {
        href: '/reports/fulfilment',
        name: 'Fulfilment Deep Dive',
        description: 'Customer scorecard, SKU analysis, substitution log, and chronic shortage flags.',
        filterTags: ['Customer', 'Line Type', 'Date Range'],
      },
      {
        href: '/reports/ai-strategy',
        name: 'AI Strategy Report',
        description: 'Claude-powered health score, urgent actions, minimum stock levels, and risk flags.',
        filterTags: ['AI-generated', 'Last 60 days'],
      },
    ],
  },
]

function ReportCard({ report }: { report: ReportCard }) {
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: report.isKeyReport ? '1px solid var(--accent)' : '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-md)',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        position: 'relative',
      }}
    >
      {report.isKeyReport && (
        <div style={{ position: 'absolute', top: '-1px', right: '1rem', transform: 'translateY(-50%)', background: 'var(--accent)', color: '#fff', fontSize: 'var(--text-xs)', fontWeight: 700, padding: '0.1rem 0.5rem', borderRadius: 'var(--radius-sm)', letterSpacing: '0.06em' }}>
          KEY REPORT
        </div>
      )}
      <div>
        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.3rem' }}>
          {report.name}
        </h3>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
          {report.description}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {report.filterTags.map((tag) => (
          <span
            key={tag}
            style={{ fontSize: 'var(--text-xs)', padding: '0.15rem 0.5rem', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}
          >
            {tag}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
        <Link
          href={report.href}
          style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.45rem 1rem', fontSize: 'var(--text-sm)', fontWeight: 600, background: 'var(--accent)', color: '#fff', borderRadius: 'var(--radius-sm)', textDecoration: 'none' }}
        >
          Open Report
        </Link>
        <Link
          href={`${report.href}?print=1`}
          onClick={(e) => { e.preventDefault(); window.open(report.href, '_blank')?.print() }}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.45rem 0.75rem', fontSize: 'var(--text-sm)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)', textDecoration: 'none', background: 'none', cursor: 'pointer' }}
          title="Quick print"
        >
          <Printer size={15} />
        </Link>
      </div>
    </div>
  )
}

export default function ReportsLandingPage() {
  return (
    <main style={{ padding: '1.5rem 2rem', maxWidth: '1400px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--accent-bright)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
          NIRANKARI BINDI
        </div>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, margin: '0 0 0.35rem' }}>Reports</h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0 }}>
          12 printable operational reports. Select a report to open with filters.
        </p>
      </div>

      {REPORT_GROUPS.map((group) => (
        <div key={group.title} style={{ marginBottom: '2.5rem' }}>
          <div style={{ marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.2rem', letterSpacing: '0.06em' }}>
              {group.title}
            </h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
              {group.subtitle}
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '1rem',
            }}
          >
            {group.reports.map((report) => (
              <ReportCard key={report.href} report={report} />
            ))}
          </div>
        </div>
      ))}
    </main>
  )
}
