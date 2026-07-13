CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS reach_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid,
  agent_email citext NOT NULL UNIQUE,
  agent_name text,
  plan text NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'reach', 'reach_crm', 'full_suite')),
  client_limit integer NOT NULL DEFAULT 20,
  locked boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'cancelled')),
  source text NOT NULL DEFAULT 'reach_app',
  created_at timestamptz NOT NULL DEFAULT now(),
  upgraded_at timestamptz,
  cancelled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_reach_enrollments_agent_id
ON reach_enrollments (agent_id);

CREATE INDEX IF NOT EXISTS idx_reach_enrollments_plan_status
ON reach_enrollments (plan, status);

CREATE TABLE IF NOT EXISTS reach_free_tier_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL
    REFERENCES reach_enrollments(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  client_key text NOT NULL,
  client_mobile text,
  client_name text,
  selected_at timestamptz NOT NULL DEFAULT now(),
  locked boolean NOT NULL DEFAULT true,
  removed_at timestamptz,
  UNIQUE (enrollment_id, client_key)
);

CREATE INDEX IF NOT EXISTS idx_reach_free_tier_clients_enrollment
ON reach_free_tier_clients (enrollment_id, selected_at);

CREATE OR REPLACE FUNCTION enforce_reach_free_tier_client_limit()
RETURNS trigger AS $$
DECLARE
  enrollment reach_enrollments%ROWTYPE;
  used_count integer;
BEGIN
  SELECT *
  INTO enrollment
  FROM reach_enrollments
  WHERE id = NEW.enrollment_id
  FOR UPDATE;

  IF enrollment.plan <> 'free' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
  INTO used_count
  FROM reach_free_tier_clients
  WHERE enrollment_id = NEW.enrollment_id;

  IF used_count >= enrollment.client_limit THEN
    RAISE EXCEPTION 'Reach free tier client limit reached (% locked clients)', enrollment.client_limit;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reach_free_tier_client_limit
ON reach_free_tier_clients;

CREATE TRIGGER trg_reach_free_tier_client_limit
BEFORE INSERT ON reach_free_tier_clients
FOR EACH ROW
EXECUTE FUNCTION enforce_reach_free_tier_client_limit();

CREATE OR REPLACE FUNCTION prevent_reach_free_tier_client_delete()
RETURNS trigger AS $$
DECLARE
  enrollment_plan text;
BEGIN
  SELECT plan
  INTO enrollment_plan
  FROM reach_enrollments
  WHERE id = OLD.enrollment_id;

  IF OLD.locked = true AND enrollment_plan = 'free' THEN
    RAISE EXCEPTION 'Free tier client slots are locked and cannot be deleted';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reach_free_tier_client_delete
ON reach_free_tier_clients;

CREATE TRIGGER trg_reach_free_tier_client_delete
BEFORE DELETE ON reach_free_tier_clients
FOR EACH ROW
EXECUTE FUNCTION prevent_reach_free_tier_client_delete();
