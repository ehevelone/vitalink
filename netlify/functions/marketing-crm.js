const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-marketing-session",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function json(statusCode, body){
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body)
  };
}

function cleanText(value){
  const text = String(value || "").trim();
  return text || null;
}

function cleanDate(value){
  const text = cleanText(value);
  return text || null;
}

async function ensureTables(){
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS marketing_crm_sessions (
      id uuid primary key default gen_random_uuid(),
      agent_id integer not null,
      session_token text not null unique,
      session_expires timestamptz not null,
      created_at timestamptz not null default now()
    );

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

    CREATE TABLE IF NOT EXISTS marketing_activities (
      id uuid primary key default gen_random_uuid(),
      contact_id uuid references marketing_contacts(id) on delete cascade,
      activity_type text not null default 'Note',
      activity_date timestamptz not null default now(),
      title text not null,
      notes text,
      outcome text,
      next_follow_up_date date,
      created_at timestamptz not null default now()
    );

    CREATE TABLE IF NOT EXISTS marketing_appointments (
      id uuid primary key default gen_random_uuid(),
      contact_id uuid references marketing_contacts(id) on delete set null,
      title text not null,
      appointment_type text not null default 'Demo',
      appointment_date date not null,
      appointment_time time,
      location text,
      notes text,
      status text not null default 'Scheduled',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
}

async function login(body){
  const email = cleanText(body.email);
  const password = String(body.password || "");

  if(!email || !password){
    throw new Error("Email and password are required.");
  }

  const result = await pool.query(`
    SELECT id, email, name, password_hash, active, admin_manual_access
    FROM agents
    WHERE LOWER(email) = LOWER($1)
    LIMIT 1
  `, [email]);

  if(result.rowCount === 0){
    throw new Error("Invalid credentials.");
  }

  const agent = result.rows[0];

  if(!agent.active || !agent.admin_manual_access){
    throw new Error("This login is not authorized for Marketing CRM access.");
  }

  if(!agent.password_hash){
    throw new Error("Agent password is not set.");
  }

  let ok = await bcrypt.compare(password, agent.password_hash);
  const trimmedPassword = password.trim();

  if(!ok && trimmedPassword && trimmedPassword !== password){
    ok = await bcrypt.compare(trimmedPassword, agent.password_hash);
  }

  if(!ok){
    throw new Error("Invalid credentials.");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 12 * 60 * 60 * 1000);

  await pool.query(`
    INSERT INTO marketing_crm_sessions (agent_id, session_token, session_expires)
    VALUES ($1, $2, $3)
  `, [agent.id, token, expires.toISOString()]);

  return {
    session_token: token,
    session_expires: expires.toISOString(),
    user: {
      id: agent.id,
      email: agent.email,
      name: agent.name
    }
  };
}

async function requireMarketingAdmin(event){
  const token =
    event.headers["x-marketing-session"] ||
    event.headers["X-Marketing-Session"] ||
    "";

  if(!token){
    return {
      ok: false,
      error: "Missing Marketing CRM session."
    };
  }

  const result = await pool.query(`
    SELECT s.agent_id, s.session_expires, a.email, a.name
    FROM marketing_crm_sessions s
    JOIN agents a ON a.id = s.agent_id
    WHERE s.session_token = $1
      AND s.session_expires > NOW()
      AND a.active = TRUE
      AND a.admin_manual_access = TRUE
    LIMIT 1
  `, [token]);

  if(result.rowCount === 0){
    return {
      ok: false,
      error: "Marketing CRM session expired or unauthorized."
    };
  }

  return {
    ok: true,
    user: result.rows[0]
  };
}

async function logout(event){
  const token =
    event.headers["x-marketing-session"] ||
    event.headers["X-Marketing-Session"] ||
    "";

  if(token){
    await pool.query(
      "DELETE FROM marketing_crm_sessions WHERE session_token = $1",
      [token]
    );
  }
}

async function loadData(){
  const [contacts, activities, appointments] = await Promise.all([
    pool.query(`
      SELECT *
      FROM marketing_contacts
      ORDER BY
        COALESCE(follow_up_date, '2999-12-31'::date) ASC,
        updated_at DESC
    `),
    pool.query(`
      SELECT a.*, c.name AS contact_name, c.organization
      FROM marketing_activities a
      LEFT JOIN marketing_contacts c ON c.id = a.contact_id
      ORDER BY a.activity_date DESC
      LIMIT 300
    `),
    pool.query(`
      SELECT a.*, c.name AS contact_name, c.organization
      FROM marketing_appointments a
      LEFT JOIN marketing_contacts c ON c.id = a.contact_id
      ORDER BY a.appointment_date ASC, a.appointment_time ASC NULLS LAST
    `)
  ]);

  return {
    contacts: contacts.rows,
    activities: activities.rows,
    appointments: appointments.rows
  };
}

async function saveContact(body){
  const values = [
    cleanText(body.name),
    cleanText(body.organization),
    cleanText(body.contact_type) || "Agency Owner",
    cleanText(body.stage) || "New",
    cleanText(body.priority) || "Medium",
    cleanText(body.phone),
    cleanText(body.email),
    cleanText(body.website),
    cleanText(body.city),
    cleanText(body.state),
    cleanText(body.source),
    cleanText(body.owner),
    cleanDate(body.demo_date),
    cleanDate(body.follow_up_date),
    cleanDate(body.last_contact_date),
    cleanText(body.referral_source),
    cleanText(body.notes)
  ];

  if(!values[0]){
    throw new Error("Name is required.");
  }

  if(body.id){
    const result = await pool.query(`
      UPDATE marketing_contacts
      SET
        name = $1,
        organization = $2,
        contact_type = $3,
        stage = $4,
        priority = $5,
        phone = $6,
        email = $7,
        website = $8,
        city = $9,
        state = $10,
        source = $11,
        owner = $12,
        demo_date = $13,
        follow_up_date = $14,
        last_contact_date = $15,
        referral_source = $16,
        notes = $17,
        updated_at = now()
      WHERE id = $18
      RETURNING *
    `, [...values, body.id]);

    return result.rows[0];
  }

  const result = await pool.query(`
    INSERT INTO marketing_contacts (
      name,
      organization,
      contact_type,
      stage,
      priority,
      phone,
      email,
      website,
      city,
      state,
      source,
      owner,
      demo_date,
      follow_up_date,
      last_contact_date,
      referral_source,
      notes
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
    )
    RETURNING *
  `, values);

  return result.rows[0];
}

async function saveActivity(body){
  const values = [
    cleanText(body.contact_id),
    cleanText(body.activity_type) || "Note",
    cleanDate(body.activity_date) || new Date().toISOString(),
    cleanText(body.title),
    cleanText(body.notes),
    cleanText(body.outcome),
    cleanDate(body.next_follow_up_date)
  ];

  if(!values[3]){
    throw new Error("Activity title is required.");
  }

  const result = await pool.query(`
    INSERT INTO marketing_activities (
      contact_id,
      activity_type,
      activity_date,
      title,
      notes,
      outcome,
      next_follow_up_date
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *
  `, values);

  if(values[0] && values[6]){
    await pool.query(`
      UPDATE marketing_contacts
      SET follow_up_date = $1, updated_at = now()
      WHERE id = $2
    `, [values[6], values[0]]);
  }

  return result.rows[0];
}

async function saveAppointment(body){
  const values = [
    cleanText(body.contact_id),
    cleanText(body.title),
    cleanText(body.appointment_type) || "Demo",
    cleanDate(body.appointment_date),
    cleanText(body.appointment_time),
    cleanText(body.location),
    cleanText(body.notes),
    cleanText(body.status) || "Scheduled"
  ];

  if(!values[1]){
    throw new Error("Appointment title is required.");
  }

  if(!values[3]){
    throw new Error("Appointment date is required.");
  }

  if(body.id){
    const result = await pool.query(`
      UPDATE marketing_appointments
      SET
        contact_id = $1,
        title = $2,
        appointment_type = $3,
        appointment_date = $4,
        appointment_time = $5,
        location = $6,
        notes = $7,
        status = $8,
        updated_at = now()
      WHERE id = $9
      RETURNING *
    `, [...values, body.id]);

    return result.rows[0];
  }

  const result = await pool.query(`
    INSERT INTO marketing_appointments (
      contact_id,
      title,
      appointment_type,
      appointment_date,
      appointment_time,
      location,
      notes,
      status
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
  `, values);

  return result.rows[0];
}

async function removeRow(table, id){
  const allowedTables = {
    contact: "marketing_contacts",
    activity: "marketing_activities",
    appointment: "marketing_appointments"
  };

  const tableName = allowedTables[table];

  if(!tableName || !id){
    throw new Error("Invalid delete request.");
  }

  await pool.query(`DELETE FROM ${tableName} WHERE id = $1`, [id]);
}

exports.handler = async (event) => {
  if(event.httpMethod === "OPTIONS"){
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ""
    };
  }

  try{
    await ensureTables();

    const action =
      event.queryStringParameters?.action ||
      "load";

    const body =
      event.body ? JSON.parse(event.body) : {};

    if(action === "login"){
      const session = await login(body);
      return json(200, {
        success: true,
        ...session
      });
    }

    if(action === "logout"){
      await logout(event);
      return json(200, {
        success: true
      });
    }

    const auth = await requireMarketingAdmin(event);

    if(!auth.ok){
      return json(401, {
        success: false,
        error: auth.error
      });
    }

    if(action === "load"){
      return json(200, {
        success: true,
        ...(await loadData())
      });
    }

    if(action === "save-contact"){
      return json(200, {
        success: true,
        contact: await saveContact(body)
      });
    }

    if(action === "save-activity"){
      return json(200, {
        success: true,
        activity: await saveActivity(body)
      });
    }

    if(action === "save-appointment"){
      return json(200, {
        success: true,
        appointment: await saveAppointment(body)
      });
    }

    if(action === "delete"){
      await removeRow(body.table, body.id);

      return json(200, {
        success: true
      });
    }

    return json(400, {
      success: false,
      error: "Unknown action."
    });
  }catch(err){
    console.error(err);

    return json(500, {
      success: false,
      error: err.message
    });
  }
};
