const db = require("./db");

let schemaPromise;

function ensureClientArchiveColumns() {
  schemaPromise ??= db.query(`
    ALTER TABLE crm_clients
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS archived_by TEXT
  `).catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

module.exports = { ensureClientArchiveColumns };
