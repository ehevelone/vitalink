const { Pool } = require("pg");
const { ensureGoogleCalendarTables } = require("./google-calendar-sync");

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

    await ensureGoogleCalendarTables(pool);

    const result = await pool.query(
      `
      SELECT updated_at
      FROM crm_google_calendar_connections
      WHERE agent_id = $1
      LIMIT 1
      `,
      [String(agentId)]
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
