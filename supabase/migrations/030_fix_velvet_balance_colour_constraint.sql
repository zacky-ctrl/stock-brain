-- ============================================================
-- Migration 030: Fix Velvet Balance Colour Constraint
-- ============================================================
-- Some production databases still retained the original
-- UNIQUE (velvet_type) constraint after the colour dimension
-- migration. Velvet receipts are now colour-specific, so balances
-- must be unique by (velvet_type, bindi_colour_id).
-- ============================================================

ALTER TABLE velvet_stock_balance
  DROP CONSTRAINT IF EXISTS velvet_stock_balance_velvet_type_key;

ALTER TABLE velvet_stock_balance
  DROP CONSTRAINT IF EXISTS velvet_stock_balance_velvet_type_colour_key;

ALTER TABLE velvet_stock_balance
  ADD CONSTRAINT velvet_stock_balance_velvet_type_colour_key
  UNIQUE (velvet_type, bindi_colour_id);
