const { Pool } = require("pg");

const pool = new Pool({
  connectionString:process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

const allowedFields = [
  "agent_name",
  "agent_email",
  "agent_phone",
  "agency_name",
  "npn",
  "license_number",
  "timezone",
  "default_appointment_type",
  "default_appointment_duration",
  "default_appointment_location",
  "sync_notes_to_google",
  "default_task_priority",
  "default_task_due_days",
  "show_completed_tasks",
  "renewal_reminder_days",
  "default_client_status",
  "notify_appointments",
  "notify_overdue_tasks",
  "notify_renewals",
  "notify_google_sync_errors",
  "custom_appointment_types",
  "custom_task_priorities",
  "custom_lead_sources",
  "custom_carriers"
];

async function ensureSettingsTable(){

  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_agent_settings (
      agent_id TEXT PRIMARY KEY,
      agent_name TEXT,
      agent_email TEXT,
      agent_phone TEXT,
      agency_name TEXT,
      npn TEXT,
      license_number TEXT,
      timezone TEXT,
      default_appointment_type TEXT,
      default_appointment_duration INTEGER,
      default_appointment_location TEXT,
      sync_notes_to_google BOOLEAN DEFAULT TRUE,
      default_task_priority TEXT,
      default_task_due_days INTEGER,
      show_completed_tasks BOOLEAN DEFAULT FALSE,
      renewal_reminder_days INTEGER DEFAULT 60,
      default_client_status TEXT,
      notify_appointments BOOLEAN DEFAULT TRUE,
      notify_overdue_tasks BOOLEAN DEFAULT TRUE,
      notify_renewals BOOLEAN DEFAULT TRUE,
      notify_google_sync_errors BOOLEAN DEFAULT TRUE,
      custom_appointment_types TEXT,
      custom_task_priorities TEXT,
      custom_lead_sources TEXT,
      custom_carriers TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE crm_agent_settings
    ADD COLUMN IF NOT EXISTS agent_name TEXT,
    ADD COLUMN IF NOT EXISTS agent_email TEXT,
    ADD COLUMN IF NOT EXISTS agent_phone TEXT,
    ADD COLUMN IF NOT EXISTS agency_name TEXT,
    ADD COLUMN IF NOT EXISTS npn TEXT,
    ADD COLUMN IF NOT EXISTS license_number TEXT,
    ADD COLUMN IF NOT EXISTS timezone TEXT,
    ADD COLUMN IF NOT EXISTS default_appointment_type TEXT,
    ADD COLUMN IF NOT EXISTS default_appointment_duration INTEGER,
    ADD COLUMN IF NOT EXISTS default_appointment_location TEXT,
    ADD COLUMN IF NOT EXISTS sync_notes_to_google BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS default_task_priority TEXT,
    ADD COLUMN IF NOT EXISTS default_task_due_days INTEGER,
    ADD COLUMN IF NOT EXISTS show_completed_tasks BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS renewal_reminder_days INTEGER DEFAULT 60,
    ADD COLUMN IF NOT EXISTS default_client_status TEXT,
    ADD COLUMN IF NOT EXISTS notify_appointments BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notify_overdue_tasks BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notify_renewals BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notify_google_sync_errors BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS custom_appointment_types TEXT,
    ADD COLUMN IF NOT EXISTS custom_task_priorities TEXT,
    ADD COLUMN IF NOT EXISTS custom_lead_sources TEXT,
    ADD COLUMN IF NOT EXISTS custom_carriers TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
  `);

}

function normalizeValue(field, value){

  if(value === ""){
    return null;
  }

  if([
    "default_appointment_duration",
    "default_task_due_days",
    "renewal_reminder_days"
  ].includes(field)){

    const number =
      Number(value);

    return Number.isFinite(number) ? number : null;

  }

  if([
    "sync_notes_to_google",
    "show_completed_tasks",
    "notify_appointments",
    "notify_overdue_tasks",
    "notify_renewals",
    "notify_google_sync_errors"
  ].includes(field)){

    return value === true || value === "true";

  }

  return value ?? null;

}

exports.handler = async (event) => {

  if(event.httpMethod !== "POST"){

    return{
      statusCode:405,
      body:JSON.stringify({
        success:false,
        error:"Method not allowed"
      })
    };

  }

  try{

    const body =
      JSON.parse(event.body || "{}");

    if(!body.agent_id){

      return{
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"Missing agent_id"
        })
      };

    }

    await ensureSettingsTable();

    const columns =
      allowedFields.filter(field =>
        Object.prototype.hasOwnProperty.call(body, field)
      );

    if(columns.length === 0){

      return{
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"No settings to update"
        })
      };

    }

    const insertColumns = [
      "agent_id",
      ...columns
    ];

    const values = [
      String(body.agent_id),
      ...columns.map(field =>
        normalizeValue(field, body[field])
      )
    ];

    const placeholders =
      values.map((_, index) => `$${index + 1}`);

    const updateColumns =
      columns.map(field =>
        `${field} = EXCLUDED.${field}`
      );

    const result = await pool.query(
      `
      INSERT INTO crm_agent_settings (
        ${insertColumns.join(", ")}
      )
      VALUES (
        ${placeholders.join(", ")}
      )
      ON CONFLICT (agent_id)
      DO UPDATE SET
        ${updateColumns.join(",\n        ")},
        updated_at = NOW()
      RETURNING *
      `,
      values
    );

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        settings:result.rows[0]
      })
    };

  }catch(err){

    return{
      statusCode:500,
      body:JSON.stringify({
        success:false,
        error:err.message
      })
    };

  }

};
