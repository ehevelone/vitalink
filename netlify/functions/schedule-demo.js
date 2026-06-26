const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

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

async function ensureTables(){
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS marketing_contacts (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      organization text,
      contact_type text not null default 'Agency Owner',
      stage text not null default 'New',
      priority text not null default 'Medium',
      phone text,
      email text,
      website text,
      city text,
      state text,
      source text,
      owner text,
      demo_date timestamptz,
      follow_up_date date,
      last_contact_date date,
      referral_source text,
      notes text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
}

exports.handler = async (event) => {
  if(event.httpMethod === "OPTIONS"){
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ""
    };
  }

  if(event.httpMethod !== "POST"){
    return reply(405, {
      success: false,
      error: "Method not allowed."
    });
  }

  try{
    await ensureTables();

    const body = event.body ? JSON.parse(event.body) : {};
    const name = clean(body.name);
    const organization = clean(body.organization);
    const phone = clean(body.phone);
    const email = clean(body.email);
    const preferredContact = clean(body.preferred_contact) || "Phone";
    const contactType = clean(body.contact_type) || "Demo Request";
    const notes = clean(body.notes);

    if(!name){
      return reply(400, {
        success: false,
        error: "Name is required."
      });
    }

    if(!phone && !email){
      return reply(400, {
        success: false,
        error: "Phone or email is required."
      });
    }

    const noteLines = [
      "Schedule a demo request submitted from myvitalink.app.",
      `Preferred contact: ${preferredContact}`,
      notes ? `Notes: ${notes}` : ""
    ].filter(Boolean);

    const result = await pool.query(`
      INSERT INTO marketing_contacts (
        name,
        organization,
        contact_type,
        stage,
        priority,
        phone,
        email,
        source,
        notes
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id
    `, [
      name,
      organization,
      contactType,
      "Demo Requested",
      "High",
      phone,
      email,
      "Website Demo Request",
      noteLines.join("\n")
    ]);

    return reply(200, {
      success: true,
      id: result.rows[0].id
    });
  }catch(err){
    console.error(err);

    return reply(500, {
      success: false,
      error: err.message
    });
  }
};
