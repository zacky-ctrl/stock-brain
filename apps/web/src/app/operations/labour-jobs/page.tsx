import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { LabourJobsClient } from './LabourJobsClient'
import type { JobRow } from './LabourJobsClient'
import Link from 'next/link'

export default async function LabourJobsPage() {
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('labour_jobs')
    .select(`
      id, date_assigned, expected_return_date, actual_return_date, status, notes, created_at,
      labour_units(name, serial_number),
      labour_job_lines(quantity_sent_gross, quantity_returned_gross)
    `)
    .order('date_assigned', { ascending: false })
    .limit(300)

  const jobs = (data ?? []) as unknown as JobRow[]

  return (
    <main className="labour-jobs-page" style={{ padding: '1.5rem 2rem' }}>
      <PageHeader
        title="Labour Jobs"
        actions={
          <Link href="/operations/labour-jobs/new">
            <Button variant="primary">+ New Job</Button>
          </Link>
        }
      />

      {error && (
        <p style={{ color: 'var(--danger)', fontSize: '0.88rem' }}>Error: {error.message}</p>
      )}

      {!error && jobs.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          No labour jobs yet.{' '}
          <Link href="/operations/labour-jobs/new" style={{ color: 'var(--info)' }}>Issue the first job.</Link>
        </p>
      )}

      {jobs.length > 0 && <LabourJobsClient jobs={jobs} />}
    </main>
  )
}
