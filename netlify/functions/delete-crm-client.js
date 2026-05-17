const { Pool } = require("pg");
const { requireCrmClient } = require("./crm-auth");

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
          error:"Missing client id"
        })
      };

    }

    const auth = await requireCrmClient(event, body.id);

    if(auth.error){
      return{
        statusCode:403,
        body:JSON.stringify({
          success:false,
          error:auth.error
        })
      };
    }

    const client =
      await pool.connect();

    try{

      await client.query("BEGIN");

      await client.query(
        `
        DELETE FROM crm_tasks
        WHERE client_id = $1
          AND agent_id = $2
        `,
        [body.id, auth.crmAgentId]
      );

      await client.query(
        `
        DELETE FROM crm_appointments
        WHERE client_id = $1
          AND agent_id = $2
        `,
        [body.id, auth.crmAgentId]
      );

      const result = await client.query(
        `
        DELETE FROM crm_clients
        WHERE id = $1
          AND agent_id = $2
        RETURNING id
        `,
        [body.id, auth.crmAgentId]
      );

      if(result.rows.length === 0){

        await client.query("ROLLBACK");

        return{
          statusCode:404,
          body:JSON.stringify({
            success:false,
            error:"Client not found"
          })
        };

      }

      await client.query("COMMIT");

    }catch(err){

      await client.query("ROLLBACK");
      throw err;

    }finally{

      client.release();

    }

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true
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
