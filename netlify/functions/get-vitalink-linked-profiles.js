const { Pool } = require("pg");

const pool = new Pool({
  connectionString:process.env.SUPABASE_URL,
  ssl:{
    rejectUnauthorized:false
  }
});

exports.handler = async (event) => {

  try{

    const agentId =
      event.queryStringParameters?.agent_id;

    if(!agentId){

      return{
        statusCode:400,
        body:JSON.stringify({
          success:false,
          error:"Missing agent_id"
        })
      };

    }

    await pool.query(`
      ALTER TABLE crm_clients
      ADD COLUMN IF NOT EXISTS linked_app_client_id TEXT,
      ADD COLUMN IF NOT EXISTS profile_linked TEXT,
      ADD COLUMN IF NOT EXISTS last_sync TIMESTAMPTZ
    `);

    const appAgent = await pool.query(
      `
      SELECT id
      FROM agents
      WHERE crm_uuid = $1
      LIMIT 1
      `,
      [agentId]
    );

    const appAgentId =
      appAgent.rows[0]?.id || null;

    const crmRes = await pool.query(
      `
      SELECT
        id,
        first_name,
        last_name,
        email,
        mobile_phone,
        linked_app_client_id,
        profile_linked,
        last_sync
      FROM crm_clients
      WHERE agent_id = $1
      ORDER BY last_sync DESC NULLS LAST, created_at DESC
      `,
      [agentId]
    );

    let appClients = [];

    if(appAgentId){

      const appRes = await pool.query(
        `
        SELECT
          u.id,
          u.first_name,
          u.last_name,
          u.email,
          u.phone,
          u.profile_complete,
          u.last_notified_at,
          EXISTS (
            SELECT 1
            FROM user_devices ud
            WHERE ud.user_id = u.id
              AND ud.device_token IS NOT NULL
              AND TRIM(ud.device_token) <> ''
              AND TRIM(ud.device_token) <> 'NO_TOKEN'
          ) AS has_device
        FROM users u
        WHERE u.agent_id = $1
        ORDER BY u.created_at DESC
        `,
        [appAgentId]
      );

      appClients = appRes.rows;

    }

    const crmByAppId = new Map(
      crmRes.rows
        .filter(client => client.linked_app_client_id)
        .map(client => [String(client.linked_app_client_id), client])
    );

    const profiles = appClients.map(client => {

      const crmClient =
        crmByAppId.get(String(client.id));

      return {
        app_client_id:client.id,
        crm_client_id:crmClient?.id || null,
        first_name:client.first_name || crmClient?.first_name || "",
        last_name:client.last_name || crmClient?.last_name || "",
        email:client.email || crmClient?.email || "",
        phone:client.phone || crmClient?.mobile_phone || "",
        profile_complete:client.profile_complete === true,
        has_device:client.has_device === true,
        last_notified_at:client.last_notified_at || null,
        last_sync:crmClient?.last_sync || null,
        linked:Boolean(crmClient)
      };

    });

    const linkedCount =
      profiles.filter(profile => profile.linked).length;

    return{
      statusCode:200,
      body:JSON.stringify({
        success:true,
        app_agent_id:appAgentId,
        total:profiles.length,
        linked:linkedCount,
        unlinked:profiles.length - linkedCount,
        profiles
      })
    };

  }catch(err){

    console.error("get-vitalink-linked-profiles error:", err);

    return{
      statusCode:500,
      body:JSON.stringify({
        success:false,
        error:err.message
      })
    };

  }

};
