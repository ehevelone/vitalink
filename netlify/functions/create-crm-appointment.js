const { Pool } = require("pg");
const { syncGoogleAppointment } = require("./google-calendar-sync");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function handler(event){

  if(event.httpMethod !== "POST"){

    return {
      statusCode:405,
      body:JSON.stringify({
        success:false,
        error:"Method not allowed"
      })
    };

  }

  try{

    const body = JSON.parse(event.body);

    const {
      agent_id,
      client_id,
      appointment_type,
      appointment_date,
      appointment_time,
      location,
      notes
    } = body;

    if(!agent_id || !client_id || !appointment_date){

      return {
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"Missing required fields"
        })
      };

    }

    const result = await pool.query(
      `
      INSERT INTO crm_appointments (
        agent_id,
        client_id,
        appointment_type,
        appointment_date,
        appointment_time,
        location,
        notes
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [
        agent_id,
        client_id,
        appointment_type,
        appointment_date,
        appointment_time,
        location,
        notes
      ]
    );

    let googleSyncError = null;
    let googleSyncStatus = "not_attempted";

    try{

      googleSyncStatus = await syncGoogleAppointment(
        pool,
        result.rows[0].id
      );

    }catch(syncErr){

      console.error("Google Calendar sync error:", syncErr);
      googleSyncError = syncErr.message;

    }

    return {
      statusCode:200,
      body:JSON.stringify({
        success:true,
        appointment:result.rows[0],
        google_sync_status:googleSyncStatus,
        google_sync_error:googleSyncError
      })
    };

  }catch(err){

    console.error(err);

    return {
      statusCode:500,
      body:JSON.stringify({
        success:false,
        error:err.message
      })
    };

  }

}

exports.handler = handler;
module.exports.handler = handler;
