const db = require('./db');

async function getRecordedRevocation(crmAgentId, crmClientId) {
  try {
    const result = await db.query(`
      SELECT status.revoked_at
      FROM crm_vitalink_packages pkg
      JOIN user_authorization_status status
        ON status.user_id::text = pkg.app_user_id
      WHERE pkg.crm_agent_id = $1
        AND pkg.crm_client_id = $2
        AND status.revoked_at IS NOT NULL
      ORDER BY status.revoked_at DESC
      LIMIT 1
    `, [crmAgentId, crmClientId]);
    return result.rows[0]?.revoked_at || null;
  } catch (error) {
    // Older deployments may not yet have the app authorization table.
    if (error.code === '42P01') return null;
    throw error;
  }
}

module.exports = { getRecordedRevocation };
