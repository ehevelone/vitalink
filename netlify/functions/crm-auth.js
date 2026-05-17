const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function getHeader(event, name) {
  const headers = event.headers || {};
  const lower = name.toLowerCase();

  return headers[name] || headers[lower] || "";
}

async function requireCrmAgent(event, requestedAgentId) {
  const token =
    getHeader(event, "x-agent-session") ||
    getHeader(event, "x-crm-session");

  const crmUuid =
    requestedAgentId ||
    getHeader(event, "x-crm-agent-id");

  if (!token || !crmUuid) {
    return { error: "Unauthorized" };
  }

  await pool.query(`
    ALTER TABLE agents
    ADD COLUMN IF NOT EXISTS session_token TEXT,
    ADD COLUMN IF NOT EXISTS session_expires TIMESTAMPTZ
  `);

  const result = await pool.query(
    `
    SELECT id, crm_uuid, email, name
    FROM agents
    WHERE crm_uuid = $1
      AND session_token = $2
      AND session_expires > NOW()
      AND (active = TRUE OR (billing_owner IS NOT NULL AND subscription_status = 'active'))
    LIMIT 1
    `,
    [String(crmUuid), token]
  );

  if (!result.rows.length) {
    return { error: "Unauthorized" };
  }

  return {
    agent: result.rows[0],
    crmAgentId: String(result.rows[0].crm_uuid)
  };
}

async function requireCrmClient(event, clientId, requestedAgentId) {
  const auth = await requireCrmAgent(event, requestedAgentId);

  if (auth.error) {
    return auth;
  }

  if (!clientId) {
    return auth;
  }

  const result = await pool.query(
    `
    SELECT id
    FROM crm_clients
    WHERE id = $1
      AND agent_id = $2
    LIMIT 1
    `,
    [clientId, auth.crmAgentId]
  );

  if (!result.rows.length) {
    return { error: "Unauthorized client" };
  }

  return auth;
}

module.exports = {
  requireCrmAgent,
  requireCrmClient,
};
