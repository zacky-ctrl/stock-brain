-- ============================================================
-- Stock Brain — Migration 007: Drop FK on created_by (pre-auth)
-- ============================================================
-- The created_by column on orders and order_lines references
-- users(id), which in turn references auth.users(id). Until
-- Phase 3 (Supabase Auth), there is no authenticated user to
-- supply a valid UUID, and inserting a seed dev-user row into
-- auth.users is not viable outside of the auth lifecycle.
--
-- This migration drops the FK constraint while preserving NOT NULL.
-- Server actions supply a configurable DEV_ACTOR_ID (env variable)
-- as the pre-auth actor. The value does not need to exist in users
-- once the FK is removed.
--
-- This supersedes migration 006 (make created_by nullable), which
-- was written but never applied. Do NOT apply migration 006.
--
-- Phase 3 will:
--   1. Add Supabase Auth users for each operator
--   2. Set created_by = auth.uid() in all server actions
--   3. Re-add the FK: REFERENCES users(id) ON DELETE RESTRICT
--   4. Enforce RLS WITH CHECK (created_by = auth.uid())
-- ============================================================

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_created_by_fkey;

ALTER TABLE order_lines
  DROP CONSTRAINT IF EXISTS order_lines_created_by_fkey;
