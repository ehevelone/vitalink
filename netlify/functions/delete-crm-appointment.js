const { Pool } = require("pg");
const { deleteGoogleAppointment } = require("./google-calendar-sync");
const { requireCrmAgent } = require("./crm-auth");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

exports.handler = async (event) => {

  if(event.httpMethod !== "POST"){

    return{
      statusCode:405,
      body:JSON.stringify({
        success:false
      })
    };

  }

  try{

    const body =
      JSON.parse(event.body);

    const { id } = body;

    const currentAppointment = await pool.query(
      `
      SELECT agent_id
      FROM crm_appointments
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if(!currentAppointment.rows.length){
      return{
        statusCode:404,
        body:JSON.stringify({
          success:false,
          error:"Appointment not found"
        })
      };
    }

    const auth = await requireCrmAgent(
      event,
      currentAppointment.rows[0].agent_id
    );

    if(auth.error){
      return{
        statusCode:403,
        body:JSON.stringify({
          success:false,
          error:auth.error
        })
      };
    }

    let googleSyncError = null;

    try{

      await deleteGoogleAppointment(
        pool,
        id
      );

    }catch(syncErr){

      console.error("Google Calendar delete error:", syncErr);
      googleSyncError = syncErr.message;

    }

    await pool.query(

      `
      DELETE FROM crm_appointments
      WHERE id = $1
        AND agent_id = $2
      `,

      [id, auth.crmAgentId]

    );

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        google_sync_error:googleSyncError
      })
    };

  }catch(err){

    console.error(err);

    return{
      statusCode:500,
      body:JSON.stringify({
        success:false,
        error:err.message
      })
    };

  }

};
