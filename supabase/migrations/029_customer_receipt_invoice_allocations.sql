-- ============================================================
-- Stock Brain — Migration 029: Customer Receipt Invoice Allocation
-- ============================================================
-- Extends receipt posting so a payment can be linked to pending invoice
-- numbers while preserving one atomic money transaction.
-- ============================================================

CREATE OR REPLACE FUNCTION post_customer_receipt(
  p_customer_id UUID,
  p_receipt_date DATE,
  p_amount NUMERIC,
  p_mode TEXT,
  p_reference TEXT,
  p_notes TEXT,
  p_actor UUID,
  p_allocations JSONB DEFAULT '[]'::JSONB
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
  v_alloc JSONB;
  v_invoice_id UUID;
  v_alloc_amount NUMERIC(14,2);
  v_invoice_total NUMERIC(14,2);
  v_invoice_number TEXT;
  v_existing_allocated NUMERIC(14,2);
  v_total_allocated NUMERIC(14,2) := 0;
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

  IF jsonb_typeof(coalesce(p_allocations, '[]'::JSONB)) != 'array' THEN
    RAISE EXCEPTION 'Receipt allocations must be an array';
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

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(coalesce(p_allocations, '[]'::JSONB))
  LOOP
    v_invoice_id := (v_alloc ->> 'invoice_id')::UUID;
    v_alloc_amount := (v_alloc ->> 'amount')::NUMERIC(14,2);

    IF v_invoice_id IS NULL OR v_alloc_amount IS NULL OR v_alloc_amount <= 0 THEN
      RAISE EXCEPTION 'Invalid invoice allocation';
    END IF;

    SELECT invoice_number, total_amount
    INTO v_invoice_number, v_invoice_total
    FROM sales_invoices
    WHERE id = v_invoice_id
      AND customer_id = p_customer_id
      AND status = 'issued';

    IF v_invoice_total IS NULL THEN
      RAISE EXCEPTION 'Invoice allocation does not belong to this customer or is not issued';
    END IF;

    SELECT coalesce(sum(allocation.amount_allocated), 0)::NUMERIC(14,2)
    INTO v_existing_allocated
    FROM sales_invoice_receipt_allocations allocation
    JOIN customer_receipts receipt
      ON receipt.id = allocation.customer_receipt_id
    WHERE allocation.sales_invoice_id = v_invoice_id
      AND receipt.status = 'confirmed';

    IF v_alloc_amount > (v_invoice_total - v_existing_allocated) THEN
      RAISE EXCEPTION 'Allocation exceeds outstanding amount for invoice %', coalesce(v_invoice_number, v_invoice_id::TEXT);
    END IF;

    v_total_allocated := v_total_allocated + v_alloc_amount;
  END LOOP;

  IF v_total_allocated > p_amount THEN
    RAISE EXCEPTION 'Invoice allocations cannot exceed receipt amount';
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

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(coalesce(p_allocations, '[]'::JSONB))
  LOOP
    v_invoice_id := (v_alloc ->> 'invoice_id')::UUID;
    v_alloc_amount := (v_alloc ->> 'amount')::NUMERIC(14,2);

    INSERT INTO sales_invoice_receipt_allocations (
      sales_invoice_id,
      customer_receipt_id,
      amount_allocated
    )
    VALUES (
      v_invoice_id,
      v_receipt_id,
      v_alloc_amount
    );
  END LOOP;

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
    CASE
      WHEN v_total_allocated > 0 AND v_total_allocated < p_amount THEN
        'Receipt ' || v_receipt_number || ' (' || v_total_allocated || ' allocated, ' || (p_amount - v_total_allocated) || ' advance)'
      WHEN v_total_allocated > 0 THEN
        'Receipt ' || v_receipt_number || ' (' || v_total_allocated || ' allocated)'
      ELSE
        'Receipt ' || v_receipt_number || ' (advance/unallocated)'
    END,
    v_journal_id,
    p_actor
  );

  UPDATE customer_receipts
  SET accounting_journal_entry_id = v_journal_id
  WHERE id = v_receipt_id;

  RETURN v_receipt_id;
END;
$$;
