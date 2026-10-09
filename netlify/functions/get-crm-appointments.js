const { Pool } = require("pg");
const { requireCrmAgent } = require("./crm-auth");
const { ensureClientArchiveColumns } = require("./services/crm-client-archive");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

exports.handler = async (event) => {

  try{

    await ensureClientArchiveColumns();

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

    const auth = await requireCrmAgent(event, agent_id);

    if(auth.error){
      return{
        statusCode:403,
        body:JSON.stringify({
          success:false,
          error:auth.error
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
        AND (a.client_id IS NULL OR c.archived_at IS NULL)

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
