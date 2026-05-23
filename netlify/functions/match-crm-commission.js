const { requireCrmAgent } = require("./crm-auth");
const {
  pool,
  ensureCommissionScheduleTable,
  cleanNumber,
  scoreSchedule
} = require("./commission-schedule-utils");

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

    await ensureCommissionScheduleTable();

    const body =
      JSON.parse(event.body || "{}");

    const auth =
      await requireCrmAgent(event, body.agent_id);

    if(auth.error){
      return{
        statusCode:403,
        body:JSON.stringify({
          success:false,
          error:auth.error
        })
      };
    }

    const candidates = await pool.query(
      `
      SELECT *
      FROM crm_commission_schedules
      WHERE agent_id = $1
      ORDER BY created_at DESC
      LIMIT 500
      `,
      [auth.crmAgentId]
    );

    const ranked =
      candidates.rows
        .map(row => ({
          ...row,
          match_score:scoreSchedule(body, row)
        }))
        .filter(row => row.match_score > 0)
        .sort((a, b) => b.match_score - a.match_score);

    const match =
      ranked[0] || null;

    if(!match){
      return{
        statusCode:200,
        body:JSON.stringify({
          success:true,
          match:null
        })
      };
    }

    const annualPremium =
      cleanNumber(body.annual_premium);

    const expectedCommission =
      match.commission_type === "percent" && annualPremium && match.commission_rate ?
        annualPremium * (Number(match.commission_rate) / 100) :
        match.commission_amount;

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        match:{
          id:match.id,
          source_file:match.source_file,
          carrier:match.carrier,
          policy_type:match.policy_type,
          plan_name:match.plan_name,
          rule_label:match.rule_label,
          commission_type:match.commission_type,
          commission_rate:match.commission_rate,
          commission_amount:match.commission_amount,
          expected_commission:expectedCommission,
          match_score:match.match_score
        }
      })
    };

  }catch(err){

    console.error("match-crm-commission error:", err);

    return{
      statusCode:500,
      body:JSON.stringify({
        success:false,
        error:err.message
      })
    };

  }

};
