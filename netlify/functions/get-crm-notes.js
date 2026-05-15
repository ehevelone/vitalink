const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

exports.handler = async (event) => {

  try{

    const agent_id =
      event.queryStringParameters.agent_id;

    const client_id =
      event.queryStringParameters.client_id;

    if(!client_id){

      return{
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"Missing client_id"
        })
      };

    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_client_notes (
        id BIGSERIAL PRIMARY KEY,
        agent_id TEXT NOT NULL,
        client_id TEXT NOT NULL,
        note TEXT NOT NULL,
        source TEXT,
        source_app_item_id BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      ALTER TABLE crm_client_notes
      ADD COLUMN IF NOT EXISTS source_app_item_id BIGINT
    `);

    await pool.query(`
      ALTER TABLE crm_client_notes
      ALTER COLUMN client_id TYPE TEXT
      USING client_id::TEXT
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_crm_client_notes_client_created
      ON crm_client_notes (client_id, created_at DESC)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_crm_client_notes_source_app_item
      ON crm_client_notes (source_app_item_id)
    `);

    const result = await pool.query(
      `
      SELECT *
      FROM crm_client_notes
      WHERE client_id = $1
        AND (
          $2 = ''
          OR agent_id = $2
        )
      ORDER BY created_at DESC
      LIMIT 25
      `,
      [client_id, agent_id || ""]
    );

    console.log("get-crm-notes result:", {
      agent_id,
      client_id,
      count:result.rows.length
    });

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        notes:result.rows
      })
    };

  }catch(err){

    console.error(err);

    return{
      statusCode:500,
      body:JSON.stringify({
        success:false,
        error:err.message
      })
    };

  }

};
