const { Pool } = require("pg");
const { deleteGoogleAppointment } = require("./google-calendar-sync");

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
      `,

      [id]

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
