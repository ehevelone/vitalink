const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

exports.handler = async (event) => {

  try{

    await pool.query(`
      ALTER TABLE crm_clients
      ADD COLUMN IF NOT EXISTS status TEXT
    `);

    const agent_id = event.queryStringParameters.agent_id;

    const result = await pool.query(

      `
      SELECT *
      FROM crm_clients
      WHERE agent_id = $1
      ORDER BY created_at DESC
      `,

      [agent_id]

    );

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        clients:result.rows
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
