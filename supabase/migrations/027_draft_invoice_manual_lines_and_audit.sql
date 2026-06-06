-- ============================================================
-- Stock Brain — Migration 027: Draft Invoice Manual Lines + Audit Events
-- ============================================================
-- Extends the invoicing workflow to support:
--   - Manual (non-dispatch-backed) invoice lines with required reason
--   - manual_lines_amount tracking on sales_invoices header
--   - Audit event trail for draft invoice edits (rate changes, charge edits)
-- ============================================================

-- ------------------------------------------------------------
-- Extend sales_invoice_lines for manual lines
-- ------------------------------------------------------------

ALTER TABLE sales_invoice_lines
  ADD COLUMN IF NOT EXISTS line_type TEXT NOT NULL DEFAULT 'dispatch'
    CHECK (line_type IN ('dispatch', 'manual')),
  ADD COLUMN IF NOT EXISTS manual_description TEXT,
  ADD COLUMN IF NOT EXISTS manual_reason TEXT;

-- Make rate/qty columns nullable so manual lines don't need them
ALTER TABLE sales_invoice_lines
  ALTER COLUMN rate_kind DROP NOT NULL,
  ALTER COLUMN quantity_gross DROP NOT NULL,
  ALTER COLUMN rate_per_gross DROP NOT NULL;

-- Dispatch lines must have rate_kind, quantity_gross, rate_per_gross, and dispatch_line_id
ALTER TABLE sales_invoice_lines
  ADD CONSTRAINT dispatch_line_requires_fields CHECK (
    line_type != 'dispatch'
    OR (rate_kind IS NOT NULL AND quantity_gross IS NOT NULL AND rate_per_gross IS NOT NULL)
  );

-- Manual lines must have description and reason, and must not link to a dispatch_line
ALTER TABLE sales_invoice_lines
  ADD CONSTRAINT manual_line_requires_fields CHECK (
    line_type != 'manual'
    OR (manual_description IS NOT NULL AND manual_reason IS NOT NULL AND dispatch_line_id IS NULL)
  );

-- ------------------------------------------------------------
-- Add manual_lines_amount to sales_invoices header
-- Stores the sum of all manual line amounts — updated whenever
-- manual lines are added/removed, and included in total_amount.
-- ------------------------------------------------------------

ALTER TABLE sales_invoices
  ADD COLUMN IF NOT EXISTS manual_lines_amount NUMERIC(14,2) NOT NULL DEFAULT 0
    CHECK (manual_lines_amount >= 0);

-- ------------------------------------------------------------
-- Audit events for draft invoice edits
-- Records old/new values when an accountant changes rates or charges on a draft.
-- Silent mutations are not allowed — every meaningful change must leave a record.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sales_invoice_audit_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_invoice_id UUID NOT NULL REFERENCES sales_invoices(id) ON DELETE RESTRICT,
  event_type       TEXT NOT NULL
    CHECK (event_type IN ('rate_change', 'charge_edit', 'manual_line_added', 'manual_line_removed')),
  field_name       TEXT,
  old_value        TEXT,
  new_value        TEXT,
  reason           TEXT,
  actor_id         UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_invoice_audit_events_invoice
  ON sales_invoice_audit_events (sales_invoice_id, created_at DESC);

ALTER TABLE sales_invoice_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_access" ON sales_invoice_audit_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- Update issue_sales_invoice to include manual_lines_amount
-- in journal entries (credited alongside transport/other charges).
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION issue_sales_invoice(p_invoice_id UUID, p_actor UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice sales_invoices%ROWTYPE;
  v_invoice_number TEXT;
  v_journal_id UUID;
  v_receivables_account_id UUID;
  v_goods_sales_account_id UUID;
  v_transport_account_id UUID;
  v_discount_account_id UUID;
  v_transport_credit NUMERIC(14,2);
  v_discount_debit NUMERIC(14,2);
BEGIN
  SELECT *
  INTO v_invoice
  FROM sales_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_invoice.status = 'issued' THEN
    RETURN v_invoice.invoice_number;
  END IF;

  IF v_invoice.status != 'draft' THEN
    RAISE EXCEPTION 'Only draft invoices can be issued';
  END IF;

  IF v_invoice.total_amount <= 0 THEN
    RAISE EXCEPTION 'Invoice total must be greater than zero';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM sales_invoice_lines WHERE sales_invoice_id = p_invoice_id
  ) THEN
    RAISE EXCEPTION 'Invoice has no lines';
  END IF;

  -- Block issue if any linked dispatch has been voided
  IF EXISTS (
    SELECT 1
    FROM sales_invoice_dispatches sid
    JOIN dispatch_events de ON de.id = sid.dispatch_event_id
    WHERE sid.sales_invoice_id = p_invoice_id
      AND de.status = 'voided'
  ) THEN
    RAISE EXCEPTION 'Linked dispatch has been voided. This draft cannot be issued.';
  END IF;

  SELECT id INTO v_receivables_account_id
  FROM accounting_accounts
  WHERE system_key = 'customer_receivables';

  SELECT id INTO v_goods_sales_account_id
  FROM accounting_accounts
  WHERE system_key = 'goods_sales';

  SELECT id INTO v_transport_account_id
  FROM accounting_accounts
  WHERE system_key = 'transport_recovery';

  SELECT id INTO v_discount_account_id
  FROM accounting_accounts
  WHERE system_key = 'sales_discounts';

  IF v_receivables_account_id IS NULL
    OR v_goods_sales_account_id IS NULL
    OR v_transport_account_id IS NULL
    OR v_discount_account_id IS NULL THEN
    RAISE EXCEPTION 'System accounting accounts are missing';
  END IF;

  v_invoice_number := next_sales_invoice_number();

  INSERT INTO accounting_journal_entries (
    entry_date,
    source_type,
    source_id,
    status,
    memo,
    posted_by,
    posted_at,
    created_by
  )
  VALUES (
    v_invoice.invoice_date,
    'sales_invoice',
    p_invoice_id,
    'posted',
    'Sales invoice ' || v_invoice_number,
    p_actor,
    now(),
    p_actor
  )
  RETURNING id INTO v_journal_id;

  -- DR: Customer Receivables = total_amount
  INSERT INTO accounting_journal_lines (
    journal_entry_id,
    account_id,
    customer_id,
    debit_amount,
    credit_amount,
    memo
  )
  VALUES (
    v_journal_id,
    v_receivables_account_id,
    v_invoice.customer_id,
    v_invoice.total_amount,
    0,
    'Customer receivable for ' || v_invoice_number
  );

  -- CR: Goods Sales = goods_amount
  IF v_invoice.goods_amount > 0 THEN
    INSERT INTO accounting_journal_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      memo
    )
    VALUES (
      v_journal_id,
      v_goods_sales_account_id,
      0,
      v_invoice.goods_amount,
      'Goods sales for ' || v_invoice_number
    );
  END IF;

  -- CR: Transport/Charges Recovery = transport + other_charges + manual_lines + positive round_off
  v_transport_credit :=
    v_invoice.transport_charges
    + v_invoice.other_charges
    + v_invoice.manual_lines_amount
    + GREATEST(v_invoice.round_off_amount, 0);

  IF v_transport_credit > 0 THEN
    INSERT INTO accounting_journal_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      memo
    )
    VALUES (
      v_journal_id,
      v_transport_account_id,
      0,
      v_transport_credit,
      'Transport/charges recovery for ' || v_invoice_number
    );
  END IF;

  -- DR: Sales Discounts = discount + negative round_off
  v_discount_debit :=
    v_invoice.discount_amount
    + GREATEST(-v_invoice.round_off_amount, 0);

  IF v_discount_debit > 0 THEN
    INSERT INTO accounting_journal_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      memo
    )
    VALUES (
      v_journal_id,
      v_discount_account_id,
      v_discount_debit,
      0,
      'Sales discount/rounding for ' || v_invoice_number
    );
  END IF;

  IF NOT accounting_assert_journal_balanced(v_journal_id) THEN
    RAISE EXCEPTION 'Invoice journal is not balanced';
  END IF;

  INSERT INTO customer_ledger_entries (
    customer_id,
    entry_date,
    entry_type,
    source_type,
    source_id,
    debit_amount,
    credit_amount,
    description,
    accounting_journal_entry_id,
    created_by
  )
  VALUES (
    v_invoice.customer_id,
    v_invoice.invoice_date,
    'invoice',
    'sales_invoice',
    p_invoice_id,
    v_invoice.total_amount,
    0,
    'Invoice ' || v_invoice_number,
    v_journal_id,
    p_actor
  );

  UPDATE sales_invoices
  SET
    invoice_number = v_invoice_number,
    status = 'issued',
    accounting_journal_entry_id = v_journal_id,
    issued_by = p_actor,
    issued_at = now()
  WHERE id = p_invoice_id;

  UPDATE dispatch_events
  SET
    invoice_number = v_invoice_number,
    invoice_generated_at = now()
  WHERE id IN (
    SELECT dispatch_event_id
    FROM sales_invoice_dispatches
    WHERE sales_invoice_id = p_invoice_id
  );

  RETURN v_invoice_number;
END;
$$;
