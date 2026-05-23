const { requireCrmAgent } = require("./crm-auth");
const { pool, ensurePolicyTable } = require("./policy-utils");

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

    await ensurePolicyTable();

    const body =
      JSON.parse(event.body || "{}");

    if(!body.id){
      return{
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"Missing policy id"
        })
      };
    }

    const current = await pool.query(
      `
      SELECT agent_id
      FROM crm_policies
      WHERE id = $1
      LIMIT 1
      `,
      [body.id]
    );

    if(!current.rows.length){
      return{
        statusCode:404,
        body:JSON.stringify({
          success:false,
          error:"Policy not found"
        })
      };
    }

    const auth =
      await requireCrmAgent(event, current.rows[0].agent_id);

    if(auth.error){
      return{
        statusCode:403,
        body:JSON.stringify({
          success:false,
          error:auth.error
        })
      };
    }

    await pool.query(
      `
      DELETE FROM crm_policies
      WHERE id = $1
        AND agent_id = $2
      `,
      [body.id, auth.crmAgentId]
    );

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true
      })
    };

  }catch(err){

    console.error("delete-crm-policy error:", err);

    return{
      statusCode:500,
      body:JSON.stringify({
        success:false,
        error:err.message
      })
    };

  }

};
