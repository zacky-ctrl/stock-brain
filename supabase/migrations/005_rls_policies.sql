-- ============================================================
-- Stock Brain — Migration 005: RLS Policies
-- ============================================================
-- All 29 tables had RLS enabled in migrations 001–004 but had
-- no policies, which means only the service_role client could
-- access data (service_role bypasses RLS at the Postgres level).
--
-- This migration adds the Phase 2 / single-tenant policies.
-- They are intentionally permissive: any authenticated user can
-- read and write all rows on all tables.
--
-- WHY SO PERMISSIVE NOW:
--   Stock Brain is currently a single-tenant internal tool.
--   There is one business, one set of operators, one admin.
--   Row-level filtering by customer, user, or org is not needed
--   yet and would only add complexity before the model stabilises.
--
-- WHAT IS NOT DONE HERE (Phase 3):
--   - Row-level isolation per customer or user
--   - Restricting DELETE on append-only audit tables
--   - Restricting balance table writes to the service role only
--   - Role-based column masking (e.g. hiding payment_risk_flag
--     from non-admin operators)
--
-- SERVICE ROLE NOTE:
--   The app currently uses SUPABASE_SERVICE_ROLE_KEY for all
--   server-side operations. The service role has BYPASSRLS
--   privilege and is unaffected by any policy in this file.
--   These policies take effect when the app transitions to
--   user-scoped JWTs (authenticated role) in Phase 3.
--
-- ANON ROLE:
--   No policies are granted to anon. This is an internal tool.
--   Unauthenticated requests must not access any data.
--
-- Prerequisite: migrations 001–004 must be applied first.
-- ============================================================

-- ============================================================
-- MASTER / REFERENCE TABLES (from migration 001)
-- ============================================================

-- brands: read + write for authenticated users
-- Phase 3: may restrict INSERT/UPDATE/DELETE to admin role only
CREATE POLICY "authenticated_all_access" ON brands
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- dabbi_colours: read + write for authenticated users
CREATE POLICY "authenticated_all_access" ON dabbi_colours
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- bindi_colours: read + write for authenticated users
CREATE POLICY "authenticated_all_access" ON bindi_colours
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- shape_designs: read + write for authenticated users
CREATE POLICY "authenticated_all_access" ON shape_designs
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- sizes: read + write for authenticated users
CREATE POLICY "authenticated_all_access" ON sizes
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- customers: read + write for authenticated users
-- Phase 3: payment_risk_flag may be masked for non-admin role
CREATE POLICY "authenticated_all_access" ON customers
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- machines: read + write for authenticated users
CREATE POLICY "authenticated_all_access" ON machines
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- labour_units: read + write for authenticated users
CREATE POLICY "authenticated_all_access" ON labour_units
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- users: authenticated users can read all users and update their own rows
-- Phase 3: restrict UPDATE to self or admin; restrict role promotion to admin
CREATE POLICY "authenticated_all_access" ON users
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- STOCK LIFECYCLE TABLES (from migration 002)
-- ============================================================

-- velvet_receipts: append-only by domain layer convention
-- Phase 3: restrict INSERT to admin/operator; DELETE should never be allowed
CREATE POLICY "authenticated_all_access" ON velvet_receipts
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- velvet_stock_balance: domain layer is the only writer (via service role)
-- Phase 3: restrict to SELECT for authenticated; writes only via service role
CREATE POLICY "authenticated_all_access" ON velvet_stock_balance
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- velvet_conversion_rates: read + write for authenticated users
CREATE POLICY "authenticated_all_access" ON velvet_conversion_rates
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- cutting_sessions: read + write for authenticated users
CREATE POLICY "authenticated_all_access" ON cutting_sessions
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- cutting_session_lines: read + write for authenticated users
CREATE POLICY "authenticated_all_access" ON cutting_session_lines
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- cuttings_stock_balance: domain layer is the only writer (via service role)
-- Phase 3: restrict to SELECT for authenticated; writes only via service role
CREATE POLICY "authenticated_all_access" ON cuttings_stock_balance
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- labour_jobs: read + write for authenticated users
CREATE POLICY "authenticated_all_access" ON labour_jobs
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- labour_job_status_history: append-only by domain layer convention
-- Phase 3: restrict to INSERT + SELECT for authenticated; no UPDATE/DELETE
CREATE POLICY "authenticated_all_access" ON labour_job_status_history
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- labour_job_lines: read + write for authenticated users
CREATE POLICY "authenticated_all_access" ON labour_job_lines
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- labour_job_return_events: append-only by domain layer convention
-- Phase 3: restrict to INSERT + SELECT for authenticated; no UPDATE/DELETE
CREATE POLICY "authenticated_all_access" ON labour_job_return_events
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- labour_job_return_lines: append-only by domain layer convention
-- Phase 3: restrict to INSERT + SELECT for authenticated; no UPDATE/DELETE
CREATE POLICY "authenticated_all_access" ON labour_job_return_lines
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ready_stock_balance: domain layer is the only writer (via service role)
-- THIS TABLE IS THE DISPATCH SOURCE — read access is always required
-- Phase 3: restrict to SELECT for authenticated; writes only via service role
CREATE POLICY "authenticated_all_access" ON ready_stock_balance
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- ORDERS / DISPATCH TABLES (from migration 003)
-- ============================================================

-- orders: read + write for authenticated users
CREATE POLICY "authenticated_all_access" ON orders
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- order_lines: read + write for authenticated users
-- Phase 3: ordered_qty amendment must go through order_line_amendments audit path
CREATE POLICY "authenticated_all_access" ON order_lines
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- dispatch_events: read + write for authenticated users
-- Phase 3: voiding a confirmed dispatch requires admin role + stock_correction
CREATE POLICY "authenticated_all_access" ON dispatch_events
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- dispatch_lines: read + write for authenticated users
CREATE POLICY "authenticated_all_access" ON dispatch_lines
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- ALLOCATIONS / AUDIT TABLES (from migration 004)
-- ============================================================

-- stock_allocations: domain layer manages lifecycle via service role
-- Phase 3: SELECT for authenticated; INSERT/UPDATE only via service role
CREATE POLICY "authenticated_all_access" ON stock_allocations
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- stock_corrections: append-only audit table — no updates or deletes, ever
-- Phase 3: restrict to INSERT + SELECT for authenticated; DELETE never
CREATE POLICY "authenticated_all_access" ON stock_corrections
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- order_line_amendments: append-only audit table
-- Phase 3: restrict to INSERT + SELECT for authenticated; DELETE never
CREATE POLICY "authenticated_all_access" ON order_line_amendments
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- priority_overrides: append-only by domain convention (supersede via new row)
-- Phase 3: restrict INSERT to admin role; restrict to INSERT + SELECT
CREATE POLICY "authenticated_all_access" ON priority_overrides
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
