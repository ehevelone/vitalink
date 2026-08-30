const { Pool } = require("pg");
const { requireCrmAgent } = require("./crm-auth");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

exports.handler = async (event) => {

  try{

    await pool.query(`
      ALTER TABLE crm_clients
      ADD COLUMN IF NOT EXISTS status TEXT,
      ADD COLUMN IF NOT EXISTS linked_app_client_id TEXT,
      ADD COLUMN IF NOT EXISTS profile_linked TEXT,
      ADD COLUMN IF NOT EXISTS emergency_profile TEXT,
      ADD COLUMN IF NOT EXISTS insurance_cards_uploaded TEXT,
      ADD COLUMN IF NOT EXISTS medication_list TEXT,
      ADD COLUMN IF NOT EXISTS doctor_list TEXT,
      ADD COLUMN IF NOT EXISTS last_sync TIMESTAMPTZ
    `);

    await pool.query(`
      ALTER TABLE user_devices
      ADD COLUMN IF NOT EXISTS push_status TEXT,
      ADD COLUMN IF NOT EXISTS last_push_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_push_success_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_push_failure_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_push_error TEXT
    `);

    const agent_id = event.queryStringParameters.agent_id;
    const auth = await requireCrmAgent(event, agent_id);

    if(auth.error){
      return{
        statusCode:403,
        body:JSON.stringify({
          success:false,
          error:auth.error
        })
      };
    }

    const result = await pool.query(

      `
      SELECT
        c.*,
        ud.push_status,
        ud.last_push_at,
        ud.last_push_success_at,
        ud.last_push_failure_at,
        ud.last_push_error,
        ud.updated_at AS device_updated_at,
        CASE
          WHEN ud.push_status IN ('invalid','failed')
            THEN 'Needs Contact'
          WHEN ud.id IS NULL
            OR ud.device_token IS NULL
            OR TRIM(ud.device_token) = ''
            OR TRIM(ud.device_token) = 'NO_TOKEN'
            THEN 'No Device'
          WHEN ud.updated_at < NOW() - INTERVAL '90 days'
            THEN 'Stale'
          WHEN ud.push_status = 'delivered'
            THEN 'OK'
          ELSE 'Registered'
        END AS push_health
      FROM crm_clients c
      LEFT JOIN users u
        ON (
          c.linked_app_client_id IS NOT NULL
          AND c.linked_app_client_id = u.id::TEXT
        )
        OR (
          c.email IS NOT NULL
          AND c.email <> ''
          AND LOWER(c.email) = LOWER(u.email)
        )
      LEFT JOIN user_devices ud
        ON ud.user_id = u.id
      WHERE c.agent_id = $1
      ORDER BY c.created_at DESC
      `,

      [agent_id]

    );

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        clients:result.rows
      })
    };

  }catch(err){

    console.error(err);

    return{
      statusCode:500,
      body:JSON.stringify({
        success:false,
        error:err.message
      })
    };

  }

};
