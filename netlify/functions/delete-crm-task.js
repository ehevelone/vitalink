const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

async function deleteLinkedAppTask(task){

  if(task.source_app_item_id){

    await pool.query(
      `
      DELETE FROM agent_client_items
      WHERE id = $1
        AND item_type = 'task'
      `,
      [task.source_app_item_id]
    );

    return;

  }

  await pool.query(
    `
    DELETE FROM agent_client_items
    WHERE id IN (
      SELECT i.id
      FROM agent_client_items i
      JOIN agents a
        ON a.id = i.agent_id
      JOIN crm_clients c
        ON c.linked_app_client_id = i.user_id::TEXT
      WHERE a.crm_uuid = $1
        AND c.id = $2
        AND i.item_type = 'task'
        AND (
          i.body = COALESCE($3, '')
          OR i.body = COALESCE($4, '')
        )
      ORDER BY i.created_at DESC
      LIMIT 1
    )
    `,
    [task.agent_id, task.client_id, task.notes, task.title]
  );

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

    if(!body.id){

      return{
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"Missing task id"
        })
      };

    }

    await pool.query(`
      ALTER TABLE crm_tasks
      ADD COLUMN IF NOT EXISTS source_app_item_id BIGINT
    `);

    const result = await pool.query(
      `
      DELETE FROM crm_tasks
      WHERE id = $1
      RETURNING source_app_item_id, agent_id, client_id, title, notes
      `,
      [body.id]
    );

    if(result.rows[0]){

      await deleteLinkedAppTask(result.rows[0]);
      
    }

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true
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
