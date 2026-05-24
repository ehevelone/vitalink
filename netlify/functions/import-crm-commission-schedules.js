const { requireCrmAgent } = require("./crm-auth");
const ExcelJS = require("exceljs");
const {
  normalizeScheduleRow
} = require("./commission-schedule-utils");
const {
  importCanonicalProductsBulk
} = require("./product-library-utils");

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

function normalizeKey(value){
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

    let names_imported = 0;
    let rows_scanned = 0;
    let rows_skipped = 0;
    const uniqueProducts =
      new Map();

    for(const file of files){
      const rows =
        await rowsFromFile(file);

      for(const row of rows){
        rows_scanned += 1;

        const normalized =
          normalizeScheduleRow(row, file.name);

        if(!normalized){
          rows_skipped += 1;
          continue;
        }

        if(!normalized.carrier || (!normalized.plan_name && !normalized.policy_type)){
          rows_skipped += 1;
          continue;
        }

        const key =
          [
            normalizeKey(normalized.carrier),
            normalizeKey(normalized.plan_name),
            normalizeKey(normalized.policy_type)
          ].join("|");

        if(!uniqueProducts.has(key)){
          uniqueProducts.set(key, {
            carrier:normalized.carrier,
            planName:normalized.plan_name,
            policyType:normalized.policy_type
          });
        }
      }
    }

    const bulkResult =
      await importCanonicalProductsBulk([...uniqueProducts.values()]);

    names_imported =
      bulkResult.products;

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        imported:names_imported,
        names_imported,
        carriers_imported:bulkResult.carriers,
        aliases_imported:bulkResult.aliases,
        unique_products:uniqueProducts.size,
        rows_scanned,
        rows_skipped
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
