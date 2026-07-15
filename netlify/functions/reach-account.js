const bcrypt = require("bcryptjs");
const db = require("./services/db");
const {
  createAgentSession,
  verifyAgentSession,
} = require("./services/agent-auth");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Reach-Session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

async function ensureReachTables() {
  await db.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE EXTENSION IF NOT EXISTS citext;

    ALTER TABLE agents
    ADD COLUMN IF NOT EXISTS password_hash TEXT,
    ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'agent',
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

    CREATE TABLE IF NOT EXISTS reach_enrollments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id uuid,
      agent_email citext NOT NULL UNIQUE,
      agent_name text,
      plan text NOT NULL DEFAULT 'free'
        CHECK (plan IN ('free', 'reach', 'reach_crm', 'full_suite')),
      client_limit integer NOT NULL DEFAULT 20,
      locked boolean NOT NULL DEFAULT true,
      admin_override boolean NOT NULL DEFAULT false,
      admin_override_reason text,
      admin_override_by text,
      admin_override_until timestamptz,
      status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'cancelled')),
      source text NOT NULL DEFAULT 'reach_app',
      created_at timestamptz NOT NULL DEFAULT now(),
      upgraded_at timestamptz,
      cancelled_at timestamptz
    );
  `);
}

function accessFromRow(row) {
  return {
    agentEmail: row.agent_email,
    plan: row.plan || "free",
    status: row.status || "active",
    clientLimit: Number(row.client_limit || 20),
    adminOverride: row.admin_override === true,
    adminOverrideReason: row.admin_override_reason || "",
    adminOverrideUntil: row.admin_override_until || null,
  };
}

async function getReachAccess(email, name = "") {
  await ensureReachTables();

  const result = await db.query(
    `
    INSERT INTO reach_enrollments (
      agent_email,
      agent_name,
      plan,
      client_limit,
      status,
      source
    )
    VALUES ($1, $2, 'free', 20, 'active', 'reach_app')
    ON CONFLICT (agent_email)
    DO UPDATE SET
      agent_name = COALESCE(reach_enrollments.agent_name, EXCLUDED.agent_name)
    RETURNING agent_email, plan, status, client_limit, admin_override,
      admin_override_reason, admin_override_until
    `,
    [email, name || email]
  );

  return accessFromRow(result.rows[0]);
}

async function signIn(body) {
  const email = clean(body.email).toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  await ensureReachTables();

  const result = await db.query(
    `
    SELECT id, email, name, password_hash, active
    FROM agents
    WHERE LOWER(email) = LOWER($1)
    LIMIT 1
    `,
    [email]
  );

  if (!result.rows.length) {
    throw new Error("No VitaLink account found for that email.");
  }

  const agent = result.rows[0];
  if (!agent.active) {
    throw new Error("This VitaLink account is not active.");
  }
  if (!agent.password_hash) {
    throw new Error("This VitaLink account needs a password set first.");
  }

  let ok = await bcrypt.compare(password, agent.password_hash);
  const trimmedPassword = password.trim();
  if (!ok && trimmedPassword && trimmedPassword !== password) {
    ok = await bcrypt.compare(trimmedPassword, agent.password_hash);
  }
  if (!ok) {
    throw new Error("Invalid credentials.");
  }

  const sessionToken = await createAgentSession(agent.id);
  const access = await getReachAccess(agent.email, agent.name);

  return {
    sessionToken,
    agent: {
      id: agent.id,
      email: agent.email,
      name: agent.name,
    },
    access,
  };
}

async function createFreeAccount(body) {
  const email = clean(body.email).toLowerCase();
  const password = String(body.password || "");
  const agentName = clean(body.agentName) || email;

  if (!email || password.length < 6) {
    throw new Error("Enter an email and a password with at least 6 characters.");
  }

  await ensureReachTables();

  const existing = await db.query(
    `
    SELECT id, password_hash
    FROM agents
    WHERE LOWER(email) = LOWER($1)
    LIMIT 1
    `,
    [email]
  );

  if (existing.rows.length && existing.rows[0].password_hash) {
    throw new Error("That account already exists. Sign in instead.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await db.query(
    `
    INSERT INTO agents (
      email,
      name,
      password_hash,
      active,
      role,
      created_at
    )
    VALUES ($1, $2, $3, TRUE, 'agent', NOW())
    ON CONFLICT (email)
    DO UPDATE SET
      name = COALESCE(agents.name, EXCLUDED.name),
      password_hash = COALESCE(agents.password_hash, EXCLUDED.password_hash),
      active = TRUE,
      role = COALESCE(agents.role, 'agent')
    RETURNING id, email, name
    `,
    [email, agentName, passwordHash]
  );

  const agent = result.rows[0];
  const sessionToken = await createAgentSession(agent.id);
  const access = await getReachAccess(agent.email, agent.name);

  return {
    sessionToken,
    agent,
    access,
  };
}

async function syncAccess(body, event) {
  const email = clean(body.email).toLowerCase();
  const token =
    clean(body.sessionToken) ||
    clean(event.headers["x-reach-session"]) ||
    clean(event.headers["X-Reach-Session"]);

  const agent = await verifyAgentSession({ agentEmail: email, token });
  if (!agent) {
    throw new Error("Sign in again to sync VitaLink Reach access.");
  }

  const access = await getReachAccess(agent.email, agent.name);
  return {
    sessionToken: token,
    agent,
    access,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return json(200, {});
  }

  if (event.httpMethod !== "POST") {
    return json(405, { success: false, error: "Method not allowed." });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const action = clean(body.action);
    let result;

    if (action === "signIn") {
      result = await signIn(body);
    } else if (action === "createFreeAccount") {
      result = await createFreeAccount(body);
    } else if (action === "syncAccess") {
      result = await syncAccess(body, event);
    } else {
      throw new Error("Unknown account action.");
    }

    return json(200, {
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("reach-account error:", error);
    return json(400, {
      success: false,
      error: error.message || "VitaLink account request failed.",
    });
  }
};
