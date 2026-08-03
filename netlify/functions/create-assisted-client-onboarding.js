const crypto = require("crypto");
const { requireCrmAgent } = require("./crm-auth");
const { verifyAgentSession } = require("./services/agent-auth");
const db = require("./services/db");

const SESSION_HOURS = 2;

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

function normalizeUsPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }

  return digits.length === 10 ? digits : clean(value);
}

function safeDate(value) {
  const text = clean(value);
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] || "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : "",
  };
}

function normalizeContacts(value) {
  const items = Array.isArray(value) ? value : [];

  return items
    .map((item) => ({
      name: clean(item?.name),
      phone: normalizeUsPhone(item?.phone),
    }))
    .filter((item) => item.name || item.phone);
}

function createInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 12; i += 1) {
    const index = crypto.randomInt(0, alphabet.length);
    code += alphabet[index];
  }

  return code;
}

function hashCode(code) {
  return crypto
    .createHash("sha256")
    .update(String(code || "").trim().toUpperCase())
    .digest("hex");
}

async function ensureSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS assisted_client_onboarding (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      crm_agent_id TEXT NOT NULL,
      app_agent_id INTEGER,
      crm_client_id UUID,
      invite_code_hash TEXT UNIQUE NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      expires_at TIMESTAMPTZ NOT NULL,
      claimed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    ALTER TABLE crm_clients
    ADD COLUMN IF NOT EXISTS vitalink_emergency_contacts TEXT,
    ADD COLUMN IF NOT EXISTS vitalink_allergies TEXT,
    ADD COLUMN IF NOT EXISTS vitalink_conditions TEXT,
    ADD COLUMN IF NOT EXISTS vitalink_blood_type TEXT,
    ADD COLUMN IF NOT EXISTS vitalink_implants TEXT,
    ADD COLUMN IF NOT EXISTS vitalink_procedures TEXT,
    ADD COLUMN IF NOT EXISTS vitalink_organ_donor BOOLEAN DEFAULT false
  `);

  await db.query(`
    DELETE FROM assisted_client_onboarding
    WHERE expires_at <= NOW()
      AND claimed_at IS NULL
  `);
}

async function saveCrmClient({ crmAgentId, profile, emergency, status }) {
  const { firstName, lastName } = splitName(profile.fullName);
  const contactsText = (emergency.contacts || [])
    .map((contact, index) => {
      const label = `Emergency Contact ${index + 1}`;
      return [label, contact.name, contact.phone].filter(Boolean).join(": ");
    })
    .join("\n");

  const result = await db.query(
    `
    INSERT INTO crm_clients (
      agent_id,
      first_name,
      last_name,
      dob,
      mobile_phone,
      email,
      address,
      city,
      state,
      zip,
      status,
      vitalink_emergency_contacts,
      vitalink_allergies,
      vitalink_conditions,
      vitalink_blood_type,
      vitalink_implants,
      vitalink_procedures,
      vitalink_organ_donor
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    RETURNING *
    `,
    [
      crmAgentId,
      firstName,
      lastName,
      safeDate(profile.dob),
      normalizeUsPhone(profile.userPhone),
      clean(profile.email),
      clean(profile.address),
      clean(profile.city),
      clean(profile.state),
      clean(profile.zip),
      clean(status) || "Prospect",
      contactsText || null,
      clean(emergency.allergies),
      clean(emergency.conditions),
      clean(emergency.bloodType),
      clean(emergency.implants),
      clean(emergency.procedures),
      Boolean(emergency.organDonor),
    ]
  );

  return result.rows[0];
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return reply(200, {});

  if (event.httpMethod !== "POST") {
    return reply(405, { success: false, error: "Method not allowed" });
  }

  try {
    await ensureSchema();

    const body = JSON.parse(event.body || "{}");
    let auth = await requireCrmAgent(event, clean(body.agent_id || body.crmAgentId));

    let sessionAgent = null;
    let crmAgentId = auth.error ? null : auth.crmAgentId;

    if (auth.error) {
      sessionAgent = await verifyAgentSession({
        agentId: clean(body.appAgentId || body.agentId),
        agentEmail: clean(body.agentEmail || body.email),
        token:
          clean(body.agentSessionToken) ||
          clean(event.headers?.["x-agent-session"]) ||
          clean(event.headers?.["x-crm-session"]),
      });

      if (!sessionAgent) {
        return reply(403, { success: false, error: "Unauthorized" });
      }
    }

    const agentResult = await db.query(
      `
      SELECT id, crm_uuid, name, email, unlock_code
      FROM agents
      WHERE ${crmAgentId ? "crm_uuid = $1" : "id = $1"}
      LIMIT 1
      `,
      [crmAgentId || sessionAgent.id]
    );

    const agent = agentResult.rows[0];
    crmAgentId = crmAgentId || clean(agent?.crm_uuid);

    if (!agent?.unlock_code) {
      return reply(409, {
        success: false,
        error: "Agent activation code is not configured.",
      });
    }

    const profile = {
      fullName: clean(body.profile?.fullName || body.fullName),
      dob: safeDate(body.profile?.dob || body.dob),
      userPhone: normalizeUsPhone(body.profile?.userPhone || body.userPhone),
      email: clean(body.profile?.email || body.email)?.toLowerCase(),
      address: clean(body.profile?.address || body.address),
      city: clean(body.profile?.city || body.city),
      state: clean(body.profile?.state || body.state),
      zip: clean(body.profile?.zip || body.zip),
    };

    if (!profile.fullName || !profile.userPhone) {
      return reply(400, {
        success: false,
        error: "Client name and phone are required.",
      });
    }

    const emergency = {
      contacts: normalizeContacts(body.emergency?.contacts || body.emergencyContacts),
      allergies: clean(body.emergency?.allergies || body.allergies),
      conditions: clean(body.emergency?.conditions || body.conditions),
      bloodType: clean(body.emergency?.bloodType || body.bloodType),
      implants: clean(body.emergency?.implants || body.implants),
      procedures: clean(body.emergency?.procedures || body.procedures),
      organDonor: Boolean(body.emergency?.organDonor || body.organDonor),
    };

    const saveToCrm = body.saveToCrm !== false && !auth.error && crmAgentId;
    const crmClient = saveToCrm
      ? await saveCrmClient({
          crmAgentId,
          profile,
          emergency,
          status: body.status,
        })
      : null;

    const inviteCode = createInviteCode();
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
    const payload = {
      version: "vitalink.assisted_onboarding.v1",
      profile,
      emergency,
      activationCode: agent.unlock_code,
      agent: {
        id: agent.id,
        crmAgentId,
        name: clean(agent.name),
        email: clean(agent.email),
      },
      crmClientId: crmClient?.id || null,
    };

    const result = await db.query(
      `
      INSERT INTO assisted_client_onboarding (
        crm_agent_id,
        app_agent_id,
        crm_client_id,
        invite_code_hash,
        payload,
        expires_at
      )
      VALUES ($1,$2,$3,$4,$5::jsonb,$6)
      RETURNING id, expires_at
      `,
      [
        crmAgentId || `agent:${agent.id}`,
        agent.id,
        crmClient?.id || null,
        hashCode(inviteCode),
        JSON.stringify(payload),
        expiresAt,
      ]
    );

    return reply(200, {
      success: true,
      onboarding: result.rows[0],
      crmClient,
      inviteCode,
      expiresAt: result.rows[0].expires_at,
      onboardingUrl: `vitalink://activate?onboard=${encodeURIComponent(inviteCode)}`,
    });
  } catch (err) {
    console.error("create-assisted-client-onboarding error:", err);
    return reply(500, { success: false, error: err.message });
  }
};
