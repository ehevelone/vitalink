const db = require("./db");
const {
  AUDIT_EVENTS,
  DOCUMENT_TYPES,
  ensureVitalinkImportSchema,
  logCrmAuditEvent,
} = require("./crm-vitalink-import");

const DESTINATIONS = Object.freeze({
  sunfire: {
    id: "sunfire",
    label: "SunFire",
    loginUrl: process.env.SUNFIRE_LOGIN_URL || "",
  },
  drx: {
    id: "drx",
    label: "DRX",
    loginUrl: process.env.DRX_LOGIN_URL || "",
  },
});

function clean(value) {
  const text = (value ?? "").toString().trim();
  return text || null;
}

function normalizeDestination(value) {
  const key = String(value || "").trim().toLowerCase();
  return DESTINATIONS[key] || null;
}

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function getLatestDocument({ crmAgentId, crmClientId, type }) {
  const result = await db.query(
    `
    SELECT
      id,
      document_type,
      document_name,
      document_size_bytes,
      sha256,
      signed_at,
      received_at
    FROM crm_client_documents
    WHERE crm_agent_id = $1
      AND crm_client_id = $2
      AND document_type = $3
    ORDER BY received_at DESC
    LIMIT 1
    `,
    [crmAgentId, crmClientId, type]
  );

  return result.rows[0] || null;
}

async function prepareDestinationPackage({
  crmAgentId,
  crmClientId,
  destination,
  actorId,
  ipAddress,
  userAgent,
}) {
  await ensureVitalinkImportSchema();

  const destinationConfig = normalizeDestination(destination);

  if (!destinationConfig) {
    return {
      success: false,
      statusCode: 400,
      error: "Unsupported destination",
    };
  }

  const clientResult = await db.query(
    `
    SELECT *
    FROM crm_clients
    WHERE id = $1
      AND agent_id = $2
    LIMIT 1
    `,
    [crmClientId, crmAgentId]
  );

  if (!clientResult.rows.length) {
    return {
      success: false,
      statusCode: 404,
      error: "Client not found",
    };
  }

  const client = clientResult.rows[0];

  const packageResult = await db.query(
    `
    SELECT *
    FROM crm_vitalink_packages
    WHERE crm_agent_id = $1
      AND crm_client_id = $2
    ORDER BY received_at DESC
    LIMIT 1
    `,
    [crmAgentId, crmClientId]
  );

  const latestPackage = packageResult.rows[0] || null;

  const hipaa = await getLatestDocument({
    crmAgentId,
    crmClientId,
    type: DOCUMENT_TYPES.HIPAA,
  });

  const soa = await getLatestDocument({
    crmAgentId,
    crmClientId,
    type: DOCUMENT_TYPES.SOA,
  });

  const hipaaSignedAt = client.hipaa_signed_at || hipaa?.signed_at;
  const soaSignedAt = client.soa_signed_at || soa?.signed_at;
  const packageImportedAt =
    client.last_vitalink_import_at || latestPackage?.imported_at;

  if (
    !client.vitalink_connected ||
    !latestPackage ||
    !packageImportedAt ||
    !hipaa ||
    !soa ||
    !hipaaSignedAt ||
    !soaSignedAt
  ) {
    return {
      success: false,
      statusCode: 409,
      error: "Client must have an imported VitaLink package with HIPAA and SOA on file before destination prep.",
      requirements: {
        vitalinkConnected: Boolean(client.vitalink_connected),
        packageReceived: Boolean(latestPackage),
        packageImported: Boolean(packageImportedAt),
        hipaaOnFile: Boolean(hipaa),
        soaOnFile: Boolean(soa),
        hipaaSigned: Boolean(hipaaSignedAt),
        soaSigned: Boolean(soaSignedAt),
      },
    };
  }

  const profilePackage = {
    packageVersion: "vitalink.destination.v1",
    destination: destinationConfig.id,
    preparedAt: new Date().toISOString(),
    authorization: {
      hipaaSignedAt,
      soaSignedAt,
      hipaaDocumentId: hipaa.id,
      soaDocumentId: soa.id,
      sourcePackageId: latestPackage.id,
    },
    client: {
      firstName: clean(client.first_name),
      lastName: clean(client.last_name),
      fullName: clean(`${client.first_name || ""} ${client.last_name || ""}`),
      dob: clean(client.dob),
      address: clean(client.address),
      city: clean(client.city),
      state: clean(client.state),
      zip: clean(client.zip),
      phone: clean(client.mobile_phone || client.landline_phone),
      email: clean(client.email),
    },
    profile: {
      medications: splitLines(client.medication_list),
      doctors: splitLines(client.doctor_list),
      pharmacies: splitLines(client.vitalink_pharmacy_list),
      emergencyContacts: splitLines(client.vitalink_emergency_contacts),
    },
    source: {
      crmClientId,
      crmAgentId,
      vitalinkAppUserId: clean(client.vitalink_app_user_id),
      vitalinkProfileId: clean(client.vitalink_profile_id),
      lastPackageAt: client.last_vitalink_package_at || latestPackage.received_at,
      lastImportAt: packageImportedAt,
    },
  };

  await logCrmAuditEvent({
    crmAgentId,
    crmClientId,
    actorType: "agent",
    actorId,
    eventType: AUDIT_EVENTS.PLATFORM_PUSH_STARTED,
    packageId: latestPackage.id,
    ipAddress,
    userAgent,
    metadata: {
      destination: destinationConfig.id,
      destinationLabel: destinationConfig.label,
      mode: "framework_prepare",
      automatedPush: false,
    },
  });

  return {
    success: true,
    destination: destinationConfig,
    profilePackage,
    nextStep: destinationConfig.loginUrl
      ? "login_handoff"
      : "configure_destination_login_url",
  };
}

module.exports = {
  DESTINATIONS,
  prepareDestinationPackage,
};
