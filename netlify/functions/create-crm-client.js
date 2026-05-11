const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

exports.handler = async (event) => {

  try{

    const body = JSON.parse(event.body);

    const client = await pool.query(

      `INSERT INTO crm_clients (

        agent_id,

        first_name,
        last_name,

        dob,

        mobile_phone,
        landline_phone,

        email,

        address,
        city,
        state,
        zip

      )

      VALUES (

        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11

      )

      RETURNING *`,

      [

        body.agent_id,

        body.first_name,
        body.last_name,

        body.dob,

        body.mobile_phone,
        body.landline_phone,

        body.email,

        body.address,
        body.city,
        body.state,
        body.zip

      ]

    );

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        client:client.rows[0]
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