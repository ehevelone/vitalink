const db = require("./services/db");
const { verifyAgentSession } = require("./services/agent-auth");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Reach-Session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const tableConfigs = {
  clients: {
    remote: "reach_backup_clients",
    columns: [
      "first_name",
      "last_name",
      "mobile",
      "birthday",
      "last_review_date",
      "opt_in",
      "status",
      "has_vitalink",
      "last_ask_sent",
      "consent_date",
      "marketing_lockout_until",
      "drip_paused",
      "aep_drip_enabled",
      "aep_drip_prompt_pending",
      "aep_drip_override",
      "welcome_consent_sent_at",
      "notes",
    ],
  },
  send_log: {
    remote: "reach_backup_send_log",
    columns: [
      "client_id",
      "template_id",
      "rendered_body",
      "sent_at",
      "status",
      "skip_reason",
      "segment_count",
      "ask_override",
      "drip_sequence_id",
      "channel",
    ],
  },
  consent_log: {
    remote: "reach_backup_consent_log",
    columns: [
      "client_id",
      "received_at",
      "message_text",
      "triggering_template_name",
    ],
  },
  optout_log: {
    remote: "reach_backup_optout_log",
    columns: ["client_id", "mobile", "message_text", "received_at"],
  },
  drip_queue: {
    remote: "reach_backup_drip_queue",
    columns: [
      "client_id",
      "template_name",
      "scheduled_date",
      "status",
      "skip_reason",
      "sent_at",
      "appointment_key",
      "track",
      "created_at",
    ],
  },
  messages: {
    remote: "reach_backup_messages",
    columns: [
      "client_id",
      "direction",
      "body",
      "status",
      "message_type",
      "template_purpose",
      "template_style",
      "template_variant",
      "sent_at",
      "read_at",
      "flagged",
      "flag_type",
      "flag_resolved",
      "flag_resolved_at",
      "ai_suggested_reply",
    ],
  },
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function clean(value) {
  return String(value || "").trim();
}

async function ensureBackupTables() {
  await db.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS reach_backup_clients (
      agent_id uuid NOT NULL,
      local_id integer NOT NULL,
      first_name text,
      last_name text,
      mobile text,
      birthday text,
      last_review_date text,
      opt_in boolean,
      status text,
      has_vitalink boolean,
      last_ask_sent text,
      consent_date text,
      marketing_lockout_until text,
      drip_paused boolean,
      aep_drip_enabled boolean,
      aep_drip_prompt_pending boolean,
      aep_drip_override text,
      welcome_consent_sent_at text,
      notes text,
      record jsonb NOT NULL,
      synced_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (agent_id, local_id)
    );

    CREATE TABLE IF NOT EXISTS reach_backup_send_log (
      agent_id uuid NOT NULL,
      local_id integer NOT NULL,
      client_id integer,
      template_id integer,
      rendered_body text,
      sent_at text,
      status text,
      skip_reason text,
      segment_count integer,
      ask_override boolean,
      drip_sequence_id integer,
      channel text,
      record jsonb NOT NULL,
      synced_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (agent_id, local_id)
    );

    CREATE TABLE IF NOT EXISTS reach_backup_consent_log (
      agent_id uuid NOT NULL,
      local_id integer NOT NULL,
      client_id integer,
      received_at text,
      message_text text,
      triggering_template_name text,
      record jsonb NOT NULL,
      synced_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (agent_id, local_id)
    );

    CREATE TABLE IF NOT EXISTS reach_backup_optout_log (
      agent_id uuid NOT NULL,
      local_id integer NOT NULL,
      client_id integer,
      mobile text,
      message_text text,
      received_at text,
      record jsonb NOT NULL,
      synced_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (agent_id, local_id)
    );

    CREATE TABLE IF NOT EXISTS reach_backup_drip_queue (
      agent_id uuid NOT NULL,
      local_id integer NOT NULL,
      client_id integer,
      template_name text,
      scheduled_date text,
      status text,
      skip_reason text,
      sent_at text,
      appointment_key text,
      track text,
      created_at text,
      record jsonb NOT NULL,
      synced_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (agent_id, local_id)
    );

    CREATE TABLE IF NOT EXISTS reach_backup_messages (
      agent_id uuid NOT NULL,
      local_id integer NOT NULL,
      client_id integer,
      direction text,
      body text,
      status text,
      message_type text,
      template_purpose text,
      template_style text,
      template_variant integer,
      sent_at text,
      read_at text,
      flagged boolean,
      flag_type text,
      flag_resolved boolean,
      flag_resolved_at text,
      ai_suggested_reply text,
      record jsonb NOT NULL,
      synced_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (agent_id, local_id)
    );
  `);
}

function normalizeValue(column, value) {
  if (value === undefined) return null;
  if (
    [
      "opt_in",
      "has_vitalink",
      "drip_paused",
      "aep_drip_enabled",
      "aep_drip_prompt_pending",
      "ask_override",
      "flagged",
      "flag_resolved",
    ].includes(column)
  ) {
    return value === true || value === 1 || value === "1";
  }
  return value;
}

async function syncRows(agentId, rowsByTable) {
  const syncedIds = {};
  for (const [localName, config] of Object.entries(tableConfigs)) {
    const rows = Array.isArray(rowsByTable[localName])
      ? rowsByTable[localName]
      : [];
    syncedIds[localName] = [];

    for (const row of rows) {
      const localId = Number(row && row.id);
      if (!Number.isInteger(localId) || localId <= 0) continue;

      const baseColumns = ["agent_id", "local_id", ...config.columns, "record"];
      const values = [
        agentId,
        localId,
        ...config.columns.map((column) => normalizeValue(column, row[column])),
        JSON.stringify(row),
      ];
      const placeholders = values.map((_, index) => `$${index + 1}`);
      const updates = [...config.columns, "record"]
        .map((column) => `${column} = EXCLUDED.${column}`)
        .join(", ");

      await db.query(
        `
        INSERT INTO ${config.remote} (${baseColumns.join(", ")}, synced_at)
        VALUES (${placeholders.join(", ")}, NOW())
        ON CONFLICT (agent_id, local_id)
        DO UPDATE SET
          ${updates},
          synced_at = NOW()
        `,
        values
      );
      syncedIds[localName].push(localId);
    }
  }
  return syncedIds;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});
  if (event.httpMethod !== "POST") {
    return json(405, { success: false, error: "Method not allowed." });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const email = clean(body.email).toLowerCase();
    const token =
      clean(body.sessionToken) ||
      clean(event.headers["x-reach-session"]) ||
      clean(event.headers["X-Reach-Session"]);

    const agent = await verifyAgentSession({ agentEmail: email, token });
    if (!agent) {
      throw new Error("Sign in again before syncing backups.");
    }

    await ensureBackupTables();
    const syncedIds = await syncRows(agent.id, body.rows || {});
    const syncedAt = new Date().toISOString();

    return json(200, {
      success: true,
      syncedAt,
      syncedIds,
    });
  } catch (error) {
    console.error("reach-backup-sync error:", error);
    return json(400, {
      success: false,
      error: error.message || "Backup sync failed.",
    });
  }
};
