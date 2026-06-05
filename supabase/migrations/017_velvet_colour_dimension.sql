-- ============================================================
-- Migration 017: Velvet Colour Dimension
-- ============================================================
-- Adds bindi_colour_id to velvet_receipts and velvet_stock_balance.
--
-- Business reality: Maroon velvet produces M-colour bindis only.
-- Velvet colour = bindi_colour (same master table, same UUID).
--
-- bindi_colour_id is NULLABLE. NULL = generic pool (not colour-specific).
-- Existing rows receive NULL, which means they belong to the generic pool.
-- The seeded 'standard' row in velvet_stock_balance remains the generic pool.
--
-- Prerequisite: migrations 001–016 must be applied first.
-- ============================================================

ALTER TABLE velvet_receipts
  ADD COLUMN IF NOT EXISTS bindi_colour_id UUID
  REFERENCES bindi_colours(id) ON DELETE RESTRICT;

ALTER TABLE velvet_stock_balance
  ADD COLUMN IF NOT EXISTS bindi_colour_id UUID
  REFERENCES bindi_colours(id) ON DELETE RESTRICT;

-- Drop the old single-column unique constraint
ALTER TABLE velvet_stock_balance
  DROP CONSTRAINT IF EXISTS velvet_stock_balance_velvet_type_key;

-- New constraint covers (velvet_type, bindi_colour_id).
-- Note: PostgreSQL treats NULLs as distinct in unique constraints, so
-- (standard, NULL) rows are not protected from duplicates at DB level.
-- The domain layer enforces that only one NULL row exists per velvet_type.
ALTER TABLE velvet_stock_balance
  ADD CONSTRAINT velvet_stock_balance_velvet_type_colour_key
  UNIQUE (velvet_type, bindi_colour_id);
