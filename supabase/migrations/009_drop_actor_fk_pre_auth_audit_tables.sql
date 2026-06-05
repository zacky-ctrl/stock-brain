-- ============================================================
-- Stock Brain — Migration 009: Drop actor FKs (pre-auth, audit)
-- ============================================================
-- Extends the pre-auth pattern from migrations 007 and 008 to
-- cover audit and allocation tables that have actor FK columns
-- referencing users(id).
--
-- Without this migration, inserting into stock_corrections,
-- priority_overrides, order_line_amendments, or stock_allocations
-- using DEV_ACTOR_ID (which does not exist in users) will fail
-- with a FK violation.
--
-- Phase 3 will restore these FKs once real auth.users rows exist
-- for every operator. Actor columns stay NOT NULL; the FK is the
-- only part being removed temporarily.
--
-- Tables covered:
--   stock_corrections.corrected_by
--   priority_overrides.overridden_by
--   order_line_amendments.amended_by
--   stock_allocations.allocated_by
--   stock_allocations.deactivated_by  (nullable, but still FK)
-- ============================================================

ALTER TABLE stock_corrections
  DROP CONSTRAINT IF EXISTS stock_corrections_corrected_by_fkey;

ALTER TABLE priority_overrides
  DROP CONSTRAINT IF EXISTS priority_overrides_overridden_by_fkey;

ALTER TABLE order_line_amendments
  DROP CONSTRAINT IF EXISTS order_line_amendments_amended_by_fkey;

ALTER TABLE stock_allocations
  DROP CONSTRAINT IF EXISTS stock_allocations_allocated_by_fkey;

ALTER TABLE stock_allocations
  DROP CONSTRAINT IF EXISTS stock_allocations_deactivated_by_fkey;
