const { requireAdmin } = require("./_adminAuth");
const db = require("./services/db");

const SITE =
  "https://myvitalink.app";

const MAX_FILE_BYTES =
  8 * 1024 * 1024;

const MAX_ROWS_PER_FILE =
  20000;

const corsHeaders = {
  "Access-Control-Allow-Origin": SITE,
  "Access-Control-Allow-Headers": "Content-Type, x-admin-session, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function reply(statusCode, body){
  return {
    statusCode,
    headers:{
      "Content-Type":"application/json",
      ...corsHeaders
    },
    body:JSON.stringify(body)
  };
}

function getHeader(event, name){
  const headers =
    event.headers || {};

  const lower =
    name.toLowerCase();

  return headers[name] || headers[lower] || "";
}

async function verifyAdmin(event){
  const adminKey =
    getHeader(event, "x-admin-key");

  if(
    process.env.ADMIN_KEY &&
    adminKey &&
    adminKey === process.env.ADMIN_KEY
  ){
    return { ok:true, method:"admin_key" };
  }

  const auth =
    await requireAdmin(event);

  if(auth.error){
    return {
      ok:false,
      error:auth.error
    };
  }

  return {
    ok:true,
    method:"admin_session",
    admin:auth.admin
  };
}

function clean(value){
  const text =
    String(value ?? "").replace(/\u00a0/g, " ").trim();

  return text || "";
}

function normalizeName(value){
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(company|co|inc|llc|insurance|ins|life|health)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeStats(){
  return {
    carriers_added:0,
    carriers_updated:0,
    products_added:0,
    products_updated:0,
    aliases_added:0,
    rows_skipped:0,
    errors:[]
  };
}

async function ensureProductLibrarySchema(){
  await db.query(`
    CREATE TABLE IF NOT EXISTS crm_carriers (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      scope TEXT NOT NULL DEFAULT 'global',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS crm_carrier_aliases (
      id BIGSERIAL PRIMARY KEY,
      carrier_id BIGINT NOT NULL REFERENCES crm_carriers(id) ON DELETE CASCADE,
      alias_text TEXT NOT NULL,
      normalized_alias TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS crm_products (
      id BIGSERIAL PRIMARY KEY,
      carrier_id BIGINT NOT NULL REFERENCES crm_carriers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      product_type TEXT,
      scope TEXT NOT NULL DEFAULT 'global',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (carrier_id, normalized_name)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS crm_product_aliases (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES crm_products(id) ON DELETE CASCADE,
      alias_text TEXT NOT NULL,
      normalized_alias TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    ALTER TABLE crm_carriers
    ADD COLUMN IF NOT EXISTS normalized_name TEXT,
    ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'global',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await db.query(`
    ALTER TABLE crm_carrier_aliases
    ADD COLUMN IF NOT EXISTS normalized_alias TEXT
  `);

  await db.query(`
    ALTER TABLE crm_products
    ADD COLUMN IF NOT EXISTS normalized_name TEXT,
    ADD COLUMN IF NOT EXISTS product_type TEXT,
    ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'global',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);

  await db.query(`
    ALTER TABLE crm_product_aliases
    ADD COLUMN IF NOT EXISTS normalized_alias TEXT
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_carriers_normalized_name
    ON crm_carriers (normalized_name)
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_carrier_aliases_normalized_alias
    ON crm_carrier_aliases (normalized_alias)
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_products_carrier_normalized_name
    ON crm_products (carrier_id, normalized_name)
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_product_aliases_product_alias
    ON crm_product_aliases (product_id, normalized_alias)
  `);
}

async function upsertCarrier(name, stats){
  const carrierName =
    clean(name);

  const normalizedName =
    normalizeName(carrierName);

  if(!carrierName || !normalizedName){
    stats.rows_skipped += 1;
    return null;
  }

  const existing =
    await db.query(
      `
      SELECT id
      FROM crm_carriers
      WHERE normalized_name = $1
      LIMIT 1
      `,
      [normalizedName]
    );

  if(existing.rows.length){
    await db.query(
      `
      UPDATE crm_carriers
      SET name = $1,
          scope = COALESCE(scope, 'global'),
          updated_at = NOW()
      WHERE id = $2
      `,
      [carrierName, existing.rows[0].id]
    );

    stats.carriers_updated += 1;
    return existing.rows[0].id;
  }

  const inserted =
    await db.query(
      `
      INSERT INTO crm_carriers (name, normalized_name, scope, updated_at)
      VALUES ($1, $2, 'global', NOW())
      RETURNING id
      `,
      [carrierName, normalizedName]
    );

  stats.carriers_added += 1;
  return inserted.rows[0].id;
}

async function insertCarrierAlias(carrierId, aliasText, stats){
  const alias =
    clean(aliasText);

  const normalizedAlias =
    normalizeName(alias);

  if(!carrierId || !alias || !normalizedAlias){
    return;
  }

  const existing =
    await db.query(
      `
      SELECT id
      FROM crm_carrier_aliases
      WHERE normalized_alias = $1
      LIMIT 1
      `,
      [normalizedAlias]
    );

  if(existing.rows.length){
    return;
  }

  await db.query(
    `
    INSERT INTO crm_carrier_aliases (carrier_id, alias_text, normalized_alias)
    VALUES ($1, $2, $3)
    `,
    [carrierId, alias, normalizedAlias]
  );

  stats.aliases_added += 1;
}

async function upsertProduct(carrierId, pair, stats){
  const productName =
    clean(pair.product);

  const normalizedName =
    normalizeName(productName);

  if(!carrierId || !productName || !normalizedName){
    stats.rows_skipped += 1;
    return null;
  }

  const existing =
    await db.query(
      `
      SELECT id
      FROM crm_products
      WHERE carrier_id = $1
        AND normalized_name = $2
      LIMIT 1
      `,
      [carrierId, normalizedName]
    );

  if(existing.rows.length){
    await db.query(
      `
      UPDATE crm_products
      SET name = $1,
          product_type = COALESCE($2, product_type),
          scope = COALESCE(scope, 'global'),
          updated_at = NOW()
      WHERE id = $3
      `,
      [productName, clean(pair.policy_type) || null, existing.rows[0].id]
    );

    stats.products_updated += 1;
    return existing.rows[0].id;
  }

  const inserted =
    await db.query(
      `
      INSERT INTO crm_products (
        carrier_id,
        name,
        normalized_name,
        product_type,
        scope,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 'global', NOW())
      RETURNING id
      `,
      [
        carrierId,
        productName,
        normalizedName,
        clean(pair.policy_type) || null
      ]
    );

  stats.products_added += 1;
  return inserted.rows[0].id;
}

async function insertProductAlias(productId, aliasText, stats){
  const alias =
    clean(aliasText);

  const normalizedAlias =
    normalizeName(alias);

  if(!productId || !alias || !normalizedAlias){
    return;
  }

  const existing =
    await db.query(
      `
      SELECT id
      FROM crm_product_aliases
      WHERE product_id = $1
        AND normalized_alias = $2
      LIMIT 1
      `,
      [productId, normalizedAlias]
    );

  if(existing.rows.length){
    return;
  }

  await db.query(
    `
    INSERT INTO crm_product_aliases (product_id, alias_text, normalized_alias)
    VALUES ($1, $2, $3)
    `,
    [productId, alias, normalizedAlias]
  );

  stats.aliases_added += 1;
}

async function importPairs(pairs, stats){
  const carrierIds =
    new Map();

  for(const carrier of pairs.carriers){
    try{
      const normalizedCarrier =
        normalizeName(carrier);

      if(!carrierIds.has(normalizedCarrier)){
        const carrierId =
          await upsertCarrier(carrier, stats);

        if(carrierId){
          carrierIds.set(normalizedCarrier, carrierId);
          await insertCarrierAlias(carrierId, carrier, stats);
        }
      }
    }catch(err){
      stats.errors.push({
        type:"carrier",
        value:carrier,
        error:err.message
      });
    }
  }

  for(const pair of pairs.products){
    try{
      const normalizedCarrier =
        normalizeName(pair.carrier);

      let carrierId =
        carrierIds.get(normalizedCarrier);

      if(!carrierId){
        carrierId =
          await upsertCarrier(pair.carrier, stats);

        if(carrierId){
          carrierIds.set(normalizedCarrier, carrierId);
          await insertCarrierAlias(carrierId, pair.carrier, stats);
        }
      }

      const productId =
        await upsertProduct(carrierId, pair, stats);

      if(productId){
        await insertProductAlias(productId, pair.product, stats);
      }
    }catch(err){
      stats.errors.push({
        type:"product",
        carrier:pair.carrier,
        product:pair.product,
        error:err.message
      });
    }
  }
}

function firstValue(row, names){
  const keys =
    Object.keys(row || {});

  for(const name of names){
    const wanted =
      normalizeName(name);

    const key =
      keys.find(item => normalizeName(item) === wanted);

    if(key && clean(row[key])){
      return clean(row[key]);
    }
  }

  for(const name of names){
    const wanted =
      normalizeName(name);

    const key =
      keys.find(item => normalizeName(item).includes(wanted));

    if(key && clean(row[key])){
      return clean(row[key]);
    }
  }

  return "";
}

function parseCsv(text){
  const rows = [];
  let current = "";
  let row = [];
  let quoted = false;

  for(let index = 0; index < text.length; index += 1){
    const char =
      text[index];

    const next =
      text[index + 1];

    if(char === "\"" && quoted && next === "\""){
      current += "\"";
      index += 1;
      continue;
    }

    if(char === "\""){
      quoted = !quoted;
      continue;
    }

    if(char === "," && !quoted){
      row.push(current);
      current = "";
      continue;
    }

    if((char === "\n" || char === "\r") && !quoted){
      if(char === "\r" && next === "\n"){
        index += 1;
      }

      row.push(current);

      if(row.some(value => clean(value))){
        rows.push(row);
      }

      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current);

  if(row.some(value => clean(value))){
    rows.push(row);
  }

  if(rows.length < 2){
    return [];
  }

  const headers =
    rows[0].map(header => clean(header));

  return rows.slice(1).map(values => {
    const item = {};

    headers.forEach((header, index) => {
      if(header){
        item[header] = values[index] ?? "";
      }
    });

    return item;
  });
}

function looksLikeNote(text){
  const lower =
    clean(text).toLowerCase();

  return (
    !lower ||
    lower.includes("note:") ||
    lower.includes("commission reflected") ||
    lower.includes("commission paid") ||
    lower.includes("please contact") ||
    lower.includes("do not assume") ||
    lower.includes("cms guidelines") ||
    lower.includes("if the application") ||
    lower.includes("effective dates") ||
    lower.includes("per cms") ||
    lower.includes("all ma commissions")
  );
}

function looksLikeCarrier(text){
  const value =
    clean(text);

  if(looksLikeNote(value)){
    return false;
  }

  if(/\b20\d{2}\b/.test(value)){
    return false;
  }

  const lower =
    value.toLowerCase();

  if(
    lower.includes("plans") ||
    lower.includes("part d") ||
    lower.includes("mapd") ||
    lower.includes("ma-pd") ||
    lower.includes("pdp") ||
    lower.includes("medicare advantage")
  ){
    return false;
  }

  const letters =
    value.replace(/[^a-z]/gi, "");

  return letters.length >= 3 && value === value.toUpperCase();
}

function hasNumericRates(values){
  return values
    .slice(1, 8)
    .some(value => {
      const cleaned =
        clean(value).replace(/[$,%]/g, "").replace(/,/g, "");

      return cleaned && Number.isFinite(Number(cleaned));
    });
}

function rowsFromStackedSheet(matrix, sheetName){
  const header =
    matrix.find(row =>
      clean(row[0]).toLowerCase() === "plans" &&
      row.slice(1).some(value => clean(value).toLowerCase().includes("level"))
    );

  if(!header){
    return [];
  }

  let carrier = "";
  let product = "";
  const rows = [];

  matrix.forEach(row => {
    const values =
      row.map(clean);

    const first =
      values[0];

    if(!first || first.toLowerCase() === "plans"){
      return;
    }

    if(hasNumericRates(values)){
      if(carrier && product){
        rows.push({
          Carrier:carrier,
          Product:product,
          "Policy Type":sheetName,
          Rule:first,
          Sheet:sheetName
        });
      }

      return;
    }

    if(values.filter(Boolean).length !== 1 || looksLikeNote(first)){
      return;
    }

    if(looksLikeCarrier(first)){
      carrier = first;
      product = "";
      return;
    }

    product = first;
  });

  return rows;
}

async function parseXlsx(buffer){
  const ExcelJS =
    require("exceljs");

  const workbook =
    new ExcelJS.Workbook();

  await workbook.xlsx.load(buffer);

  const rows = [];

  workbook.worksheets.forEach(sheet => {
    const sheetName =
      sheet.name;

    const matrix = [];
    const headers = [];

    sheet.eachRow((row, rowNumber) => {
      const values =
        row.values.slice(1).map(value => {
          if(value && typeof value === "object"){
            if(value.text){
              return value.text;
            }

            if(value.result !== undefined){
              return value.result;
            }

            if(value.richText){
              return value.richText.map(part => part.text || "").join("");
            }
          }

          return value ?? "";
        });

      matrix.push(values);

      if(rowNumber === 1){
        values.forEach(value => {
          headers.push(clean(value));
        });
        return;
      }

      const item = {
        Sheet:sheetName
      };

      headers.forEach((header, index) => {
        if(header){
          item[header] = values[index] ?? "";
        }
      });

      if(Object.keys(item).length > 1){
        rows.push(item);
      }
    });

    rows.push(...rowsFromStackedSheet(matrix, sheetName));
  });

  return rows;
}

function productPairsFromRows(rows){
  const products =
    new Map();

  const carriers =
    new Map();

  rows.slice(0, MAX_ROWS_PER_FILE).forEach(row => {
    const carrier =
      firstValue(row, ["carrier", "company", "insurance company"]);

    const product =
      firstValue(row, ["product", "product name", "plan", "plan name"]);

    const policyType =
      firstValue(row, ["policy type", "product type", "line of business", "lob", "sheet"]);

    if(carrier){
      carriers.set(normalizeName(carrier), carrier);
    }

    if(carrier && (product || policyType)){
      const key =
        [
          normalizeName(carrier),
          normalizeName(product || policyType),
          normalizeName(policyType)
        ].join("|");

      products.set(key, {
        carrier,
        product:product || policyType,
        policy_type:policyType || "",
      });
    }
  });

  return {
    carriers:[...carriers.values()],
    products:[...products.values()]
  };
}

function parseMultipart(event){
  const contentType =
    getHeader(event, "content-type");

  const boundaryMatch =
    contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

  if(!boundaryMatch){
    throw new Error("Missing multipart boundary");
  }

  const boundary =
    boundaryMatch[1] || boundaryMatch[2];

  const bodyBuffer =
    event.isBase64Encoded ?
      Buffer.from(event.body || "", "base64") :
      Buffer.from(event.body || "", "binary");

  const body =
    bodyBuffer.toString("binary");

  return body
    .split(`--${boundary}`)
    .filter(part => part.includes("Content-Disposition"))
    .map(part => {
      const separator =
        part.indexOf("\r\n\r\n");

      if(separator === -1){
        return null;
      }

      const rawHeaders =
        part.slice(0, separator);

      let content =
        part.slice(separator + 4);

      if(content.endsWith("\r\n")){
        content = content.slice(0, -2);
      }

      const disposition =
        rawHeaders.match(/content-disposition:[^\n]+/i)?.[0] || "";

      const filename =
        disposition.match(/filename="([^"]*)"/i)?.[1] || "";

      const fieldName =
        disposition.match(/name="([^"]*)"/i)?.[1] || "";

      const contentTypeMatch =
        rawHeaders.match(/content-type:\s*([^\r\n]+)/i);

      return {
        fieldName,
        filename,
        contentType:contentTypeMatch?.[1] || "",
        buffer:Buffer.from(content, "binary")
      };
    })
    .filter(Boolean);
}

async function parseFile(file){
  const filename =
    file.filename || "upload";

  const lower =
    filename.toLowerCase();

  if(file.buffer.length > MAX_FILE_BYTES){
    throw new Error(`${filename} is too large.`);
  }

  if(lower.endsWith(".csv")){
    return parseCsv(file.buffer.toString("utf8"));
  }

  if(lower.endsWith(".xlsx") || lower.endsWith(".xls")){
    return parseXlsx(file.buffer);
  }

  throw new Error(`${filename} is not a supported file type.`);
}

exports.handler = async function(event){
  if(event.httpMethod === "OPTIONS"){
    return {
      statusCode:200,
      headers:corsHeaders,
      body:""
    };
  }

  if(event.httpMethod !== "POST"){
    return reply(405, {
      success:false,
      error:"Method Not Allowed"
    });
  }

  const auth =
    await verifyAdmin(event);

  if(!auth.ok){
    return reply(401, {
      success:false,
      error:auth.error || "Unauthorized"
    });
  }

  try{
    await ensureProductLibrarySchema();

    const parts =
      parseMultipart(event);

    const files =
      parts.filter(part => part.filename);

    if(!files.length){
      return reply(400, {
        success:false,
        error:"No files uploaded"
      });
    }

    const parsedFiles = [];
    const importStats =
      makeStats();

    for(const file of files){
      try{
        const rows =
          await parseFile(file);

        if(rows.length > MAX_ROWS_PER_FILE){
          importStats.rows_skipped += rows.length - MAX_ROWS_PER_FILE;
        }

        const pairs =
          productPairsFromRows(rows);

        await importPairs(pairs, importStats);

        parsedFiles.push({
          file:file.filename,
          content_type:file.contentType,
          row_count:rows.length,
          sampled_rows:Math.min(rows.length, MAX_ROWS_PER_FILE),
          carrier_count:pairs.carriers.length,
          product_count:pairs.products.length,
          carrier_preview:pairs.carriers.slice(0, 20),
          product_preview:pairs.products.slice(0, 30)
        });
      }catch(err){
        importStats.errors.push({
          type:"file",
          file:file.filename,
          error:err.message
        });
      }
    }

    return reply(200, {
      success:true,
      mode:"import",
      auth_method:auth.method,
      files:parsedFiles,
      totals:{
        files:parsedFiles.length,
        rows:parsedFiles.reduce((sum, file) => sum + file.row_count, 0),
        carriers:parsedFiles.reduce((sum, file) => sum + file.carrier_count, 0),
        products:parsedFiles.reduce((sum, file) => sum + file.product_count, 0)
      },
      import_stats:importStats
    });
  }catch(err){
    console.error("import-crm-product-library import error:", err);

    return reply(500, {
      success:false,
      error:err.message || "Import failed"
    });
  }
};
