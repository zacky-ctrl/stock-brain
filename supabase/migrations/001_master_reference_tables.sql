-- ============================================================
-- Stock Brain — Migration 001: Master / Reference Tables
-- ============================================================
-- These are the leaf nodes of the dependency graph. Every
-- business table foreign-keys into one or more of these.
-- They must be applied first and in this file's internal order.
--
-- Design decisions enforced here:
--   - sizes and shape_designs are reference tables, NOT Postgres
--     enums. New values = one INSERT, zero schema migrations.
--   - is_standard distinguishes catalog items from special/rare
--     items added for specific customers.
--   - is_active + sort_order on all extensible tables.
--   - bindi_colours and dabbi_colours are completely separate
--     tables. They are different attributes, different FKs,
--     and must never be conflated in queries.
--   - customers carries brand_rule: the default brand policy
--     applied at dispatch time when no line-level override exists.
--   - users extends Supabase auth.users via a trigger. The UUID
--     id matches auth.users(id) exactly.
--
-- All tables have RLS enabled. Policies are defined in Phase 3.
-- During development, use the service_role key to access data.
-- ============================================================

-- ------------------------------------------------------------
-- Shared trigger function: maintain updated_at on mutation
-- Defined once here; all subsequent migrations use it.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- Sequence for labour unit serial numbers
-- Labour units are identified by name + serial number (from 1).
-- Domain layer calls nextval() when registering a new labour unit.
-- ------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS labour_unit_serial_seq
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

-- ============================================================
-- BRANDS
-- ============================================================
-- Two brands in current operation: NIRANKARI and SUHELA.
-- Brand is a PACKAGING distinction, not a cutting distinction.
-- Brand identity is irrelevant at cuttings stage.
-- Brand becomes load-bearing at ready stock, order lines,
-- labour job issue, and dispatch stages.
--
-- A third brand requires a business decision + one INSERT.
-- It does not require a schema migration.
CREATE TABLE brands (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT    NOT NULL UNIQUE,  -- 'NIRANKARI', 'SUHELA'
  name        TEXT    NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_brands_updated_at
  BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- DABBI COLOURS
-- ============================================================
-- Yellow and White only. These are the packaging dabbi colours.
-- This is NOT the bindi colour (CLR). They are different attributes
-- with different FKs throughout the schema.
--
-- No substitution between Yellow and White without a formal
-- stock_correction record with reason. The domain layer enforces
-- this at dispatch time.
CREATE TABLE dabbi_colours (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT    NOT NULL UNIQUE,  -- 'YELLOW', 'WHITE'
  name        TEXT    NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_dabbi_colours_updated_at
  BEFORE UPDATE ON dabbi_colours
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE dabbi_colours ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- BINDI COLOURS
-- ============================================================
-- The colour of the bindi itself. This is the CLR field in the
-- order book. Completely separate from dabbi colour.
-- Bindi colour is relevant from cuttings stage onward.
-- Dabbi colour is relevant from order placement onward.
-- These two attributes must never be stored in the same column
-- or confused in queries.
CREATE TABLE bindi_colours (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT    NOT NULL UNIQUE,  -- 'D', 'M', 'R', 'CF', 'BK', 'MIX'
  name        TEXT    NOT NULL,          -- 'Deep Red', 'Maroon', 'Red', 'Coffee', 'Black', 'Mix'
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_bindi_colours_updated_at
  BEFORE UPDATE ON bindi_colours
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE bindi_colours ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SHAPE DESIGNS
-- ============================================================
-- Shape and design are the same concept in this business.
-- The shape_design is the first dimension of the cuttings-stage
-- SKU key: (shape_design, bindi_colour, size).
--
-- Current values: Round, Oval, Capsul, Chand, STK, Star, Square, Barfi.
-- Catalog grows over time. Adding a new shape = one INSERT, no migration.
--
-- is_standard = true  → standard catalog shape used in all planning views
-- is_standard = false → special/custom shape for specific customers;
--                       visible and valid system-wide but filtered out of
--                       standard planning views by the UI layer
-- sort_order controls display sequence in planning and order screens.
CREATE TABLE shape_designs (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT    NOT NULL UNIQUE,  -- 'ROUND', 'OVAL', 'CAPSUL', etc.
  name         TEXT    NOT NULL,          -- 'Round', 'Oval', 'Capsul', etc.
  is_standard  BOOLEAN NOT NULL DEFAULT true,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_shape_designs_updated_at
  BEFORE UPDATE ON shape_designs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE shape_designs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SIZES
-- ============================================================
-- Bindi sizes. Current active set: 000, 00, 0, 1, 2, 3, 4, 5, 6, 0.1, 0000.
-- Sizes are STRING codes, not numeric values. '0.1' is a label, not decimal.
-- The complete SKU key at cuttings stage is (shape_design, bindi_colour, size).
--
-- is_standard = true  → standard catalog size, appears in all planning views
-- is_standard = false → special size for a small subset of customers;
--                       fully valid on any order line, but filtered from
--                       default planning views unless explicitly requested
--
-- Adding a new size (standard or special) = one INSERT, no migration.
-- sort_order preserves the operational sequence used in planning.
CREATE TABLE sizes (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT    NOT NULL UNIQUE,  -- '000', '00', '0', '1', ..., '0.1', '0000'
  name         TEXT    NOT NULL,          -- display label; usually same as code
  is_standard  BOOLEAN NOT NULL DEFAULT true,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_sizes_updated_at
  BEFORE UPDATE ON sizes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE sizes ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- CUSTOMERS
-- ============================================================
-- Party master. Every order references a customer.
-- brand_rule is the default dispatch policy for this customer:
--
--   no_preference    → either NIRANKARI or SUHELA may be dispatched
--   prefer_nirankari → prefer NIRANKARI; SUHELA allowed if unavailable
--   prefer_suhela    → prefer SUHELA; NIRANKARI allowed if unavailable
--   strict_nirankari → ONLY NIRANKARI; substitution blocked
--   strict_suhela    → ONLY SUHELA; substitution blocked
--
-- brand_rule is NOT NULL; every customer must have an explicit
-- rule even if it is 'no_preference'. The domain layer uses this
-- at labour job issue time and at dispatch time.
--
-- Individual order_lines may override brand_rule at line level
-- (brand_id_override on order_lines). The customer-level rule is
-- the fallback when no line-level override is set.
--
-- priority_weight feeds into the planning engine's priority sort.
-- 1 = lowest priority, 10 = highest. Hard manual overrides on
-- order_lines rank above this.
CREATE TABLE customers (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT    NOT NULL,
  contact_phone     TEXT,
  contact_address   TEXT,
  area              TEXT,    -- geographic area for exclusivity context
  brand_rule        TEXT    NOT NULL DEFAULT 'no_preference'
    CHECK (brand_rule IN (
      'no_preference',
      'prefer_nirankari',
      'prefer_suhela',
      'strict_nirankari',
      'strict_suhela'
    )),
  priority_weight   INTEGER NOT NULL DEFAULT 5
    CHECK (priority_weight BETWEEN 1 AND 10),
  payment_risk_flag BOOLEAN NOT NULL DEFAULT false,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- MACHINES
-- ============================================================
-- Cutting machine reference. Identifies which machine ran each
-- cutting session. Machine identity is tracked for operational
-- records but does not affect SKU identity or stock math.
CREATE TABLE machines (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_machines_updated_at
  BEFORE UPDATE ON machines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE machines ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- LABOUR UNITS
-- ============================================================
-- External packaging labour reference. Labour units receive cut
-- bindis from the factory, perform filling + dabbi packing +
-- box packaging as one combined stage, and return finished goods.
--
-- Identified by name and a sequential serial number starting at 1.
-- Serial number is a business identifier, distinct from the UUID pk.
-- Domain layer calls nextval('labour_unit_serial_seq') on creation.
CREATE TABLE labour_units (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number  INTEGER NOT NULL UNIQUE,  -- business identifier, starts at 1
  name           TEXT    NOT NULL,
  contact        TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_labour_units_updated_at
  BEFORE UPDATE ON labour_units
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE labour_units ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- USERS
-- ============================================================
-- Application-layer extension of Supabase auth.users.
-- id matches auth.users(id) exactly — not independently generated.
-- Every audit trail entry, correction, and override in the system
-- must reference a user. No anonymous mutations are permitted.
--
-- The trigger below auto-creates a users row when auth.users
-- receives a new registration. Admin promotes role via UPDATE.
-- Direct updates to auth.users are not reflected here automatically
-- beyond initial creation — name/email updates need explicit handling.
CREATE TABLE users (
  id          UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  email       TEXT    NOT NULL UNIQUE,
  role        TEXT    NOT NULL DEFAULT 'operator'
    CHECK (role IN ('admin', 'operator')),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Bridge trigger: when Supabase Auth creates a user, create the
-- corresponding application users row with default operator role.
-- Admin promotes role via an explicit UPDATE after creation.
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'operator'
  )
  ON CONFLICT (id) DO NOTHING;  -- idempotent; safe on retry
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- ============================================================
-- SEED DATA — Known Fixed Reference Values
-- ============================================================
-- These rows reflect real business values confirmed in the
-- business blueprint. Do not alter codes after data exists —
-- codes are used as business keys in reporting and domain logic.

INSERT INTO brands (code, name) VALUES
  ('NIRANKARI', 'Nirankari'),
  ('SUHELA',    'Suhela');

INSERT INTO dabbi_colours (code, name) VALUES
  ('YELLOW', 'Yellow'),
  ('WHITE',  'White');

-- CLR codes from the order book. sort_order follows operational sequence.
INSERT INTO bindi_colours (code, name, sort_order) VALUES
  ('D',   'Deep Red', 1),
  ('M',   'Maroon',   2),
  ('R',   'Red',      3),
  ('CF',  'Coffee',   4),
  ('BK',  'Black',    5),
  ('MIX', 'Mix',      6);

-- Shape/design catalog. All current values are standard.
-- sort_order is approximate; adjust via UPDATE as needed.
INSERT INTO shape_designs (code, name, sort_order, is_standard) VALUES
  ('ROUND',  'Round',  1, true),
  ('OVAL',   'Oval',   2, true),
  ('CAPSUL', 'Capsul', 3, true),
  ('CHAND',  'Chand',  4, true),
  ('STK',    'STK',    5, true),
  ('STAR',   'Star',   6, true),
  ('SQUARE', 'Square', 7, true),
  ('BARFI',  'Barfi',  8, true);

-- Sizes from the order book grid. Codes are strings, not numbers.
-- sort_order follows the order provided in the business blueprint.
-- All current values are standard. Special/rare sizes = INSERT with is_standard = false.
INSERT INTO sizes (code, name, sort_order, is_standard) VALUES
  ('000',  '000',  1,  true),
  ('00',   '00',   2,  true),
  ('0',    '0',    3,  true),
  ('1',    '1',    4,  true),
  ('2',    '2',    5,  true),
  ('3',    '3',    6,  true),
  ('4',    '4',    7,  true),
  ('5',    '5',    8,  true),
  ('6',    '6',    9,  true),
  ('0.1',  '0.1',  10, true),
  ('0000', '0000', 11, true);
