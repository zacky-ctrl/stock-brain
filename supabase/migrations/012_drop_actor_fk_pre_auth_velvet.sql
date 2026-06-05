-- ============================================================
-- Migration 012: Drop velvet_receipts.created_by FK (pre-auth)
-- ============================================================
-- TEMPORARY pre-auth infrastructure. Phase 3 will:
--   1. Restore FK: REFERENCES users(id) ON DELETE RESTRICT
--   2. Set created_by from auth.uid() in all server actions
--   3. Enforce RLS WITH CHECK (created_by = auth.uid())
--
-- created_by column remains NOT NULL. DEV_ACTOR_ID is used
-- as a placeholder until real auth is wired.
-- ============================================================

ALTER TABLE velvet_receipts
  DROP CONSTRAINT IF EXISTS velvet_receipts_created_by_fkey;
