const { Pool } = require("pg");
const { requireCrmAgent } = require("./crm-auth");

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
        AND c.id::TEXT = $2::TEXT
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

    const currentTask = await pool.query(
      `
      SELECT agent_id
      FROM crm_tasks
      WHERE id = $1
      LIMIT 1
      `,
      [body.id]
    );

    if(!currentTask.rows.length){
      return{
        statusCode:404,
        body:JSON.stringify({
          success:false,
          error:"Task not found"
        })
      };
    }

    const auth = await requireCrmAgent(event, currentTask.rows[0].agent_id);

    if(auth.error){
      return{
        statusCode:403,
        body:JSON.stringify({
          success:false,
          error:auth.error
        })
      };
    }

    const completedAt =
      body.status === "Complete" ? new Date() : null;

    await pool.query(`
      ALTER TABLE crm_tasks
      ADD COLUMN IF NOT EXISTS source_app_item_id BIGINT
    `);

    const result = await pool.query(
      `
      UPDATE crm_tasks
      SET
        client_id = $1,
        title = $2,
        notes = $3,
        due_date = $4,
        priority = $5,
        status = $6,
        completed_at = $7,
        updated_at = NOW()
      WHERE id = $8
        AND agent_id = $9
      RETURNING *
      `,
      [
        body.client_id || null,
        body.title,
        body.notes || null,
        body.due_date || null,
        body.priority || "Medium",
        body.status || "Open",
        completedAt,
        body.id,
        auth.crmAgentId
      ]
    );

    if(body.status === "Complete" && result.rows[0]){

      await deleteLinkedAppTask(result.rows[0]);
      
    }

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        task:result.rows[0]
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
