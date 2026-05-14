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

    if(!body.agent_id){

      return {
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"Missing agent_id"
        })
      };

    }

    await ensureGoogleCalendarTables(pool);

    await pool.query(
      `
      DELETE FROM crm_google_calendar_connections
      WHERE agent_id = $1
      `,
      [String(body.agent_id)]
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
