const db = require("./services/db");
const { requireCrmAgent } = require("./crm-auth");
const {
  AUDIT_EVENTS,
  DOCUMENT_TYPES,
  ensureVitalinkImportSchema,
  logCrmAuditEvent,
  recordCrmClientDocument,
  recordVitalinkPackageReceived,
} = require("./services/crm-vitalink-import");

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-agent-session, x-crm-session, x-crm-agent-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(statusCode, obj) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(obj),
  };
}

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

function safeDate(value) {
  const text = clean(value);
  return text || null;
}

function splitName(client) {
  const first = clean(client.first_name || client.firstName);
  const last = clean(client.last_name || client.lastName);

  if (first || last) return { firstName: first, lastName: last };

  const full = clean(client.name || client.fullName || client.full_name);
  if (!full) return { firstName: null, lastName: null };

  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function listFrom(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function formatPersonList(items, fallbackKeys = []) {
  return listFrom(items)
    .map(item => {
      if (typeof item === "string") return clean(item);
      if (!item || typeof item !== "object") return null;

      const name = clean(
        item.name ||
        item.fullName ||
        item.full_name ||
        fallbackKeys.map(key => item[key]).find(Boolean)
      );

      const parts = [
        name,
        clean(item.relationship),
        normalizePhone(item.phone || item.mobile_phone || item.mobilePhone),
        clean(item.email),
      ].filter(Boolean);

      return parts.join(" - ");
    })
    .filter(Boolean)
    .join("\n");
}

function formatMedicationList(medications) {
  return listFrom(medications)
    .map(item => {
      if (typeof item === "string") return clean(item);
      if (!item || typeof item !== "object") return null;

      const parts = [
        clean(item.name || item.medication || item.medicationName),
        clean(item.dose || item.dosage),
        clean(item.frequency),
        clean(item.doctor || item.prescriber),
        clean(item.pharmacy),
      ].filter(Boolean);

      return parts.join(" - ");
    })
    .filter(Boolean)
    .join("\n");
}

function formatDoctorList(doctors) {
  return listFrom(doctors)
    .map(item => {
      if (typeof item === "string") return clean(item);
      if (!item || typeof item !== "object") return null;

      const parts = [
        clean(item.name || item.doctor || item.provider),
        clean(item.specialty || item.type),
        normalizePhone(item.phone),
      ].filter(Boolean);

      return parts.join(" - ");
    })
    .filter(Boolean)
    .join("\n");
}

function formatPharmacyList(pharmacies) {
  return listFrom(pharmacies)
    .map(item => {
      if (typeof item === "string") return clean(item);
      if (!item || typeof item !== "object") return null;

      const parts = [
        clean(item.name || item.pharmacy),
        normalizePhone(item.phone),
        clean(item.address),
      ].filter(Boolean);

      return parts.join(" - ");
    })
    .filter(Boolean)
    .join("\n");
}

async function ensureClientImportColumns() {
  await ensureVitalinkImportSchema();

  await db.query(`
    ALTER TABLE crm_clients
    ADD COLUMN IF NOT EXISTS status TEXT,
    ADD COLUMN IF NOT EXISTS linked_app_client_id TEXT,
    ADD COLUMN IF NOT EXISTS profile_linked TEXT,
    ADD COLUMN IF NOT EXISTS emergency_profile TEXT,
    ADD COLUMN IF NOT EXISTS medication_list TEXT,
    ADD COLUMN IF NOT EXISTS doctor_list TEXT,
    ADD COLUMN IF NOT EXISTS last_sync TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
  `);
}

async function findCrmClient({ crmAgentId, clientId, appUserId, appProfileId, email, phone }) {
  if (clientId) {
    const result = await db.query(
      `
      SELECT *
      FROM crm_clients
      WHERE id = $1
        AND agent_id = $2
      LIMIT 1
      `,
      [clientId, crmAgentId]
    );

    if (result.rows[0]) return result.rows[0];
  }

  const result = await db.query(
    `
    SELECT *
    FROM crm_clients
    WHERE agent_id = $1
      AND (
        ($2::text IS NOT NULL AND linked_app_client_id = $2)
        OR ($3::text IS NOT NULL AND vitalink_app_user_id = $3)
        OR ($4::text IS NOT NULL AND vitalink_profile_id = $4)
        OR ($5::text IS NOT NULL AND LOWER(COALESCE(email,'')) = LOWER($5))
        OR ($6::text IS NOT NULL AND RIGHT(REGEXP_REPLACE(COALESCE(mobile_phone,''), '\\D', '', 'g'), 10) = $6)
      )
    ORDER BY
      CASE
        WHEN $2::text IS NOT NULL AND linked_app_client_id = $2 THEN 0
        WHEN $3::text IS NOT NULL AND vitalink_app_user_id = $3 THEN 1
        WHEN $4::text IS NOT NULL AND vitalink_profile_id = $4 THEN 2
        ELSE 3
      END,
      updated_at DESC NULLS LAST,
      created_at DESC NULLS LAST
    LIMIT 1
    `,
    [
      crmAgentId,
      clean(appUserId),
      clean(appUserId),
      clean(appProfileId),
      clean(email),
      normalizePhone(phone),
    ]
  );

  return result.rows[0] || null;
}

async function createCrmClient({ crmAgentId, client, appUserId, appProfileId, summaries, hipaaSignedAt, soaSignedAt }) {
  const { firstName, lastName } = splitName(client);

  const result = await db.query(
    `
    INSERT INTO crm_clients (
      agent_id,
      first_name,
      last_name,
      dob,
      mobile_phone,
      email,
      address,
      city,
      state,
      zip,
      status,
      linked_app_client_id,
      profile_linked,
      emergency_profile,
      medication_list,
      doctor_list,
      last_sync,
      vitalink_connected,
      vitalink_app_user_id,
      vitalink_profile_id,
      last_vitalink_package_at,
      last_vitalink_import_at,
      hipaa_signed_at,
      soa_signed_at,
      vitalink_emergency_contacts,
      vitalink_pharmacy_list
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Client',$11,'Linked',$12,$13,$14,NOW(),true,$15,$16,NOW(),NOW(),$17,$18,$19,$20)
    RETURNING *
    `,
    [
      crmAgentId,
      firstName,
      lastName,
      safeDate(client.dob || client.dateOfBirth),
      normalizePhone(client.phone || client.mobile_phone || client.mobilePhone),
      clean(client.email),
      clean(client.address || client.street),
      clean(client.city),
      clean(client.state),
      clean(client.zip || client.zipCode),
      clean(appUserId),
      summaries.emergencyStatus,
      summaries.medications,
      summaries.doctors,
      clean(appUserId),
      clean(appProfileId),
      safeDate(hipaaSignedAt),
      safeDate(soaSignedAt),
      summaries.emergencyContacts,
      summaries.pharmacies,
    ]
  );

  await logCrmAuditEvent({
    crmAgentId,
    crmClientId: result.rows[0].id,
    eventType: AUDIT_EVENTS.CLIENT_CREATED,
    metadata: { source: "vitalink_package" },
  });

  return result.rows[0];
}

async function updateCrmClient({ crmClientId, client, appUserId, appProfileId, summaries, hipaaSignedAt, soaSignedAt }) {
  const { firstName, lastName } = splitName(client);

  const result = await db.query(
    `
    UPDATE crm_clients
    SET
      first_name = COALESCE($1, first_name),
      last_name = COALESCE($2, last_name),
      dob = COALESCE($3, dob),
      mobile_phone = COALESCE($4, mobile_phone),
      email = COALESCE($5, email),
      address = COALESCE($6, address),
      city = COALESCE($7, city),
      state = COALESCE($8, state),
      zip = COALESCE($9, zip),
      linked_app_client_id = COALESCE($10, linked_app_client_id),
      profile_linked = 'Linked',
      emergency_profile = COALESCE($11, emergency_profile),
      medication_list = COALESCE($12, medication_list),
      doctor_list = COALESCE($13, doctor_list),
      last_sync = NOW(),
      vitalink_connected = true,
      vitalink_app_user_id = COALESCE($14, vitalink_app_user_id),
      vitalink_profile_id = COALESCE($15, vitalink_profile_id),
      last_vitalink_package_at = NOW(),
      last_vitalink_import_at = NOW(),
      hipaa_signed_at = COALESCE($16, hipaa_signed_at),
      soa_signed_at = COALESCE($17, soa_signed_at),
      vitalink_emergency_contacts = COALESCE($18, vitalink_emergency_contacts),
      vitalink_pharmacy_list = COALESCE($19, vitalink_pharmacy_list),
      updated_at = NOW()
    WHERE id = $20
    RETURNING *
    `,
    [
      firstName,
      lastName,
      safeDate(client.dob || client.dateOfBirth),
      normalizePhone(client.phone || client.mobile_phone || client.mobilePhone),
      clean(client.email),
      clean(client.address || client.street),
      clean(client.city),
      clean(client.state),
      clean(client.zip || client.zipCode),
      clean(appUserId),
      summaries.emergencyStatus,
      summaries.medications,
      summaries.doctors,
      clean(appUserId),
      clean(appProfileId),
      safeDate(hipaaSignedAt),
      safeDate(soaSignedAt),
      summaries.emergencyContacts,
      summaries.pharmacies,
      crmClientId,
    ]
  );

  return result.rows[0];
}

async function recordDocuments({ crmAgentId, crmClientId, packageId, documents, hipaaSignedAt, soaSignedAt }) {
  const saved = [];
  const documentMap = documents || {};
  const packageSource = clean(
    documentMap.source ||
    documentMap.generatedBy ||
    documentMap.package_source ||
    documentMap.packageSource
  );

  if (packageSource !== "vitalink_package") {
    return saved;
  }

  const specs = [
    {
      type: DOCUMENT_TYPES.HIPAA,
      source: documentMap.hipaa || documentMap.HIPAA,
      signedAt: hipaaSignedAt,
      defaultName: "VitaLink HIPAA Authorization",
    },
    {
      type: DOCUMENT_TYPES.SOA,
      source: documentMap.soa || documentMap.SOA,
      signedAt: soaSignedAt,
      defaultName: "VitaLink Scope of Appointment",
    },
    {
      type: DOCUMENT_TYPES.VITALINK_CSV,
      source: documentMap.csv || documentMap.vitalinkCsv,
      signedAt: null,
      defaultName: "VitaLink CSV Export",
    },
  ];

  for (const spec of specs) {
    if (!spec.source) continue;

    const doc = typeof spec.source === "string"
      ? { documentUrl: spec.source }
      : spec.source;

    const docSource = clean(doc.source || doc.generatedBy) || packageSource;

    if (docSource !== "vitalink_package") {
      continue;
    }

    const documentBase64 =
      doc.documentBase64 ||
      doc.base64 ||
      doc.pdfBase64 ||
      doc.contentBase64;

    if ((spec.type === DOCUMENT_TYPES.HIPAA || spec.type === DOCUMENT_TYPES.SOA) && !documentBase64) {
      continue;
    }

    saved.push(await recordCrmClientDocument({
      crmAgentId,
      crmClientId,
      packageId,
      documentType: spec.type,
      documentName: clean(doc.documentName || doc.name) || spec.defaultName,
      documentBase64,
      storagePath: doc.storagePath,
      documentUrl: doc.documentUrl || doc.url,
      mimeType: doc.mimeType || "application/pdf",
      sha256: doc.sha256,
      signedAt: spec.signedAt || doc.signedAt,
      metadata: {
        ...(doc.metadata || {}),
        source: "vitalink_package",
      },
    }));
  }

  return saved;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return reply(200, {});

  if (event.httpMethod !== "POST") {
    return reply(405, { success: false, error: "Method not allowed" });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const agentId = clean(body.agent_id || body.agentId);

    if (!agentId) {
      return reply(400, { success: false, error: "Missing agent_id" });
    }

    const auth = await requireCrmAgent(event, agentId);

    if (auth.error) {
      return reply(403, { success: false, error: auth.error });
    }

    await ensureClientImportColumns();

    const client = body.client || {};
    const appUserId = clean(body.app_user_id || body.appUserId || client.app_user_id || client.user_id);
    const appProfileId = clean(body.app_profile_id || body.appProfileId || client.profile_id);
    const hipaaSignedAt = body.hipaa_signed_at || body.hipaaSignedAt;
    const soaSignedAt = body.soa_signed_at || body.soaSignedAt;

    const summaries = {
      emergencyStatus: body.emergency_profile_status || body.emergencyProfileStatus || "Received",
      emergencyContacts: formatPersonList(body.emergency_contacts || body.emergencyContacts),
      medications: formatMedicationList(body.medications || body.meds),
      doctors: formatDoctorList(body.doctors || body.providers),
      pharmacies: formatPharmacyList(body.pharmacies || body.pharmacy),
    };

    const existing = await findCrmClient({
      crmAgentId: auth.crmAgentId,
      clientId: body.client_id || body.clientId,
      appUserId,
      appProfileId,
      email: client.email,
      phone: client.phone || client.mobile_phone || client.mobilePhone,
    });

    let crmClient;
    let action;

    if (existing) {
      crmClient = await updateCrmClient({
        crmClientId: existing.id,
        client,
        appUserId,
        appProfileId,
        summaries,
        hipaaSignedAt,
        soaSignedAt,
      });
      action = "updated";
    } else {
      crmClient = await createCrmClient({
        crmAgentId: auth.crmAgentId,
        client,
        appUserId,
        appProfileId,
        summaries,
        hipaaSignedAt,
        soaSignedAt,
      });
      action = "created";
    }

    const pkg = await recordVitalinkPackageReceived({
      crmAgentId: auth.crmAgentId,
      crmClientId: crmClient.id,
      appUserId,
      appProfileId,
      clientName: clean(client.name || client.fullName || `${crmClient.first_name || ""} ${crmClient.last_name || ""}`),
      clientDob: client.dob || client.dateOfBirth,
      clientEmail: client.email,
      clientPhone: client.phone || client.mobile_phone || client.mobilePhone,
      hipaaSignedAt,
      soaSignedAt,
      metadata: {
        source: "intentional_vitalink_package",
        receivedBy: "crm_import_endpoint",
      },
    });

    const documents = await recordDocuments({
      crmAgentId: auth.crmAgentId,
      crmClientId: crmClient.id,
      packageId: pkg.id,
      documents: body.documents,
      hipaaSignedAt,
      soaSignedAt,
    });

    await logCrmAuditEvent({
      crmAgentId: auth.crmAgentId,
      crmClientId: crmClient.id,
      actorType: "agent",
      actorId: auth.agent?.id,
      eventType: AUDIT_EVENTS.IMPORT_COMPLETED,
      packageId: pkg.id,
      ipAddress: event.headers?.["x-nf-client-connection-ip"] || event.headers?.["client-ip"],
      userAgent: event.headers?.["user-agent"],
      metadata: {
        action,
        documents: documents.map(doc => doc.document_type),
      },
    });

    return reply(200, {
      success: true,
      action,
      client: crmClient,
      package: pkg,
      documents,
    });
  } catch (err) {
    console.error("import-vitalink-package error:", err);
    return reply(500, {
      success: false,
      error: err.message || "Server error",
    });
  }
};
