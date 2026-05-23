const { requireCrmAgent } = require("./crm-auth");
const {
  pool,
  ensureCommissionScheduleTable
} = require("./commission-schedule-utils");

exports.handler = async (event) => {

  try{

    await ensureCommissionScheduleTable();

    const agentId =
      event.queryStringParameters.agent_id;

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

    const result = await pool.query(
      `
      SELECT
        source_file,
        COUNT(*)::INT AS row_count,
        MAX(created_at) AS uploaded_at
      FROM crm_commission_schedules
      WHERE agent_id = $1
      GROUP BY source_file
      ORDER BY MAX(created_at) DESC
      `,
      [auth.crmAgentId]
    );

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        schedules:result.rows
      })
    };

  }catch(err){

    console.error("get-crm-commission-schedules error:", err);

    return{
      statusCode:500,
      body:JSON.stringify({
        success:false,
        error:err.message
      })
    };

  }

};
