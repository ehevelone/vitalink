const { requireCrmAgent } = require("./crm-auth");
const {
  ensureProductLibraryTables,
  findCarrier,
  findProduct
} = require("./product-library-utils");

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

    await ensureProductLibraryTables();

    const carrier =
      await findCarrier(body.carrier);

    const product =
      carrier ?
        await findProduct({
          carrierId:carrier.id,
          name:body.plan_name || body.policy_type,
          productType:body.policy_type
        }) :
        null;

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        carrier,
        product
      })
    };
  }catch(err){
    console.error("match-crm-product error:", err);

    return{
      statusCode:500,
      body:JSON.stringify({
        success:false,
        error:err.message
      })
    };
  }
};
