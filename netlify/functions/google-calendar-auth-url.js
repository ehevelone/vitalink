const crypto = require("crypto");
const {
  ensureGoogleCalendarTables,
  getRedirectUri
} = require("./google-calendar-sync");
const { requireCrmAgent } = require("./crm-auth");
const { Pool } = require("pg");

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

    if(!process.env.GOOGLE_CLIENT_ID){

      return {
        statusCode:500,
        body:JSON.stringify({
          success:false,
          error:"Missing GOOGLE_CLIENT_ID"
        })
      };

    }

    const state =
      crypto.randomBytes(24).toString("hex");

    await ensureGoogleCalendarTables(pool);

    await pool.query(
      `
      INSERT INTO crm_google_calendar_oauth_states (
        state,
        agent_id,
        expires_at
      )
      VALUES ($1,$2,NOW() + INTERVAL '15 minutes')
      `,
      [
        state,
        auth.crmAgentId
      ]
    );

    const params = new URLSearchParams({
      client_id:process.env.GOOGLE_CLIENT_ID,
      redirect_uri:getRedirectUri(event),
      response_type:"code",
      access_type:"offline",
      prompt:"consent",
      scope:"https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly",
      state
    });

    return {
      statusCode:200,
      body:JSON.stringify({
        success:true,
        url:`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
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
