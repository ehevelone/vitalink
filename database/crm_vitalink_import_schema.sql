-- VitaLink CRM package import foundation.
-- Phase 1 only: metadata, document references, and audit events.
-- Do not store insurance card images or continuous health-data snapshots here.

ALTER TABLE crm_clients
ADD COLUMN IF NOT EXISTS vitalink_connected BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS vitalink_app_user_id TEXT,
ADD COLUMN IF NOT EXISTS vitalink_profile_id TEXT,
ADD COLUMN IF NOT EXISTS last_vitalink_package_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_vitalink_import_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS hipaa_signed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS soa_signed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS vitalink_emergency_contacts TEXT,
ADD COLUMN IF NOT EXISTS vitalink_pharmacy_list TEXT;

CREATE TABLE IF NOT EXISTS crm_vitalink_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_agent_id TEXT NOT NULL,
  crm_client_id TEXT,
  app_user_id TEXT,
  app_profile_id TEXT,
  package_type TEXT NOT NULL DEFAULT 'vitalink_package',
  status TEXT NOT NULL DEFAULT 'received',
  client_name TEXT,
  client_dob DATE,
  client_email TEXT,
  client_phone TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_at TIMESTAMPTZ,
  imported_by_agent_id TEXT,
  hipaa_signed_at TIMESTAMPTZ,
  soa_signed_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'vitalink_app',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_vitalink_packages_agent
ON crm_vitalink_packages (crm_agent_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_vitalink_packages_client
ON crm_vitalink_packages (crm_client_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_vitalink_packages_app_user
ON crm_vitalink_packages (app_user_id, app_profile_id);

CREATE TABLE IF NOT EXISTS crm_client_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_agent_id TEXT NOT NULL,
  crm_client_id TEXT NOT NULL,
  package_id UUID REFERENCES crm_vitalink_packages(id) ON DELETE SET NULL,
  document_type TEXT NOT NULL,
  document_name TEXT,
  storage_path TEXT,
  document_url TEXT,
  document_data BYTEA,
  document_size_bytes INTEGER,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  sha256 TEXT,
  signed_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT crm_client_documents_type_check
    CHECK (document_type IN ('hipaa', 'soa', 'vitalink_csv', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_crm_client_documents_client
ON crm_client_documents (crm_client_id, document_type, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_client_documents_package
ON crm_client_documents (package_id);

CREATE TABLE IF NOT EXISTS crm_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_agent_id TEXT,
  crm_client_id TEXT,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT,
  event_type TEXT NOT NULL,
  package_id UUID REFERENCES crm_vitalink_packages(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_audit_log_event_type_check
    CHECK (
      event_type IN (
        'agent_login',
        'admin_login',
        'failed_login',
        'client_created',
        'vitalink_package_received',
        'vitalink_import_completed',
        'hipaa_received',
        'soa_received',
        'client_access_granted',
        'client_access_revoked',
        'platform_push_started'
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_crm_audit_log_agent
ON crm_audit_log (crm_agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_audit_log_client
ON crm_audit_log (crm_client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_audit_log_event
ON crm_audit_log (event_type, created_at DESC);
