const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

exports.handler = async () => {

  try{

    const client =
      await pool.connect();

    try{

      const result =
        await client.query(
          `
          select crm_name
          from crm_templates
          order by crm_name asc
          `
        );

      return {
        statusCode:200,
        headers:{
          "Access-Control-Allow-Origin":"*",
          "Content-Type":"application/json"
        },
        body:JSON.stringify(result.rows)
      };

    }finally{

      client.release();

    }

  }catch(err){

    console.error(err);

    return {
      statusCode:500,
      body:"Failed to load CRM templates."
    };

  }

};