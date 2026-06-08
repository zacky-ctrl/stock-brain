-- ============================================================
-- Stock Brain — Migration 032: Purchase Accounting Foundation
-- ============================================================
-- Adds supplier-side accounting:
--   - suppliers
--   - purchase bills + bill lines
--   - supplier payments with bill allocations
--   - supplier ledger
--   - atomic posting functions for confirmed bills and payments
--
-- No GST/tax model is included. Purchase rates are per selected unit.
-- Inventory-impact lines are identified, but stock mutation remains explicit.
-- ============================================================

-- ------------------------------------------------------------
-- Numbering
-- ------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS purchase_bill_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS supplier_payment_number_seq START 1;

CREATE OR REPLACE FUNCTION next_purchase_bill_number()
RETURNS TEXT
LANGUAGE SQL
AS $$
  SELECT 'PB-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('purchase_bill_number_seq')::TEXT, 5, '0');
$$;

CREATE OR REPLACE FUNCTION next_supplier_payment_number()
RETURNS TEXT
LANGUAGE SQL
AS $$
  SELECT 'SP-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('supplier_payment_number_seq')::TEXT, 5, '0');
$$;

-- ------------------------------------------------------------
-- Suppliers
-- ------------------------------------------------------------
CREATE TABLE suppliers (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                       TEXT NOT NULL,
  entity_name                TEXT,
  address                    TEXT,
  phone_number               TEXT,
  payment_terms_days         INTEGER NOT NULL DEFAULT 0 CHECK (payment_terms_days >= 0),
  opening_balance_amount     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (opening_balance_amount >= 0),
  opening_balance_type       TEXT NOT NULL DEFAULT 'none'
    CHECK (opening_balance_type IN ('none', 'payable', 'advance')),
  notes                      TEXT,
  is_active                  BOOLEAN NOT NULL DEFAULT true,
  created_by                 UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_name_not_blank CHECK (nullif(trim(name), '') IS NOT NULL)
);

CREATE UNIQUE INDEX suppliers_active_name_unique
  ON suppliers (lower(trim(name)))
  WHERE is_active = true;

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- Supplier-aware journal lines.
ALTER TABLE accounting_journal_lines
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_accounting_journal_lines_supplier
  ON accounting_journal_lines (supplier_id)
  WHERE supplier_id IS NOT NULL;

-- ------------------------------------------------------------
-- Purchase accounts
-- ------------------------------------------------------------
INSERT INTO accounting_accounts (code, name, account_type, normal_balance, system_key, is_system)
VALUES
  ('1200', 'Purchase Inventory', 'asset', 'debit', 'purchase_inventory', true),
  ('2100', 'Supplier Payables', 'liability', 'credit', 'supplier_payables', true),
  ('5000', 'Purchase Expense', 'expense', 'debit', 'purchase_expense', true),
  ('5090', 'Purchase Discounts / Adjustments', 'expense', 'credit', 'purchase_discounts', true)
ON CONFLICT (system_key) DO NOTHING;

-- ------------------------------------------------------------
-- Purchase bills
-- ------------------------------------------------------------
CREATE TABLE purchase_bills (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_bill_number        TEXT UNIQUE,
  supplier_bill_number        TEXT,
  supplier_id                 UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  purchase_date               DATE NOT NULL,
  due_date                    DATE,
  status                      TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'voided')),

  supplier_name_snapshot      TEXT NOT NULL,
  entity_name_snapshot        TEXT,
  address_snapshot            TEXT,
  phone_snapshot              TEXT,

  goods_amount                NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (goods_amount >= 0),
  inventory_amount            NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (inventory_amount >= 0),
  expense_amount              NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (expense_amount >= 0),
  transport_charges           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (transport_charges >= 0),
  other_charges               NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (other_charges >= 0),
  discount_amount             NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  round_off_amount            NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount                NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),

  stock_impact_status         TEXT NOT NULL DEFAULT 'none'
    CHECK (stock_impact_status IN ('none', 'pending', 'applied')),
  accounting_journal_entry_id UUID REFERENCES accounting_journal_entries(id) ON DELETE RESTRICT,
  notes                       TEXT,
  confirmed_by                UUID REFERENCES users(id) ON DELETE RESTRICT,
  confirmed_at                TIMESTAMPTZ,
  voided_by                   UUID REFERENCES users(id) ON DELETE RESTRICT,
  voided_at                   TIMESTAMPTZ,
  void_reason                 TEXT,
  created_by                  UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT confirmed_purchase_bill_fields CHECK (
    status != 'confirmed'
    OR (purchase_bill_number IS NOT NULL AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
  ),
  CONSTRAINT voided_purchase_bill_fields CHECK (
    status != 'voided'
    OR (voided_by IS NOT NULL AND voided_at IS NOT NULL AND nullif(trim(void_reason), '') IS NOT NULL)
  )
);

CREATE TRIGGER trg_purchase_bills_updated_at
  BEFORE UPDATE ON purchase_bills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_purchase_bills_supplier
  ON purchase_bills (supplier_id, purchase_date DESC);

CREATE INDEX idx_purchase_bills_status
  ON purchase_bills (status, purchase_date DESC);

ALTER TABLE purchase_bills ENABLE ROW LEVEL SECURITY;

CREATE TABLE purchase_bill_lines (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_bill_id           UUID NOT NULL REFERENCES purchase_bills(id) ON DELETE RESTRICT,
  line_type                  TEXT NOT NULL
    CHECK (line_type IN ('velvet', 'direct_ready_stock', 'direct_cuttings', 'packaging_material', 'expense')),
  description                TEXT NOT NULL,
  quantity                   NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit                       TEXT NOT NULL,
  rate_per_unit              NUMERIC(12,2) NOT NULL CHECK (rate_per_unit >= 0),
  line_amount                NUMERIC(14,2) NOT NULL CHECK (line_amount >= 0),

  stock_stage                TEXT NOT NULL DEFAULT 'none'
    CHECK (stock_stage IN ('none', 'velvet', 'cuttings', 'ready', 'packaging')),
  shape_design_id            UUID REFERENCES shape_designs(id) ON DELETE RESTRICT,
  bindi_colour_id            UUID REFERENCES bindi_colours(id) ON DELETE RESTRICT,
  size_id                    UUID REFERENCES sizes(id) ON DELETE RESTRICT,
  dabbi_colour_id            UUID REFERENCES dabbi_colours(id) ON DELETE RESTRICT,
  brand_id                   UUID REFERENCES brands(id) ON DELETE RESTRICT,
  velvet_colour_id           UUID REFERENCES bindi_colours(id) ON DELETE RESTRICT,
  stock_quantity_gross       NUMERIC(10,3),
  stock_quantity_metres      NUMERIC(12,3),
  stock_quantity_bundles     NUMERIC(12,3),
  notes                      TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT purchase_bill_line_description_not_blank CHECK (nullif(trim(description), '') IS NOT NULL)
);

CREATE INDEX idx_purchase_bill_lines_bill
  ON purchase_bill_lines (purchase_bill_id);

ALTER TABLE purchase_bill_lines ENABLE ROW LEVEL SECURITY;

CREATE TABLE purchase_bill_audit_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_bill_id  UUID NOT NULL REFERENCES purchase_bills(id) ON DELETE RESTRICT,
  event_type        TEXT NOT NULL,
  field_name        TEXT,
  old_value         TEXT,
  new_value         TEXT,
  reason            TEXT,
  actor_id          UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchase_bill_audit_events_bill
  ON purchase_bill_audit_events (purchase_bill_id, created_at DESC);

ALTER TABLE purchase_bill_audit_events ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Supplier payments and supplier ledger
-- ------------------------------------------------------------
CREATE TABLE supplier_payments (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number              TEXT UNIQUE,
  supplier_id                 UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  payment_date                DATE NOT NULL,
  amount                      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  mode                        TEXT NOT NULL
    CHECK (mode IN ('cash', 'bank', 'upi', 'cheque', 'other')),
  reference                   TEXT,
  notes                       TEXT,
  status                      TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'voided')),
  accounting_journal_entry_id UUID REFERENCES accounting_journal_entries(id) ON DELETE RESTRICT,
  paid_by                     UUID REFERENCES users(id) ON DELETE RESTRICT,
  voided_by                   UUID REFERENCES users(id) ON DELETE RESTRICT,
  voided_at                   TIMESTAMPTZ,
  void_reason                 TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT voided_supplier_payment_fields CHECK (
    status != 'voided'
    OR (voided_by IS NOT NULL AND voided_at IS NOT NULL AND nullif(trim(void_reason), '') IS NOT NULL)
  )
);

CREATE TRIGGER trg_supplier_payments_updated_at
  BEFORE UPDATE ON supplier_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_supplier_payments_supplier
  ON supplier_payments (supplier_id, payment_date DESC);

ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;

CREATE TABLE purchase_bill_payment_allocations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_bill_id     UUID NOT NULL REFERENCES purchase_bills(id) ON DELETE RESTRICT,
  supplier_payment_id  UUID NOT NULL REFERENCES supplier_payments(id) ON DELETE RESTRICT,
  amount_allocated     NUMERIC(14,2) NOT NULL CHECK (amount_allocated > 0),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (purchase_bill_id, supplier_payment_id)
);

CREATE INDEX idx_purchase_bill_payment_allocations_payment
  ON purchase_bill_payment_allocations (supplier_payment_id);

ALTER TABLE purchase_bill_payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE TABLE supplier_ledger_entries (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id                 UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  entry_date                  DATE NOT NULL,
  entry_type                  TEXT NOT NULL
    CHECK (entry_type IN ('opening', 'purchase_bill', 'payment', 'debit_note', 'credit_note', 'reversal')),
  source_type                 TEXT NOT NULL,
  source_id                   UUID,
  debit_amount                NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount               NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  description                 TEXT NOT NULL,
  accounting_journal_entry_id UUID REFERENCES accounting_journal_entries(id) ON DELETE RESTRICT,
  created_by                  UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT supplier_ledger_one_sided CHECK (
    (debit_amount > 0 AND credit_amount = 0)
    OR (credit_amount > 0 AND debit_amount = 0)
  )
);

CREATE INDEX idx_supplier_ledger_entries_supplier
  ON supplier_ledger_entries (supplier_id, entry_date DESC, created_at DESC);

CREATE INDEX idx_supplier_ledger_entries_source
  ON supplier_ledger_entries (source_type, source_id);

ALTER TABLE supplier_ledger_entries ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Purchase bill posting
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION confirm_purchase_bill(
  p_purchase_bill_id UUID,
  p_actor UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bill purchase_bills%ROWTYPE;
  v_journal_id UUID;
  v_bill_number TEXT;
  v_inventory_account_id UUID;
  v_expense_account_id UUID;
  v_discount_account_id UUID;
  v_payable_account_id UUID;
  v_expense_debit NUMERIC(14,2);
  v_discount_credit NUMERIC(14,2);
BEGIN
  IF p_purchase_bill_id IS NULL THEN
    RAISE EXCEPTION 'Purchase bill is required';
  END IF;

  SELECT *
  INTO v_bill
  FROM purchase_bills
  WHERE id = p_purchase_bill_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase bill not found';
  END IF;

  IF v_bill.status = 'confirmed' THEN
    RETURN v_bill.accounting_journal_entry_id;
  END IF;

  IF v_bill.status != 'draft' THEN
    RAISE EXCEPTION 'Only draft purchase bills can be confirmed';
  END IF;

  IF v_bill.total_amount <= 0 THEN
    RAISE EXCEPTION 'Purchase bill total must be greater than zero';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM purchase_bill_lines WHERE purchase_bill_id = p_purchase_bill_id) THEN
    RAISE EXCEPTION 'Purchase bill must have at least one line';
  END IF;

  SELECT id INTO v_inventory_account_id
  FROM accounting_accounts
  WHERE system_key = 'purchase_inventory';

  SELECT id INTO v_expense_account_id
  FROM accounting_accounts
  WHERE system_key = 'purchase_expense';

  SELECT id INTO v_discount_account_id
  FROM accounting_accounts
  WHERE system_key = 'purchase_discounts';

  SELECT id INTO v_payable_account_id
  FROM accounting_accounts
  WHERE system_key = 'supplier_payables';

  IF v_inventory_account_id IS NULL
     OR v_expense_account_id IS NULL
     OR v_discount_account_id IS NULL
     OR v_payable_account_id IS NULL THEN
    RAISE EXCEPTION 'System purchase accounting accounts are missing';
  END IF;

  v_bill_number := coalesce(v_bill.purchase_bill_number, next_purchase_bill_number());
  v_expense_debit := (
    v_bill.expense_amount
    + v_bill.transport_charges
    + v_bill.other_charges
    + greatest(v_bill.round_off_amount, 0)
  )::NUMERIC(14,2);
  v_discount_credit := (
    v_bill.discount_amount
    + greatest(-v_bill.round_off_amount, 0)
  )::NUMERIC(14,2);

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
    v_bill.purchase_date,
    'purchase_bill',
    p_purchase_bill_id,
    'posted',
    'Purchase bill ' || v_bill_number,
    p_actor,
    now(),
    p_actor
  )
  RETURNING id INTO v_journal_id;

  IF v_bill.inventory_amount > 0 THEN
    INSERT INTO accounting_journal_lines (
      journal_entry_id,
      account_id,
      supplier_id,
      debit_amount,
      credit_amount,
      memo
    )
    VALUES (
      v_journal_id,
      v_inventory_account_id,
      v_bill.supplier_id,
      v_bill.inventory_amount,
      0,
      'Inventory purchase — ' || v_bill.supplier_name_snapshot
    );
  END IF;

  IF v_expense_debit > 0 THEN
    INSERT INTO accounting_journal_lines (
      journal_entry_id,
      account_id,
      supplier_id,
      debit_amount,
      credit_amount,
      memo
    )
    VALUES (
      v_journal_id,
      v_expense_account_id,
      v_bill.supplier_id,
      v_expense_debit,
      0,
      'Purchase expenses and charges — ' || v_bill.supplier_name_snapshot
    );
  END IF;

  IF v_discount_credit > 0 THEN
    INSERT INTO accounting_journal_lines (
      journal_entry_id,
      account_id,
      supplier_id,
      debit_amount,
      credit_amount,
      memo
    )
    VALUES (
      v_journal_id,
      v_discount_account_id,
      v_bill.supplier_id,
      0,
      v_discount_credit,
      'Purchase discount / negative round off — ' || v_bill.supplier_name_snapshot
    );
  END IF;

  INSERT INTO accounting_journal_lines (
    journal_entry_id,
    account_id,
    supplier_id,
    debit_amount,
    credit_amount,
    memo
  )
  VALUES (
    v_journal_id,
    v_payable_account_id,
    v_bill.supplier_id,
    0,
    v_bill.total_amount,
    'Payable to ' || v_bill.supplier_name_snapshot || ' — ' || v_bill_number
  );

  IF NOT accounting_assert_journal_balanced(v_journal_id) THEN
    RAISE EXCEPTION 'Purchase bill journal is not balanced';
  END IF;

  INSERT INTO supplier_ledger_entries (
    supplier_id,
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
    v_bill.supplier_id,
    v_bill.purchase_date,
    'purchase_bill',
    'purchase_bill',
    p_purchase_bill_id,
    0,
    v_bill.total_amount,
    'Purchase bill ' || v_bill_number,
    v_journal_id,
    p_actor
  );

  UPDATE purchase_bills
  SET
    purchase_bill_number = v_bill_number,
    status = 'confirmed',
    accounting_journal_entry_id = v_journal_id,
    confirmed_by = p_actor,
    confirmed_at = now()
  WHERE id = p_purchase_bill_id;

  RETURN v_journal_id;
END;
$$;

-- ------------------------------------------------------------
-- Supplier payment posting
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION post_supplier_payment(
  p_supplier_id UUID,
  p_payment_date DATE,
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
  v_payment_id UUID;
  v_payment_number TEXT;
  v_journal_id UUID;
  v_payable_account_id UUID;
  v_payment_account_id UUID;
  v_supplier_name TEXT;
  v_payment_account_key TEXT;
  v_alloc JSONB;
  v_bill_id UUID;
  v_alloc_amount NUMERIC(14,2);
  v_bill_total NUMERIC(14,2);
  v_bill_number TEXT;
  v_existing_allocated NUMERIC(14,2);
  v_total_allocated NUMERIC(14,2) := 0;
BEGIN
  IF p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Supplier is required';
  END IF;

  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'Payment date is required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  IF p_mode NOT IN ('cash', 'bank', 'upi', 'cheque', 'other') THEN
    RAISE EXCEPTION 'Invalid payment mode';
  END IF;

  IF jsonb_typeof(coalesce(p_allocations, '[]'::JSONB)) != 'array' THEN
    RAISE EXCEPTION 'Payment allocations must be an array';
  END IF;

  SELECT name
  INTO v_supplier_name
  FROM suppliers
  WHERE id = p_supplier_id;

  IF v_supplier_name IS NULL THEN
    RAISE EXCEPTION 'Supplier not found';
  END IF;

  SELECT id INTO v_payable_account_id
  FROM accounting_accounts
  WHERE system_key = 'supplier_payables';

  v_payment_account_key := CASE
    WHEN p_mode = 'cash' THEN 'cash'
    ELSE 'bank'
  END;

  SELECT id INTO v_payment_account_id
  FROM accounting_accounts
  WHERE system_key = v_payment_account_key;

  IF v_payable_account_id IS NULL OR v_payment_account_id IS NULL THEN
    RAISE EXCEPTION 'System accounting accounts are missing';
  END IF;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(coalesce(p_allocations, '[]'::JSONB))
  LOOP
    v_bill_id := (v_alloc ->> 'bill_id')::UUID;
    v_alloc_amount := (v_alloc ->> 'amount')::NUMERIC(14,2);

    IF v_bill_id IS NULL OR v_alloc_amount IS NULL OR v_alloc_amount <= 0 THEN
      RAISE EXCEPTION 'Invalid purchase bill allocation';
    END IF;

    SELECT purchase_bill_number, total_amount
    INTO v_bill_number, v_bill_total
    FROM purchase_bills
    WHERE id = v_bill_id
      AND supplier_id = p_supplier_id
      AND status = 'confirmed';

    IF v_bill_total IS NULL THEN
      RAISE EXCEPTION 'Purchase bill allocation does not belong to this supplier or is not confirmed';
    END IF;

    SELECT coalesce(sum(allocation.amount_allocated), 0)::NUMERIC(14,2)
    INTO v_existing_allocated
    FROM purchase_bill_payment_allocations allocation
    JOIN supplier_payments payment
      ON payment.id = allocation.supplier_payment_id
    WHERE allocation.purchase_bill_id = v_bill_id
      AND payment.status = 'confirmed';

    IF v_alloc_amount > (v_bill_total - v_existing_allocated) THEN
      RAISE EXCEPTION 'Allocation exceeds outstanding amount for purchase bill %', coalesce(v_bill_number, v_bill_id::TEXT);
    END IF;

    v_total_allocated := v_total_allocated + v_alloc_amount;
  END LOOP;

  IF v_total_allocated > p_amount THEN
    RAISE EXCEPTION 'Purchase bill allocations cannot exceed payment amount';
  END IF;

  v_payment_number := next_supplier_payment_number();

  INSERT INTO supplier_payments (
    payment_number,
    supplier_id,
    payment_date,
    amount,
    mode,
    reference,
    notes,
    status,
    paid_by
  )
  VALUES (
    v_payment_number,
    p_supplier_id,
    p_payment_date,
    p_amount,
    p_mode,
    nullif(trim(coalesce(p_reference, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    'confirmed',
    p_actor
  )
  RETURNING id INTO v_payment_id;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(coalesce(p_allocations, '[]'::JSONB))
  LOOP
    v_bill_id := (v_alloc ->> 'bill_id')::UUID;
    v_alloc_amount := (v_alloc ->> 'amount')::NUMERIC(14,2);

    INSERT INTO purchase_bill_payment_allocations (
      purchase_bill_id,
      supplier_payment_id,
      amount_allocated
    )
    VALUES (
      v_bill_id,
      v_payment_id,
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
    p_payment_date,
    'supplier_payment',
    v_payment_id,
    'posted',
    'Supplier payment ' || v_payment_number,
    p_actor,
    now(),
    p_actor
  )
  RETURNING id INTO v_journal_id;

  INSERT INTO accounting_journal_lines (
    journal_entry_id,
    account_id,
    supplier_id,
    debit_amount,
    credit_amount,
    memo
  )
  VALUES (
    v_journal_id,
    v_payable_account_id,
    p_supplier_id,
    p_amount,
    0,
    'Supplier payment to ' || v_supplier_name || ' — ' || v_payment_number
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
    p_amount,
    upper(p_mode) || ' payment ' || v_payment_number
  );

  IF NOT accounting_assert_journal_balanced(v_journal_id) THEN
    RAISE EXCEPTION 'Supplier payment journal is not balanced';
  END IF;

  INSERT INTO supplier_ledger_entries (
    supplier_id,
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
    p_supplier_id,
    p_payment_date,
    'payment',
    'supplier_payment',
    v_payment_id,
    p_amount,
    0,
    CASE
      WHEN v_total_allocated > 0 AND v_total_allocated < p_amount THEN
        'Payment ' || v_payment_number || ' (' || v_total_allocated || ' allocated, ' || (p_amount - v_total_allocated) || ' advance)'
      WHEN v_total_allocated > 0 THEN
        'Payment ' || v_payment_number || ' (' || v_total_allocated || ' allocated)'
      ELSE
        'Payment ' || v_payment_number || ' (advance/unallocated)'
    END,
    v_journal_id,
    p_actor
  );

  UPDATE supplier_payments
  SET accounting_journal_entry_id = v_journal_id
  WHERE id = v_payment_id;

  RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION void_supplier_payment(
  p_payment_id UUID,
  p_actor UUID,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment supplier_payments%ROWTYPE;
  v_journal_id UUID;
  v_payable_account_id UUID;
  v_payment_account_id UUID;
  v_payment_account_key TEXT;
BEGIN
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment is required';
  END IF;

  IF nullif(trim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Void reason is required';
  END IF;

  SELECT *
  INTO v_payment
  FROM supplier_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_payment.status = 'voided' THEN
    RETURN v_payment.accounting_journal_entry_id;
  END IF;

  IF v_payment.status != 'confirmed' THEN
    RAISE EXCEPTION 'Only confirmed supplier payments can be voided';
  END IF;

  SELECT id INTO v_payable_account_id
  FROM accounting_accounts
  WHERE system_key = 'supplier_payables';

  v_payment_account_key := CASE
    WHEN v_payment.mode = 'cash' THEN 'cash'
    ELSE 'bank'
  END;

  SELECT id INTO v_payment_account_id
  FROM accounting_accounts
  WHERE system_key = v_payment_account_key;

  IF v_payable_account_id IS NULL OR v_payment_account_id IS NULL THEN
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
    'supplier_payment_void',
    p_payment_id,
    'posted',
    'Void supplier payment ' || coalesce(v_payment.payment_number, p_payment_id::TEXT) || ': ' || trim(p_reason),
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
    v_payment.amount,
    0,
    'Reverse ' || upper(v_payment.mode) || ' payment ' || coalesce(v_payment.payment_number, p_payment_id::TEXT)
  );

  INSERT INTO accounting_journal_lines (
    journal_entry_id,
    account_id,
    supplier_id,
    debit_amount,
    credit_amount,
    memo
  )
  VALUES (
    v_journal_id,
    v_payable_account_id,
    v_payment.supplier_id,
    0,
    v_payment.amount,
    'Reverse supplier payment ' || coalesce(v_payment.payment_number, p_payment_id::TEXT)
  );

  IF NOT accounting_assert_journal_balanced(v_journal_id) THEN
    RAISE EXCEPTION 'Supplier payment void journal is not balanced';
  END IF;

  INSERT INTO supplier_ledger_entries (
    supplier_id,
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
    v_payment.supplier_id,
    CURRENT_DATE,
    'reversal',
    'supplier_payment_void',
    p_payment_id,
    0,
    v_payment.amount,
    'Voided supplier payment ' || coalesce(v_payment.payment_number, p_payment_id::TEXT) || ' — ' || trim(p_reason),
    v_journal_id,
    p_actor
  );

  UPDATE supplier_payments
  SET
    status = 'voided',
    voided_by = p_actor,
    voided_at = now(),
    void_reason = trim(p_reason)
  WHERE id = p_payment_id;

  RETURN v_journal_id;
END;
$$;

-- ------------------------------------------------------------
-- RLS policies. The server uses service role; authenticated access mirrors
-- the current accounting tables until role hardening is centralized.
-- ------------------------------------------------------------
CREATE POLICY "authenticated_all_access" ON suppliers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_access" ON purchase_bills
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_access" ON purchase_bill_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_access" ON purchase_bill_audit_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_access" ON supplier_payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_access" ON purchase_bill_payment_allocations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all_access" ON supplier_ledger_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
