// functions/get_user_agent.js
const db = require("./services/db");

function ok(obj) {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({ success: true, ...obj }),
  };
}

function fail(msg, code = 400) {
  return {
    statusCode: code,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
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

    const { email } = JSON.parse(event.body || "{}");

    if (!email) {
      return fail("Missing user email");
    }

    // 1️⃣ Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // 2️⃣ Fetch user and agent_id
    const userResult = await db.query(
      "SELECT id, agent_id FROM users WHERE email = $1 LIMIT 1",
      [normalizedEmail]
    );

    if (!userResult.rows.length) {
      return fail("User not found", 404);
    }

    const agentId = userResult.rows[0].agent_id;

    // 3️⃣ If no agent assigned
    if (!agentId) {
      return ok({ agent: null });
    }

    await db.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS calendly_url TEXT
    `);

    await db.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS business_card_image_base64 TEXT
    `);

    // 4️⃣ Fetch agent details
    const agentResult = await db.query(
      `
      SELECT
        name,
        email,
        phone,
        agency_name,
        agency_address,
        agency_phone, -- 🔥 ADDED
        calendly_url,
        business_card_image_base64,
        active
      FROM agents
      WHERE id = $1
      LIMIT 1
      `,
      [agentId]
    );

    if (!agentResult.rows.length) {
      return ok({ agent: null });
    }

    return ok({
      agent: agentResult.rows[0],
    });

  } catch (e) {
    console.error("❌ get_user_agent error:", e);
    return fail("Server error: " + e.message, 500);
  }
};
