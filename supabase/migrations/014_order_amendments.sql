-- ============================================================
-- ORDER AMENDMENTS
-- ============================================================
-- Audit record for changes to order header fields after creation.
-- Covers: customer_id, order_date, reference, notes, status.
--
-- Same append-only pattern as order_line_amendments.
-- TEXT for old_value/new_value to handle IDs, dates, and free text.
--
-- Pre-auth: amended_by FK dropped in same migration.

CREATE TABLE order_amendments (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  amended_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  amended_by    UUID    NOT NULL,
  order_id      UUID    NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  field_amended TEXT    NOT NULL,   -- 'customer_id', 'order_date', 'reference', 'notes'
  old_value     TEXT    NOT NULL,
  new_value     TEXT    NOT NULL,
  reason        TEXT    NOT NULL CHECK (length(trim(reason)) > 0)
  -- Append-only: no updated_at, no updates, no deletes, ever
);

CREATE INDEX idx_order_amendments_order
  ON order_amendments (order_id, amended_at DESC);

ALTER TABLE order_amendments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_access" ON order_amendments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Drop actor FK — pre-auth: no auth.users table linked yet.
ALTER TABLE order_amendments
  DROP CONSTRAINT IF EXISTS order_amendments_amended_by_fkey;
