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
      ADD COLUMN IF NOT EXISTS linked_app_client_id TEXT,
      ADD COLUMN IF NOT EXISTS profile_linked TEXT,
      ADD COLUMN IF NOT EXISTS emergency_profile TEXT,
      ADD COLUMN IF NOT EXISTS insurance_cards_uploaded TEXT,
      ADD COLUMN IF NOT EXISTS medication_list TEXT,
      ADD COLUMN IF NOT EXISTS doctor_list TEXT,
      ADD COLUMN IF NOT EXISTS last_sync TIMESTAMPTZ
    `);

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
