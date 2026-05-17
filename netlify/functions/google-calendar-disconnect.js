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

  if(event.httpMethod !== "POST"){

    return {
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

      return {
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"Missing agent_id"
        })
      };

    }

    const auth = await requireCrmAgent(event, body.agent_id);

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

    await pool.query(
      `
      DELETE FROM crm_google_calendar_connections
      WHERE agent_id = $1
      `,
      [auth.crmAgentId]
    );

    return {
      statusCode:200,
      body:JSON.stringify({
        success:true
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
