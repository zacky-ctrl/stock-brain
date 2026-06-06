-- ============================================================
-- Stock Brain — Migration 025: Sales Accounting Foundation
-- ============================================================
-- Adds the first money foundation:
--   - lightweight chart of accounts + journal skeleton for future full accounting
--   - sales invoices generated from confirmed dispatches
--   - sales invoice lines with rate and SKU snapshots
--   - customer receipts
--   - customer ledger entries for outstanding calculation
--
-- No GST/tax model is included. Rates are per gross.
-- ============================================================

-- ------------------------------------------------------------
-- Numbering
-- ------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS sales_invoice_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS customer_receipt_number_seq START 1;

CREATE OR REPLACE FUNCTION next_sales_invoice_number()
RETURNS TEXT
LANGUAGE SQL
AS $$
  SELECT 'INV-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('sales_invoice_number_seq')::TEXT, 5, '0');
$$;

CREATE OR REPLACE FUNCTION next_customer_receipt_number()
RETURNS TEXT
LANGUAGE SQL
AS $$
  SELECT 'RCP-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('customer_receipt_number_seq')::TEXT, 5, '0');
$$;

-- ------------------------------------------------------------
-- Customer accounting defaults
-- ------------------------------------------------------------
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS opening_balance_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_balance_type TEXT NOT NULL DEFAULT 'none'
    CHECK (opening_balance_type IN ('none', 'receivable', 'advance')),
  ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER NOT NULL DEFAULT 0
    CHECK (payment_terms_days >= 0);

-- ------------------------------------------------------------
-- General accounting skeleton
-- ------------------------------------------------------------
CREATE TABLE accounting_accounts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  account_type       TEXT NOT NULL
    CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  normal_balance     TEXT NOT NULL
    CHECK (normal_balance IN ('debit', 'credit')),
  parent_account_id  UUID REFERENCES accounting_accounts(id) ON DELETE RESTRICT,
  system_key         TEXT UNIQUE,
  is_system          BOOLEAN NOT NULL DEFAULT false,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_accounting_accounts_updated_at
  BEFORE UPDATE ON accounting_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE accounting_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE accounting_journal_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date    DATE NOT NULL,
  source_type   TEXT NOT NULL,
  source_id     UUID,
  status        TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'voided')),
  memo          TEXT,
  posted_by     UUID REFERENCES users(id) ON DELETE RESTRICT,
  posted_at     TIMESTAMPTZ,
  voided_by     UUID REFERENCES users(id) ON DELETE RESTRICT,
  voided_at     TIMESTAMPTZ,
  void_reason   TEXT,
  created_by    UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT posted_journal_fields_together CHECK (
    status != 'posted' OR (posted_by IS NOT NULL AND posted_at IS NOT NULL)
  ),
  CONSTRAINT voided_journal_fields_together CHECK (
    status != 'voided' OR (voided_by IS NOT NULL AND voided_at IS NOT NULL AND nullif(trim(void_reason), '') IS NOT NULL)
  )
);

CREATE TRIGGER trg_accounting_journal_entries_updated_at
  BEFORE UPDATE ON accounting_journal_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_accounting_journal_entries_source
  ON accounting_journal_entries (source_type, source_id);

ALTER TABLE accounting_journal_entries ENABLE ROW LEVEL SECURITY;

CREATE TABLE accounting_journal_lines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id   UUID NOT NULL REFERENCES accounting_journal_entries(id) ON DELETE RESTRICT,
  account_id         UUID NOT NULL REFERENCES accounting_accounts(id) ON DELETE RESTRICT,
  customer_id        UUID REFERENCES customers(id) ON DELETE RESTRICT,
  debit_amount       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  memo               TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT journal_line_one_sided CHECK (
    (debit_amount > 0 AND credit_amount = 0)
    OR (credit_amount > 0 AND debit_amount = 0)
  )
);

CREATE INDEX idx_accounting_journal_lines_entry
  ON accounting_journal_lines (journal_entry_id);

CREATE INDEX idx_accounting_journal_lines_account
  ON accounting_journal_lines (account_id);

CREATE INDEX idx_accounting_journal_lines_customer
  ON accounting_journal_lines (customer_id)
  WHERE customer_id IS NOT NULL;

ALTER TABLE accounting_journal_lines ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION accounting_journal_entry_totals(entry_id UUID)
RETURNS TABLE (debit_total NUMERIC, credit_total NUMERIC)
LANGUAGE SQL
AS $$
  SELECT
    COALESCE(SUM(debit_amount), 0)::NUMERIC(14,2) AS debit_total,
    COALESCE(SUM(credit_amount), 0)::NUMERIC(14,2) AS credit_total
  FROM accounting_journal_lines
  WHERE journal_entry_id = entry_id;
$$;

CREATE OR REPLACE FUNCTION accounting_assert_journal_balanced(entry_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
AS $$
  SELECT debit_total = credit_total AND debit_total > 0
  FROM accounting_journal_entry_totals(entry_id);
$$;

INSERT INTO accounting_accounts (code, name, account_type, normal_balance, system_key, is_system)
VALUES
  ('1000', 'Cash', 'asset', 'debit', 'cash', true),
  ('1010', 'Bank', 'asset', 'debit', 'bank', true),
  ('1100', 'Customer Receivables', 'asset', 'debit', 'customer_receivables', true),
  ('4000', 'Goods Sales', 'income', 'credit', 'goods_sales', true),
  ('4010', 'Transport Charges Recovered', 'income', 'credit', 'transport_recovery', true),
  ('4090', 'Sales Discounts / Adjustments', 'income', 'debit', 'sales_discounts', true)
ON CONFLICT (system_key) DO NOTHING;

-- ------------------------------------------------------------
-- Sales invoices
-- ------------------------------------------------------------
CREATE TABLE sales_invoices (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number             TEXT UNIQUE,
  customer_id                UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  invoice_date               DATE NOT NULL,
  due_date                   DATE,
  status                     TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'issued', 'cancelled')),

  customer_name_snapshot     TEXT NOT NULL,
  entity_name_snapshot       TEXT,
  address_snapshot           TEXT,
  phone_snapshot             TEXT,
  transport_name_snapshot    TEXT,
  yellow_rate_per_gross      NUMERIC(12,2),
  white_rate_per_gross       NUMERIC(12,2),

  goods_amount               NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (goods_amount >= 0),
  transport_charges          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (transport_charges >= 0),
  other_charges              NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (other_charges >= 0),
  discount_amount            NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  round_off_amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount               NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),

  accounting_journal_entry_id UUID REFERENCES accounting_journal_entries(id) ON DELETE RESTRICT,
  notes                      TEXT,
  issued_by                  UUID REFERENCES users(id) ON DELETE RESTRICT,
  issued_at                  TIMESTAMPTZ,
  cancelled_by               UUID REFERENCES users(id) ON DELETE RESTRICT,
  cancelled_at               TIMESTAMPTZ,
  cancel_reason              TEXT,
  created_by                 UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT issued_invoice_fields_together CHECK (
    status != 'issued'
    OR (invoice_number IS NOT NULL AND issued_by IS NOT NULL AND issued_at IS NOT NULL)
  ),
  CONSTRAINT cancelled_invoice_fields_together CHECK (
    status != 'cancelled'
    OR (cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL AND nullif(trim(cancel_reason), '') IS NOT NULL)
  )
);

CREATE TRIGGER trg_sales_invoices_updated_at
  BEFORE UPDATE ON sales_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_sales_invoices_customer
  ON sales_invoices (customer_id, invoice_date DESC);

CREATE INDEX idx_sales_invoices_status
  ON sales_invoices (status, invoice_date DESC);

ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;

CREATE TABLE sales_invoice_dispatches (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_invoice_id   UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE RESTRICT,
  dispatch_event_id  UUID NOT NULL REFERENCES dispatch_events(id) ON DELETE RESTRICT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dispatch_event_id)
);

CREATE INDEX idx_sales_invoice_dispatches_invoice
  ON sales_invoice_dispatches (sales_invoice_id);

ALTER TABLE sales_invoice_dispatches ENABLE ROW LEVEL SECURITY;

CREATE TABLE sales_invoice_lines (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_invoice_id           UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE RESTRICT,
  dispatch_line_id           UUID REFERENCES dispatch_lines(id) ON DELETE RESTRICT,
  order_line_id              UUID REFERENCES order_lines(id) ON DELETE RESTRICT,
  ready_stock_balance_id     UUID REFERENCES ready_stock_balance(id) ON DELETE RESTRICT,

  shape_design_id            UUID REFERENCES shape_designs(id) ON DELETE RESTRICT,
  bindi_colour_id            UUID REFERENCES bindi_colours(id) ON DELETE RESTRICT,
  size_id                    UUID REFERENCES sizes(id) ON DELETE RESTRICT,
  dabbi_colour_id            UUID REFERENCES dabbi_colours(id) ON DELETE RESTRICT,
  brand_id                   UUID REFERENCES brands(id) ON DELETE RESTRICT,

  shape_name_snapshot        TEXT NOT NULL,
  bindi_colour_code_snapshot TEXT NOT NULL,
  size_code_snapshot         TEXT NOT NULL,
  dabbi_colour_code_snapshot TEXT NOT NULL,
  brand_name_snapshot        TEXT,
  rate_kind                  TEXT NOT NULL CHECK (rate_kind IN ('yellow', 'white')),
  quantity_gross             NUMERIC(10,3) NOT NULL CHECK (quantity_gross > 0),
  rate_per_gross             NUMERIC(12,2) NOT NULL CHECK (rate_per_gross >= 0),
  line_amount                NUMERIC(14,2) NOT NULL CHECK (line_amount >= 0),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_invoice_lines_invoice
  ON sales_invoice_lines (sales_invoice_id);

CREATE INDEX idx_sales_invoice_lines_dispatch_line
  ON sales_invoice_lines (dispatch_line_id)
  WHERE dispatch_line_id IS NOT NULL;

ALTER TABLE sales_invoice_lines ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Customer receipts and customer ledger
-- ------------------------------------------------------------
CREATE TABLE customer_receipts (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number             TEXT UNIQUE,
  customer_id                UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  receipt_date               DATE NOT NULL,
  amount                     NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  mode                       TEXT NOT NULL
    CHECK (mode IN ('cash', 'bank', 'upi', 'cheque', 'other')),
  reference                  TEXT,
  notes                      TEXT,
  status                     TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'voided')),
  accounting_journal_entry_id UUID REFERENCES accounting_journal_entries(id) ON DELETE RESTRICT,
  received_by                UUID REFERENCES users(id) ON DELETE RESTRICT,
  voided_by                  UUID REFERENCES users(id) ON DELETE RESTRICT,
  voided_at                  TIMESTAMPTZ,
  void_reason                TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT voided_receipt_fields_together CHECK (
    status != 'voided'
    OR (voided_by IS NOT NULL AND voided_at IS NOT NULL AND nullif(trim(void_reason), '') IS NOT NULL)
  )
);

CREATE TRIGGER trg_customer_receipts_updated_at
  BEFORE UPDATE ON customer_receipts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_customer_receipts_customer
  ON customer_receipts (customer_id, receipt_date DESC);

ALTER TABLE customer_receipts ENABLE ROW LEVEL SECURITY;

CREATE TABLE sales_invoice_receipt_allocations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_invoice_id   UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE RESTRICT,
  customer_receipt_id UUID NOT NULL REFERENCES customer_receipts(id) ON DELETE RESTRICT,
  amount_allocated   NUMERIC(14,2) NOT NULL CHECK (amount_allocated > 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sales_invoice_id, customer_receipt_id)
);

CREATE INDEX idx_sales_invoice_receipt_allocations_receipt
  ON sales_invoice_receipt_allocations (customer_receipt_id);

ALTER TABLE sales_invoice_receipt_allocations ENABLE ROW LEVEL SECURITY;

CREATE TABLE customer_ledger_entries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id        UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  entry_date         DATE NOT NULL,
  entry_type         TEXT NOT NULL
    CHECK (entry_type IN ('opening', 'invoice', 'receipt', 'credit_note', 'debit_note', 'reversal')),
  source_type        TEXT NOT NULL,
  source_id          UUID,
  debit_amount       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  description        TEXT NOT NULL,
  accounting_journal_entry_id UUID REFERENCES accounting_journal_entries(id) ON DELETE RESTRICT,
  created_by         UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT customer_ledger_one_sided CHECK (
    (debit_amount > 0 AND credit_amount = 0)
    OR (credit_amount > 0 AND debit_amount = 0)
  )
);

CREATE INDEX idx_customer_ledger_entries_customer
  ON customer_ledger_entries (customer_id, entry_date DESC, created_at DESC);

CREATE INDEX idx_customer_ledger_entries_source
  ON customer_ledger_entries (source_type, source_id);

ALTER TABLE customer_ledger_entries ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- RLS policies for new tables. Current app uses service role on the server;
-- these keep authenticated clients permissive until role hardening.
-- ------------------------------------------------------------
CREATE POLICY "authenticated_all_access" ON accounting_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_access" ON accounting_journal_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_access" ON accounting_journal_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_access" ON sales_invoices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_access" ON sales_invoice_dispatches
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_access" ON sales_invoice_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_access" ON customer_receipts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_access" ON sales_invoice_receipt_allocations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_access" ON customer_ledger_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
