-- ============================================================
-- DISPATCH FLEXIBILITY + FULFILMENT RECORDS + AI REPORTS
-- ============================================================
-- Extends dispatch_lines for the flexible dispatch model:
--   line_type gains 'short' (dispatched less than ordered)
--   colour_match: was the sent colour what was ordered?
--   qty_variance: actual_qty - open_qty at dispatch time
--                 (negative = short, 0 = exact, positive = over)
--   ordered_sku_context: captures the original ordered SKU JSONB
--                        for substitute lines
--   override_reason: explains why stock/qty check was bypassed
--
-- Creates fulfilment_records: permanent record per dispatch line
--   of ordered vs actual for gap analysis and reporting.
--
-- Creates ai_reports: stores generated AI strategy report history.
-- ============================================================

-- 1. Extend line_type to include 'short'
ALTER TABLE dispatch_lines DROP CONSTRAINT dispatch_lines_line_type_check;
ALTER TABLE dispatch_lines ADD CONSTRAINT dispatch_lines_line_type_check
  CHECK (line_type IN ('ordered', 'substitute', 'extra', 'short'));

-- 2. Add flexibility columns
ALTER TABLE dispatch_lines
  ADD COLUMN IF NOT EXISTS colour_match BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS qty_variance NUMERIC(10,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ordered_sku_context JSONB,
  ADD COLUMN IF NOT EXISTS override_reason TEXT;

-- 3. Create fulfilment_records
--    Permanent per-line record of ordered vs actual at dispatch time.
--    order_line_id is NULL for extra lines (no corresponding order line).
--    fulfilment_pct is GENERATED STORED for fast reporting queries.
CREATE TABLE fulfilment_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_event_id UUID NOT NULL
                      REFERENCES dispatch_events(id) ON DELETE RESTRICT,
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_line_id     UUID REFERENCES order_lines(id) ON DELETE RESTRICT,
  ordered_qty       NUMERIC(10,3) NOT NULL DEFAULT 0,
  actual_qty        NUMERIC(10,3) NOT NULL DEFAULT 0,
  line_type         TEXT NOT NULL
                      CHECK (line_type IN ('ordered', 'substitute', 'extra', 'short')),
  colour_match      BOOLEAN NOT NULL DEFAULT true,
  qty_match         BOOLEAN NOT NULL DEFAULT true,
  fulfilment_pct    NUMERIC(5,2) GENERATED ALWAYS AS (
                      CASE WHEN ordered_qty = 0 THEN 100
                      ELSE LEAST(actual_qty / ordered_qty * 100, 100) END
                    ) STORED,
  ordered_sku       JSONB NOT NULL,
  actual_sku        JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fulfilment_records_order
  ON fulfilment_records (order_id, created_at DESC);

CREATE INDEX idx_fulfilment_records_dispatch
  ON fulfilment_records (dispatch_event_id);

-- 4. Create ai_reports
--    Stores generated AI strategy report history with data snapshot.
CREATE TABLE ai_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  report_text   TEXT NOT NULL,
  data_snapshot JSONB NOT NULL
);
