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

    if(!body.agent_id || !body.calendar_id){

      return {
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"Missing calendar selection"
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

    const result = await pool.query(
      `
      UPDATE crm_google_calendar_connections
      SET calendar_id = $1,
          updated_at = NOW()
      WHERE agent_id = $2
      RETURNING calendar_id
      `,
      [
        body.calendar_id,
        auth.crmAgentId
      ]
    );

    if(!result.rows.length){

      return {
        statusCode:404,
        body:JSON.stringify({
          success:false,
          error:"Google Calendar is not connected for this agent."
        })
      };

    }

    return {
      statusCode:200,
      body:JSON.stringify({
        success:true,
        selected_calendar_id:result.rows[0].calendar_id
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
