const nodemailer = require("nodemailer");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const SOURCE = "T65 Free VitaLink Request";
const CONSENT_LANGUAGE = "By submitting, you agree to receive text/call from Eric Hevelone or a participating VitaLink agent about your VitaLink request and activation.";
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 5;
const rateBuckets = new Map();
const validStates = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA",
  "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
  "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX",
  "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function clean(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function clientIp(event) {
  return clean(
    event.headers?.["x-nf-client-connection-ip"] ||
    event.headers?.["client-ip"] ||
    event.headers?.["x-forwarded-for"]?.split(",")[0] ||
    "unknown",
    100
  );
}

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (rateBuckets.get(ip) || []).filter((time) => now - time < RATE_WINDOW_MS);
  recent.push(now);
  rateBuckets.set(ip, recent);
  return recent.length > RATE_MAX;
}

function createMailer() {
  const host = clean(process.env.SMTP_HOST, 255);
  const user = clean(process.env.SMTP_USER, 255);
  const pass = clean(process.env.SMTP_PASS, 500);
  const port = Number.parseInt(process.env.SMTP_PORT || "587", 10);
  if (!host || !user || !pass) throw new Error("SMTP is not configured.");
  const secure = port === 465;
  const isGmail = /gmail/i.test(host) || /gmail/i.test(user);
  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure || isGmail,
    auth: { user, pass },
    authMethod: isGmail ? "LOGIN" : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    tls: { minVersion: "TLSv1.2", servername: host },
  });
}

async function sendNotification({ id, name, phone, state, contactPreference }) {
  const fromEmail = clean(
    process.env.T65_VITALINK_FROM_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER || "ehevelone@gmail.com",
    255
  );
  const toEmail = clean(process.env.T65_VITALINK_TO_EMAIL || "ehevelone@asb.insure", 255);
  const preference = contactPreference === "text" ? "Text me" : "Call me";
  return createMailer().sendMail({
    from: `"VitaLink T65" <${fromEmail}>`,
    to: toEmail,
    subject: "New T65 Free VitaLink Request",
    text: [
      "New T65 Free VitaLink Request",
      "",
      `Lead ID: ${id}`,
      `Name: ${name}`,
      `Mobile: ${phone}`,
      `State: ${state}`,
      `Preferred contact: ${preference}`,
      `Source: ${SOURCE}`,
    ].join("\n"),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return reply(405, { success: false, error: "Method not allowed." });

  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (_) {
    return reply(400, { success: false, error: "Invalid request." });
  }

  if (clean(body.website, 200)) return reply(200, { success: true });
  if (isRateLimited(clientIp(event))) {
    return reply(429, { success: false, error: "Too many requests. Please wait a few minutes and try again." });
  }

  const name = clean(body.name, 120);
  const phone = clean(body.phone, 30).replace(/\D/g, "");
  const state = clean(body.state, 2).toUpperCase();
  const contactPreference = clean(body.contactPreference, 10).toLowerCase();
  const consent = body.consent || {};
  const consentPage = clean(consent.page, 500);
  const consentCapturedAt = clean(consent.capturedAt, 50);

  if (name.length < 2) return reply(400, { success: false, error: "Please enter your name." });
  if (phone.length !== 10) return reply(400, { success: false, error: "Please enter a valid 10-digit mobile number." });
  if (!validStates.has(state)) return reply(400, { success: false, error: "Please select your state." });
  if (!["text", "call"].includes(contactPreference)) return reply(400, { success: false, error: "Please choose text or call." });
  if (consent.accepted !== true || clean(consent.language, 500) !== CONSENT_LANGUAGE || !consentPage || Number.isNaN(Date.parse(consentCapturedAt))) {
    return reply(400, { success: false, error: "Consent is required." });
  }

  const preferenceLabel = contactPreference === "text" ? "Text me" : "Call me";
  const notes = [
    `Preferred contact: ${preferenceLabel}`,
    "Consent to contact: Yes",
    `Consent language: ${CONSENT_LANGUAGE}`,
    `Consent page: ${consentPage}`,
    `Consent captured at: ${consentCapturedAt}`,
  ].join("\n");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${SOURCE}:${phone}`]);
    const duplicate = await client.query(
      `SELECT id FROM marketing_contacts
       WHERE source = $1
         AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $2
         AND created_at >= now() - interval '24 hours'
       ORDER BY created_at DESC
       LIMIT 1`,
      [SOURCE, phone]
    );

    if (duplicate.rows.length) {
      await client.query("COMMIT");
      return reply(200, { success: true, id: duplicate.rows[0].id, duplicate: true });
    }

    const inserted = await client.query(
      `INSERT INTO marketing_contacts
        (name, contact_type, stage, priority, phone, state, source, owner, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [name, "Consumer", "New", "High", phone, state, SOURCE, "Eric Hevelone", notes]
    );
    const id = inserted.rows[0].id;
    await sendNotification({ id, name, phone, state, contactPreference });
    await client.query("COMMIT");
    return reply(200, { success: true, id });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("t65-vitalink-request error:", error);
    return reply(500, { success: false, error: "Unable to send your request right now. Please call or text Eric instead." });
  } finally {
    client.release();
  }
};
