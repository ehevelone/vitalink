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

    const body =
      JSON.parse(event.body || "{}");

    if(!body.agent_id || !body.title){

      return{
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"Missing required fields"
        })
      };

    }

    const result = await pool.query(
      `
      INSERT INTO crm_tasks (
        agent_id,
        client_id,
        title,
        notes,
        due_date,
        priority,
        status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [
        body.agent_id,
        body.client_id || null,
        body.title,
        body.notes || null,
        body.due_date || null,
        body.priority || "Medium",
        body.status || "Open"
      ]
    );

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        task:result.rows[0]
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
