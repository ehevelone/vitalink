const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

function clean(value){
  const text =
    String(value ?? "").trim();

  return text || null;
}

function normalizeName(value){
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(company|co|inc|llc|insurance|ins|life|health)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value){
  return normalizeName(value)
    .split(" ")
    .filter(Boolean);
}

function tokenScore(left, right){
  const leftTokens =
    new Set(tokens(left));

  const rightTokens =
    new Set(tokens(right));

  if(!leftTokens.size || !rightTokens.size){
    return 0;
  }

  let shared = 0;

  leftTokens.forEach(token => {
    if(rightTokens.has(token)){
      shared += 1;
    }
  });

  return shared / Math.max(leftTokens.size, rightTokens.size);
}

async function ensureProductLibraryTables(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_carriers (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      scope TEXT NOT NULL DEFAULT 'global',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_carrier_aliases (
      id BIGSERIAL PRIMARY KEY,
      carrier_id BIGINT NOT NULL REFERENCES crm_carriers(id) ON DELETE CASCADE,
      alias_text TEXT NOT NULL,
      normalized_alias TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_products (
      id BIGSERIAL PRIMARY KEY,
      carrier_id BIGINT NOT NULL REFERENCES crm_carriers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      product_type TEXT,
      scope TEXT NOT NULL DEFAULT 'global',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(carrier_id, normalized_name)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_product_aliases (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES crm_products(id) ON DELETE CASCADE,
      alias_text TEXT NOT NULL,
      normalized_alias TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE crm_product_aliases
    DROP CONSTRAINT IF EXISTS crm_product_aliases_normalized_alias_key
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_product_aliases_product_alias
    ON crm_product_aliases (product_id, normalized_alias)
  `);
}

async function findCarrier(name){
  const normalized =
    normalizeName(name);

  if(!normalized){
    return null;
  }

  const exact = await pool.query(
    `
    SELECT *
    FROM crm_carriers
    WHERE normalized_name = $1
    LIMIT 1
    `,
    [normalized]
  );

  if(exact.rows.length){
    return exact.rows[0];
  }

  const alias = await pool.query(
    `
    SELECT c.*
    FROM crm_carrier_aliases a
    JOIN crm_carriers c
      ON c.id = a.carrier_id
    WHERE a.normalized_alias = $1
    LIMIT 1
    `,
    [normalized]
  );

  if(alias.rows.length){
    return alias.rows[0];
  }

  const candidates = await pool.query(`
    SELECT *
    FROM crm_carriers
    LIMIT 500
  `);

  return candidates.rows
    .map(row => ({
      ...row,
      score:tokenScore(name, row.name)
    }))
    .filter(row => row.score >= 0.75)
    .sort((a, b) => b.score - a.score)[0] || null;
}

async function getOrCreateCarrier(name){
  const cleaned =
    clean(name);

  if(!cleaned){
    return null;
  }

  const existing =
    await findCarrier(cleaned);

  if(existing){
    return existing;
  }

  const result = await pool.query(
    `
    INSERT INTO crm_carriers (name, normalized_name)
    VALUES ($1, $2)
    ON CONFLICT (normalized_name)
    DO UPDATE SET name = EXCLUDED.name
    RETURNING *
    `,
    [cleaned, normalizeName(cleaned)]
  );

  return result.rows[0];
}

async function addCarrierAlias(carrierId, aliasText){
  const alias =
    clean(aliasText);

  if(!carrierId || !alias){
    return;
  }

  await pool.query(
    `
    INSERT INTO crm_carrier_aliases (carrier_id, alias_text, normalized_alias)
    VALUES ($1, $2, $3)
    ON CONFLICT (normalized_alias) DO NOTHING
    `,
    [carrierId, alias, normalizeName(alias)]
  );
}

async function findProduct({ carrierId, name, productType }){
  const normalized =
    normalizeName(name);

  if(!carrierId || !normalized){
    return null;
  }

  const exact = await pool.query(
    `
    SELECT *
    FROM crm_products
    WHERE carrier_id = $1
      AND normalized_name = $2
    LIMIT 1
    `,
    [carrierId, normalized]
  );

  if(exact.rows.length){
    return exact.rows[0];
  }

  const alias = await pool.query(
    `
    SELECT p.*
    FROM crm_product_aliases a
    JOIN crm_products p
      ON p.id = a.product_id
    WHERE p.carrier_id = $1
      AND a.normalized_alias = $2
    LIMIT 1
    `,
    [carrierId, normalized]
  );

  if(alias.rows.length){
    return alias.rows[0];
  }

  const candidates = await pool.query(
    `
    SELECT *
    FROM crm_products
    WHERE carrier_id = $1
    LIMIT 500
    `,
    [carrierId]
  );

  return candidates.rows
    .map(row => ({
      ...row,
      score:
        tokenScore(name, row.name) +
        (productType && row.product_type && normalizeName(productType) === normalizeName(row.product_type) ? 0.15 : 0)
    }))
    .filter(row => row.score >= 0.72)
    .sort((a, b) => b.score - a.score)[0] || null;
}

async function matchCarrier(carrierName){
  await ensureProductLibraryTables();

  const carrier =
    await findCarrier(carrierName);

  return {
    matched:Boolean(carrier),
    carrier_id:carrier?.id || null,
    carrier
  };
}

async function matchProduct({ carrierId, carrier, product, planName, policyType }){
  await ensureProductLibraryTables();

  let resolvedCarrierId =
    carrierId || null;

  let matchedCarrier =
    null;

  if(!resolvedCarrierId && carrier){
    const carrierMatch =
      await matchCarrier(carrier);

    resolvedCarrierId =
      carrierMatch.carrier_id;
    matchedCarrier =
      carrierMatch.carrier;
  }

  const productName =
    product || planName || "";

  const matchedProduct =
    await findProduct({
      carrierId:resolvedCarrierId,
      name:productName,
      productType:policyType
    });

  return {
    matched:Boolean(matchedProduct),
    carrier_id:resolvedCarrierId,
    product_id:matchedProduct?.id || null,
    carrier:matchedCarrier,
    product:matchedProduct
  };
}

async function getOrCreateProduct({ carrierId, name, productType }){
  const cleaned =
    clean(name);

  if(!carrierId || !cleaned){
    return null;
  }

  const existing =
    await findProduct({ carrierId, name:cleaned, productType });

  if(existing){
    await addProductAlias(existing.id, cleaned);
    return existing;
  }

  const result = await pool.query(
    `
    INSERT INTO crm_products (
      carrier_id,
      name,
      normalized_name,
      product_type
    )
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (carrier_id, normalized_name)
    DO UPDATE SET product_type = COALESCE(crm_products.product_type, EXCLUDED.product_type)
    RETURNING *
    `,
    [carrierId, cleaned, normalizeName(cleaned), clean(productType)]
  );

  return result.rows[0];
}

async function addProductAlias(productId, aliasText){
  const alias =
    clean(aliasText);

  if(!productId || !alias){
    return;
  }

  await pool.query(
    `
    INSERT INTO crm_product_aliases (product_id, alias_text, normalized_alias)
    VALUES ($1, $2, $3)
    ON CONFLICT (product_id, normalized_alias) DO NOTHING
    `,
    [productId, alias, normalizeName(alias)]
  );
}

async function getOrCreateCanonicalProduct({ carrier, planName, policyType }){
  await ensureProductLibraryTables();

  const canonicalCarrier =
    await getOrCreateCarrier(carrier);

  if(!canonicalCarrier){
    return {
      carrier:null,
      product:null
    };
  }

  await addCarrierAlias(canonicalCarrier.id, carrier);

  const product =
    await getOrCreateProduct({
      carrierId:canonicalCarrier.id,
      name:planName || policyType,
      productType:policyType
    });

  return {
    carrier:canonicalCarrier,
    product
  };
}

async function importCanonicalProductsBulk(items = []){
  await ensureProductLibraryTables();

  const cleanedItems =
    items
      .map(item => ({
        carrier:clean(item.carrier),
        planName:clean(item.planName || item.product || item.policyType),
        policyType:clean(item.policyType)
      }))
      .filter(item => item.carrier && item.planName);

  if(!cleanedItems.length){
    return {
      carriers:0,
      products:0,
      aliases:0
    };
  }

  const carriers =
    [...new Map(
      cleanedItems.map(item => [
        normalizeName(item.carrier),
        {
          name:item.carrier,
          normalized_name:normalizeName(item.carrier)
        }
      ])
    ).values()];

  await pool.query(
    `
    WITH input AS (
      SELECT *
      FROM jsonb_to_recordset($1::jsonb)
      AS x(name TEXT, normalized_name TEXT)
    )
    INSERT INTO crm_carriers (name, normalized_name, scope)
    SELECT name, normalized_name, 'global'
    FROM input
    ON CONFLICT (normalized_name)
    DO UPDATE SET name = EXCLUDED.name
    `,
    [JSON.stringify(carriers)]
  );

  await pool.query(
    `
    WITH input AS (
      SELECT *
      FROM jsonb_to_recordset($1::jsonb)
      AS x(name TEXT, normalized_name TEXT)
    )
    INSERT INTO crm_carrier_aliases (carrier_id, alias_text, normalized_alias)
    SELECT c.id, input.name, input.normalized_name
    FROM input
    JOIN crm_carriers c
      ON c.normalized_name = input.normalized_name
    ON CONFLICT (normalized_alias) DO NOTHING
    `,
    [JSON.stringify(carriers)]
  );

  const carrierRows =
    await pool.query(
      `
      SELECT id, normalized_name
      FROM crm_carriers
      WHERE normalized_name = ANY($1::text[])
      `,
      [carriers.map(carrier => carrier.normalized_name)]
    );

  const carrierIds =
    new Map(
      carrierRows.rows.map(row => [row.normalized_name, row.id])
    );

  const products =
    [...new Map(
      cleanedItems.map(item => {
        const carrierKey =
          normalizeName(item.carrier);

        const productKey =
          normalizeName(item.planName);

        return [
          `${carrierKey}|${productKey}`,
          {
            carrier_id:carrierIds.get(carrierKey),
            name:item.planName,
            normalized_name:productKey,
            product_type:item.policyType || null
          }
        ];
      })
    ).values()]
      .filter(item => item.carrier_id && item.normalized_name);

  await pool.query(
    `
    WITH input AS (
      SELECT *
      FROM jsonb_to_recordset($1::jsonb)
      AS x(carrier_id BIGINT, name TEXT, normalized_name TEXT, product_type TEXT)
    )
    INSERT INTO crm_products (
      carrier_id,
      name,
      normalized_name,
      product_type,
      scope
    )
    SELECT carrier_id, name, normalized_name, product_type, 'global'
    FROM input
    ON CONFLICT (carrier_id, normalized_name)
    DO UPDATE SET product_type = COALESCE(crm_products.product_type, EXCLUDED.product_type)
    `,
    [JSON.stringify(products)]
  );

  await pool.query(
    `
    WITH input AS (
      SELECT *
      FROM jsonb_to_recordset($1::jsonb)
      AS x(carrier_id BIGINT, name TEXT, normalized_name TEXT)
    )
    INSERT INTO crm_product_aliases (product_id, alias_text, normalized_alias)
    SELECT p.id, input.name, input.normalized_name
    FROM input
    JOIN crm_products p
      ON p.carrier_id = input.carrier_id
      AND p.normalized_name = input.normalized_name
    ON CONFLICT (product_id, normalized_alias) DO NOTHING
    `,
    [JSON.stringify(products)]
  );

  return {
    carriers:carriers.length,
    products:products.length,
    aliases:carriers.length + products.length
  };
}

module.exports = {
  pool,
  clean,
  normalizeName,
  ensureProductLibraryTables,
  matchCarrier,
  matchProduct,
  findCarrier,
  findProduct,
  getOrCreateCanonicalProduct,
  importCanonicalProductsBulk
};
