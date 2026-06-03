const { Pool } = require("pg");

const pool = new Pool({
  connectionString:process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

const CHUNK_SIZE = 100;

function siteUrl(){
  return (
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    "https://myvitalink.app"
  ).replace(/\/$/, "");
}

function nextPlanYear(date = new Date()){
  return date.getUTCFullYear() + 1;
}

function cmsUrl(planYear){
  return `https://www.cms.gov/files/zip/pbp-benefits-${planYear}-json.zip`;
}

async function ensureAutoImportTable(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cms_medicare_auto_import_state (
      id BIGSERIAL PRIMARY KEY,
      plan_year INTEGER NOT NULL UNIQUE,
      cms_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      next_offset INTEGER NOT NULL DEFAULT 0,
      files_available INTEGER,
      files_processed INTEGER NOT NULL DEFAULT 0,
      plans_added INTEGER NOT NULL DEFAULT 0,
      plans_updated INTEGER NOT NULL DEFAULT 0,
      rows_skipped INTEGER NOT NULL DEFAULT 0,
      errors JSONB NOT NULL DEFAULT '[]'::JSONB,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_run_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ
    )
  `);
}

async function getOrCreateState(planYear){
  const url =
    cmsUrl(planYear);

  const result =
    await pool.query(
      `
      INSERT INTO cms_medicare_auto_import_state (plan_year, cms_url)
      VALUES ($1, $2)
      ON CONFLICT (plan_year)
      DO UPDATE SET cms_url = EXCLUDED.cms_url
      RETURNING *
      `,
      [planYear, url]
    );

  return result.rows[0];
}

async function updateState(planYear, stats){
  const done =
    Boolean(stats.done);
  const errors =
    Array.isArray(stats.errors) ? stats.errors : [];

  await pool.query(
    `
    UPDATE cms_medicare_auto_import_state
    SET
      status = $2,
      next_offset = $3,
      files_available = $4,
      files_processed = files_processed + $5,
      plans_added = plans_added + $6,
      plans_updated = plans_updated + $7,
      rows_skipped = rows_skipped + $8,
      errors = COALESCE(errors, '[]'::jsonb) || $9::jsonb,
      last_run_at = NOW(),
      completed_at = CASE WHEN $10 THEN NOW() ELSE completed_at END
    WHERE plan_year = $1
    `,
    [
      planYear,
      done ? "complete" : "running",
      Number(stats.next_offset || 0),
      Number(stats.files_available || 0),
      Number(stats.files_processed || 0),
      Number(stats.plans_added || 0),
      Number(stats.plans_updated || 0),
      Number(stats.rows_skipped || 0),
      JSON.stringify(errors.slice(0, 20)),
      done
    ]
  );
}

async function importNextChunk(state){
  if(!process.env.ADMIN_KEY){
    throw new Error("ADMIN_KEY is required for scheduled CMS import");
  }

  const response =
    await fetch(`${siteUrl()}/.netlify/functions/import-cms-pbp-benefits`, {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "x-admin-key":process.env.ADMIN_KEY
      },
      body:JSON.stringify({
        plan_year:state.plan_year,
        cms_url:state.cms_url,
        offset:state.next_offset,
        max_files:CHUNK_SIZE
      })
    });

  const text =
    await response.text();
  let data;

  try{
    data = JSON.parse(text);
  }catch(error){
    throw new Error(`CMS chunk import returned ${response.status}: ${text.slice(0, 160)}`);
  }

  if(!response.ok || !data.success){
    throw new Error(data.error || `CMS chunk import failed with status ${response.status}`);
  }

  return data.import_stats || {};
}

exports.handler = async function(){
  const planYear =
    nextPlanYear();

  try{
    await ensureAutoImportTable();

    const state =
      await getOrCreateState(planYear);

    if(state.status === "complete"){
      return {
        statusCode:200,
        body:JSON.stringify({
          success:true,
          skipped:true,
          plan_year:planYear,
          status:"complete"
        })
      };
    }

    const stats =
      await importNextChunk(state);

    await updateState(planYear, stats);

    console.info("auto-cms-pbp-import chunk complete", {
      planYear,
      offset:state.next_offset,
      nextOffset:stats.next_offset,
      done:stats.done
    });

    return {
      statusCode:200,
      body:JSON.stringify({
        success:true,
        plan_year:planYear,
        import_stats:stats
      })
    };
  }catch(error){
    console.error("auto-cms-pbp-import error:", error);

    return {
      statusCode:500,
      body:JSON.stringify({
        success:false,
        plan_year:planYear,
        error:error.message
      })
    };
  }
};
