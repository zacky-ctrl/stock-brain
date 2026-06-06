-- ============================================================
-- Stock Brain — Migration 026: Atomic Sales Invoice Issue
-- ============================================================
-- Draft invoices are review documents. Issuing is the money event and must
-- atomically:
--   - generate invoice number
--   - post journal entry
--   - create customer ledger debit
--   - mark linked dispatches invoiced for legacy dispatch screens
-- ============================================================

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

  v_transport_credit :=
    v_invoice.transport_charges
    + v_invoice.other_charges
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

