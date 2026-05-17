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

          readable
            .pipe(csv())
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

                output = rows.map((r) => {

                  const newRow = {};

                  crmHeaders.forEach((header) => {

                    const vitalinkField =
                      mappings[header];

                    if(vitalinkField){

                      newRow[header] =
                        r[vitalinkField] || "";

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
