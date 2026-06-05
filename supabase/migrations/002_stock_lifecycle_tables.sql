-- ============================================================
-- Stock Brain — Migration 002: Stock Lifecycle Tables
-- ============================================================
-- Models the full production journey from velvet receipt to
-- finished goods ready for dispatch.
--
-- Stage sequence:
--   Velvet → Cutting Session → Cuttings Stock
--   → Labour Job (WIP) → Labour Return → Ready Stock
--
-- SKU identity changes at the labour job boundary:
--
--   CUTTINGS STAGE key: (shape_design_id, bindi_colour_id, size_id)
--   No brand. No dabbi_colour. This is a hard structural invariant.
--   Columns for brand or dabbi_colour are intentionally absent from
--   cuttings-stage tables. Adding them would be a schema error.
--
--   FINISHED GOODS key: (shape_design_id, bindi_colour_id, size_id,
--                         dabbi_colour_id, brand_id)
--   Brand and dabbi_colour are assigned at labour job issue time
--   because packaging instructions are set per order at that point.
--
-- Balance tables (cuttings_stock_balance, ready_stock_balance):
--   - Maintained exclusively by the domain layer.
--   - available_qty is a GENERATED column: always correct, never stale.
--   - committed_qty is maintained by the domain layer as allocations
--     are created or deactivated. SELECT ... FOR UPDATE must be used
--     when reading a balance row before modifying it to prevent
--     concurrent over-allocation.
--   - Direct SQL updates to these tables outside the domain layer
--     are prohibited. All corrections go through stock_corrections.
--
-- All quantities are in GROSS (the primary commercial unit).
-- Velvet is tracked in BUNDLES. NUMERIC(10,3) supports the fractional
-- gross values that arise in labour return variance scenarios.
--
-- Prerequisite: migration 001 must be applied first.
-- ============================================================

-- ============================================================
-- VELVET RECEIPTS
-- ============================================================
-- Append-only event log of velvet stock arrivals.
-- Each receipt increases velvet_stock_balance.bundles_on_hand.
-- Do not modify rows after creation. Corrections go through
-- stock_corrections (migration 004).
CREATE TABLE velvet_receipts (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_date      DATE    NOT NULL,
  bundles_received  NUMERIC(10,3) NOT NULL CHECK (bundles_received > 0),
  supplier          TEXT,    -- free text; future FK to suppliers table (Phase 3+)
  reference         TEXT,    -- supplier invoice or receipt number
  notes             TEXT,
  created_by        UUID    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  -- Append-only: no updated_at. Corrections via stock_corrections.
);

ALTER TABLE velvet_receipts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- VELVET STOCK BALANCE
-- ============================================================
-- Running balance of velvet on hand, maintained by domain layer.
-- Increases when velvet_receipts are recorded.
-- Decreases when cutting_sessions are confirmed (velvet consumed).
--
-- velvet_type supports future multi-velvet scenarios.
-- Currently only 'standard' exists; do not hardcode this assumption
-- in domain logic — always look up by velvet_type.
--
-- bundles_on_hand >= 0 enforced at DB level as a second defence.
-- Domain layer enforces this first.
CREATE TABLE velvet_stock_balance (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  velvet_type      TEXT    NOT NULL DEFAULT 'standard',
  bundles_on_hand  NUMERIC(10,3) NOT NULL DEFAULT 0
    CHECK (bundles_on_hand >= 0),
  last_updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (velvet_type)
);

-- Seed the initial balance row. bundles_on_hand starts at 0;
-- domain layer updates it as receipts and cutting sessions are recorded.
INSERT INTO velvet_stock_balance (velvet_type, bundles_on_hand)
VALUES ('standard', 0);

ALTER TABLE velvet_stock_balance ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- VELVET CONVERSION RATES
-- ============================================================
-- Known fixed conversion: how many gross of cut bindi does one
-- bundle of velvet produce for a given (shape_design, size)?
-- Bindi colour does NOT affect cutting yield, so it is absent
-- from the composite key here.
--
-- This table enables the planning engine to answer:
--   "How many velvet bundles do we need to cover this cuttings shortfall?"
-- It also enables machine cutting quantity recommendations.
--
-- One active rate per (shape_design, size). To update a rate:
-- set is_active = false on the old row, insert a new row.
-- This preserves history without modifying past records.
CREATE TABLE velvet_conversion_rates (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  shape_design_id  UUID    NOT NULL REFERENCES shape_designs(id) ON DELETE RESTRICT,
  size_id          UUID    NOT NULL REFERENCES sizes(id) ON DELETE RESTRICT,
  gross_per_bundle NUMERIC(10,3) NOT NULL CHECK (gross_per_bundle > 0),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shape_design_id, size_id)
  -- One active rate per (shape, size). Uniqueness is on the full pair,
  -- not filtered by is_active, because concurrent active rates for
  -- the same pair would create planning ambiguity.
);

CREATE TRIGGER trg_velvet_conversion_rates_updated_at
  BEFORE UPDATE ON velvet_conversion_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE velvet_conversion_rates ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- CUTTING SESSIONS
-- ============================================================
-- A machine cutting event: velvet in, cut bindis out.
-- Per-SKU output detail lives in cutting_session_lines.
--
-- status flow:
--   draft → confirmed : credits cuttings_stock_balance, debits velvet
--   draft → voided    : no stock effect
--   confirmed → voided: requires a stock_correction record first;
--                       voiding after confirmation is an admin action
--
-- Stock is only credited when status transitions to 'confirmed'.
-- The domain layer performs the balance update and status change
-- atomically within a single transaction.
CREATE TABLE cutting_sessions (
  id                       UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date             DATE    NOT NULL,
  machine_id               UUID    NOT NULL REFERENCES machines(id) ON DELETE RESTRICT,
  velvet_bundles_consumed  NUMERIC(10,3) NOT NULL CHECK (velvet_bundles_consumed > 0),
  status                   TEXT    NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'voided')),
  notes                    TEXT,
  created_by               UUID    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  confirmed_by             UUID    REFERENCES users(id) ON DELETE RESTRICT,
  confirmed_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- confirmed_by and confirmed_at must both be present when confirmed
  CONSTRAINT confirmed_fields_together CHECK (
    (status = 'confirmed'
      AND confirmed_by IS NOT NULL
      AND confirmed_at IS NOT NULL)
    OR status != 'confirmed'
  )
);

CREATE TRIGGER trg_cutting_sessions_updated_at
  BEFORE UPDATE ON cutting_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE cutting_sessions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- CUTTING SESSION LINES
-- ============================================================
-- Per-SKU output from a cutting session.
-- SKU at this stage = (shape_design, bindi_colour, size). Three parts only.
--
-- brand_id and dabbi_colour_id are intentionally absent.
-- Brand and dabbi colour are NOT cuttings-stage concepts.
-- Their absence here is a business invariant, not an omission.
CREATE TABLE cutting_session_lines (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  cutting_session_id UUID   NOT NULL REFERENCES cutting_sessions(id) ON DELETE RESTRICT,
  shape_design_id   UUID    NOT NULL REFERENCES shape_designs(id) ON DELETE RESTRICT,
  bindi_colour_id   UUID    NOT NULL REFERENCES bindi_colours(id) ON DELETE RESTRICT,
  size_id           UUID    NOT NULL REFERENCES sizes(id) ON DELETE RESTRICT,
  -- brand_id absent: not a cuttings-stage concept
  -- dabbi_colour_id absent: not a cuttings-stage concept
  quantity_gross    NUMERIC(10,3) NOT NULL CHECK (quantity_gross > 0),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One line per cuttings SKU per session
  UNIQUE (cutting_session_id, shape_design_id, bindi_colour_id, size_id)
);

ALTER TABLE cutting_session_lines ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- CUTTINGS STOCK BALANCE
-- ============================================================
-- Running balance of cut bindi stock by cuttings-stage SKU.
-- Composite key: (shape_design, bindi_colour, size). Three parts only.
--
-- gross_qty:     total cut bindis physically in factory, not yet in WIP
-- committed_qty: earmarked for planned or active labour jobs
-- available_qty: gross_qty - committed_qty (always computed, never stale)
--
-- Domain layer maintains gross_qty and committed_qty.
-- available_qty is a generated column — correct by construction.
--
-- The domain layer must SELECT ... FOR UPDATE on this row before
-- any allocation or consumption to prevent concurrent over-commitment.
CREATE TABLE cuttings_stock_balance (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  shape_design_id  UUID    NOT NULL REFERENCES shape_designs(id) ON DELETE RESTRICT,
  bindi_colour_id  UUID    NOT NULL REFERENCES bindi_colours(id) ON DELETE RESTRICT,
  size_id          UUID    NOT NULL REFERENCES sizes(id) ON DELETE RESTRICT,
  -- brand_id absent: cuttings-stage structural invariant
  -- dabbi_colour_id absent: cuttings-stage structural invariant
  gross_qty        NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (gross_qty >= 0),
  committed_qty    NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (committed_qty >= 0),
  available_qty    NUMERIC(10,3) GENERATED ALWAYS AS (gross_qty - committed_qty) STORED,
  last_updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shape_design_id, bindi_colour_id, size_id),
  CONSTRAINT cuttings_committed_cannot_exceed_gross
    CHECK (committed_qty <= gross_qty)
);

ALTER TABLE cuttings_stock_balance ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- LABOUR JOBS
-- ============================================================
-- A packaging batch issued to an external labour unit.
-- One job = one physical handover of cut bindis to labour.
-- Labour performs filling + dabbi packing + box packaging
-- as a single combined stage (no sub-stages).
--
-- status is a state machine. Valid transitions (domain enforced):
--   assigned → in_packaging
--   in_packaging → partially_returned | returned_complete | delayed
--   delayed → in_packaging
--   partially_returned → returned_complete | short_variance | cancelled_recalled
--   any non-terminal → cancelled_recalled
--
-- All transitions are logged in labour_job_status_history.
-- A cancelled job must trigger restoration of cuttings_stock_balance
-- for any uncommitted cuttings (domain layer responsibility).
CREATE TABLE labour_jobs (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  labour_unit_id       UUID    NOT NULL REFERENCES labour_units(id) ON DELETE RESTRICT,
  date_assigned        DATE    NOT NULL,
  expected_return_date DATE,
  actual_return_date   DATE,
  status               TEXT    NOT NULL DEFAULT 'assigned'
    CHECK (status IN (
      'assigned',
      'in_packaging',
      'partially_returned',
      'returned_complete',
      'delayed',
      'short_variance',
      'cancelled_recalled'
    )),
  notes                TEXT,
  created_by           UUID    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_labour_jobs_updated_at
  BEFORE UPDATE ON labour_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE labour_jobs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- LABOUR JOB STATUS HISTORY
-- ============================================================
-- Immutable log of every status transition on a labour job.
-- Required because delays, partial returns, and recalls must be
-- traceable with timestamps and attributed to a user.
-- Append-only: no updates or deletes, ever.
CREATE TABLE labour_job_status_history (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  labour_job_id  UUID    NOT NULL REFERENCES labour_jobs(id) ON DELETE RESTRICT,
  from_status    TEXT,    -- NULL for the initial 'assigned' entry
  to_status      TEXT    NOT NULL,
  changed_by     UUID    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason         TEXT     -- domain layer should require reason for non-routine transitions
  -- Append-only: no updated_at
);

ALTER TABLE labour_job_status_history ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- LABOUR JOB LINES
-- ============================================================
-- Per-SKU detail of what was issued to a labour job.
-- This table is the SKU identity transition point:
--   Inbound identity  = cuttings stage: (shape_design, bindi_colour, size)
--   Outbound identity = finished stage: + dabbi_colour + brand
--
-- dabbi_colour_id: inherited from the linked order line at job issue time
-- brand_id: assigned from customer brand_rule (or line override) at issue time
-- Both are set when the job is created, not when goods are returned.
--
-- order_line_id: the order line this packaging run fulfils.
-- Nullable to support future speculative (non-order-linked) packaging runs.
-- FK to order_lines is added in migration 003 after that table exists.
--
-- quantity_returned_gross: running total of all returns for this line,
-- updated by domain layer as labour_job_return_lines are confirmed.
CREATE TABLE labour_job_lines (
  id                      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  labour_job_id           UUID    NOT NULL REFERENCES labour_jobs(id) ON DELETE RESTRICT,
  -- Cuttings-stage identity (what was sent)
  shape_design_id         UUID    NOT NULL REFERENCES shape_designs(id) ON DELETE RESTRICT,
  bindi_colour_id         UUID    NOT NULL REFERENCES bindi_colours(id) ON DELETE RESTRICT,
  size_id                 UUID    NOT NULL REFERENCES sizes(id) ON DELETE RESTRICT,
  -- Finished-goods additions (assigned at issue time)
  dabbi_colour_id         UUID    NOT NULL REFERENCES dabbi_colours(id) ON DELETE RESTRICT,
  brand_id                UUID    NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
  -- Order linkage: FK constraint added in migration 003
  order_line_id           UUID,   -- REFERENCES order_lines(id) — added in 003
  -- Quantities
  quantity_sent_gross     NUMERIC(10,3) NOT NULL CHECK (quantity_sent_gross > 0),
  quantity_returned_gross NUMERIC(10,3) NOT NULL DEFAULT 0
    CHECK (quantity_returned_gross >= 0),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One line per finished-goods SKU per job
  UNIQUE (labour_job_id, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id, brand_id),
  -- Total returns cannot exceed what was sent
  CONSTRAINT returned_cannot_exceed_sent
    CHECK (quantity_returned_gross <= quantity_sent_gross)
);

CREATE TRIGGER trg_labour_job_lines_updated_at
  BEFORE UPDATE ON labour_job_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE labour_job_lines ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- LABOUR JOB RETURN EVENTS
-- ============================================================
-- Header for each physical return visit from a labour unit.
-- Labour may return in multiple partial batches; each visit
-- creates one return event with one or more return lines.
-- Append-only: returns are facts, not mutable records.
CREATE TABLE labour_job_return_events (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  labour_job_id  UUID    NOT NULL REFERENCES labour_jobs(id) ON DELETE RESTRICT,
  return_date    DATE    NOT NULL,
  notes          TEXT,
  recorded_by    UUID    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  -- Append-only: no updated_at
);

ALTER TABLE labour_job_return_events ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- LABOUR JOB RETURN LINES
-- ============================================================
-- Per-job-line quantities returned in a return event.
-- When a return line is confirmed, domain layer must:
--   1. Increment labour_job_lines.quantity_returned_gross
--   2. UPSERT ready_stock_balance for the finished-goods SKU
--      (shape, bindi_colour, size, dabbi_colour, brand match
--       the labour_job_line fields)
--   3. Update the labour_job status if fully returned
--
-- Cumulative constraint: total returned across all events for a
-- given labour_job_line must not exceed quantity_sent_gross.
-- This cannot be expressed as a simple CHECK (requires summing
-- other rows) — enforced by the domain layer.
--
-- Variance: short returns are written off as wastage per
-- business rule. variance_gross and variance_type record what
-- happened; no further financial action is taken in the system.
CREATE TABLE labour_job_return_lines (
  id                      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  return_event_id         UUID    NOT NULL REFERENCES labour_job_return_events(id) ON DELETE RESTRICT,
  labour_job_line_id      UUID    NOT NULL REFERENCES labour_job_lines(id) ON DELETE RESTRICT,
  quantity_returned_gross NUMERIC(10,3) NOT NULL CHECK (quantity_returned_gross >= 0),
  variance_gross          NUMERIC(10,3) NOT NULL DEFAULT 0,
  -- variance_type: records why a short return occurred
  variance_type           TEXT    NOT NULL DEFAULT 'none'
    CHECK (variance_type IN ('none', 'short_count', 'wastage', 'rejected', 'other')),
  variance_notes          TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
  -- Append-only: no updated_at
);

CREATE INDEX idx_labour_job_return_lines_job_line
  ON labour_job_return_lines (labour_job_line_id);

ALTER TABLE labour_job_return_lines ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- READY STOCK BALANCE
-- ============================================================
-- Running balance of finished packaged goods available for dispatch.
-- Composite key: (shape_design, bindi_colour, size, dabbi_colour, brand).
-- Five-part key — the full finished-goods identity.
--
-- THIS IS THE ONLY TABLE FROM WHICH DISPATCH IS PERMITTED.
-- Dispatch from any other stock stage is a business rule violation.
-- If available_qty is insufficient, the domain layer must block
-- the dispatch. Admin bypass requires a stock_correction record
-- with reason before the dispatch can proceed.
--
-- gross_qty:     total finished goods physically on hand
-- committed_qty: reserved by active stock_allocations for specific orders
-- available_qty: gross_qty - committed_qty (generated, always correct)
--
-- Domain layer must SELECT ... FOR UPDATE before any dispatch or
-- allocation to prevent concurrent over-commitment.
CREATE TABLE ready_stock_balance (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  shape_design_id  UUID    NOT NULL REFERENCES shape_designs(id) ON DELETE RESTRICT,
  bindi_colour_id  UUID    NOT NULL REFERENCES bindi_colours(id) ON DELETE RESTRICT,
  size_id          UUID    NOT NULL REFERENCES sizes(id) ON DELETE RESTRICT,
  dabbi_colour_id  UUID    NOT NULL REFERENCES dabbi_colours(id) ON DELETE RESTRICT,
  brand_id         UUID    NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
  gross_qty        NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (gross_qty >= 0),
  committed_qty    NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (committed_qty >= 0),
  available_qty    NUMERIC(10,3) GENERATED ALWAYS AS (gross_qty - committed_qty) STORED,
  last_updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shape_design_id, bindi_colour_id, size_id, dabbi_colour_id, brand_id),
  CONSTRAINT ready_committed_cannot_exceed_gross
    CHECK (committed_qty <= gross_qty)
);

ALTER TABLE ready_stock_balance ENABLE ROW LEVEL SECURITY;
