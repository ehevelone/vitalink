const OpenAI = require("openai");
const db = require("./services/db");
const { verifyAgentSession } = require("./services/agent-auth");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function reply(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(obj),
  };
}

function safeJsonParse(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function clean(value) {
  return (value || "").toString().trim();
}

function cleanBase64Image(value) {
  const raw = clean(value);
  if (!raw) return "";
  return raw.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return reply(200, {});

    if (event.httpMethod !== "POST") {
      return reply(405, { success: false, error: "Method Not Allowed" });
    }

    let body = {};
    try {
      body = event.isBase64Encoded
        ? JSON.parse(Buffer.from(event.body || "", "base64").toString("utf8"))
        : JSON.parse(event.body || "{}");
    } catch (_) {
      return reply(400, { success: false, error: "Invalid request body" });
    }

    const agentEmail = clean(body.agentEmail || body.email);
    const sessionAgent = await verifyAgentSession({
      agentEmail,
      token: body.agentSessionToken,
    });

    if (!sessionAgent) {
      return reply(403, { success: false, error: "Unauthorized" });
    }

    if (!body.imageBase64) {
      return reply(400, { success: false, error: "No business card image provided" });
    }

    await db.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS business_card_image_base64 TEXT
    `);

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `
You extract insurance agent business card details.

Return ONLY valid JSON with this exact shape:
{
  "name": "",
  "title": "",
  "phone": "",
  "mobilePhone": "",
  "email": "",
  "agencyName": "",
  "website": "",
  "calendlyUrl": "",
  "address": "",
  "city": "",
  "state": "",
  "zip": "",
  "hasHeadshot": false,
  "hasLogo": false,
  "logoText": "",
  "notes": ""
}

Rules:
- Prefer the agent/person name, not the agency name.
- Use phone for the main office or best visible contact number.
- Use mobilePhone only if a separate mobile/cell number is clearly labeled.
- Extract a Calendly or scheduling URL only if it is printed on the card.
- Keep state as a 2-letter abbreviation when possible.
- Do not invent missing values.
          `.trim(),
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the agent business card details." },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${body.imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 900,
    });

    const raw = response.choices?.[0]?.message?.content || "";
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = safeJsonParse(cleaned, { rawText: raw });
    const cardImageBase64 = cleanBase64Image(body.cardImageBase64);

    if (cardImageBase64) {
      await db.query(
        `
        UPDATE agents
        SET business_card_image_base64 = $1
        WHERE LOWER(email) = LOWER($2)
        `,
        [cardImageBase64, agentEmail]
      );
    }

    return reply(200, {
      success: true,
      data: {
        name: clean(parsed.name),
        title: clean(parsed.title),
        phone: clean(parsed.phone || parsed.mobilePhone),
        mobilePhone: clean(parsed.mobilePhone),
        email: clean(parsed.email),
        agencyName: clean(parsed.agencyName),
        website: clean(parsed.website),
        calendlyUrl: clean(parsed.calendlyUrl),
        address: clean(parsed.address),
        city: clean(parsed.city),
        state: clean(parsed.state).toUpperCase(),
        zip: clean(parsed.zip),
        hasHeadshot: parsed.hasHeadshot === true,
        hasLogo: parsed.hasLogo === true,
        logoText: clean(parsed.logoText),
        notes: clean(parsed.notes),
      },
    });
  } catch (err) {
    console.error("parse_agent_business_card error:", err);
    return reply(500, {
      success: false,
      error: "Server error while scanning business card",
      details: err.message,
    });
  }
};
