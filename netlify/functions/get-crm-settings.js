const { Pool } = require("pg");
const { requireCrmAgent } = require("./crm-auth");

const pool = new Pool({
  connectionString:process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

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

exports.handler = async (event) => {

  try{

    const agentId =
      event.queryStringParameters?.agent_id;

    if(!agentId){

      return{
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"Missing agent_id"
        })
      };

    }

    const auth = await requireCrmAgent(event, agentId);

    if(auth.error){
      return{
        statusCode:403,
        body:JSON.stringify({
          success:false,
          error:auth.error
        })
      };
    }

    await ensureSettingsTable();

    const result = await pool.query(
      `
      SELECT *
      FROM crm_agent_settings
      WHERE agent_id = $1
      LIMIT 1
      `,
      [String(agentId)]
    );

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        settings:result.rows[0] || {
          agent_id:String(agentId),
          timezone:"America/Chicago",
          default_appointment_type:"Follow-Up",
          default_appointment_duration:60,
          sync_notes_to_google:true,
          default_task_priority:"Medium",
          default_task_due_days:7,
          show_completed_tasks:false,
          renewal_reminder_days:60,
          default_client_status:"Client",
          notify_appointments:true,
          notify_overdue_tasks:true,
          notify_renewals:true,
          notify_google_sync_errors:true
        }
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
