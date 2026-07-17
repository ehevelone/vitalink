const crypto = require("crypto");
const db = require("./db");

async function ensureAgentSessionColumns() {
  await db.query(`
    ALTER TABLE agents
    ADD COLUMN IF NOT EXISTS session_token TEXT,
    ADD COLUMN IF NOT EXISTS session_expires TIMESTAMPTZ
  `);
}

async function createAgentSession(agentId) {
  await ensureAgentSessionColumns();

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 8 * 60 * 60 * 1000);

  await db.query(
    `
    UPDATE agents
    SET session_token = $1,
        session_expires = $2
    WHERE id = $3
    `,
    [token, expires, agentId]
  );

  return token;
}

async function verifyAgentSession({ agentId, agentEmail, token }) {
  if ((!agentId && !agentEmail) || !token) {
    return null;
  }

  await ensureAgentSessionColumns();

  const values = [token];
  const filters = [
    "session_token = $1",
    "session_expires > NOW()",
    "(active = TRUE OR (billing_owner IS NOT NULL AND subscription_status IN ('active', 'admin_override')))",
  ];

  if (agentId) {
    values.push(agentId);
    filters.push(`id = $${values.length}`);
  }

  if (agentEmail) {
    values.push(agentEmail);
    filters.push(`LOWER(email) = LOWER($${values.length})`);
  }

  const result = await db.query(
    `
    SELECT id, email, name
    FROM agents
    WHERE ${filters.join(" AND ")}
    LIMIT 1
    `,
    values
  );

  return result.rows[0] || null;
}

module.exports = {
  createAgentSession,
  verifyAgentSession,
};
