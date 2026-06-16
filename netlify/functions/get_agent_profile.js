// functions/get_agent_profile.js
const db = require("./services/db"); // your pg client wrapper
const { verifyAgentSession } = require("./services/agent-auth");

function ok(obj) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, ...obj }),
  };
}

function fail(msg, code = 400) {
  return {
    statusCode: code,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: false, error: msg }),
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: "",
  };
}

if (event.httpMethod !== "POST") {
      return fail("Method not allowed", 405);
    }

    const { email, id, agentSessionToken } = JSON.parse(event.body || "{}");
    if (!email && !id) {
      return fail("Missing email or id");
    }

    const sessionAgent = await verifyAgentSession({
      agentId: id,
      agentEmail: email,
      token: agentSessionToken,
    });

    if (!sessionAgent) {
      return fail("Unauthorized", 403);
    }

    await db.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS calendly_url TEXT
    `);

    await db.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS business_card_image_base64 TEXT
    `);

    // 🔹 Prefer email, fallback to id
    let query = `
      SELECT
        id,
        name,
        email,
        npn,
        phone,
        agency_name,
        agency_address,
        agency_street,
        agency_city,
        agency_state,
        agency_zip,
        agency_phone,
        calendly_url,
        business_card_image_base64,
        unlock_code,
        promo_code,
        active
      FROM agents
      WHERE
    `;
    let values = [];

    if (email) {
      query += "email = $1";
      values = [email.toLowerCase()];
    } else {
      query += "id = $1";
      values = [id];
    }

    const result = await db.query(query, values);
    if (!result.rows.length) {
      return fail("Agent not found", 404);
    }

    return ok({ agent: result.rows[0] });
  } catch (e) {
    console.error("❌ get_agent_profile error:", e);
    return fail("Server error: " + e.message, 500);
  }
};
