const { requireCrmClient } = require("./crm-auth");
const {
  prepareDestinationPackage,
} = require("./services/crm-destinations");

function reply(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, x-agent-session, x-crm-session, x-crm-agent-id",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
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

  if (event.httpMethod !== "POST") {
    return reply(405, { success: false, error: "Method not allowed" });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const clientId = clean(body.client_id || body.clientId || body.id);
    const destination = clean(body.destination);
    const requestedAgentId = clean(body.agent_id || body.agentId);

    if (!clientId || !destination) {
      return reply(400, {
        success: false,
        error: "Missing client_id or destination",
      });
    }

    const auth = await requireCrmClient(event, clientId, requestedAgentId);

    if (auth.error) {
      return reply(403, { success: false, error: auth.error });
    }

    const result = await prepareDestinationPackage({
      crmAgentId: auth.crmAgentId,
      crmClientId: clientId,
      destination,
      actorId: auth.agent?.id || auth.crmAgentId,
      ipAddress: event.headers?.["x-nf-client-connection-ip"] || event.headers?.["client-ip"],
      userAgent: event.headers?.["user-agent"],
    });

    return reply(result.statusCode || (result.success ? 200 : 400), result);
  } catch (err) {
    console.error("prepare-crm-destination-package error:", err);
    return reply(500, { success: false, error: err.message });
  }
};
