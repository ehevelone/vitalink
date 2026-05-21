// functions/claim_agent_unlock.js
const db = require("./services/db");
const bcrypt = require("bcryptjs");

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

function normalizeUsPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  return value || null;
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

    const {
      unlockCode,
      email,
      password,
      npn,
      phone,
      name,
      agencyStreet,
      agencyCity,
      agencyState,
      agencyZip,
    } = JSON.parse(event.body || "{}");

    const registrationCode =
      String(unlockCode || "").trim().toUpperCase();

    if (!registrationCode || !email || !password || !npn) {
      return fail(
        "Agent registration code, email, password, and NPN are required."
      );
    }

    const existing = await db.query(
      `
      SELECT id, active, password_hash, promo_code, unlock_code,
        CASE WHEN UPPER(promo_code) = $1 THEN 'promo' ELSE 'unlock' END AS code_match
      FROM agents
      WHERE UPPER(promo_code) = $1
         OR (
           UPPER(unlock_code) = $1
           AND active = FALSE
           AND password_hash IS NULL
         )
      ORDER BY CASE WHEN UPPER(promo_code) = $1 THEN 0 ELSE 1 END
      LIMIT 1
      `,
      [registrationCode]
    );

    if (existing.rows.length === 0) {
      return fail("Invalid agent registration code", 404);
    }

    const agent = existing.rows[0];

    if (agent.password_hash) {
      return fail("Agent registration code already used");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const promoCode =
      agent.promo_code ||
      "AG-" + Math.random().toString(36).substring(2, 10).toUpperCase();

    const result = await db.query(
      `
      UPDATE agents
      SET email = $1,
          password_hash = $2,
          npn = $3,
          phone = $4,
          name = $5,
          agency_street = $6,
          agency_city = $7,
          agency_state = $8,
          agency_zip = $9,
          active = TRUE,
          promo_code = $10
      WHERE id = $11
      RETURNING id, name, email, phone, npn, agency_street, agency_city,
        agency_state, agency_zip, promo_code, active, role
      `,
      [
        email,
        hashedPassword,
        npn,
        normalizeUsPhone(phone),
        name,
        agencyStreet,
        agencyCity,
        agencyState,
        agencyZip,
        promoCode,
        agent.id,
      ]
    );

    const row = result.rows[0];

    return ok({
      message: "Agent registration complete",
      agentId: row.id,
      promoCode: row.promo_code,
      name: row.name,
      email: row.email,
      phone: row.phone,
      npn: row.npn,
      agencyStreet: row.agency_street,
      agencyCity: row.agency_city,
      agencyState: row.agency_state,
      agencyZip: row.agency_zip,
      active: row.active,
      role: row.role,
    });
  } catch (err) {
    console.error("claim_agent_unlock error:", err);
    return fail("Server error: " + err.message, 500);
  }
};
