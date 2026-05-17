const { Pool } = require("pg");
const { requireCrmAgent } = require("./crm-auth");

const pool = new Pool({
  connectionString:process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

async function ensureClientColumns(){

  await pool.query(`
    ALTER TABLE crm_clients
    ADD COLUMN IF NOT EXISTS status TEXT
  `);

}

function clean(value){

  const text =
    String(value || "").trim();

  return text || null;

}

function normalizeUsPhone(value){
  let digits = String(value || "").replace(/\D/g, "");

  if(digits.length === 11 && digits.startsWith("1")){
    digits = digits.slice(1);
  }

  if(digits.length === 10){
    return digits;
  }

  return clean(value);
}

function cleanDate(value){

  const text =
    clean(value);

  if(!text){
    return null;
  }

  if(/^\d{4}-\d{2}-\d{2}$/.test(text)){
    return text;
  }

  const match =
    text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);

  if(match){

    const year =
      match[3].length === 2
        ? `19${match[3]}`
        : match[3];

    return `${year}-${match[1].padStart(2,"0")}-${match[2].padStart(2,"0")}`;

  }

  return null;

}

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

  const client =
    await pool.connect();

  try{

    await ensureClientColumns();

    const body =
      JSON.parse(event.body || "{}");

    if(!body.agent_id || !Array.isArray(body.clients)){

      return{
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"Missing import data"
        })
      };

    }

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

    const rows =
      body.clients.slice(0, 1000);

    const summary = {
      imported:0,
      duplicates:0,
      skipped:0,
      errors:[]
    };

    await client.query("BEGIN");

    for(const row of rows){

      const firstName = clean(row.first_name);
      const lastName = clean(row.last_name);
      const email = clean(row.email);
      const mobilePhone = normalizeUsPhone(row.mobile_phone);

      if(!firstName && !lastName && !email && !mobilePhone){
        summary.skipped += 1;
        continue;
      }

      if(email || mobilePhone){

        const duplicate = await client.query(
          `
          SELECT id
          FROM crm_clients
          WHERE agent_id = $1
            AND (
              ($2::text IS NOT NULL AND LOWER(email) = LOWER($2))
              OR
              ($3::text IS NOT NULL AND RIGHT(REGEXP_REPLACE(mobile_phone, '\\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE($3::text, '\\D', '', 'g'), 10))
            )
          LIMIT 1
          `,
          [
            body.agent_id,
            email,
            mobilePhone
          ]
        );

        if(duplicate.rows.length){
          summary.duplicates += 1;
          continue;
        }

      }

      await client.query(
        `
        INSERT INTO crm_clients (
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
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `,
        [
          body.agent_id,
          firstName,
          lastName,
          cleanDate(row.dob),
          mobilePhone,
          normalizeUsPhone(row.landline_phone),
          email,
          clean(row.address),
          clean(row.city),
          clean(row.state),
          clean(row.zip),
          clean(row.status) || body.default_status || "Client"
        ]
      );

      summary.imported += 1;

    }

    await client.query("COMMIT");

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        ...summary
      })
    };

  }catch(err){

    await client.query("ROLLBACK");

    return{
      statusCode:500,
      body:JSON.stringify({
        success:false,
        error:err.message
      })
    };

  }finally{

    client.release();

  }

};
