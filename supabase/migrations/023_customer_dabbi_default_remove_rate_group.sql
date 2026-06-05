-- Customer order defaults.
-- Rate group was removed from the customer model; yellow/white rates remain
-- customer-level per-gross values for future invoice calculation.

ALTER TABLE customers
  DROP COLUMN IF EXISTS rate_group,
  ADD COLUMN IF NOT EXISTS default_dabbi_colour_id UUID
    REFERENCES dabbi_colours(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_default_dabbi_colour
  ON customers(default_dabbi_colour_id)
  WHERE default_dabbi_colour_id IS NOT NULL;
