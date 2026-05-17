const { Pool } = require("pg");
const { syncGoogleAppointment } = require("./google-calendar-sync");
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

    const {
      id,
      client_id,
      appointment_type,
      appointment_date,
      appointment_time,
      location,
      notes
    } = body;

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
        AND agent_id = $8

      RETURNING *
      `,

      [
        client_id,
        appointment_type,
        appointment_date,
        appointment_time,
        location,
        notes,
        id,
        auth.crmAgentId
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
