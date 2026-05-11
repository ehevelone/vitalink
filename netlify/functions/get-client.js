const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

exports.handler = async (event) => {

  try{

    const id = event.queryStringParameters.id;

    const result = await pool.query(

      `
      SELECT *
      FROM crm_clients
      WHERE id = $1
      LIMIT 1
      `,

      [id]

    );

    if(result.rows.length === 0){

      return{
        statusCode:404,
        body:JSON.stringify({
          success:false,
          error:"Client not found"
        })
      };

    }

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        client:result.rows[0]
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