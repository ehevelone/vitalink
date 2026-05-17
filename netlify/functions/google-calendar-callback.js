const { Pool } = require("pg");
const {
  ensureGoogleCalendarTables,
  getRedirectUri
} = require("./google-calendar-sync");

const pool = new Pool({
  connectionString:process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

exports.handler = async (event) => {

  try{

    const code =
      event.queryStringParameters?.code;

    const agentId =
      event.queryStringParameters?.state;

    if(!code || !agentId){

      return {
        statusCode:400,
        body:"Missing Google authorization details."
      };

    }

    await ensureGoogleCalendarTables(pool);

    const stateResult = await pool.query(
      `
      DELETE FROM crm_google_calendar_oauth_states
      WHERE state = $1
        AND expires_at > NOW()
      RETURNING agent_id
      `,
      [String(agentId)]
    );

    if(!stateResult.rows.length){

      return {
        statusCode:400,
        body:"Google authorization expired or was not started from VitaLink CRM."
      };

    }

    const crmAgentId =
      stateResult.rows[0].agent_id;

    const params = new URLSearchParams({
      code,
      client_id:process.env.GOOGLE_CLIENT_ID,
      client_secret:process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri:getRedirectUri(event),
      grant_type:"authorization_code"
    });

    const res = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method:"POST",
        headers:{
          "Content-Type":"application/x-www-form-urlencoded"
        },
        body:params.toString()
      }
    );

    const data = await res.json();

    if(!res.ok){
      throw new Error(data.error_description || "Google authorization failed");
    }

    const expiresAt =
      new Date(Date.now() + (data.expires_in || 3600) * 1000);

    await pool.query(
      `
      INSERT INTO crm_google_calendar_connections (
        agent_id,
        access_token,
        refresh_token,
        expires_at,
        calendar_id,
        updated_at
      )
      VALUES ($1,$2,$3,$4,'primary',NOW())
      ON CONFLICT (agent_id)
      DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, crm_google_calendar_connections.refresh_token),
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
      `,
      [
        String(crmAgentId),
        data.access_token,
        data.refresh_token || null,
        expiresAt
      ]
    );

    return {
      statusCode:200,
      headers:{
        "Content-Type":"text/html"
      },
      body:`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Google Calendar Connected</title>
          </head>
          <body style="font-family:Arial,sans-serif;padding:32px;">
            <h2>Google Calendar connected.</h2>
            <p>You can close this tab and return to VitaLink CRM Settings.</p>
          </body>
        </html>
      `
    };

  }catch(err){

    return {
      statusCode:500,
      body:`Google Calendar connection failed: ${err.message}`
    };

  }

};
