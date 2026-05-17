const { Pool } = require("pg");
const { getGoogleAccessToken } = require("./google-calendar-sync");
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

    const google =
      await getGoogleAccessToken(pool, auth.crmAgentId);

    if(!google){

      return {
        statusCode:200,
        body:JSON.stringify({
          success:true,
          connected:false,
          calendars:[]
        })
      };

    }

    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      {
        headers:{
          "Authorization":`Bearer ${google.accessToken}`
        }
      }
    );

    const data = await res.json();

    if(!res.ok){
      throw new Error(data.error?.message || "Unable to load calendars");
    }

    const calendars =
      (data.items || [])
        .filter(calendar =>
          calendar.accessRole === "owner" ||
          calendar.accessRole === "writer"
        )
        .map(calendar => ({
          id:calendar.id,
          summary:calendar.summary,
          primary:calendar.primary === true
        }));

    return {
      statusCode:200,
      body:JSON.stringify({
        success:true,
        connected:true,
        selected_calendar_id:google.connection.calendar_id || "primary",
        calendars
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
