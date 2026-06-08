-- ============================================================
-- Stock Brain — Migration 031: Void Customer Receipt Function
-- ============================================================
-- Voiding a receipt must be an auditable reversal, not deletion.
-- The original receipt remains visible; a posted reversal journal and
-- customer ledger debit neutralize the original credit.
-- ============================================================

CREATE OR REPLACE FUNCTION void_customer_receipt(
  p_receipt_id UUID,
  p_actor UUID,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_receipt customer_receipts%ROWTYPE;
  v_journal_id UUID;
  v_receivables_account_id UUID;
  v_payment_account_id UUID;
  v_payment_account_key TEXT;
BEGIN
  IF p_receipt_id IS NULL THEN
    RAISE EXCEPTION 'Receipt is required';
  END IF;

  IF nullif(trim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Void reason is required';
  END IF;

  SELECT *
  INTO v_receipt
  FROM customer_receipts
  WHERE id = p_receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt not found';
  END IF;

  IF v_receipt.status = 'voided' THEN
    RETURN v_receipt.accounting_journal_entry_id;
  END IF;

  IF v_receipt.status != 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed receipts can be voided';
  END IF;

  SELECT id INTO v_receivables_account_id
  FROM accounting_accounts
  WHERE system_key = 'customer_receivables';

  v_payment_account_key := CASE
    WHEN v_receipt.mode = 'cash' THEN 'cash'
    ELSE 'bank'
  END;

  SELECT id INTO v_payment_account_id
  FROM accounting_accounts
  WHERE system_key = v_payment_account_key;

  IF v_receivables_account_id IS NULL OR v_payment_account_id IS NULL THEN
    RAISE EXCEPTION 'System accounting accounts are missing';
  END IF;

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
    CURRENT_DATE,
    'customer_receipt_void',
    p_receipt_id,
    'posted',
    'Void receipt ' || coalesce(v_receipt.receipt_number, p_receipt_id::TEXT) || ': ' || trim(p_reason),
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
    v_receipt.customer_id,
    v_receipt.amount,
    0,
    'Reverse customer receipt ' || coalesce(v_receipt.receipt_number, p_receipt_id::TEXT)
  );

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
    0,
    v_receipt.amount,
    'Reverse ' || upper(v_receipt.mode) || ' receipt ' || coalesce(v_receipt.receipt_number, p_receipt_id::TEXT)
  );

  IF NOT accounting_assert_journal_balanced(v_journal_id) THEN
    RAISE EXCEPTION 'Receipt void journal is not balanced';
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
    v_receipt.customer_id,
    CURRENT_DATE,
    'reversal',
    'customer_receipt_void',
    p_receipt_id,
    v_receipt.amount,
    0,
    'Voided receipt ' || coalesce(v_receipt.receipt_number, p_receipt_id::TEXT) || ' — ' || trim(p_reason),
    v_journal_id,
    p_actor
  );

  UPDATE customer_receipts
  SET
    status = 'voided',
    voided_by = p_actor,
    voided_at = now(),
    void_reason = trim(p_reason)
  WHERE id = p_receipt_id;

  RETURN v_journal_id;
END;
$$;
