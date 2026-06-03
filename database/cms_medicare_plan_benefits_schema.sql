CREATE TABLE IF NOT EXISTS cms_medicare_plan_benefits (
  id BIGSERIAL PRIMARY KEY,
  plan_year INTEGER NOT NULL,
  contract_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  segment_id TEXT NOT NULL DEFAULT '000',
  plan_key TEXT NOT NULL,
  plan_name TEXT,
  carrier_name TEXT,
  contract_legal_name TEXT,
  plan_type TEXT,
  geography TEXT,
  cms_status TEXT,
  cms_last_updated_at TEXT,
  moop_in_network TEXT,
  moop_combined TEXT,
  moop_out_of_network TEXT,
  normalized_benefits_json JSONB,
  raw_benefits_json JSONB,
  source_file TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plan_year, contract_id, plan_id, segment_id)
);

CREATE INDEX IF NOT EXISTS idx_cms_medicare_plan_benefits_lookup
ON cms_medicare_plan_benefits (plan_year, plan_key);

CREATE INDEX IF NOT EXISTS idx_cms_medicare_plan_benefits_carrier
ON cms_medicare_plan_benefits (carrier_name);

CREATE TABLE IF NOT EXISTS cms_medicare_import_runs (
  id BIGSERIAL PRIMARY KEY,
  plan_year INTEGER NOT NULL,
  source_name TEXT,
  files_processed INTEGER NOT NULL DEFAULT 0,
  plans_added INTEGER NOT NULL DEFAULT 0,
  plans_updated INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
