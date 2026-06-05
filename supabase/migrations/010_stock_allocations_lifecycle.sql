-- ============================================================
-- Stock Brain — Migration 010: stock_allocations lifecycle columns
-- ============================================================
-- The original stock_allocations table (migration 004) used a
-- single is_active boolean + deactivated_by/at/reason for ALL
-- deactivation types. This migration adds a status discriminator
-- and the columns needed to audit the two distinct deactivation
-- paths: release and reassignment.
--
-- New columns:
--   status            — discriminates active / released / reassigned
--   released_at       — timestamp of a release event
--   released_by       — actor who released (pre-auth: no FK, see below)
--   reassigned_from_id — self-reference for reassignment audit chain
--   reassigned_by     — actor who reassigned (pre-auth: no FK, see below)
--
-- The old deactivation_fields_complete CHECK constraint is replaced
-- by allocation_lifecycle_complete, which enforces:
--   active      → none of the deactivation fields are set
--   released    → deactivated_by/at/reason + released_by + released_at
--   reassigned  → deactivated_by/at/reason + reassigned_by
--
-- PRE-AUTH NOTE:
--   released_by and reassigned_by are intentionally defined WITHOUT
--   FK references to users(id). This is the same pre-auth pattern
--   used in migrations 007–009. Phase 3 will:
--     ALTER TABLE stock_allocations
--       ADD CONSTRAINT stock_allocations_released_by_fkey
--       FOREIGN KEY (released_by) REFERENCES users(id) ON DELETE RESTRICT;
--     (same for reassigned_by)
--   Actor columns stay NOT NULL when populated (enforced by CHECK).
--   They are DB-nullable only because active rows have no actor value.
--
-- Prerequisite: migrations 001–009 must be applied first.
-- ============================================================

-- 1. Add status column (active by default for existing rows)
ALTER TABLE stock_allocations
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'released', 'reassigned'));

-- 2. Add released_at (nullable; required when status = 'released')
ALTER TABLE stock_allocations
  ADD COLUMN released_at TIMESTAMPTZ;

-- 3. Add released_by (nullable at column level; required when status = 'released')
--    No FK reference — pre-auth temporary. Phase 3 adds FK.
ALTER TABLE stock_allocations
  ADD COLUMN released_by UUID;

-- 4. Add reassigned_from_id (self-reference for audit chain; nullable)
--    When a reservation is reassigned, the new row links back to the
--    old row via this column, creating a traceable reassignment chain.
ALTER TABLE stock_allocations
  ADD COLUMN reassigned_from_id UUID REFERENCES stock_allocations(id) ON DELETE RESTRICT;

-- 5. Add reassigned_by (nullable at column level; required when status = 'reassigned')
--    No FK reference — pre-auth temporary. Phase 3 adds FK.
ALTER TABLE stock_allocations
  ADD COLUMN reassigned_by UUID;

-- 6. Enforce status consistency with is_active
--    status = 'active' must match is_active = true, and vice versa.
--    This is structural insurance against divergence between the two fields.
ALTER TABLE stock_allocations
  ADD CONSTRAINT status_matches_is_active CHECK (
    (status = 'active' AND is_active = true)
    OR (status IN ('released', 'reassigned') AND is_active = false)
  );

-- 7. Drop old deactivation_fields_complete and replace with lifecycle version
ALTER TABLE stock_allocations
  DROP CONSTRAINT deactivation_fields_complete;

ALTER TABLE stock_allocations
  ADD CONSTRAINT allocation_lifecycle_complete CHECK (
    -- Active rows: none of the deactivation fields are populated
    (status = 'active'
      AND deactivated_by IS NULL
      AND deactivated_at IS NULL
      AND deactivation_reason IS NULL
      AND released_by IS NULL
      AND released_at IS NULL
      AND reassigned_by IS NULL)
    OR
    -- Released rows: deactivation audit trail + release-specific fields
    (status = 'released'
      AND deactivated_by IS NOT NULL
      AND deactivated_at IS NOT NULL
      AND deactivation_reason IS NOT NULL
      AND length(trim(deactivation_reason)) > 0
      AND released_by IS NOT NULL
      AND released_at IS NOT NULL)
    OR
    -- Reassigned rows: deactivation audit trail + reassignment actor
    -- reassigned_from_id is set on the NEW row, not this one
    (status = 'reassigned'
      AND deactivated_by IS NOT NULL
      AND deactivated_at IS NOT NULL
      AND deactivation_reason IS NOT NULL
      AND length(trim(deactivation_reason)) > 0
      AND reassigned_by IS NOT NULL)
  );
