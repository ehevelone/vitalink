const { Pool } = require("pg");
const { ensureGoogleCalendarTables } = require("./google-calendar-sync");
const { requireCrmAgent } = require("./crm-auth");

const pool = new Pool({
  connectionString:process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

exports.handler = async (event) => {

  try{

    const agentId =
      event.queryStringParameters?.agent_id;

    if(!agentId){

      return {
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"Missing agent_id"
        })
      };

    }

    const auth = await requireCrmAgent(event, agentId);

    if(auth.error){

      return {
        statusCode:403,
        body:JSON.stringify({
          success:false,
          error:auth.error
        })
      };

    }

    await ensureGoogleCalendarTables(pool);

    const result = await pool.query(
      `
      SELECT updated_at
      FROM crm_google_calendar_connections
      WHERE agent_id = $1
      LIMIT 1
      `,
      [auth.crmAgentId]
    );

    return {
      statusCode:200,
      body:JSON.stringify({
        success:true,
        connected:result.rows.length > 0,
        updated_at:result.rows[0]?.updated_at || null
      })
    };

  }catch(err){

    return {
      statusCode:500,
      body:JSON.stringify({
        success:false,
        error:err.message
      })
    };

  }

};
