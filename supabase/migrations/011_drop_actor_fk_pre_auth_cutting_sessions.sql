-- ============================================================
-- Stock Brain — Migration 011: Drop actor FKs (pre-auth, cutting sessions)
-- ============================================================
-- Extends the pre-auth pattern from migrations 007, 008, and 009 to
-- cover cutting_sessions, which carries created_by and confirmed_by
-- columns referencing users(id).
--
-- Without this migration, any INSERT or UPDATE on cutting_sessions
-- using DEV_ACTOR_ID (which does not exist in the users table) will
-- fail with a FK violation.
--
-- Migration 008 explicitly deferred this table with the comment:
--   "NOT dropped here (added later when those modules are built):
--    cutting_sessions.created_by / confirmed_by"
-- This migration is that deferred step.
--
-- Phase 3 will:
--   1. Restore these FKs: REFERENCES users(id) ON DELETE RESTRICT
--   2. Set created_by / confirmed_by from auth.uid() in server actions
--   3. Enforce RLS WITH CHECK (created_by = auth.uid())
--
-- Tables covered:
--   cutting_sessions.created_by
--   cutting_sessions.confirmed_by  (nullable — FK still dropped for consistency)
-- ============================================================

ALTER TABLE cutting_sessions
  DROP CONSTRAINT IF EXISTS cutting_sessions_created_by_fkey;

ALTER TABLE cutting_sessions
  DROP CONSTRAINT IF EXISTS cutting_sessions_confirmed_by_fkey;
