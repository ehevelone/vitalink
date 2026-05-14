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
    let googleSyncStatus = "not_attempted";
    let googleEventLink = null;
    let googleEventId = null;
    let googleCalendarId = null;

    if(result.rows[0]){

      try{

        const googleSyncResult = await syncGoogleAppointment(
          pool,
          result.rows[0].id
        );

        googleSyncStatus =
          googleSyncResult?.status || googleSyncResult;

        googleEventLink =
          googleSyncResult?.event_link || null;

        googleEventId =
          googleSyncResult?.event_id || null;

        googleCalendarId =
          googleSyncResult?.calendar_id || null;

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
        google_sync_status:googleSyncStatus,
        google_event_link:googleEventLink,
        google_event_id:googleEventId,
        google_calendar_id:googleCalendarId,
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
