const { requireCrmAgent } = require("./crm-auth");
const {
  pool,
  ensureCommissionScheduleTable,
  normalizeScheduleRow
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

    const agentId =
      body.agent_id;

    const auth =
      await requireCrmAgent(event, agentId);

    if(auth.error){
      return{
        statusCode:403,
        body:JSON.stringify({
          success:false,
          error:auth.error
        })
      };
    }

    const files =
      Array.isArray(body.files) ? body.files : [];

    let imported = 0;

    for(const file of files){
      const rows =
        Array.isArray(file.rows) ? file.rows : [];

      for(const row of rows){
        const normalized =
          normalizeScheduleRow(row, file.name);

        if(!normalized){
          continue;
        }

        await pool.query(
          `
          INSERT INTO crm_commission_schedules (
            agent_id,
            source_file,
            carrier,
            policy_type,
            plan_name,
            state,
            rule_label,
            commission_type,
            commission_rate,
            commission_amount,
            raw_data
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          `,
          [
            auth.crmAgentId,
            normalized.source_file,
            normalized.carrier,
            normalized.policy_type,
            normalized.plan_name,
            normalized.state,
            normalized.rule_label,
            normalized.commission_type,
            normalized.commission_rate,
            normalized.commission_amount,
            normalized.raw_data
          ]
        );

        imported += 1;
      }
    }

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        imported
      })
    };

  }catch(err){

    console.error("import-crm-commission-schedules error:", err);

    return{
      statusCode:500,
      body:JSON.stringify({
        success:false,
        error:err.message
      })
    };

  }

};
