const Busboy = require("busboy");
const csv = require("csv-parser");

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

function normalizeKey(value){
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const FIELD_ALIASES = {
  first_name:[
    "First Name",
    "firstName",
    "fname",
    "FNAME",
    "profile_first_name",
    "user_first_name"
  ],
  fname:[
    "first_name",
    "First Name",
    "firstName",
    "FNAME",
    "profile_first_name",
    "user_first_name"
  ],
  firstname:[
    "first_name",
    "First Name",
    "firstName",
    "FNAME",
    "profile_first_name",
    "user_first_name"
  ],
  last_name:[
    "Last Name",
    "lastName",
    "lname",
    "LNAME",
    "profile_last_name",
    "user_last_name"
  ],
  lname:[
    "last_name",
    "Last Name",
    "lastName",
    "LNAME",
    "profile_last_name",
    "user_last_name"
  ],
  lastname:[
    "last_name",
    "Last Name",
    "lastName",
    "LNAME",
    "profile_last_name",
    "user_last_name"
  ],
  phone:[
    "Phone",
    "PHONE",
    "mobile_phone",
    "Mobile Phone",
    "profile_phone",
    "user_phone"
  ],
  email:[
    "Email",
    "EMAIL",
    "client_email"
  ],
  address:[
    "Address",
    "ADDRESS",
    "street",
    "Street Address"
  ],
  city:["City", "CITY"],
  state:["State", "STATE"],
  zip:["ZIP", "Zip", "zip_code", "Postal Code"],
  dob:["DOB", "Date of Birth", "date_of_birth"],
  county:["County", "COUNTY"],
  notes:["Notes", "NOTES"],
  agent:["Agent", "AGENT", "agent_name"],
  source:["Source", "SOURCE"],
  status:["Status", "STATUS"],
  plan:["Plan", "PLAN"],
  mbi:["MBI", "Medicare Number", "medicare_number"]
};

const HEADERLESS_COLUMNS = [
  "first_name",
  "last_name",
  "address",
  "phone",
  "dob"
];

function looksLikeHeaderRow(csvText){
  const firstLine =
    String(csvText || "")
      .split(/\r?\n/)
      .find((line) => line.trim());

  if(!firstLine){
    return true;
  }

  const normalized =
    firstLine.split(",").map(normalizeKey);

  return normalized.some((header) => [
    "firstname",
    "fname",
    "lastname",
    "lname",
    "phone",
    "email",
    "address",
    "dob"
  ].includes(header));
}

function parseCityStateZip(value){
  const text =
    String(value || "").replace(/^"|"$/g, "").trim();

  const match =
    text.match(/^(.+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);

  if(!match){
    return {};
  }

  return {
    city:match[1].trim(),
    state:match[2].trim().toUpperCase(),
    zip:match[3].trim()
  };
}

function normalizeParsedRows(rows, headerless){
  if(!headerless){
    return rows;
  }

  const normalized = [];

  rows.forEach((row) => {
    const firstName =
      String(row.first_name || "").trim();
    const lastName =
      String(row.last_name || "").trim();
    const address =
      String(row.address || "").trim();

    if(!firstName && !lastName && address && normalized.length){
      Object.assign(
        normalized[normalized.length - 1],
        parseCityStateZip(address)
      );
      return;
    }

    normalized.push({
      first_name:firstName,
      last_name:lastName,
      address,
      phone:String(row.phone || "").trim(),
      dob:String(row.dob || "").trim()
    });
  });

  return normalized;
}

function getRowValue(row, field){
  if(!row || !field){
    return "";
  }

  if(Object.prototype.hasOwnProperty.call(row, field)){
    return row[field] || "";
  }

  const normalizedRow = {};

  Object.keys(row).forEach((key) => {
    normalizedRow[normalizeKey(key)] = row[key];
  });

  const candidates = [
    field,
    ...(FIELD_ALIASES[field] || []),
    ...(FIELD_ALIASES[normalizeKey(field)] || [])
  ];

  for(const candidate of candidates){
    const normalized = normalizeKey(candidate);

    if(Object.prototype.hasOwnProperty.call(normalizedRow, normalized)){
      return normalizedRow[normalized] || "";
    }
  }

  return "";
}

function rowHasValue(row){
  return Object.values(row || {}).some((value) =>
    String(value || "").trim()
  );
}

exports.handler = async (event) => {

  return new Promise((resolve) => {

    try{

      const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods":
          "POST, OPTIONS",
      };

      if(event.httpMethod === "OPTIONS"){

        return resolve({
          statusCode:200,
          headers,
          body:""
        });

      }

      const busboy = Busboy({
        headers:event.headers
      });

      const files = {};
      const fields = {};

      busboy.on("file", (fieldname, file) => {

        const chunks = [];

        file.on("data", (data) => {
          chunks.push(data);
        });

        file.on("end", () => {

          files[fieldname] =
            Buffer.concat(chunks);

        });

      });

      busboy.on("field", (fieldname, value) => {

        fields[fieldname] = value;

      });

      busboy.on("finish", async () => {

        try{

          const crmType = fields.crmType;

          if(!files.vitalinkCsv){

            return resolve({
              statusCode:400,
              headers,
              body:"Missing VitaLink CSV."
            });

          }

          const csvText =
            files.vitalinkCsv.toString("utf8");

          const rows = [];

          const stream = require("stream");

          const readable =
            new stream.Readable();

          readable.push(csvText);
          readable.push(null);

          const hasHeader =
            looksLikeHeaderRow(csvText);

          readable
            .pipe(
              hasHeader
                ? csv()
                : csv({ headers:HEADERLESS_COLUMNS })
            )
            .on("data", (row) => {

              rows.push(row);

            })
            .on("end", async () => {

              try{

                let output = [];

                const client =
                  await pool.connect();

                let template;

                try{

                  const result =
                    await client.query(
                      `
                      select *
                      from crm_templates
                      where crm_name = $1
                      limit 1
                      `,
                      [crmType]
                    );

                  if(!result.rows.length){

                    return resolve({
                      statusCode:400,
                      headers,
                      body:"CRM template not found."
                    });

                  }

                  template =
                    result.rows[0];

                }finally{

                  client.release();

                }

                const crmHeaders =
                  template.headers_json || [];

                const mappings =
                  template.mapping_json || {};

                const dataRows =
                  normalizeParsedRows(rows, !hasHeader).filter(rowHasValue);

                output = dataRows.map((r) => {

                  const newRow = {};

                  crmHeaders.forEach((header) => {

                    const vitalinkField =
                      mappings[header];

                    if(vitalinkField){

                      newRow[header] =
                        getRowValue(r, vitalinkField);

                    }else{

                      newRow[header] = "";

                    }

                  });

                  return newRow;

                });

                if(!output.length){

                  return resolve({
                    statusCode:400,
                    headers,
                    body:"No rows found."
                  });

                }

                const mappedValueCount =
                  output.reduce((count, row) => {
                    return count + Object.values(row).filter((value) =>
                      String(value || "").trim()
                    ).length;
                  }, 0);

                if(mappedValueCount === 0){
                  return resolve({
                    statusCode:422,
                    headers,
                    body:"No mapped values found. Check the CRM template field mappings against the VitaLink export headers."
                  });
                }

                const outputHeaders =
                  Object.keys(output[0]);

                const csvLines = [];

                csvLines.push(
                  outputHeaders.join(",")
                );

                output.forEach((row) => {

                  const values =
                    outputHeaders.map((h) => {

                      const val =
                        String(row[h] || "")
                          .replace(/"/g, '""');

                      return `"${val}"`;

                    });

                  csvLines.push(
                    values.join(",")
                  );

                });

                const finalCsv =
                  csvLines.join("\n");

                return resolve({
                  statusCode:200,
                  headers:{
                    ...headers,
                    "Content-Type":"text/csv",
                    "Content-Disposition":
                      "attachment; filename=vitalink-crm-import.csv"
                  },
                  body:finalCsv
                });

              }catch(err){

                console.error(err);

                return resolve({
                  statusCode:500,
                  headers,
                  body:"Conversion error."
                });

              }

            });

        }catch(err){

          console.error(err);

          return resolve({
            statusCode:500,
            headers,
            body:"Processing error."
          });

        }

      });

      busboy.end(
        Buffer.from(event.body, "base64")
      );

    }catch(err){

      console.error(err);

      return resolve({
        statusCode:500,
        body:"Server error."
      });

    }

  });

};
