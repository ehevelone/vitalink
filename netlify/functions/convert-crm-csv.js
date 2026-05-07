const Busboy = require("busboy");
const csv = require("csv-parser");

exports.handler = async (event) => {

  return new Promise((resolve) => {

    try{

      const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
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
                    FNAME:
                      r["First Name"] || "",

                    LNAME:
                      r["Last Name"] || "",

                    DOB:
                      r["DOB"] || "",

                    PHONE:
                      r["Phone"] || "",

                    EMAIL:
                      r["Email"] || "",

                    NOTES:
                      `
Medications:
${r["Medications"] || ""}

Doctors:
${r["Doctors"] || ""}
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
                    FirstName:
                      r["First Name"] || "",

                    LastName:
                      r["Last Name"] || "",

                    DateOfBirth:
                      r["DOB"] || "",

                    PhoneNumber:
                      r["Phone"] || "",

                    EmailAddress:
                      r["Email"] || "",

                    Notes:
                      `
Medications:
${r["Medications"] || ""}

Doctors:
${r["Doctors"] || ""}
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
                    first_name:
                      r["First Name"] || "",

                    last_name:
                      r["Last Name"] || "",

                    dob:
                      r["DOB"] || "",

                    phone:
                      r["Phone"] || "",

                    email:
                      r["Email"] || "",

                    notes:
                      `
Medications:
${r["Medications"] || ""}

Doctors:
${r["Doctors"] || ""}
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