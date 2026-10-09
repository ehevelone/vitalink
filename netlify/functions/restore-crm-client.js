const { Pool } = require("pg");
const { requireCrmClient } = require("./crm-auth");
const { ensureVitalinkImportSchema } = require("./services/crm-vitalink-import");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function reply(statusCode, body) {
  return { statusCode, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return reply(405, { success: false, error: "Method not allowed" });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    if (!body.id) {
      return reply(400, { success: false, error: "Missing client id" });
    }

    await ensureVitalinkImportSchema();
    const auth = await requireCrmClient(event, body.id);
    if (auth.error) {
      return reply(403, { success: false, error: auth.error });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE crm_clients
         SET archived_at=NULL, archived_by=NULL, updated_at=NOW()
         WHERE id=$1 AND agent_id=$2 AND archived_at IS NOT NULL
         RETURNING id`,
        [body.id, auth.crmAgentId],
      );
      if (!result.rows.length) {
        await client.query("ROLLBACK");
        return reply(404, { success: false, error: "Archived client not found" });
      }

      await client.query(
        `INSERT INTO crm_audit_log (
           crm_agent_id, crm_client_id, actor_type, actor_id,
           event_type, ip_address, user_agent, metadata
         ) VALUES ($1,$2,'agent',$3,'client_restored',$4,$5,'{}'::jsonb)`,
        [
          auth.crmAgentId,
          body.id,
          auth.agent?.id || auth.crmAgentId,
          event.headers?.["x-nf-client-connection-ip"] || event.headers?.["client-ip"] || null,
          event.headers?.["user-agent"] || null,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return reply(200, { success: true, restored: true });
  } catch (error) {
    console.error("restore-crm-client error", error);
    return reply(500, { success: false, error: "Unable to restore client" });
  }
};
