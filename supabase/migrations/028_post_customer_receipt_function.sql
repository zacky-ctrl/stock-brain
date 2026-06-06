-- ============================================================
-- Stock Brain — Migration 027: Atomic Customer Receipt Posting
-- ============================================================
-- A confirmed receipt is a money event and must atomically:
--   - generate receipt number
--   - create customer receipt
--   - post journal entry
--   - create customer ledger credit
-- ============================================================

CREATE OR REPLACE FUNCTION post_customer_receipt(
  p_customer_id UUID,
  p_receipt_date DATE,
  p_amount NUMERIC,
  p_mode TEXT,
  p_reference TEXT,
  p_notes TEXT,
  p_actor UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_receipt_id UUID;
  v_receipt_number TEXT;
  v_journal_id UUID;
  v_receivables_account_id UUID;
  v_payment_account_id UUID;
  v_customer_name TEXT;
  v_payment_account_key TEXT;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer is required';
  END IF;

  IF p_receipt_date IS NULL THEN
    RAISE EXCEPTION 'Receipt date is required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Receipt amount must be greater than zero';
  END IF;

  IF p_mode NOT IN ('cash', 'bank', 'upi', 'cheque', 'other') THEN
    RAISE EXCEPTION 'Invalid receipt mode';
  END IF;

  SELECT name
  INTO v_customer_name
  FROM customers
  WHERE id = p_customer_id;

  IF v_customer_name IS NULL THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  SELECT id INTO v_receivables_account_id
  FROM accounting_accounts
  WHERE system_key = 'customer_receivables';

  v_payment_account_key := CASE
    WHEN p_mode = 'cash' THEN 'cash'
    ELSE 'bank'
  END;

  SELECT id INTO v_payment_account_id
  FROM accounting_accounts
  WHERE system_key = v_payment_account_key;

  IF v_receivables_account_id IS NULL OR v_payment_account_id IS NULL THEN
    RAISE EXCEPTION 'System accounting accounts are missing';
  END IF;

  v_receipt_number := next_customer_receipt_number();

  INSERT INTO customer_receipts (
    receipt_number,
    customer_id,
    receipt_date,
    amount,
    mode,
    reference,
    notes,
    status,
    received_by
  )
  VALUES (
    v_receipt_number,
    p_customer_id,
    p_receipt_date,
    p_amount,
    p_mode,
    nullif(trim(coalesce(p_reference, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    'confirmed',
    p_actor
  )
  RETURNING id INTO v_receipt_id;

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
    p_receipt_date,
    'customer_receipt',
    v_receipt_id,
    'posted',
    'Customer receipt ' || v_receipt_number,
    p_actor,
    now(),
    p_actor
  )
  RETURNING id INTO v_journal_id;

  INSERT INTO accounting_journal_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    memo
  )
  VALUES (
    v_journal_id,
    v_payment_account_id,
    p_amount,
    0,
    upper(p_mode) || ' receipt ' || v_receipt_number
  );

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
    p_customer_id,
    0,
    p_amount,
    'Customer payment from ' || v_customer_name || ' — ' || v_receipt_number
  );

  IF NOT accounting_assert_journal_balanced(v_journal_id) THEN
    RAISE EXCEPTION 'Receipt journal is not balanced';
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
    p_customer_id,
    p_receipt_date,
    'receipt',
    'customer_receipt',
    v_receipt_id,
    0,
    p_amount,
    'Receipt ' || v_receipt_number,
    v_journal_id,
    p_actor
  );

  UPDATE customer_receipts
  SET accounting_journal_entry_id = v_journal_id
  WHERE id = v_receipt_id;

  RETURN v_receipt_id;
END;
$$;
