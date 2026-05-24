const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

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

function reply(statusCode, body){
  return {
    statusCode,
    headers:{
      "Content-Type":"application/json"
    },
    body:JSON.stringify(body)
  };
}

function listChunks(){
  const dir =
    path.join(process.cwd(), "database", "asb_seed_chunks");

  return fs
    .readdirSync(dir)
    .filter(file => /^asb_seed_part_\d+\.sql$/i.test(file))
    .sort()
    .map(file => path.join(dir, file));
}

function splitStatements(sql){
  return sql
    .split(/\r?\n/)
    .filter(line => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\r?\n|$)/)
    .map(statement => statement.trim())
    .filter(Boolean);
}

exports.handler = async function(event){
  if(event.httpMethod !== "POST"){
    return reply(405, {
      success:false,
      error:"Method not allowed"
    });
  }

  const auth =
    await requireAdmin(event);

  if(!auth.ok){
    return reply(401, {
      success:false,
      error:auth.error || "Unauthorized"
    });
  }

  try{
    const body =
      JSON.parse(event.body || "{}");

    const chunks =
      listChunks();

    const requestedChunk =
      Math.max(1, Number(body.chunk || 1));

    const chunkIndex =
      requestedChunk - 1;

    if(!chunks[chunkIndex]){
      return reply(400, {
        success:false,
        error:"Seed chunk not found",
        total_chunks:chunks.length
      });
    }

    const sql =
      fs.readFileSync(chunks[chunkIndex], "utf8");

    const statements =
      splitStatements(sql);

    let executed = 0;

    for(const statement of statements){
      await pool.query(statement);
      executed += 1;
    }

    return reply(200, {
      success:true,
      chunk:requestedChunk,
      total_chunks:chunks.length,
      statements_executed:executed,
      done:requestedChunk >= chunks.length
    });
  }catch(err){
    console.error("seed-asb-product-library error:", err);

    return reply(500, {
      success:false,
      error:err.message || "Unable to seed ASB product library"
    });
  }
};
