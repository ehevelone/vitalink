const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

const editableFields = [
  "first_name",
  "last_name",
  "dob",
  "mobile_phone",
  "landline_phone",
  "email",
  "address",
  "city",
  "state",
  "zip",
  "marital_status",
  "spouse_name",
  "spouse_dob",
  "lead_source",
  "referral_source",
  "seminar_event",
  "lead_cost",
  "date_added",
  "policy_carrier",
  "plan_name",
  "plan_type",
  "effective_date",
  "renewal_month",
  "monthly_premium",
  "preferred_contact_method",
  "best_time_to_call",
  "text_messaging",
  "email_communication"
];

async function ensureClientColumns(){

  await pool.query(`
    ALTER TABLE crm_clients
    ADD COLUMN IF NOT EXISTS marital_status TEXT,
    ADD COLUMN IF NOT EXISTS spouse_name TEXT,
    ADD COLUMN IF NOT EXISTS spouse_dob DATE,
    ADD COLUMN IF NOT EXISTS lead_source TEXT,
    ADD COLUMN IF NOT EXISTS referral_source TEXT,
    ADD COLUMN IF NOT EXISTS seminar_event TEXT,
    ADD COLUMN IF NOT EXISTS lead_cost TEXT,
    ADD COLUMN IF NOT EXISTS date_added DATE,
    ADD COLUMN IF NOT EXISTS policy_carrier TEXT,
    ADD COLUMN IF NOT EXISTS plan_name TEXT,
    ADD COLUMN IF NOT EXISTS plan_type TEXT,
    ADD COLUMN IF NOT EXISTS effective_date DATE,
    ADD COLUMN IF NOT EXISTS renewal_month TEXT,
    ADD COLUMN IF NOT EXISTS monthly_premium TEXT,
    ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT,
    ADD COLUMN IF NOT EXISTS best_time_to_call TEXT,
    ADD COLUMN IF NOT EXISTS text_messaging TEXT,
    ADD COLUMN IF NOT EXISTS email_communication TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
  `);

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

  try{

    await ensureClientColumns();

    const body =
      JSON.parse(event.body || "{}");

    if(!body.id){

      return{
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"Missing client id"
        })
      };

    }

    const updates = [];
    const values = [];

    editableFields.forEach(field => {

      if(Object.prototype.hasOwnProperty.call(body, field)){

        values.push(body[field] || null);
        updates.push(`${field} = $${values.length}`);

      }

    });

    if(updates.length === 0){

      return{
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"No client fields to update"
        })
      };

    }

    values.push(body.id);

    const result = await pool.query(
      `
      UPDATE crm_clients
      SET
        ${updates.join(",\n        ")},
        updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING *
      `,
      values
    );

    if(result.rows.length === 0){

      return{
        statusCode:404,
        body:JSON.stringify({
          success:false,
          error:"Client not found"
        })
      };

    }

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        client:result.rows[0]
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
