const { Pool } = require("pg");
const { requireCrmAgent } = require("./crm-auth");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function ensureClientColumns(){

  await pool.query(`
    ALTER TABLE crm_clients
    ADD COLUMN IF NOT EXISTS status TEXT
  `);

}

function normalizeUsPhone(value){
  let digits = String(value || "").replace(/\D/g, "");

  if(digits.length === 11 && digits.startsWith("1")){
    digits = digits.slice(1);
  }

  if(digits.length === 10){
    return digits;
  }

  return value || null;
}

exports.handler = async (event) => {

  try{

    await ensureClientColumns();

    const body = JSON.parse(event.body);
    const auth = await requireCrmAgent(event, body.agent_id);

    if(auth.error){
      return{
        statusCode:403,
        body:JSON.stringify({
          success:false,
          error:auth.error
        })
      };
    }

    const client = await pool.query(

      `INSERT INTO crm_clients (

        agent_id,

        first_name,
        last_name,

        dob,

        mobile_phone,
        landline_phone,

        email,

        address,
        city,
        state,
        zip,
        status

      )

      VALUES (

        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12

      )

      RETURNING *`,

      [

        body.agent_id,

        body.first_name,
        body.last_name,

        body.dob,

        normalizeUsPhone(body.mobile_phone),
        normalizeUsPhone(body.landline_phone),

        body.email,

        body.address,
        body.city,
        body.state,
        body.zip,
        body.status || "Client"

      ]

    );

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        client:client.rows[0]
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
