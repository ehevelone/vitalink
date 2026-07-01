const crypto = require("crypto");
const db = require("./db");

const AUDIT_EVENTS = Object.freeze({
  AGENT_LOGIN: "agent_login",
  ADMIN_LOGIN: "admin_login",
  FAILED_LOGIN: "failed_login",
  CLIENT_CREATED: "client_created",
  PACKAGE_RECEIVED: "vitalink_package_received",
  IMPORT_COMPLETED: "vitalink_import_completed",
  HIPAA_RECEIVED: "hipaa_received",
  SOA_RECEIVED: "soa_received",
  CLIENT_ACCESS_GRANTED: "client_access_granted",
  CLIENT_ACCESS_REVOKED: "client_access_revoked",
  PLATFORM_PUSH_STARTED: "platform_push_started",
});

const DOCUMENT_TYPES = Object.freeze({
  HIPAA: "hipaa",
  SOA: "soa",
  VITALINK_CSV: "vitalink_csv",
  OTHER: "other",
});

function clean(value) {
  const text = (value ?? "").toString().trim();
  return text || null;
}

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }

  return digits.length === 10 ? digits : clean(value);
}

function toJson(value) {
  if (!value || typeof value !== "object") return {};
  return value;
}

async function ensureVitalinkImportSchema() {
  await db.query(`
    ALTER TABLE crm_clients
    ADD COLUMN IF NOT EXISTS vitalink_connected BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS vitalink_app_user_id TEXT,
    ADD COLUMN IF NOT EXISTS vitalink_profile_id TEXT,
    ADD COLUMN IF NOT EXISTS last_vitalink_package_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_vitalink_import_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS hipaa_signed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS soa_signed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS vitalink_emergency_contacts TEXT,
    ADD COLUMN IF NOT EXISTS vitalink_pharmacy_list TEXT
  `);

  await db.query(`
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
    )
  `);

  await db.query(`
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
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);

  await db.query(`
    ALTER TABLE crm_client_documents
    ADD COLUMN IF NOT EXISTS document_data BYTEA,
    ADD COLUMN IF NOT EXISTS document_size_bytes INTEGER
  `);

  await db.query(`
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_crm_vitalink_packages_agent
    ON crm_vitalink_packages (crm_agent_id, received_at DESC)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_crm_vitalink_packages_client
    ON crm_vitalink_packages (crm_client_id, received_at DESC)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_crm_vitalink_packages_app_user
    ON crm_vitalink_packages (app_user_id, app_profile_id)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_crm_client_documents_client
    ON crm_client_documents (crm_client_id, document_type, received_at DESC)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_crm_client_documents_package
    ON crm_client_documents (package_id)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_crm_audit_log_agent
    ON crm_audit_log (crm_agent_id, created_at DESC)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_crm_audit_log_client
    ON crm_audit_log (crm_client_id, created_at DESC)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_crm_audit_log_event
    ON crm_audit_log (event_type, created_at DESC)
  `);
}

async function logCrmAuditEvent({
  crmAgentId,
  crmClientId,
  actorType = "system",
  actorId,
  eventType,
  packageId,
  ipAddress,
  userAgent,
  metadata,
}) {
  if (!eventType) {
    throw new Error("Missing CRM audit event type");
  }

  await ensureVitalinkImportSchema();

  const result = await db.query(
    `
    INSERT INTO crm_audit_log (
      crm_agent_id,
      crm_client_id,
      actor_type,
      actor_id,
      event_type,
      package_id,
      ip_address,
      user_agent,
      metadata
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
    RETURNING *
    `,
    [
      clean(crmAgentId),
      clean(crmClientId),
      clean(actorType) || "system",
      clean(actorId),
      eventType,
      clean(packageId),
      clean(ipAddress),
      clean(userAgent),
      JSON.stringify(toJson(metadata)),
    ]
  );

  return result.rows[0];
}

async function recordVitalinkPackageReceived({
  crmAgentId,
  crmClientId,
  appUserId,
  appProfileId,
  clientName,
  clientDob,
  clientEmail,
  clientPhone,
  hipaaSignedAt,
  soaSignedAt,
  metadata,
}) {
  await ensureVitalinkImportSchema();

  const result = await db.query(
    `
    INSERT INTO crm_vitalink_packages (
      crm_agent_id,
      crm_client_id,
      app_user_id,
      app_profile_id,
      client_name,
      client_dob,
      client_email,
      client_phone,
      hipaa_signed_at,
      soa_signed_at,
      metadata
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
    RETURNING *
    `,
    [
      clean(crmAgentId),
      clean(crmClientId),
      clean(appUserId),
      clean(appProfileId),
      clean(clientName),
      clean(clientDob),
      clean(clientEmail),
      normalizePhone(clientPhone),
      clean(hipaaSignedAt),
      clean(soaSignedAt),
      JSON.stringify(toJson(metadata)),
    ]
  );

  const pkg = result.rows[0];

  await logCrmAuditEvent({
    crmAgentId,
    crmClientId,
    eventType: AUDIT_EVENTS.PACKAGE_RECEIVED,
    packageId: pkg.id,
  });

  if (hipaaSignedAt) {
    await logCrmAuditEvent({
      crmAgentId,
      crmClientId,
      eventType: AUDIT_EVENTS.HIPAA_RECEIVED,
      packageId: pkg.id,
    });
  }

  if (soaSignedAt) {
    await logCrmAuditEvent({
      crmAgentId,
      crmClientId,
      eventType: AUDIT_EVENTS.SOA_RECEIVED,
      packageId: pkg.id,
    });
  }

  return pkg;
}

async function recordCrmClientDocument({
  crmAgentId,
  crmClientId,
  packageId,
  documentType,
  documentName,
  documentBase64,
  storagePath,
  documentUrl,
  mimeType = "application/pdf",
  sha256,
  signedAt,
  metadata,
}) {
  await ensureVitalinkImportSchema();

  const docMetadata = toJson(metadata);
  const source = clean(docMetadata.source || docMetadata.generatedBy);

  if (source !== "vitalink_package") {
    throw new Error("Only VitaLink-generated package documents can be stored");
  }

  const allowedTypes = new Set(Object.values(DOCUMENT_TYPES));
  if (!allowedTypes.has(documentType)) {
    throw new Error("Unsupported CRM document type");
  }

  const safeType = documentType;

  let documentBuffer = null;
  let documentSizeBytes = null;
  let documentHash = clean(sha256);

  if ((safeType === DOCUMENT_TYPES.HIPAA || safeType === DOCUMENT_TYPES.SOA) && !documentBase64) {
    throw new Error("VitaLink HIPAA/SOA documents must include PDF data");
  }

  if (documentBase64) {
    const cleanedBase64 = String(documentBase64)
      .replace(/^data:application\/pdf;base64,/i, "")
      .trim();

    documentBuffer = Buffer.from(cleanedBase64, "base64");
    documentSizeBytes = documentBuffer.length;

    if (documentSizeBytes > 10 * 1024 * 1024) {
      throw new Error("Document PDF is larger than 10MB");
    }

    documentHash =
      documentHash ||
      crypto
        .createHash("sha256")
        .update(documentBuffer)
        .digest("hex");
  }

  const result = await db.query(
    `
    INSERT INTO crm_client_documents (
      crm_agent_id,
      crm_client_id,
      package_id,
      document_type,
      document_name,
      storage_path,
      document_url,
      document_data,
      document_size_bytes,
      mime_type,
      sha256,
      signed_at,
      metadata
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
    RETURNING *
    `,
    [
      clean(crmAgentId),
      clean(crmClientId),
      clean(packageId),
      safeType,
      clean(documentName),
      clean(storagePath),
      clean(documentUrl),
      documentBuffer,
      documentSizeBytes,
      clean(mimeType) || "application/pdf",
      documentHash,
      clean(signedAt),
      JSON.stringify({
        ...docMetadata,
        source: "vitalink_package",
      }),
    ]
  );

  return result.rows[0];
}

module.exports = {
  AUDIT_EVENTS,
  DOCUMENT_TYPES,
  ensureVitalinkImportSchema,
  logCrmAuditEvent,
  recordCrmClientDocument,
  recordVitalinkPackageReceived,
};
