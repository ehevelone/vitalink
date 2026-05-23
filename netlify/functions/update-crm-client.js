const { Pool } = require("pg");
const { requireCrmClient } = require("./crm-auth");

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
  "status",
  "linked_app_client_id",
  "profile_linked",
  "emergency_profile",
  "insurance_cards_uploaded",
  "medication_list",
  "doctor_list",
  "last_sync",
  "marital_status",
  "spouse_name",
  "spouse_dob",
  "lead_source",
  "lead_source_detail",
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

async function ensureClientColumns(){

  await pool.query(`
    ALTER TABLE crm_clients
    ADD COLUMN IF NOT EXISTS marital_status TEXT,
    ADD COLUMN IF NOT EXISTS spouse_name TEXT,
    ADD COLUMN IF NOT EXISTS spouse_dob DATE,
    ADD COLUMN IF NOT EXISTS lead_source TEXT,
    ADD COLUMN IF NOT EXISTS lead_source_detail TEXT,
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
    ADD COLUMN IF NOT EXISTS status TEXT,
    ADD COLUMN IF NOT EXISTS linked_app_client_id TEXT,
    ADD COLUMN IF NOT EXISTS profile_linked TEXT,
    ADD COLUMN IF NOT EXISTS emergency_profile TEXT,
    ADD COLUMN IF NOT EXISTS insurance_cards_uploaded TEXT,
    ADD COLUMN IF NOT EXISTS medication_list TEXT,
    ADD COLUMN IF NOT EXISTS doctor_list TEXT,
    ADD COLUMN IF NOT EXISTS last_sync TIMESTAMPTZ,
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

    const auth = await requireCrmClient(event, body.id);

    if(auth.error){
      return{
        statusCode:403,
        body:JSON.stringify({
          success:false,
          error:auth.error
        })
      };
    }

    const updates = [];
    const values = [];

    editableFields.forEach(field => {

      if(Object.prototype.hasOwnProperty.call(body, field)){

        const value =
          field === "mobile_phone" || field === "landline_phone"
            ? normalizeUsPhone(body[field])
            : body[field] || null;

        values.push(value);
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
        AND agent_id = $${values.length + 1}
      RETURNING *
      `,
      [...values, auth.crmAgentId]
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
