-- ============================================================
-- Stock Brain — Migration 003: Orders / Dispatch Tables
-- ============================================================
-- Orders track customer demand. An order remains open until all
-- its lines are fully dispatched or explicitly closed. Partial
-- dispatch over multiple days is the normal operating pattern.
--
-- Key formula at order_line level (the system's heartbeat):
--   open_qty = ordered_qty - dispatched_qty - closed_qty
--
-- dispatched_qty is computed: SUM(dispatch_lines.quantity_dispatched)
--   WHERE dispatch_lines.order_line_id = order_lines.id
--   AND dispatch_events.status = 'confirmed'
--
-- open_qty is never stored as a mutable column. It is derived
-- by query or computed by the domain layer on demand. Storing it
-- as a mutable column would create dual-write risk and allow it
-- to drift from the true sum of confirmed dispatch_lines.
--
-- Brand resolution at dispatch time:
--   1. If order_line.brand_id_override IS NOT NULL → use that brand
--   2. Else use customer.brand_rule to select from available stock
--   The customer_brand_rule_snapshot column preserves the rule that
--   was in effect at order creation, even if the customer changes
--   their rule later. Historical dispatch decisions remain auditable.
--
-- One dispatch_event may cover multiple order_lines for the same
-- customer (including lines from different orders). The link is:
--   dispatch_events → dispatch_lines → order_lines
-- dispatch_events does NOT have a direct order_id FK.
--
-- This file also adds the deferred FK from labour_job_lines to
-- order_lines, which could not be added in migration 002.
--
-- Prerequisite: migrations 001 and 002 must be applied first.
-- ============================================================

-- ============================================================
-- ORDERS
-- ============================================================
-- Customer order header. Stays open until all lines reach
-- 'fully_dispatched' or the order is manually 'closed'.
-- Multiple partial dispatches happen under one open order.
--
-- status is maintained by the domain layer as order_lines change.
-- When all lines are fully_dispatched, domain layer updates order
-- status to 'fully_dispatched'. Explicit admin closure sets 'closed'.
CREATE TABLE orders (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID    NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  order_date  DATE    NOT NULL,
  reference   TEXT,    -- customer PO number or internal reference; nullable
  status      TEXT    NOT NULL DEFAULT 'open'
    CHECK (status IN (
      'open',
      'partially_dispatched',
      'fully_dispatched',
      'closed'
    )),
  notes       TEXT,
  created_by  UUID    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_orders_customer_open
  ON orders (customer_id)
  WHERE status IN ('open', 'partially_dispatched');

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ORDER LINES
-- ============================================================
-- Per-SKU demand line within an order. This is the atomic unit
-- of demand tracking and the anchor for open_qty calculation.
--
-- SKU at order stage = (shape_design, bindi_colour, size, dabbi_colour).
-- dabbi_colour is specified at order placement, confirmed by blueprint.
-- brand_id_override is optional: NULL means apply customer brand_rule
-- at dispatch time. When set, this line requires that specific brand.
--
-- ordered_qty must not be changed after the first confirmed dispatch
-- against this line. The domain layer enforces this. Any change
-- requires an order_line_amendments record (migration 004).
--
-- customer_brand_rule_snapshot: records the customer's brand_rule
-- at the time this line was created. Protects historical correctness
-- if the customer later changes their brand rule. Used for audit
-- and dispute resolution on past orders.
--
-- promised_date: may be set at order creation and/or updated when
-- the next parcel is scheduled after a partial dispatch. Used by
-- the planning engine's priority sort.
--
-- has_priority_override: set to true by domain layer when an active
-- priority_overrides record exists for this line. Allows efficient
-- filtering in planning queries without joining priority_overrides.
CREATE TABLE order_lines (
  id                           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                     UUID    NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  shape_design_id              UUID    NOT NULL REFERENCES shape_designs(id) ON DELETE RESTRICT,
  bindi_colour_id              UUID    NOT NULL REFERENCES bindi_colours(id) ON DELETE RESTRICT,
  size_id                      UUID    NOT NULL REFERENCES sizes(id) ON DELETE RESTRICT,
  dabbi_colour_id              UUID    NOT NULL REFERENCES dabbi_colours(id) ON DELETE RESTRICT,
  -- Optional line-level brand override; NULL = use customer brand_rule
  brand_id_override            UUID    REFERENCES brands(id) ON DELETE RESTRICT,
  -- Snapshot of customer brand_rule at order creation time.
  -- Preserved for historical correctness even if customer rule changes.
  customer_brand_rule_snapshot TEXT    NOT NULL
    CHECK (customer_brand_rule_snapshot IN (
      'no_preference',
      'prefer_nirankari',
      'prefer_suhela',
      'strict_nirankari',
      'strict_suhela'
    )),
  ordered_qty                  NUMERIC(10,3) NOT NULL CHECK (ordered_qty > 0),
  -- closed_qty: quantity explicitly closed without dispatch.
  -- Any change requires an order_line_amendments record (migration 004).
  closed_qty                   NUMERIC(10,3) NOT NULL DEFAULT 0
    CHECK (closed_qty >= 0),
  -- Promised dispatch date. Nullable; set at order time and/or
  -- updated when next parcel is scheduled after partial dispatch.
  promised_date                DATE,
  -- True when an active priority_overrides record exists for this line.
  -- Set/cleared by domain layer; allows efficient planning queries.
  has_priority_override        BOOLEAN NOT NULL DEFAULT false,
  status                       TEXT    NOT NULL DEFAULT 'open'
    CHECK (status IN (
      'open',
      'partially_dispatched',
      'fully_dispatched',
      'closed'
    )),
  notes                        TEXT,
  created_by                   UUID    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One line per (shape, bindi_colour, size, dabbi_colour) per order.
  -- brand_id_override excluded from unique key: the base SKU identity
  -- (without brand) must be unique per order. Two lines for the same
  -- base SKU with different brand overrides would create allocation ambiguity.
  UNIQUE (order_id, shape_design_id, bindi_colour_id, size_id, dabbi_colour_id),
  CONSTRAINT closed_qty_cannot_exceed_ordered
    CHECK (closed_qty <= ordered_qty)
);

CREATE TRIGGER trg_order_lines_updated_at
  BEFORE UPDATE ON order_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Supports planning engine queries: open order lines by SKU
CREATE INDEX idx_order_lines_open
  ON order_lines (shape_design_id, bindi_colour_id, size_id, dabbi_colour_id)
  WHERE status IN ('open', 'partially_dispatched');

-- Supports efficient open_qty computation per order
CREATE INDEX idx_order_lines_order_id
  ON order_lines (order_id);

ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- DEFERRED FK: labour_job_lines → order_lines
-- ============================================================
-- This FK was declared without a constraint in migration 002
-- because order_lines did not exist yet. Added here now.
-- Nullable: allows future speculative packaging runs that are
-- not tied to a specific order line.
ALTER TABLE labour_job_lines
  ADD CONSTRAINT fk_labour_job_lines_order_line
  FOREIGN KEY (order_line_id)
  REFERENCES order_lines(id)
  ON DELETE RESTRICT;

-- ============================================================
-- DISPATCH EVENTS
-- ============================================================
-- Header for a single physical dispatch delivery to a customer.
-- One event = one delivery on one date.
-- A single event may cover multiple order_lines for the same
-- customer, including lines from different orders.
--
-- customer_id is denormalized here for efficient filtering.
-- Domain layer must verify that all dispatch_lines under this
-- event reference order_lines belonging to this customer_id.
--
-- status flow:
--   draft → confirmed : commits stock movements (domain layer)
--   draft → voided    : no stock effect
--   confirmed → voided: domain layer must fully reverse all stock
--                       movements and open_qty effects; requires
--                       a stock_correction record as audit trace
CREATE TABLE dispatch_events (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID    NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  dispatch_date DATE    NOT NULL,
  reference     TEXT,    -- delivery note number or internal reference
  status        TEXT    NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'voided')),
  notes         TEXT,
  dispatched_by UUID    NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  confirmed_by  UUID    REFERENCES users(id) ON DELETE RESTRICT,
  confirmed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dispatch_confirmed_fields_together CHECK (
    (status = 'confirmed'
      AND confirmed_by IS NOT NULL
      AND confirmed_at IS NOT NULL)
    OR status != 'confirmed'
  )
);

CREATE TRIGGER trg_dispatch_events_updated_at
  BEFORE UPDATE ON dispatch_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_dispatch_events_customer
  ON dispatch_events (customer_id, dispatch_date DESC);

ALTER TABLE dispatch_events ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- DISPATCH LINES
-- ============================================================
-- Per-order-line quantity dispatched within a dispatch event.
-- This is the row that reduces open_qty and draws from ready stock.
--
-- ready_stock_balance_id: the exact finished-goods balance row
-- that was drawn from. Records precisely which SKU (including
-- brand and dabbi_colour) was dispatched, even for no-preference
-- customers where the brand was selected at dispatch time.
--
-- Domain layer must, when a dispatch_event is confirmed:
--   1. Verify order_line.open_qty >= quantity_dispatched
--   2. Verify ready_stock_balance.available_qty >= quantity_dispatched
--   3. Decrease ready_stock_balance.gross_qty by quantity_dispatched
--   4. Decrease ready_stock_balance.committed_qty if an allocation existed
--   5. Mark the corresponding stock_allocation as fulfilled
--   6. Update order_line status; update order status if all lines resolved
--
-- All of steps 1–6 must be atomic (single transaction).
CREATE TABLE dispatch_lines (
  id                      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_event_id       UUID    NOT NULL REFERENCES dispatch_events(id) ON DELETE RESTRICT,
  order_line_id           UUID    NOT NULL REFERENCES order_lines(id) ON DELETE RESTRICT,
  -- The exact ready stock balance row drawn from.
  -- Encodes the full finished-goods SKU including brand actually dispatched.
  ready_stock_balance_id  UUID    NOT NULL REFERENCES ready_stock_balance(id) ON DELETE RESTRICT,
  quantity_dispatched     NUMERIC(10,3) NOT NULL CHECK (quantity_dispatched > 0),
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One line per order_line per dispatch event
  UNIQUE (dispatch_event_id, order_line_id)
);

-- Supports open_qty computation: fast sum of dispatched quantities per order line
CREATE INDEX idx_dispatch_lines_order_line_id
  ON dispatch_lines (order_line_id);

ALTER TABLE dispatch_lines ENABLE ROW LEVEL SECURITY;
