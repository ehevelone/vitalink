const { getRedirectUri } = require("./google-calendar-sync");

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

    if(!process.env.GOOGLE_CLIENT_ID){

      return {
        statusCode:500,
        body:JSON.stringify({
          success:false,
          error:"Missing GOOGLE_CLIENT_ID"
        })
      };

    }

    const params = new URLSearchParams({
      client_id:process.env.GOOGLE_CLIENT_ID,
      redirect_uri:getRedirectUri(event),
      response_type:"code",
      access_type:"offline",
      prompt:"consent",
      scope:"https://www.googleapis.com/auth/calendar.events",
      state:String(agentId)
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
