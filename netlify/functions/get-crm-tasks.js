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

    const client_id =
      event.queryStringParameters.client_id;

    if(!agent_id){

      return{
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"Missing agent_id"
        })
      };

    }

    const values = [agent_id];

    let where = "WHERE t.agent_id = $1";

    if(client_id){

      values.push(client_id);
      where += " AND t.client_id = $2";

    }

    const result = await pool.query(
      `
      SELECT
        t.*,
        c.first_name,
        c.last_name
      FROM crm_tasks t
      LEFT JOIN crm_clients c
        ON c.id = t.client_id
      ${where}
      ORDER BY
        CASE WHEN t.status = 'Complete' THEN 1 ELSE 0 END,
        t.due_date ASC NULLS LAST,
        t.created_at DESC
      `,
      values
    );

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        tasks:result.rows
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
