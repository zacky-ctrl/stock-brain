-- Customer commercial details and dispatch challan/invoice numbering.
-- Invoice accounting remains a later module; these columns make the dispatch
-- challan printable and give the invoice module stable numbers to attach to.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS entity_name TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS transport_name TEXT,
  ADD COLUMN IF NOT EXISTS rate_group TEXT,
  ADD COLUMN IF NOT EXISTS yellow_rate_per_gross NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS white_rate_per_gross NUMERIC(12, 2);

ALTER TABLE dispatch_events
  ADD COLUMN IF NOT EXISTS challan_number TEXT,
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS invoice_generated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS ux_dispatch_events_challan_number
  ON dispatch_events (challan_number)
  WHERE challan_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_dispatch_events_invoice_number
  ON dispatch_events (invoice_number)
  WHERE invoice_number IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS dispatch_challan_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS dispatch_invoice_number_seq START 1;

CREATE OR REPLACE FUNCTION next_dispatch_challan_number()
RETURNS TEXT
LANGUAGE SQL
AS $$
  SELECT 'CH-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('dispatch_challan_number_seq')::TEXT, 5, '0');
$$;

CREATE OR REPLACE FUNCTION next_dispatch_invoice_number()
RETURNS TEXT
LANGUAGE SQL
AS $$
  SELECT 'INV-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('dispatch_invoice_number_seq')::TEXT, 5, '0');
$$;
