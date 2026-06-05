-- ============================================================
-- DISPATCH LINE TYPE
-- ============================================================
-- Adds line_type to dispatch_lines to support extra and substitute
-- SKUs dispatched outside the ordered lines.
--
-- Business rule:
--   ordered   = dispatched against a specific order_line (existing behaviour)
--   substitute = dispatched in place of an ordered SKU (order line stays open)
--   extra     = additional parcel filler / stock push (no order line)
--
-- For substitute/extra lines, order_line_id is NULL.
-- The ready_stock_balance_id is always present — all dispatch lines
-- deduct from ready stock.
--
-- The existing UNIQUE (dispatch_event_id, order_line_id) constraint is
-- replaced with a partial unique index covering only ordered lines,
-- allowing multiple extra/substitute lines per event.
-- ============================================================

-- 1. Add line_type column
ALTER TABLE dispatch_lines
  ADD COLUMN line_type TEXT NOT NULL DEFAULT 'ordered'
  CONSTRAINT dispatch_lines_line_type_check
  CHECK (line_type IN ('ordered', 'substitute', 'extra'));

-- 2. Make order_line_id nullable (NULL for substitute/extra lines)
ALTER TABLE dispatch_lines
  ALTER COLUMN order_line_id DROP NOT NULL;

-- 3. Drop the old unique constraint (it was on non-nullable order_line_id)
ALTER TABLE dispatch_lines
  DROP CONSTRAINT IF EXISTS dispatch_lines_dispatch_event_id_order_line_id_key;

-- 4. Partial unique index: one ordered dispatch per order_line per event
CREATE UNIQUE INDEX dispatch_lines_ordered_unique
  ON dispatch_lines (dispatch_event_id, order_line_id)
  WHERE order_line_id IS NOT NULL;

-- 5. Check: ordered lines must have an order_line_id
ALTER TABLE dispatch_lines
  ADD CONSTRAINT dispatch_lines_ordered_requires_line
  CHECK (
    (line_type = 'ordered' AND order_line_id IS NOT NULL)
    OR line_type IN ('substitute', 'extra')
  );
