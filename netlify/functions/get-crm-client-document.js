const { requireCrmClient } = require("./crm-auth");
const db = require("./services/db");
const { ensureVitalinkImportSchema } = require("./services/crm-vitalink-import");

function clean(value) {
  const text = (value ?? "").toString().trim();
  return text || null;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, x-agent-session, x-crm-session, x-crm-agent-id",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "Method not allowed" }),
    };
  }

  try {
    await ensureVitalinkImportSchema();

    const clientId = clean(event.queryStringParameters?.client_id);
    const documentId = clean(event.queryStringParameters?.document_id);
    const agentId = clean(event.queryStringParameters?.agent_id);

    if (!clientId || !documentId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Missing document request" }),
      };
    }

    const auth = await requireCrmClient(event, clientId, agentId);

    if (auth.error) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: auth.error }),
      };
    }

    const result = await db.query(
      `
      SELECT
        document_name,
        mime_type,
        document_data,
        metadata
      FROM crm_client_documents
      WHERE id = $1
        AND crm_client_id = $2
        AND crm_agent_id = $3
        AND document_data IS NOT NULL
        AND COALESCE(metadata->>'source', '') = 'vitalink_package'
      LIMIT 1
      `,
      [documentId, clientId, auth.crmAgentId]
    );

    if (!result.rows.length) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Document not found" }),
      };
    }

    const doc = result.rows[0];
    const fileName = (clean(doc.document_name) || "vitalink-document").replace(/[^\w.-]+/g, "-");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": clean(doc.mime_type) || "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}.pdf"`,
        "Access-Control-Allow-Origin": "*",
      },
      isBase64Encoded: true,
      body: Buffer.from(doc.document_data).toString("base64"),
    };
  } catch (err) {
    console.error("get-crm-client-document error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};
