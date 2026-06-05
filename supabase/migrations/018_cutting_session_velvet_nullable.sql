ALTER TABLE cutting_sessions
  ALTER COLUMN velvet_bundles_consumed DROP NOT NULL;

ALTER TABLE cutting_sessions
  ALTER COLUMN velvet_bundles_consumed SET DEFAULT 0;
