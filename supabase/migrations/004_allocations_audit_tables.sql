-- ============================================================
-- Stock Brain — Migration 004: Allocations / Audit Tables
-- ============================================================
-- Two categories in this file:
--
-- 1. ALLOCATIONS (stock_allocations)
--    Hard-stored reservations that prevent false availability.
--    The domain layer must check allocations before showing any
--    available_qty figure to any user or report.
--    False availability — showing the same stock as available to
--    multiple parties simultaneously — is the #1 mistake this
--    system is designed to prevent.
--
-- 2. AUDIT TRAIL (stock_corrections, order_line_amendments,
--                  priority_overrides)
--    Every manual override is a typed, attributed, append-only
--    record. There are no silent mutations in Stock Brain.
--    The reason field is NOT NULL and non-empty on every audit
--    table. No override without a reason. No exception.
--
-- Audit tables are append-only by design. The domain layer must
-- never UPDATE or DELETE rows in these tables. To supersede an
-- override, create a new row and deactivate the old one.
--
-- Prerequisite: migrations 001, 002, and 003 must be applied first.
-- ============================================================

-- ============================================================
-- STOCK ALLOCATIONS
-- ============================================================
-- Hard-stored reservations: a committed_qty of a specific stock
-- row is reserved for a specific order_line. This reservation
-- is reflected as committed_qty on the balance table.
--
-- Allocations exist at three stock stages:
--   'ready'    → reserves from ready_stock_balance
--   'wip'      → reserves from a labour_job_line (WIP stock)
--   'cuttings' → reserves from cuttings_stock_balance
--
-- Exactly one of the three stock entity FKs is non-null,
-- determined by stock_stage. The CHECK constraint enforces this
-- structurally so malformed rows cannot exist.
--
-- Deactivation (reassignment or cancellation):
--   Set is_active = false. All three deactivation fields
--   (deactivated_by, deactivated_at, deactivation_reason) must
--   be set together. The CHECK constraint enforces this.
--   Domain layer then decrements committed_qty on the old stock
--   balance row and increments it on the new one.
--
-- Creating a new allocation:
--   Domain layer must SELECT ... FOR UPDATE the balance row,
--   verify available_qty >= allocated_qty, increment committed_qty,
--   and insert this row — all in one transaction.
CREATE TABLE stock_allocations (
  id                       UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_line_id            UUID    NOT NULL REFERENCES order_lines(id) ON DELETE RESTRICT,
  stock_stage              TEXT    NOT NULL
    CHECK (stock_stage IN ('ready', 'wip', 'cuttings')),
  -- Exactly one of these three will be non-null
  ready_stock_balance_id   UUID    REFERENCES ready_stock_balance(id) ON DELETE RESTRICT,
  labour_job_line_id       UUID    REFERENCES labour_job_lines(id) ON DELETE RESTRICT,
  cuttings_stock_balance_id UUID   REFERENCES cuttings_stock_balance(id) ON DELETE RESTRICT,
  allocated_qty            NUMERIC(10,3) NOT NULL CHECK (allocated_qty > 0),
  -- Lifecycle
  is_active                BOOLEAN NOT NULL DEFAULT true,
  allocated_by             UUID    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  allocated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Deactivation: all three fields must be populated together
  deactivated_by           UUID    REFERENCES users(id) ON DELETE RESTRICT,
  deactivated_at           TIMESTAMPTZ,
  deactivation_reason      TEXT,
  -- stock_stage must match exactly one non-null entity FK
  CONSTRAINT allocation_entity_matches_stage CHECK (
    CASE stock_stage
      WHEN 'ready' THEN
        ready_stock_balance_id IS NOT NULL
        AND labour_job_line_id IS NULL
        AND cuttings_stock_balance_id IS NULL
      WHEN 'wip' THEN
        labour_job_line_id IS NOT NULL
        AND ready_stock_balance_id IS NULL
        AND cuttings_stock_balance_id IS NULL
      WHEN 'cuttings' THEN
        cuttings_stock_balance_id IS NOT NULL
        AND ready_stock_balance_id IS NULL
        AND labour_job_line_id IS NULL
    END
  ),
  -- Active rows have no deactivation fields; inactive rows have all three
  CONSTRAINT deactivation_fields_complete CHECK (
    (is_active = true
      AND deactivated_by IS NULL
      AND deactivated_at IS NULL
      AND deactivation_reason IS NULL)
    OR
    (is_active = false
      AND deactivated_by IS NOT NULL
      AND deactivated_at IS NOT NULL
      AND deactivation_reason IS NOT NULL
      AND length(trim(deactivation_reason)) > 0)
  )
);

-- Planning engine: find all active allocations for a given order line
CREATE INDEX idx_stock_allocations_order_line_active
  ON stock_allocations (order_line_id)
  WHERE is_active = true;

-- Balance check: sum active allocated_qty for a ready stock balance row
CREATE INDEX idx_stock_allocations_ready_active
  ON stock_allocations (ready_stock_balance_id)
  WHERE is_active = true AND stock_stage = 'ready';

-- Balance check: sum active allocated_qty for a cuttings balance row
CREATE INDEX idx_stock_allocations_cuttings_active
  ON stock_allocations (cuttings_stock_balance_id)
  WHERE is_active = true AND stock_stage = 'cuttings';

-- Balance check: sum active allocated_qty for a labour job line (WIP)
CREATE INDEX idx_stock_allocations_wip_active
  ON stock_allocations (labour_job_line_id)
  WHERE is_active = true AND stock_stage = 'wip';

ALTER TABLE stock_allocations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STOCK CORRECTIONS
-- ============================================================
-- Manual adjustment to any stock quantity in any stock balance
-- table. Every adjustment creates one row here before the
-- balance is changed. The domain layer writes this record and
-- the balance update in a single transaction.
--
-- There are no exceptions to this rule. A stock change without
-- a corresponding stock_corrections row is a system integrity
-- violation. The domain layer must make this structurally
-- impossible by routing all balance mutations through one path.
--
-- reason is NOT NULL and must be non-empty. This is a hard
-- constraint enforced at the database level.
--
-- old_value and new_value are recorded at write time by the
-- domain layer. They must reflect the actual before/after state,
-- not be inferred or approximated after the fact.
--
-- delta_value is generated: new_value - old_value.
--   Positive = stock was increased (e.g. physical count found more)
--   Negative = stock was decreased (e.g. wastage, loss discovered)
CREATE TABLE stock_corrections (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  corrected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  corrected_by   UUID    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- Which stock stage was corrected
  stock_stage    TEXT    NOT NULL
    CHECK (stock_stage IN ('velvet', 'cuttings', 'wip', 'ready')),
  -- The balance table and row that was corrected
  entity_table   TEXT    NOT NULL,  -- table name for documentation and query context
  entity_id      UUID    NOT NULL,  -- primary key of the corrected balance row
  -- What changed
  field_corrected TEXT   NOT NULL,  -- column name that was adjusted
  old_value      NUMERIC(10,3) NOT NULL,
  new_value      NUMERIC(10,3) NOT NULL,
  delta_value    NUMERIC(10,3) GENERATED ALWAYS AS (new_value - old_value) STORED,
  -- Why it changed — mandatory, must not be blank
  reason         TEXT    NOT NULL CHECK (length(trim(reason)) > 0),
  notes          TEXT
  -- Append-only: no updated_at, no updates, no deletes, ever
);

CREATE INDEX idx_stock_corrections_entity
  ON stock_corrections (entity_table, entity_id, corrected_at DESC);

CREATE INDEX idx_stock_corrections_corrected_by
  ON stock_corrections (corrected_by, corrected_at DESC);

ALTER TABLE stock_corrections ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ORDER LINE AMENDMENTS
-- ============================================================
-- Audit record for any change to the fields of an order_line
-- after the line has been created. Most critical: ordered_qty
-- must not decrease below already-dispatched quantity.
--
-- Covers: ordered_qty, closed_qty, promised_date, notes.
-- Uses TEXT for old_value/new_value to accommodate both numeric
-- quantities and date values without separate columns.
--
-- Domain layer must:
--   1. Write this record with old and new values
--   2. Validate the change (e.g. ordered_qty >= dispatched_qty)
--   3. Apply the change to order_lines
--   All three steps in one transaction.
--
-- Append-only. The history of amendments on a line must be
-- complete and unmodified.
CREATE TABLE order_line_amendments (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  amended_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  amended_by    UUID    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_line_id UUID    NOT NULL REFERENCES order_lines(id) ON DELETE RESTRICT,
  field_amended TEXT    NOT NULL,   -- e.g. 'ordered_qty', 'closed_qty', 'promised_date'
  old_value     TEXT    NOT NULL,   -- TEXT supports numeric and date fields
  new_value     TEXT    NOT NULL,
  reason        TEXT    NOT NULL CHECK (length(trim(reason)) > 0)
  -- Append-only: no updated_at, no updates, no deletes, ever
);

CREATE INDEX idx_order_line_amendments_line
  ON order_line_amendments (order_line_id, amended_at DESC);

ALTER TABLE order_line_amendments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PRIORITY OVERRIDES
-- ============================================================
-- Admin manual priority override for an order line. Overrides
-- rank above all computed priority factors (customer weight,
-- promised date, order sequence) in the planning engine.
--
-- priority_value: lower = higher priority (1 = top of queue).
-- A new override row supersedes any prior active override for
-- the same order_line. Do not UPDATE existing rows to supersede;
-- instead: set is_active = false on the old row and INSERT a new one.
--
-- expires_at: NULL = permanent until explicitly superseded.
--             Set to a date when the override should lift automatically.
--             Domain layer checks this at planning time.
--
-- When a priority override is created or deactivated, domain layer
-- must update order_lines.has_priority_override to reflect the
-- current state. This flag allows planning queries to filter
-- efficiently without always joining priority_overrides.
--
-- reason is NOT NULL and non-empty. No silent reprioritisation.
CREATE TABLE priority_overrides (
  id                      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  overridden_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  overridden_by           UUID    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_line_id           UUID    NOT NULL REFERENCES order_lines(id) ON DELETE RESTRICT,
  -- Priority value: 1 = top of queue, higher numbers = lower priority
  priority_value          INTEGER NOT NULL CHECK (priority_value > 0),
  previous_priority_value INTEGER,   -- the rank before this override; informational
  reason                  TEXT    NOT NULL CHECK (length(trim(reason)) > 0),
  expires_at              DATE,       -- NULL = permanent until superseded
  is_active               BOOLEAN NOT NULL DEFAULT true
  -- Append-only: supersede by inserting a new row, not by updating this one
);

-- Planning engine: find the current active override for an order line
-- (most recent active override per line)
CREATE INDEX idx_priority_overrides_line_active
  ON priority_overrides (order_line_id, overridden_at DESC)
  WHERE is_active = true;

ALTER TABLE priority_overrides ENABLE ROW LEVEL SECURITY;
