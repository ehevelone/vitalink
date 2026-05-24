const { requireCrmAgent } = require("./crm-auth");
const ExcelJS = require("exceljs");
const {
  pool,
  ensureCommissionScheduleTable,
  normalizeScheduleRow
} = require("./commission-schedule-utils");
const {
  getOrCreateCanonicalProduct
} = require("./product-library-utils");

async function scheduleExists(agentId, normalized){
  const existing =
    await pool.query(
      `
      SELECT id
      FROM crm_commission_schedules
      WHERE agent_id = $1
        AND carrier IS NOT DISTINCT FROM $2
        AND policy_type IS NOT DISTINCT FROM $3
        AND plan_name IS NOT DISTINCT FROM $4
        AND state IS NOT DISTINCT FROM $5
        AND rule_label IS NOT DISTINCT FROM $6
        AND commission_type IS NOT DISTINCT FROM $7
        AND commission_rate IS NOT DISTINCT FROM $8
        AND commission_amount IS NOT DISTINCT FROM $9
      LIMIT 1
      `,
      [
        agentId,
        normalized.carrier,
        normalized.policy_type,
        normalized.plan_name,
        normalized.state,
        normalized.rule_label,
        normalized.commission_type,
        normalized.commission_rate,
        normalized.commission_amount
      ]
    );

  return Boolean(existing.rows.length);
}

function cleanCell(value){
  if(value && typeof value === "object"){
    if(value.text){
      return String(value.text).trim();
    }

    if(value.result !== undefined){
      return String(value.result).trim();
    }

    if(value.richText){
      return value.richText
        .map(part => part.text || "")
        .join("")
        .trim();
    }
  }

  return String(value ?? "").trim();
}

async function rowsFromWorkbook(file){
  const workbook =
    new ExcelJS.Workbook();

  await workbook.xlsx.load(Buffer.from(file.contentBase64, "base64"));

  const rows = [];

  workbook.worksheets.forEach(sheet => {
    const sheetName =
      sheet.name;

    const matrix = [];
    const headers = [];

    sheet.eachRow((row, rowNumber) => {
      const values =
        row.values.slice(1).map(cleanCell);

      matrix.push(values);

      if(rowNumber === 1){
        values.forEach(value => {
          headers.push(cleanCell(value));
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

    rows.push(...stackedScheduleRows(matrix, sheetName));
  });

  return rows;
}

function hasNumericRates(values){
  return values
    .slice(1)
    .some(value => value !== "" && Number.isFinite(Number(value)));
}

function looksLikeNote(text){
  const lower =
    text.toLowerCase();

  return (
    !text ||
    lower.includes("note:") ||
    lower.includes("commission reflected") ||
    lower.includes("commission paid") ||
    lower.includes("please contact") ||
    lower.includes("do not assume") ||
    lower.includes("cms guidelines")
  );
}

function looksLikeCarrier(text){
  if(looksLikeNote(text)){
    return false;
  }

  const letters =
    text.replace(/[^a-z]/gi, "");

  if(letters.length < 3){
    return false;
  }

  return text === text.toUpperCase();
}

function stackedScheduleRows(matrix, sheetName){
  const header =
    matrix.find(row =>
      cleanCell(row[0]).toLowerCase() === "plans" &&
      row.slice(1).some(value => cleanCell(value).toLowerCase().includes("level"))
    );

  if(!header){
    return [];
  }

  let carrier = "";
  let planName = "";
  const rows = [];

  matrix.forEach(row => {
    const values =
      row.map(cleanCell);

    const first =
      values[0];

    if(!first || first.toLowerCase() === "plans"){
      return;
    }

    if(hasNumericRates(values)){
      values.slice(1).forEach((value, index) => {
        if(!value){
          return;
        }

        const level =
          cleanCell(header[index + 1]);

        rows.push({
          Carrier:carrier,
          "Policy Type":sheetName,
          Plan:planName,
          Rule:first,
          Level:level,
          Commission:value,
          Sheet:sheetName
        });
      });

      return;
    }

    if(values.filter(Boolean).length !== 1 || looksLikeNote(first)){
      return;
    }

    if(looksLikeCarrier(first)){
      carrier = first;
      planName = "";
      return;
    }

    planName = first;
  });

  return rows;
}

async function rowsFromFile(file){
  if(Array.isArray(file.rows)){
    return file.rows;
  }

  if(file.contentBase64){
    return rowsFromWorkbook(file);
  }

  return [];
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

  try{

    await ensureCommissionScheduleTable();

    const body =
      JSON.parse(event.body || "{}");

    const agentId =
      body.agent_id;

    const auth =
      await requireCrmAgent(event, agentId);

    if(auth.error){
      return{
        statusCode:403,
        body:JSON.stringify({
          success:false,
          error:auth.error
        })
      };
    }

    const files =
      Array.isArray(body.files) ? body.files : [];

    let imported = 0;
    let skipped_duplicates = 0;

    for(const file of files){
      const rows =
        await rowsFromFile(file);

      for(const row of rows){
        const normalized =
          normalizeScheduleRow(row, file.name);

        if(!normalized){
          continue;
        }

        const exists =
          await scheduleExists(auth.crmAgentId, normalized);

        if(exists){
          skipped_duplicates += 1;
          continue;
        }

        const canonical =
          await getOrCreateCanonicalProduct({
            carrier:normalized.carrier,
            planName:normalized.plan_name,
            policyType:normalized.policy_type
          });

        await pool.query(
          `
          INSERT INTO crm_commission_schedules (
            agent_id,
            source_file,
            carrier_id,
            product_id,
            carrier,
            policy_type,
            plan_name,
            state,
            rule_label,
            commission_type,
            commission_rate,
            commission_amount,
            raw_data
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          `,
          [
            auth.crmAgentId,
            normalized.source_file,
            canonical.carrier?.id || null,
            canonical.product?.id || null,
            normalized.carrier,
            normalized.policy_type,
            normalized.plan_name,
            normalized.state,
            normalized.rule_label,
            normalized.commission_type,
            normalized.commission_rate,
            normalized.commission_amount,
            normalized.raw_data
          ]
        );

        imported += 1;
      }
    }

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        imported,
        skipped_duplicates
      })
    };

  }catch(err){

    console.error("import-crm-commission-schedules error:", err);

    return{
      statusCode:500,
      body:JSON.stringify({
        success:false,
        error:err.message
      })
    };

  }

};
