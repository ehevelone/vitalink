const db = require("./services/db");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function reply(statusCode, body){
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body)
  };
}

function clean(value){
  const text = String(value || "").trim();
  return text || null;
}

function validEmail(value){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function escapeHtml(value){
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function ensureTable(){
  await db.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS reach_waitlist (
      id uuid primary key default gen_random_uuid(),
      first_name text not null,
      last_name text not null,
      email text not null,
      phone text not null,
      state_licensed text not null,
      client_count text not null,
      founding_agent boolean not null default false,
      source text not null default 'reach_page',
      notification_status text not null default 'pending',
      notification_error text,
      created_at timestamptz not null default now()
    );
  `);
}

async function sendResendEmail({to, subject, text, html}){
  const apiKey = process.env.RESEND_API_KEY;
  if(!apiKey){
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const from = process.env.REACH_WAITLIST_FROM_EMAIL || "VitaLink Reach <myvitalink@outreach.etretirement.com>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html
    })
  });

  const payload = await response.json().catch(() => ({}));
  if(!response.ok){
    throw new Error(payload.message || payload.error || "Resend email failed.");
  }

  return payload;
}

function confirmationText(firstName){
  return `Hi ${firstName},

You're on the VitaLink Reach early access list.

Thanks for your interest in VitaLink Reach. We're preparing the release and will invite agents in phases as the platform, onboarding, and support are ready.

Android access is planned first, with iOS planned after that. Early signups may be offered special pricing when access opens.

In the meantime, check out VitaLink at myvitalink.app.

- Eric Hevelone
  VitaLink Reach
  eric@etretirement.com`;
}

function confirmationHtml(firstName){
  const safeName = escapeHtml(firstName);
  return `
    <div style="background:#0d1117;color:#ffffff;font-family:Arial,Helvetica,sans-serif;padding:28px;">
      <div style="max-width:640px;margin:0 auto;background:#161b22;border:1px solid #21262d;border-radius:18px;padding:28px;">
        <h1 style="margin:0 0 12px;color:#ffffff;">You're on the VitaLink Reach early access list.</h1>
        <p style="color:#c9d1d9;font-size:16px;line-height:1.6;">Hi ${safeName},</p>
        <p style="color:#c9d1d9;font-size:16px;line-height:1.6;">Thanks for your interest in VitaLink Reach. We're preparing the release and will invite agents in phases as the platform, onboarding, and support are ready.</p>
        <p style="color:#c9d1d9;font-size:16px;line-height:1.6;">Android access is planned first, with iOS planned after that. Early signups may be offered special pricing when access opens.</p>
        <p style="color:#c9d1d9;font-size:16px;line-height:1.6;">In the meantime, check out VitaLink at <a href="https://myvitalink.app" style="color:#00c8ff;">myvitalink.app</a>.</p>
        <p style="color:#8b949e;">- Eric Hevelone<br>VitaLink Reach<br>eric@etretirement.com</p>
      </div>
    </div>
  `;
}

function adminText(data){
  return `New VitaLink Reach early access submission

Name: ${data.first_name} ${data.last_name}
Email: ${data.email}
Phone: ${data.phone}
State licensed in: ${data.state}
Approx. clients: ${data.client_count}
Early pricing interest: ${data.founding_agent ? "Yes" : "No"}
`;
}

function adminHtml(data){
  const rows = [
    ["Name", `${data.first_name} ${data.last_name}`],
    ["Email", data.email],
    ["Phone", data.phone],
    ["State licensed in", data.state],
    ["Approx. clients", data.client_count],
    ["Early pricing interest", data.founding_agent ? "Yes" : "No"]
  ];

  const bodyRows = rows.map(([label, value]) => `
    <tr>
      <td style="padding:8px 10px;color:#8b949e;border-bottom:1px solid #21262d;">${escapeHtml(label)}</td>
      <td style="padding:8px 10px;color:#ffffff;border-bottom:1px solid #21262d;">${escapeHtml(value)}</td>
    </tr>
  `).join("");

  return `
    <div style="background:#0d1117;color:#ffffff;font-family:Arial,Helvetica,sans-serif;padding:24px;">
      <h1 style="margin:0 0 16px;">New VitaLink Reach early access submission</h1>
      <table style="border-collapse:collapse;max-width:680px;width:100%;">${bodyRows}</table>
    </div>
  `;
}

exports.handler = async (event) => {
  if(event.httpMethod === "OPTIONS"){
    return {statusCode: 204, headers: corsHeaders, body: ""};
  }

  if(event.httpMethod !== "POST"){
    return reply(405, {success: false, error: "Method not allowed."});
  }

  let savedId = null;

  try{
    const body = event.body ? JSON.parse(event.body) : {};
    const data = {
      first_name: clean(body.first_name),
      last_name: clean(body.last_name),
      email: clean(body.email),
      phone: clean(body.phone),
      state: clean(body.state),
      client_count: clean(body.client_count),
      founding_agent: Boolean(body.founding_agent)
    };

    if(!data.first_name || !data.last_name || !data.email || !data.phone || !data.state || !data.client_count){
      return reply(400, {success: false, error: "Please complete every required field."});
    }

    if(!validEmail(data.email)){
      return reply(400, {success: false, error: "Please enter a valid work email."});
    }

    await ensureTable();

    const result = await db.query(`
      INSERT INTO reach_waitlist (
        first_name,
        last_name,
        email,
        phone,
        state_licensed,
        client_count,
        founding_agent
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id
    `, [
      data.first_name,
      data.last_name,
      data.email,
      data.phone,
      data.state,
      data.client_count,
      data.founding_agent
    ]);

    savedId = result.rows[0].id;

    await sendResendEmail({
      to: "eric@etretirement.com",
      subject: "New VitaLink Reach early access submission",
      text: adminText(data),
      html: adminHtml(data)
    });

    await sendResendEmail({
      to: data.email,
      subject: "You're on the VitaLink Reach early access list!",
      text: confirmationText(data.first_name),
      html: confirmationHtml(data.first_name)
    });

    await db.query(`
      UPDATE reach_waitlist
      SET notification_status = 'sent',
          notification_error = null
      WHERE id = $1
    `, [savedId]);

    return reply(200, {success: true, id: savedId});
  }catch(err){
    console.error(err);

    if(savedId){
      await db.query(`
        UPDATE reach_waitlist
        SET notification_status = 'failed',
            notification_error = $2
        WHERE id = $1
      `, [savedId, err.message]).catch(console.error);
    }

    return reply(500, {
      success: false,
      error: err.message || "Could not submit the early access form."
    });
  }
};
