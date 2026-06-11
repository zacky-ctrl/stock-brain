-- ── Performance indexes for hot query paths ──────────────────────────────
--
-- Every planning fetch runs:
--   SELECT id FROM dispatch_events WHERE status = 'confirmed'
--   SELECT ... FROM dispatch_lines WHERE dispatch_event_id IN (...)
--   SELECT id FROM labour_jobs WHERE status NOT IN (...)
--   SELECT ... FROM labour_job_lines WHERE labour_job_id IN (...)
--
-- None of those filter columns had an index. These indexes address
-- the most frequently executed and largest scans in the planning + orders
-- code paths. All are CREATE INDEX IF NOT EXISTS so they are safe to run
-- against a live database.

-- dispatch_events(status)
-- Planning fetcher fetches confirmed event IDs on every page load.
-- Growing table: one row per dispatch event, queried on every planning hit.
CREATE INDEX IF NOT EXISTS idx_dispatch_events_status
  ON dispatch_events (status);

-- dispatch_lines(dispatch_event_id)
-- After fetching confirmed event IDs, every fetch joins back to lines
-- with .in('dispatch_event_id', confirmedIds). Only order_line_id was indexed.
CREATE INDEX IF NOT EXISTS idx_dispatch_lines_dispatch_event_id
  ON dispatch_lines (dispatch_event_id);

-- labour_jobs(status)
-- Planning fetcher selects active job IDs with NOT IN status filter.
-- Partial index keeps it small — only active/open jobs are indexed.
CREATE INDEX IF NOT EXISTS idx_labour_jobs_status_active
  ON labour_jobs (status)
  WHERE status NOT IN ('returned_complete', 'cancelled_recalled');

-- labour_job_lines(labour_job_id)
-- Planning fetcher fetches WIP lines by active job IDs (.in('labour_job_id', activeJobIds)).
-- No index existed on this FK column.
CREATE INDEX IF NOT EXISTS idx_labour_job_lines_job_id
  ON labour_job_lines (labour_job_id);

-- sales_invoices(created_at)
-- Invoices page orders by created_at DESC. Covers the ORDER BY in the
-- .order('created_at', { ascending: false }).limit(100) fetch.
CREATE INDEX IF NOT EXISTS idx_sales_invoices_created_at
  ON sales_invoices (created_at DESC);
