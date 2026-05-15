const { Pool } = require("pg");

const pool = new Pool({
  connectionString:process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

function clean(value){

  const text =
    String(value || "").trim();

  return text || null;

}

function digitsOnly(value){

  return String(value || "").replace(/\D/g,"");

}

function normalizeUsPhone(value){

  let digits =
    digitsOnly(value);

  if(digits.length === 11 && digits.startsWith("1")){
    digits = digits.slice(1);
  }

  if(digits.length === 10){
    return digits;
  }

  return clean(value);

}

async function ensureClientColumns(client){

  await client.query(`
    ALTER TABLE crm_clients
    ADD COLUMN IF NOT EXISTS status TEXT,
    ADD COLUMN IF NOT EXISTS linked_app_client_id TEXT,
    ADD COLUMN IF NOT EXISTS profile_linked TEXT,
    ADD COLUMN IF NOT EXISTS medication_list TEXT,
    ADD COLUMN IF NOT EXISTS doctor_list TEXT,
    ADD COLUMN IF NOT EXISTS last_sync TIMESTAMPTZ
  `);

}

async function getAppAgent(client, crmAgentId){

  const result =
    await client.query(
      `
      SELECT id, crm_uuid
      FROM agents
      WHERE crm_uuid = $1
      LIMIT 1
      `,
      [crmAgentId]
    );

  return result.rows[0] || null;

}

async function getAppClients(client, appAgentId){

  const result =
    await client.query(
      `
      SELECT
        id,
        first_name,
        last_name,
        email,
        phone,
        created_at
      FROM users
      WHERE agent_id = $1
      ORDER BY created_at DESC
      LIMIT 5000
      `,
      [appAgentId]
    );

  return result.rows;

}

async function getExistingCrmClient(client, crmAgentId, appClient){

  const email =
    clean(appClient.email);

  const phoneDigits =
    digitsOnly(appClient.phone);

  const result =
    await client.query(
      `
      SELECT *
      FROM crm_clients
      WHERE agent_id = $1
        AND (
          linked_app_client_id = $2
          OR ($3::text IS NOT NULL AND LOWER(COALESCE(email,'')) = LOWER($3))
          OR ($4::text <> '' AND RIGHT(REGEXP_REPLACE(COALESCE(mobile_phone,''), '\\D', '', 'g'), 10) = $4)
        )
      ORDER BY
        CASE WHEN linked_app_client_id = $2 THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1
      `,
      [
        crmAgentId,
        String(appClient.id),
        email,
        normalizeUsPhone(phoneDigits) || ""
      ]
    );

  return result.rows[0] || null;

}

async function updateCrmClient(client, crmClientId, appClient){

  await client.query(
    `
    UPDATE crm_clients
    SET
      first_name = COALESCE($1, first_name),
      last_name = COALESCE($2, last_name),
      email = COALESCE($3, email),
      mobile_phone = COALESCE($4, mobile_phone),
      linked_app_client_id = $5,
      profile_linked = 'Linked',
      last_sync = NOW()
    WHERE id = $6
    `,
    [
      clean(appClient.first_name),
      clean(appClient.last_name),
      clean(appClient.email),
      normalizeUsPhone(appClient.phone),
      String(appClient.id),
      crmClientId
    ]
  );

}

async function createCrmClient(client, crmAgentId, appClient, defaultStatus){

  await client.query(
    `
    INSERT INTO crm_clients (
      agent_id,
      first_name,
      last_name,
      email,
      mobile_phone,
      status,
      linked_app_client_id,
      profile_linked,
      last_sync
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,'Linked',NOW())
    `,
    [
      crmAgentId,
      clean(appClient.first_name),
      clean(appClient.last_name),
      clean(appClient.email),
      normalizeUsPhone(appClient.phone),
      defaultStatus || "Client",
      String(appClient.id)
    ]
  );

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

    const body =
      JSON.parse(event.body || "{}");

    if(!body.agent_id){

      return{
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"Missing agent_id"
        })
      };

    }

    await ensureClientColumns(client);

    const appAgent =
      await getAppAgent(client, body.agent_id);

    if(!appAgent){

      return{
        statusCode:404,
        body:JSON.stringify({
          success:false,
          error:"No VitaLink agent found for this CRM login."
        })
      };

    }

    const appClients =
      await getAppClients(client, appAgent.id);

    const summary = {
      created:0,
      updated:0,
      skipped:0
    };

    await client.query("BEGIN");

    for(const appClient of appClients){

      if(!clean(appClient.first_name) &&
        !clean(appClient.last_name) &&
        !clean(appClient.email) &&
        !clean(appClient.phone)){

        summary.skipped += 1;
        continue;

      }

      const existing =
        await getExistingCrmClient(
          client,
          body.agent_id,
          appClient
        );

      if(existing){

        await updateCrmClient(
          client,
          existing.id,
          appClient
        );

        summary.updated += 1;
        continue;

      }

      await createCrmClient(
        client,
        body.agent_id,
        appClient,
        clean(body.default_status) || "Client"
      );

      summary.created += 1;

    }

    await client.query("COMMIT");

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        total:appClients.length,
        ...summary
      })
    };

  }catch(err){

    await client.query("ROLLBACK");

    console.error("sync-vitalink-clients error:", err);

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
