const { Pool } = require("pg");

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

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        appointment:result.rows[0]
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