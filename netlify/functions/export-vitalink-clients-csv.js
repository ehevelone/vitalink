const { Pool } = require("pg");
const { requireCrmAgent } = require("./crm-auth");

const pool = new Pool({
  connectionString:process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

function csvEscape(value){
  if(value == null){
    return "";
  }

  const cleaned =
    String(value)
      .replace(/[\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/"/g, '""');

  return `"${cleaned}"`;
}

function joinList(rows, fields){
  return rows
    .map(row =>
      fields
        .map(field => row[field])
        .filter(Boolean)
        .join(" - ")
    )
    .filter(Boolean)
    .join("; ");
}

async function optionalRows(client, sql, values){
  try{
    const result =
      await client.query(sql, values);

    return result.rows;
  }catch(err){
    if(err.code === "42P01" || err.code === "42703"){
      return [];
    }

    throw err;
  }
}

exports.handler = async (event) => {
  const client =
    await pool.connect();

  try{
    const crmAgentId =
      event.queryStringParameters?.agent_id;

    if(!crmAgentId){
      return{
        statusCode:400,
        headers:{
          "Content-Type":"text/plain"
        },
        body:"Missing agent_id"
      };
    }

    const auth = await requireCrmAgent(event, crmAgentId);

    if(auth.error){
      return{
        statusCode:403,
        headers:{
          "Content-Type":"text/plain"
        },
        body:"Unauthorized"
      };
    }

    await client.query(`
      ALTER TABLE crm_clients
      ADD COLUMN IF NOT EXISTS linked_app_client_id TEXT,
      ADD COLUMN IF NOT EXISTS medication_list TEXT,
      ADD COLUMN IF NOT EXISTS doctor_list TEXT,
      ADD COLUMN IF NOT EXISTS last_sync TIMESTAMPTZ
    `);

    const agentRes =
      await client.query(
        `
        SELECT id, email
        FROM agents
        WHERE crm_uuid = $1
        LIMIT 1
        `,
        [crmAgentId]
      );

    const appAgent =
      agentRes.rows[0];

    if(!appAgent){
      return{
        statusCode:404,
        headers:{
          "Content-Type":"text/plain"
        },
        body:"No VitaLink agent found for this CRM login."
      };
    }

    const clientRes =
      await client.query(
        `
        SELECT
          u.id AS user_id,
          u.email AS client_email,
          u.phone AS user_phone,
          u.first_name AS user_first_name,
          u.last_name AS user_last_name,
          u.created_at AS app_created_at,
          p.first_name AS profile_first_name,
          p.last_name AS profile_last_name,
          p.phone AS profile_phone,
          p.address,
          p.city,
          p.state,
          p.zip,
          p.dob,
          p.gender,
          c.id AS crm_client_id,
          c.status,
          c.medication_list,
          c.doctor_list,
          c.last_sync
        FROM users u
        LEFT JOIN profiles p ON p.user_id = u.id
        LEFT JOIN crm_clients c
          ON c.agent_id = $2
          AND c.linked_app_client_id = u.id::text
        WHERE u.agent_id = $1
        ORDER BY u.created_at DESC
        `,
        [
          appAgent.id,
          crmAgentId
        ]
      );

    const userIds =
      clientRes.rows.map(row => row.user_id);

    const medicationRows =
      userIds.length
        ? await optionalRows(
            client,
            `
            SELECT user_id, name, dosage, frequency
            FROM medications
            WHERE user_id = ANY($1)
            `,
            [userIds]
          )
        : [];

    const doctorRows =
      userIds.length
        ? await optionalRows(
            client,
            `
            SELECT user_id, name, specialty, clinic, phone
            FROM doctors
            WHERE user_id = ANY($1)
            `,
            [userIds]
          )
        : [];

    const medsByUser =
      new Map();

    medicationRows.forEach(row => {
      const key =
        String(row.user_id);

      if(!medsByUser.has(key)){
        medsByUser.set(key, []);
      }

      medsByUser.get(key).push(row);
    });

    const doctorsByUser =
      new Map();

    doctorRows.forEach(row => {
      const key =
        String(row.user_id);

      if(!doctorsByUser.has(key)){
        doctorsByUser.set(key, []);
      }

      doctorsByUser.get(key).push(row);
    });

    let csv =
      "app_client_id,crm_client_id,first_name,last_name,phone,email,address,city,state,zip,dob,gender,status,medications,doctors,last_sync,source\n";

    clientRes.rows.forEach(row => {
      const key =
        String(row.user_id);

      const medications =
        row.medication_list ||
        joinList(medsByUser.get(key) || [], ["name", "dosage", "frequency"]);

      const doctors =
        row.doctor_list ||
        joinList(doctorsByUser.get(key) || [], ["name", "specialty", "clinic", "phone"]);

      csv += [
        csvEscape(row.user_id),
        csvEscape(row.crm_client_id),
        csvEscape(row.profile_first_name || row.user_first_name),
        csvEscape(row.profile_last_name || row.user_last_name),
        csvEscape(row.profile_phone || row.user_phone),
        csvEscape(row.client_email),
        csvEscape(row.address),
        csvEscape(row.city),
        csvEscape(row.state),
        csvEscape(row.zip),
        csvEscape(row.dob),
        csvEscape(row.gender),
        csvEscape(row.status),
        csvEscape(medications),
        csvEscape(doctors),
        csvEscape(row.last_sync),
        csvEscape("VitaLink")
      ].join(",") + "\n";
    });

    return{
      statusCode:200,
      headers:{
        "Content-Type":"text/csv",
        "Content-Disposition":`attachment; filename="vitalink_clients_${crmAgentId}.csv"`
      },
      body:csv
    };
  }catch(err){
    console.error("export-vitalink-clients-csv error:", err);

    return{
      statusCode:500,
      headers:{
        "Content-Type":"text/plain"
      },
      body:"Server error"
    };
  }finally{
    client.release();
  }
};
