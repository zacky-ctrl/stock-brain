-- ============================================================
-- PLANNING OVERRIDES
-- ============================================================
-- Admin override table for the business transition period.
-- Allows an admin to unblock a planning line when physical stock
-- exists but has not yet been entered into the system.
--
-- Every override is visible in planning as a warning flag.
-- Override does NOT change underlying stock numbers.
-- When physical stock is later entered correctly, the override
-- is manually resolved (or auto-resolved by domain layer).
--
-- This is pre-auth infrastructure. Actor FK constraints are
-- intentionally dropped below — auth is Phase 3.

CREATE TABLE planning_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_line_id   UUID NOT NULL REFERENCES order_lines(id) ON DELETE CASCADE,
  override_type   TEXT NOT NULL
                    CHECK (override_type IN (
                      'CUTTINGS_OVERRIDE',
                      'READY_STOCK_OVERRIDE',
                      'VELVET_OVERRIDE',
                      'GENERAL_OVERRIDE'
                    )),
  reason          TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_by      UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID,
  is_active       BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_planning_overrides_order_line
  ON planning_overrides (order_line_id, is_active);

ALTER TABLE planning_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_access" ON planning_overrides
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Drop actor FKs — pre-auth: no auth.users table linked yet.
ALTER TABLE planning_overrides
  DROP CONSTRAINT IF EXISTS planning_overrides_created_by_fkey;

ALTER TABLE planning_overrides
  DROP CONSTRAINT IF EXISTS planning_overrides_resolved_by_fkey;
