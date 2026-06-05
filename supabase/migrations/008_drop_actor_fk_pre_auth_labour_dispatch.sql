-- ============================================================
-- Stock Brain — Migration 008: Drop actor FKs (pre-auth)
-- ============================================================
-- Extends the pre-auth pattern established in migration 007
-- to cover the remaining tables that carry actor columns
-- referencing users(id).
--
-- Without this migration, any INSERT into labour_jobs,
-- labour_job_status_history, labour_job_return_events, or
-- dispatch_events using DEV_ACTOR_ID (which does not exist in
-- the users table) will fail with a FK violation.
--
-- Phase 3 will:
--   1. Restore these FKs: REFERENCES users(id) ON DELETE RESTRICT
--   2. Set actor columns from auth.uid() in all server actions
--   3. Enforce RLS WITH CHECK (actor = auth.uid())
--
-- NOT dropped here (added later when those modules are built):
--   velvet_receipts.created_by
--   cutting_sessions.created_by / confirmed_by
--   stock_allocations.allocated_by / deactivated_by
--   stock_corrections.corrected_by
--   order_line_amendments.amended_by
--   priority_overrides.overridden_by
-- ============================================================

ALTER TABLE labour_jobs
  DROP CONSTRAINT IF EXISTS labour_jobs_created_by_fkey;

ALTER TABLE labour_job_status_history
  DROP CONSTRAINT IF EXISTS labour_job_status_history_changed_by_fkey;

ALTER TABLE labour_job_return_events
  DROP CONSTRAINT IF EXISTS labour_job_return_events_recorded_by_fkey;

ALTER TABLE dispatch_events
  DROP CONSTRAINT IF EXISTS dispatch_events_dispatched_by_fkey;

ALTER TABLE dispatch_events
  DROP CONSTRAINT IF EXISTS dispatch_events_confirmed_by_fkey;
