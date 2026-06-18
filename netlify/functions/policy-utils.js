const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

async function ensurePolicyTable(){

  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_policies (
      id BIGSERIAL PRIMARY KEY,
      agent_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      carrier TEXT,
      plan_name TEXT,
      policy_type TEXT,
      policy_number TEXT,
      member_id TEXT,
      effective_date DATE,
      submitted_date DATE,
      renewal_month TEXT,
      monthly_premium NUMERIC,
      annual_premium NUMERIC,
      commission_type TEXT,
      commission_rate NUMERIC,
      commission_amount NUMERIC,
      paid_amount NUMERIC,
      paid_date DATE,
      status TEXT DEFAULT 'Active',
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE crm_policies
    ADD COLUMN IF NOT EXISTS agent_id TEXT,
    ADD COLUMN IF NOT EXISTS client_id TEXT,
    ADD COLUMN IF NOT EXISTS carrier TEXT,
    ADD COLUMN IF NOT EXISTS plan_name TEXT,
    ADD COLUMN IF NOT EXISTS policy_type TEXT,
    ADD COLUMN IF NOT EXISTS policy_number TEXT,
    ADD COLUMN IF NOT EXISTS member_id TEXT,
    ADD COLUMN IF NOT EXISTS effective_date DATE,
    ADD COLUMN IF NOT EXISTS submitted_date DATE,
    ADD COLUMN IF NOT EXISTS renewal_month TEXT,
    ADD COLUMN IF NOT EXISTS monthly_premium NUMERIC,
    ADD COLUMN IF NOT EXISTS annual_premium NUMERIC,
    ADD COLUMN IF NOT EXISTS commission_type TEXT,
    ADD COLUMN IF NOT EXISTS commission_rate NUMERIC,
    ADD COLUMN IF NOT EXISTS commission_amount NUMERIC,
    ADD COLUMN IF NOT EXISTS paid_amount NUMERIC,
    ADD COLUMN IF NOT EXISTS paid_date DATE,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active',
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_crm_policies_agent_client
    ON crm_policies (agent_id, client_id)
  `);

}

function clean(value){
  const text =
    String(value ?? "").trim();

  return text || null;
}

function cleanNumber(value){
  const cleaned =
    String(value ?? "").replace(/[$,]/g, "").trim();

  if(!cleaned){
    return null;
  }

  const number =
    Number(cleaned);

  return Number.isFinite(number) ? number : null;
}

function policyValues(body, agentId){
  const paidDate =
    clean(body.paid_date);

  let status =
    clean(body.status) || "Active";

  if(
    paidDate &&
    ["active", "pending", "submitted"].includes(status.toLowerCase())
  ){
    status = "Paid";
  }

  return [
    String(agentId),
    String(body.client_id),
    clean(body.carrier),
    clean(body.plan_name),
    clean(body.policy_type),
    clean(body.policy_number),
    clean(body.member_id),
    clean(body.effective_date),
    clean(body.submitted_date),
    clean(body.renewal_month),
    cleanNumber(body.monthly_premium),
    cleanNumber(body.annual_premium),
    clean(body.commission_type),
    cleanNumber(body.commission_rate),
    cleanNumber(body.commission_amount),
    cleanNumber(body.paid_amount),
    paidDate,
    status,
    clean(body.notes)
  ];

}

module.exports = {
  pool,
  ensurePolicyTable,
  policyValues
};
