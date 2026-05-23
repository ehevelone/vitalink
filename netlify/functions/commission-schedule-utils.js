const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

async function ensureCommissionScheduleTable(){

  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_commission_schedules (
      id BIGSERIAL PRIMARY KEY,
      agent_id TEXT NOT NULL,
      source_file TEXT,
      carrier TEXT,
      policy_type TEXT,
      plan_name TEXT,
      state TEXT,
      rule_label TEXT,
      commission_type TEXT,
      commission_rate NUMERIC,
      commission_amount NUMERIC,
      raw_data JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_crm_commission_schedules_agent
    ON crm_commission_schedules (agent_id)
  `);

}

function clean(value){
  const text =
    String(value ?? "").trim();

  return text || null;
}

function cleanNumber(value){
  const cleaned =
    String(value ?? "")
      .replace(/[$,%]/g, "")
      .replace(/,/g, "")
      .trim();

  if(!cleaned){
    return null;
  }

  const number =
    Number(cleaned);

  return Number.isFinite(number) ? number : null;
}

function normalizeText(value){
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function firstValue(row, names){
  const keys =
    Object.keys(row || {});

  for(const name of names){
    const wanted =
      normalizeText(name);

    const key =
      keys.find(item => normalizeText(item) === wanted);

    if(key && clean(row[key])){
      return clean(row[key]);
    }
  }

  for(const name of names){
    const wanted =
      normalizeText(name);

    const key =
      keys.find(item => normalizeText(item).includes(wanted));

    if(key && clean(row[key])){
      return clean(row[key]);
    }
  }

  return null;
}

function inferCommissionType(policyType, row){
  const explicit =
    firstValue(row, ["commission type", "type", "rate type"]);

  if(explicit){
    const text =
      explicit.toLowerCase();

    if(text.includes("flat") || text.includes("dollar")){
      return "flat";
    }

    if(text.includes("percent") || text.includes("%")){
      return "percent";
    }
  }

  const normalized =
    normalizeText(policyType);

  if(
    normalized.includes("medicare advantage") ||
    normalized.includes("mapd") ||
    normalized.includes("pdp") ||
    normalized.includes("prescription drug")
  ){
    return "flat";
  }

  return "percent";
}

function normalizeScheduleRow(row, sourceFile){
  const carrier =
    firstValue(row, ["carrier", "company", "insurance company"]);

  const policyType =
    firstValue(row, ["policy type", "product type", "line of business", "lob"]);

  const planName =
    firstValue(row, ["plan", "plan name", "product", "product name"]);

  const ruleLabel =
    firstValue(row, ["rule", "year", "years", "commission year", "description"]);

  const state =
    firstValue(row, ["state", "states"]);

  const commissionValue =
    firstValue(row, [
      "commission",
      "commission amount",
      "commission rate",
      "rate",
      "amount",
      "level 4",
      "agent rate"
    ]);

  const commissionType =
    inferCommissionType(policyType || ruleLabel, row);

  const number =
    cleanNumber(commissionValue);

  if(!carrier && !policyType && !planName && !ruleLabel && number === null){
    return null;
  }

  return {
    source_file:clean(sourceFile),
    carrier,
    policy_type:policyType,
    plan_name:planName,
    state,
    rule_label:ruleLabel,
    commission_type:commissionType,
    commission_rate:commissionType === "percent" ? number : null,
    commission_amount:commissionType === "flat" ? number : null,
    raw_data:row
  };
}

function scoreSchedule(policy, schedule){
  let score = 0;

  const policyCarrier =
    normalizeText(policy.carrier);

  const scheduleCarrier =
    normalizeText(schedule.carrier);

  const policyType =
    normalizeText(policy.policy_type);

  const scheduleType =
    normalizeText(schedule.policy_type);

  const policyPlan =
    normalizeText(policy.plan_name);

  const schedulePlan =
    normalizeText(schedule.plan_name);

  if(policyCarrier && scheduleCarrier){
    if(policyCarrier === scheduleCarrier){
      score += 60;
    }else if(policyCarrier.includes(scheduleCarrier) || scheduleCarrier.includes(policyCarrier)){
      score += 35;
    }
  }

  if(policyType && scheduleType){
    if(policyType === scheduleType){
      score += 30;
    }else if(policyType.includes(scheduleType) || scheduleType.includes(policyType)){
      score += 18;
    }
  }

  if(policyPlan && schedulePlan){
    if(policyPlan === schedulePlan){
      score += 25;
    }else if(policyPlan.includes(schedulePlan) || schedulePlan.includes(policyPlan)){
      score += 12;
    }
  }

  return score;
}

module.exports = {
  pool,
  ensureCommissionScheduleTable,
  clean,
  cleanNumber,
  normalizeScheduleRow,
  scoreSchedule
};
