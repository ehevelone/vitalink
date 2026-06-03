const Busboy = require("busboy");
const AdmZip = require("adm-zip");
const { Pool } = require("pg");
const {
  normalizePlanRecord
} = require("./cms-pbp-utils");

const DEFAULT_CMS_URL =
  "https://www.cms.gov/files/zip/pbp-benefits-2026-json.zip";

const pool = new Pool({
  connectionString:process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

function getHeader(event, name){
  const headers =
    event.headers || {};

  return headers[name] || headers[name.toLowerCase()] || "";
}

function reply(statusCode, body){
  return {
    statusCode,
    headers:{
      "Content-Type":"application/json",
      "Cache-Control":"no-store"
    },
    body:JSON.stringify(body)
  };
}

async function requireAdmin(event){
  const adminKey =
    getHeader(event, "x-admin-key");

  if(process.env.ADMIN_KEY && adminKey === process.env.ADMIN_KEY){
    return { ok:true };
  }

  const token =
    getHeader(event, "x-admin-session");

  if(!token){
    return {
      ok:false,
      error:"Missing admin session"
    };
  }

  const result =
    await pool.query(
      `
      SELECT id, role, admin_session_expires
      FROM rsms
      WHERE admin_session_token = $1
      LIMIT 1
      `,
      [token]
    );

  if(!result.rows.length){
    return {
      ok:false,
      error:"Invalid admin session"
    };
  }

  const admin =
    result.rows[0];

  if(admin.role !== "admin"){
    return {
      ok:false,
      error:"Not authorized"
    };
  }

  if(new Date(admin.admin_session_expires) < new Date()){
    return {
      ok:false,
      error:"Admin session expired"
    };
  }

  return { ok:true };
}

async function ensureCmsTables(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cms_medicare_plan_benefits (
      id BIGSERIAL PRIMARY KEY,
      plan_year INTEGER NOT NULL,
      contract_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      segment_id TEXT NOT NULL DEFAULT '000',
      plan_key TEXT NOT NULL,
      plan_name TEXT,
      carrier_name TEXT,
      contract_legal_name TEXT,
      plan_type TEXT,
      geography TEXT,
      cms_status TEXT,
      cms_last_updated_at TEXT,
      moop_in_network TEXT,
      moop_combined TEXT,
      moop_out_of_network TEXT,
      normalized_benefits_json JSONB,
      raw_benefits_json JSONB,
      source_file TEXT,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(plan_year, contract_id, plan_id, segment_id)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cms_medicare_plan_benefits_lookup
    ON cms_medicare_plan_benefits (plan_year, plan_key)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cms_medicare_plan_benefits_carrier
    ON cms_medicare_plan_benefits (carrier_name)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cms_medicare_import_runs (
      id BIGSERIAL PRIMARY KEY,
      plan_year INTEGER NOT NULL,
      source_name TEXT,
      files_processed INTEGER NOT NULL DEFAULT 0,
      plans_added INTEGER NOT NULL DEFAULT 0,
      plans_updated INTEGER NOT NULL DEFAULT 0,
      rows_skipped INTEGER NOT NULL DEFAULT 0,
      errors JSONB NOT NULL DEFAULT '[]'::JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function parseMultipart(event){
  return new Promise((resolve, reject) => {
    const fields = {};
    const files = [];
    const busboy =
      Busboy({
        headers:event.headers || {}
      });

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (name, stream, info) => {
      const chunks = [];
      const fileName =
        info.filename || "cms-pbp-benefits.zip";
      const mimeType =
        info.mimeType || "";

      stream.on("data", chunk => {
        chunks.push(chunk);
      });

      stream.on("end", () => {
        files.push({
          name:fileName,
          mimeType,
          buffer:Buffer.concat(chunks)
        });
      });
    });

    busboy.on("error", reject);
    busboy.on("finish", () => resolve({ fields, files }));

    const body =
      Buffer.from(event.body || "", event.isBase64Encoded ? "base64" : "utf8");

    busboy.end(body);
  });
}

async function getZipFromEvent(event){
  const contentType =
    getHeader(event, "content-type");

  if(contentType.includes("multipart/form-data")){
    const parsed =
      await parseMultipart(event);
    const file =
      parsed.files[0];

    if(!file){
      throw new Error("Missing CMS ZIP file");
    }

    if(!/\.zip$/i.test(file.name)){
      throw new Error("CMS import must be a .zip file");
    }

    return {
      buffer:file.buffer,
      fields:parsed.fields,
      sourceName:file.name
    };
  }

  const body =
    JSON.parse(event.body || "{}");
  const url =
    body.cms_url || DEFAULT_CMS_URL;

  if(!/^https:\/\/.+\.zip(?:\?.*)?$/i.test(url)){
    throw new Error("CMS URL must be an HTTPS .zip link");
  }

  const response =
    await fetch(url);

  if(!response.ok){
    throw new Error(`Unable to download CMS ZIP: ${response.status}`);
  }

  const arrayBuffer =
    await response.arrayBuffer();

  return {
    buffer:Buffer.from(arrayBuffer),
    fields:body,
    sourceName:url
  };
}

async function upsertPlan(record, sourceFile){
  const result =
    await pool.query(
      `
      INSERT INTO cms_medicare_plan_benefits (
        plan_year,
        contract_id,
        plan_id,
        segment_id,
        plan_key,
        plan_name,
        carrier_name,
        contract_legal_name,
        plan_type,
        geography,
        cms_status,
        cms_last_updated_at,
        moop_in_network,
        moop_combined,
        moop_out_of_network,
        normalized_benefits_json,
        raw_benefits_json,
        source_file,
        imported_at,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,NOW(),NOW()
      )
      ON CONFLICT (plan_year, contract_id, plan_id, segment_id)
      DO UPDATE SET
        plan_key = EXCLUDED.plan_key,
        plan_name = EXCLUDED.plan_name,
        carrier_name = EXCLUDED.carrier_name,
        contract_legal_name = EXCLUDED.contract_legal_name,
        plan_type = EXCLUDED.plan_type,
        geography = EXCLUDED.geography,
        cms_status = EXCLUDED.cms_status,
        cms_last_updated_at = EXCLUDED.cms_last_updated_at,
        moop_in_network = EXCLUDED.moop_in_network,
        moop_combined = EXCLUDED.moop_combined,
        moop_out_of_network = EXCLUDED.moop_out_of_network,
        normalized_benefits_json = EXCLUDED.normalized_benefits_json,
        raw_benefits_json = EXCLUDED.raw_benefits_json,
        source_file = EXCLUDED.source_file,
        updated_at = NOW()
      RETURNING (xmax = 0) AS inserted
      `,
      [
        record.plan_year,
        record.contract_id,
        record.plan_id,
        record.segment_id,
        record.plan_key,
        record.plan_name,
        record.carrier_name,
        record.contract_legal_name,
        record.plan_type,
        record.geography,
        record.cms_status,
        record.cms_last_updated_at,
        record.moop_in_network,
        record.moop_combined,
        record.moop_out_of_network,
        JSON.stringify(record.normalized_benefits_json || {}),
        JSON.stringify(record.raw_benefits_json || {}),
        sourceFile
      ]
    );

  return Boolean(result.rows[0]?.inserted);
}

async function importZip({ buffer, planYear, sourceName, maxFiles }){
  const zip =
    new AdmZip(buffer);
  const entries =
    zip
      .getEntries()
      .filter(entry => !entry.isDirectory && /\.json$/i.test(entry.entryName));

  const stats = {
    files_processed:0,
    plans_added:0,
    plans_updated:0,
    rows_skipped:0,
    errors:[]
  };

  const limit =
    Number(maxFiles || entries.length);

  for(const entry of entries.slice(0, limit)){
    stats.files_processed += 1;

    try{
      const json =
        JSON.parse(entry.getData().toString("utf8"));
      const plans =
        Array.isArray(json.pbp) ? json.pbp : [];

      if(!plans.length){
        stats.rows_skipped += 1;
        continue;
      }

      for(const pbpPlan of plans){
        const record =
          normalizePlanRecord(pbpPlan, planYear);

        if(!record || !record.plan_year){
          stats.rows_skipped += 1;
          continue;
        }

        const inserted =
          await upsertPlan(record, entry.entryName);

        if(inserted){
          stats.plans_added += 1;
        }else{
          stats.plans_updated += 1;
        }
      }
    }catch(error){
      stats.errors.push({
        file:entry.entryName,
        error:error.message
      });
    }
  }

  await pool.query(
    `
    INSERT INTO cms_medicare_import_runs (
      plan_year,
      source_name,
      files_processed,
      plans_added,
      plans_updated,
      rows_skipped,
      errors
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
    `,
    [
      planYear,
      sourceName,
      stats.files_processed,
      stats.plans_added,
      stats.plans_updated,
      stats.rows_skipped,
      JSON.stringify(stats.errors.slice(0, 50))
    ]
  );

  return {
    ...stats,
    files_available:entries.length,
    errors:stats.errors.slice(0, 20)
  };
}

exports.handler = async function(event){
  if(event.httpMethod !== "POST"){
    return reply(405, {
      success:false,
      error:"Method not allowed"
    });
  }

  try{
    const auth =
      await requireAdmin(event);

    if(!auth.ok){
      return reply(401, {
        success:false,
        error:auth.error || "Unauthorized"
      });
    }

    await ensureCmsTables();

    const zipInput =
      await getZipFromEvent(event);
    const planYear =
      Number(zipInput.fields.plan_year || zipInput.fields.planYear);

    if(!planYear || planYear < 2020 || planYear > 2100){
      return reply(400, {
        success:false,
        error:"Valid plan year is required"
      });
    }

    const stats =
      await importZip({
        buffer:zipInput.buffer,
        planYear,
        sourceName:zipInput.sourceName,
        maxFiles:zipInput.fields.max_files || zipInput.fields.maxFiles
      });

    return reply(200, {
      success:true,
      plan_year:planYear,
      source:zipInput.sourceName,
      import_stats:stats
    });
  }catch(error){
    console.error("import-cms-pbp-benefits error:", error);

    return reply(500, {
      success:false,
      error:error.message || "CMS import failed"
    });
  }
};
