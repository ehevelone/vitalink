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

    if(!body.id){

      return{
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"Missing task id"
        })
      };

    }

    const completedAt =
      body.status === "Complete" ? new Date() : null;

    const result = await pool.query(
      `
      UPDATE crm_tasks
      SET
        client_id = $1,
        title = $2,
        notes = $3,
        due_date = $4,
        priority = $5,
        status = $6,
        completed_at = $7,
        updated_at = NOW()
      WHERE id = $8
      RETURNING *
      `,
      [
        body.client_id || null,
        body.title,
        body.notes || null,
        body.due_date || null,
        body.priority || "Medium",
        body.status || "Open",
        completedAt,
        body.id
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
