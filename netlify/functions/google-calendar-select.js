const { Pool } = require("pg");
const { ensureGoogleCalendarTables } = require("./google-calendar-sync");

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
        String(body.agent_id)
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
