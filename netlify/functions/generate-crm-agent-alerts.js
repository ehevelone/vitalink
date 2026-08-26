const { Pool } = require("pg");
const { requireCrmAgent } = require("./crm-auth");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

const MILESTONES = [
  { days:365, label:"12 months" },
  { days:180, label:"6 months" },
  { days:90, label:"90 days" },
  { days:30, label:"30 days" }
];

function reply(statusCode, obj){
  return{
    statusCode,
    headers:{
      "Content-Type":"application/json",
      "Access-Control-Allow-Origin":"*",
      "Access-Control-Allow-Headers":"Content-Type, x-agent-session, x-crm-session, x-crm-agent-id",
      "Access-Control-Allow-Methods":"POST, OPTIONS"
    },
    body:JSON.stringify(obj)
  };
}

function clean(value){
  const text =
    String(value ?? "").trim();

  return text || null;
}

function parseDate(value){
  if(!value){
    return null;
  }

  const date =
    new Date(value);

  if(Number.isNaN(date.getTime())){
    return null;
  }

  date.setHours(0,0,0,0);
  return date;
}

function addYears(date, years){
  const next =
    new Date(date);

  next.setFullYear(next.getFullYear() + years);
  return next;
}

function isoDate(date){
  return date.toISOString().split("T")[0];
}

function daysUntil(date, today){
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function nextMilestone(days){
  return MILESTONES.find(milestone =>
    days <= milestone.days
  );
}

function clientName(client){
  return `${client.first_name || ""} ${client.last_name || ""}`.trim() ||
    "Client";
}

function alertForPerson(client, personType, name, dob, today){
  const birthDate =
    parseDate(dob);

  if(!birthDate){
    return null;
  }

  const eligibilityDate =
    addYears(birthDate, 65);

  const remaining =
    daysUntil(eligibilityDate, today);

  if(remaining < 0 || remaining > 365){
    return null;
  }

  const milestone =
    nextMilestone(remaining);

  if(!milestone){
    return null;
  }

  const subject =
    personType === "spouse"
      ? `${name || "Spouse"} turns 65`
      : `${name} turns 65`;

  return{
    clientId:String(client.id),
    sourceKey:`turning-65:${personType}:${client.id}:${milestone.days}`,
    title:`${subject} in ${milestone.label}`,
    notes:[
      `${subject} on ${isoDate(eligibilityDate)}.`,
      "Start Medicare eligibility outreach and schedule the next planning step."
    ].join(" "),
    dueDate:isoDate(today),
    priority:remaining <= 90 ? "High" : "Medium"
  };
}

async function ensureTaskAutomationColumns(){
  await pool.query(`
    ALTER TABLE crm_tasks
    ADD COLUMN IF NOT EXISTS source_type TEXT,
    ADD COLUMN IF NOT EXISTS source_key TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_tasks_agent_source_key
    ON crm_tasks (agent_id, source_key)
    WHERE source_key IS NOT NULL
  `);
}

exports.handler = async (event) => {
  if(event.httpMethod === "OPTIONS"){
    return reply(200, {});
  }

  if(event.httpMethod !== "POST"){
    return reply(405, {
      success:false,
      error:"Method not allowed"
    });
  }

  try{
    const body =
      JSON.parse(event.body || "{}");

    const agentId =
      clean(body.agent_id || body.crmAgentId);

    if(!agentId){
      return reply(400, {
        success:false,
        error:"Missing agent_id"
      });
    }

    const auth =
      await requireCrmAgent(event, agentId);

    if(auth.error){
      return reply(403, {
        success:false,
        error:auth.error
      });
    }

    await ensureTaskAutomationColumns();

    const clientsResult = await pool.query(
      `
      SELECT
        id,
        first_name,
        last_name,
        dob,
        spouse_name,
        spouse_dob
      FROM crm_clients
      WHERE agent_id = $1
      `,
      [auth.crmAgentId]
    );

    const today =
      new Date();

    today.setHours(0,0,0,0);

    const alerts = [];

    clientsResult.rows.forEach(client => {
      const name =
        clientName(client);

      const clientAlert =
        alertForPerson(client, "client", name, client.dob, today);

      if(clientAlert){
        alerts.push(clientAlert);
      }

      const spouseAlert =
        alertForPerson(
          client,
          "spouse",
          client.spouse_name,
          client.spouse_dob,
          today
        );

      if(spouseAlert){
        alerts.push(spouseAlert);
      }
    });

    const created = [];

    for(const alert of alerts){
      const result = await pool.query(
        `
        INSERT INTO crm_tasks (
          agent_id,
          client_id,
          title,
          notes,
          due_date,
          priority,
          status,
          source_type,
          source_key
        )
        VALUES ($1,$2,$3,$4,$5,$6,'Open','turning_65',$7)
        ON CONFLICT (agent_id, source_key)
        WHERE source_key IS NOT NULL
        DO NOTHING
        RETURNING *
        `,
        [
          auth.crmAgentId,
          alert.clientId,
          alert.title,
          alert.notes,
          alert.dueDate,
          alert.priority,
          alert.sourceKey
        ]
      );

      if(result.rows[0]){
        created.push(result.rows[0]);
      }
    }

    return reply(200, {
      success:true,
      createdCount:created.length,
      created
    });
  }catch(err){
    console.error("generate-crm-agent-alerts error:", err);
    return reply(500, {
      success:false,
      error:err.message
    });
  }
};
