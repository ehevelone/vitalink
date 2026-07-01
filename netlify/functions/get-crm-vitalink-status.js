const { requireCrmClient } = require("./crm-auth");
const db = require("./services/db");
const { ensureVitalinkImportSchema, DOCUMENT_TYPES } = require("./services/crm-vitalink-import");

function reply(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, x-agent-session, x-crm-session, x-crm-agent-id",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
    body: JSON.stringify(obj),
  };
}

function clean(value) {
  const text = (value ?? "").toString().trim();
  return text || null;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return reply(200, {});

  if (event.httpMethod !== "GET") {
    return reply(405, { success: false, error: "Method not allowed" });
  }

  try {
    await ensureVitalinkImportSchema();

    const clientId = clean(event.queryStringParameters?.client_id || event.queryStringParameters?.id);
    const agentId = clean(event.queryStringParameters?.agent_id);

    if (!clientId) {
      return reply(400, { success: false, error: "Missing client_id" });
    }

    const auth = await requireCrmClient(event, clientId, agentId);

    if (auth.error) {
      return reply(403, { success: false, error: auth.error });
    }

    const clientResult = await db.query(
      `
      SELECT
        id,
        vitalink_connected,
        last_vitalink_package_at,
        last_vitalink_import_at,
        hipaa_signed_at,
        soa_signed_at,
        vitalink_emergency_contacts,
        vitalink_pharmacy_list
      FROM crm_clients
      WHERE id = $1
        AND agent_id = $2
      LIMIT 1
      `,
      [clientId, auth.crmAgentId]
    );

    if (!clientResult.rows.length) {
      return reply(404, { success: false, error: "Client not found" });
    }

    const packageResult = await db.query(
      `
      SELECT *
      FROM crm_vitalink_packages
      WHERE crm_client_id = $1
        AND crm_agent_id = $2
      ORDER BY received_at DESC
      LIMIT 1
      `,
      [clientId, auth.crmAgentId]
    );

    const documentsResult = await db.query(
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
      WHERE crm_client_id = $1
        AND crm_agent_id = $2
        AND document_type IN ($3, $4)
      ORDER BY received_at DESC
      `,
      [clientId, auth.crmAgentId, DOCUMENT_TYPES.HIPAA, DOCUMENT_TYPES.SOA]
    );

    const documents = {};

    documentsResult.rows.forEach((doc) => {
      if (!documents[doc.document_type]) {
        documents[doc.document_type] = doc;
      }
    });

    return reply(200, {
      success: true,
      client: clientResult.rows[0],
      package: packageResult.rows[0] || null,
      documents,
    });
  } catch (err) {
    console.error("get-crm-vitalink-status error:", err);
    return reply(500, { success: false, error: err.message });
  }
};
