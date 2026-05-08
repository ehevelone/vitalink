const Busboy = require("busboy");
const csv = require("csv-parser");

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

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

      busboy.on("file", (fieldname, file, info) => {

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

          const customCrmName =
  fields.customCrmName || "";
  let existingTemplate = null;
  if(
  crmType === "custom" &&
  customCrmName
){

  try{

    const client =
      await pool.connect();

    const result =
      await client.query(
        `
        select *
        from crm_templates
        where lower(crm_name) =
          lower($1)
        limit 1
        `,
        [customCrmName]
      );

    client.release();

    if(result.rows.length){

      existingTemplate =
        result.rows[0];

      console.log(
        "Existing CRM template found:",
        customCrmName
      );

    }

  }catch(dbErr){

    console.error(
      "CRM lookup failed:",
      dbErr
    );

  }

}

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

          readable
            .pipe(csv())
            .on("data", (row) => {
              rows.push(row);
            })
            .on("end", async () => {

              try{

                let output = [];

                // =========================
                // MAX CRM
                // =========================

               if(crmType === "max"){

  output = rows.map((r) => ({

    "First Name":
      r["First Name"] || "",

    "Last Name":
      r["Last Name"] || "",

    "DOB":
      r["DOB"] || "",

    "Address":
      r["Address"] || "",

    "City":
      r["City"] || "",

    "State":
      r["State"] || "",

    "Zip":
      r["Zip"] || "",

    "Phone":
      r["Phone"] || "",

    "Email":
      r["Email"] || "",

    "Notes":
`
Medications:
${r["Medications"] || ""}

Doctors:
${r["Doctors"] || ""}

Emergency Contacts:
${r["Emergency Contacts"] || ""}
`.trim()

  }));

}

                // =========================
                // Integrity Connect
                // =========================

               else if(
  crmType === "integrity_connect"
){

  output = rows.map((r) => ({

    "First Name":
      r["First Name"] || "",

    "Last Name":
      r["Last Name"] || "",

    "Date of Birth":
      r["DOB"] || "",

    "Address":
      r["Address"] || "",

    "City":
      r["City"] || "",

    "State":
      r["State"] || "",

    "Zip":
      r["Zip"] || "",

    "Phone":
      r["Phone"] || "",

    "Email":
      r["Email"] || "",

    "Notes":
`
Medications:
${r["Medications"] || ""}

Doctors:
${r["Doctors"] || ""}

Emergency Contacts:
${r["Emergency Contacts"] || ""}
`.trim()

  }));

}

                // =========================
                // Lead Advantage
                // =========================

else if(
  crmType === "lead_advantage"
){

  output = rows.map((r) => ({

    "First Name":
      r["First Name"] || "",

    "Last Name":
      r["Last Name"] || "",

    "DOB":
      r["DOB"] || "",

    "Address":
      r["Address"] || "",

    "City":
      r["City"] || "",

    "State":
      r["State"] || "",

    "Zip":
      r["Zip"] || "",

    "Phone":
      r["Phone"] || "",

    "Email":
      r["Email"] || "",

    "Notes":
`
Medications:
${r["Medications"] || ""}

Doctors:
${r["Doctors"] || ""}

Emergency Contacts:
${r["Emergency Contacts"] || ""}
`.trim()

  }));

}

                // =========================
                // CUSTOM CRM
                // =========================

else if(
  crmType === "custom"
){

  output = rows;

  if(
  files.crmTemplateCsv &&
  !existingTemplate
){

    try{

      const templateText =
        files.crmTemplateCsv.toString("utf8");

      const firstLine =
        templateText.split("\n")[0];

      const templateHeaders =
        firstLine
          .split(",")
          .map((h) =>
            h.replace(/"/g, "").trim()
          );

const client =
  await pool.connect();

try{

  await client.query(
    `
    insert into crm_templates
    (
      crm_name,
      headers_json
    )
    values
    ($1, $2)
    `,
    [
      customCrmName,
      JSON.stringify(templateHeaders)
    ]
  );

}finally{

  client.release();

}

    }catch(saveErr){

      console.error(
        "CRM template save failed:",
        saveErr
      );

    }

  }

}

                else{

                  return resolve({
                    statusCode:400,
                    headers,
                    body:"Unsupported CRM type."
                  });

                }

                if(!output.length){

                  return resolve({
                    statusCode:400,
                    headers,
                    body:"No rows found."
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