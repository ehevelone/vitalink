const { Pool } = require("pg");
const { requireCrmClient } = require("./crm-auth");
const { ensureVitalinkImportSchema } = require("./services/crm-vitalink-import");

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

    await ensureVitalinkImportSchema();

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

      const result = await client.query(
        `
        UPDATE crm_clients
        SET archived_at = COALESCE(archived_at, NOW()),
            archived_by = COALESCE(archived_by, $2),
            updated_at = NOW()
        WHERE id = $1
          AND agent_id = $2
        RETURNING id, archived_at, archived_by
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

      await client.query(
        `
        INSERT INTO crm_audit_log (
          crm_agent_id,
          crm_client_id,
          actor_type,
          actor_id,
          event_type,
          ip_address,
          user_agent,
          metadata
        )
        VALUES ($1,$2,'agent',$3,'client_archived',$4,$5,$6::jsonb)
        `,
        [
          auth.crmAgentId,
          body.id,
          auth.agent?.id || auth.crmAgentId,
          event.headers?.["x-nf-client-connection-ip"] || event.headers?.["client-ip"] || null,
          event.headers?.["user-agent"] || null,
          JSON.stringify({ previousAction: "delete_client" }),
        ]
      );

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
        success:true,
        archived:true
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
