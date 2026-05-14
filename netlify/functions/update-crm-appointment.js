const { Pool } = require("pg");
const { syncGoogleAppointment } = require("./google-calendar-sync");

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

    const {
      id,
      client_id,
      appointment_type,
      appointment_date,
      appointment_time,
      location,
      notes
    } = body;

    const result = await pool.query(

      `
      UPDATE crm_appointments

      SET

        client_id = $1,
        appointment_type = $2,
        appointment_date = $3,
        appointment_time = $4,
        location = $5,
        notes = $6

      WHERE id = $7

      RETURNING *
      `,

      [
        client_id,
        appointment_type,
        appointment_date,
        appointment_time,
        location,
        notes,
        id
      ]

    );

    let googleSyncError = null;

    if(result.rows[0]){

      try{

        await syncGoogleAppointment(
          pool,
          result.rows[0].id
        );

      }catch(syncErr){

        console.error("Google Calendar sync error:", syncErr);
        googleSyncError = syncErr.message;

      }

    }

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        appointment:result.rows[0],
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
