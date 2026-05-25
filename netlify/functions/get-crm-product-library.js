const { requireCrmAgent } = require("./crm-auth");
const {
  pool,
  ensureProductLibraryTables
} = require("./product-library-utils");

exports.handler = async (event) => {
  try{
    const params =
      event.queryStringParameters || {};

    const agentId =
      params.agent_id;

    const auth =
      await requireCrmAgent(event, agentId);

    if(auth.error){
      return{
        statusCode:403,
        headers:{
          "Cache-Control":"no-store"
        },
        body:JSON.stringify({
          success:false,
          error:auth.error
        })
      };
    }

    await ensureProductLibraryTables();

    const carriers = await pool.query(`
      SELECT id, name
      FROM crm_carriers
      ORDER BY name
    `);

    const products = await pool.query(`
      SELECT
        p.id,
        p.carrier_id,
        p.name,
        p.product_type,
        c.name AS carrier_name
      FROM crm_products p
      JOIN crm_carriers c
        ON c.id = p.carrier_id
      ORDER BY c.name, p.name
    `);

    return{
      statusCode:200,
      headers:{
        "Cache-Control":"no-store"
      },
      body:JSON.stringify({
        success:true,
        carrier_count:carriers.rows.length,
        product_count:products.rows.length,
        sample_carriers:carriers.rows.slice(0, 5).map(carrier => carrier.name),
        carriers:carriers.rows,
        products:products.rows
      })
    };
  }catch(err){
    console.error("get-crm-product-library error:", err);

    return{
      statusCode:500,
      headers:{
        "Cache-Control":"no-store"
      },
      body:JSON.stringify({
        success:false,
        error:err.message
      })
    };
  }
};
