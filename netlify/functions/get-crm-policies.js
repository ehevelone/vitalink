const { requireCrmAgent } = require("./crm-auth");
const { pool, ensurePolicyTable } = require("./policy-utils");

exports.handler = async (event) => {

  try{

    await ensurePolicyTable();

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

    const auth =
      await requireCrmAgent(event, agent_id);

    if(auth.error){
      return{
        statusCode:403,
        body:JSON.stringify({
          success:false,
          error:auth.error
        })
      };
    }

    const values =
      [auth.crmAgentId];

    let where =
      "WHERE p.agent_id::TEXT = $1::TEXT";

    if(client_id){
      values.push(String(client_id));
      where += ` AND p.client_id::TEXT = $${values.length}::TEXT`;
    }

    const result = await pool.query(
      `
      SELECT
        p.*,
        c.first_name,
        c.last_name
      FROM crm_policies p
      LEFT JOIN crm_clients c
        ON c.id::TEXT = p.client_id::TEXT
      ${where}
      ORDER BY
        p.effective_date DESC NULLS LAST,
        p.created_at DESC
      `,
      values
    );

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        policies:result.rows
      })
    };

  }catch(err){

    console.error("get-crm-policies error:", err);

    return{
      statusCode:500,
      body:JSON.stringify({
        success:false,
        error:err.message
      })
    };

  }

};
