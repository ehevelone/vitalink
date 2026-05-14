const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

exports.handler = async (event) => {

  try{

    const agent_id =
      event.queryStringParameters.agent_id;

    if(!agent_id){

      return{
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"Missing agent_id"
        })
      };

    }

    const result = await pool.query(

      `
      SELECT
        a.*,
        c.first_name,
        c.last_name,
        c.city,
        c.state

      FROM crm_appointments a

      LEFT JOIN crm_clients c
        ON c.id = a.client_id

      WHERE a.agent_id = $1

      ORDER BY
        a.appointment_date ASC,
        a.appointment_time ASC
      `,

      [agent_id]

    );

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        appointments:result.rows
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