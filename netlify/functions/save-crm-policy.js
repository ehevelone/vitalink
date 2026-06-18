const { requireCrmAgent, requireCrmClient } = require("./crm-auth");
const { pool, ensurePolicyTable, policyValues } = require("./policy-utils");

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

    if(!body.client_id){
      return{
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"Missing client_id"
        })
      };
    }

    let auth;

    if(body.id){
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

      auth =
        await requireCrmAgent(event, current.rows[0].agent_id);
    }else{
      auth =
        await requireCrmClient(event, body.client_id, body.agent_id);
    }

    if(auth.error){
      return{
        statusCode:403,
        body:JSON.stringify({
          success:false,
          error:auth.error
        })
      };
    }

    if(body.id){
      const values =
        policyValues(body, auth.crmAgentId);

      values.push(body.id);

      const result = await pool.query(
        `
        UPDATE crm_policies
        SET
          agent_id = $1,
          client_id = $2,
          carrier = $3,
          plan_name = $4,
          policy_type = $5,
          policy_number = $6,
          member_id = $7,
          effective_date = $8,
          submitted_date = $9,
          renewal_month = $10,
          monthly_premium = $11,
          annual_premium = $12,
          commission_type = $13,
          commission_rate = $14,
          commission_amount = $15,
          paid_amount = $16,
          paid_date = $17,
          status = $18,
          notes = $19,
          updated_at = NOW()
        WHERE id = $20
          AND agent_id = $1
        RETURNING *
        `,
        values
      );

      return{
        statusCode:200,
        body:JSON.stringify({
          success:true,
          policy:result.rows[0]
        })
      };
    }

    const result = await pool.query(
      `
      INSERT INTO crm_policies (
        agent_id,
        client_id,
        carrier,
        plan_name,
        policy_type,
        policy_number,
        member_id,
        effective_date,
        submitted_date,
        renewal_month,
        monthly_premium,
        annual_premium,
        commission_type,
        commission_rate,
        commission_amount,
        paid_amount,
        paid_date,
        status,
        notes
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *
      `,
      policyValues(body, auth.crmAgentId)
    );

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        policy:result.rows[0]
      })
    };

  }catch(err){

    console.error("save-crm-policy error:", err);

    return{
      statusCode:500,
      body:JSON.stringify({
        success:false,
        error:err.message
      })
    };

  }

};
