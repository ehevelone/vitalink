async function ensureGoogleCalendarTables(pool){

  await pool.query(`
    CREATE TABLE IF NOT EXISTS crm_google_calendar_connections (
      agent_id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at TIMESTAMPTZ,
      calendar_id TEXT DEFAULT 'primary',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE crm_appointments
    ADD COLUMN IF NOT EXISTS google_event_id TEXT
  `);

}

function getRedirectUri(event){

  if(process.env.GOOGLE_REDIRECT_URI){
    return process.env.GOOGLE_REDIRECT_URI;
  }

  const host =
    event.headers.host || event.headers.Host;

  return `https://${host}/.netlify/functions/google-calendar-callback`;

}

function getTimeZone(){

  return process.env.GOOGLE_CALENDAR_TIMEZONE ||
    "America/Chicago";

}

function toDateKey(value){

  if(!value){
    return "";
  }

  if(value instanceof Date){

    return value.getFullYear() +
      "-" +
      String(value.getMonth() + 1).padStart(2,"0") +
      "-" +
      String(value.getDate()).padStart(2,"0");

  }

  return String(value).split("T")[0];

}

function addOneHour(time){

  if(!time){
    return "";
  }

  const parts = time.split(":");
  const date = new Date();

  date.setHours(Number(parts[0] || 0));
  date.setMinutes(Number(parts[1] || 0));
  date.setSeconds(0);
  date.setMilliseconds(0);
  date.setHours(date.getHours() + 1);

  return String(date.getHours()).padStart(2,"0") +
    ":" +
    String(date.getMinutes()).padStart(2,"0");

}

function addOneDay(date){

  const parts =
    date.split("-");

  const value = new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2])
  );

  value.setDate(value.getDate() + 1);

  return value.getFullYear() +
    "-" +
    String(value.getMonth() + 1).padStart(2,"0") +
    "-" +
    String(value.getDate()).padStart(2,"0");

}

function buildGoogleEvent(appointment){

  const clientName =
    `${appointment.first_name || ""} ${appointment.last_name || ""}`.trim();

  const titleParts = [
    appointment.appointment_type || "CRM Appointment",
    clientName
  ].filter(Boolean);

  const event = {
    summary: titleParts.join(" - "),
    location: appointment.location || "",
    description: appointment.notes || ""
  };

  const date =
    toDateKey(appointment.appointment_date);

  if(appointment.appointment_time){

    event.start = {
      dateTime: `${date}T${appointment.appointment_time}`,
      timeZone: getTimeZone()
    };

    event.end = {
      dateTime: `${date}T${addOneHour(appointment.appointment_time)}`,
      timeZone: getTimeZone()
    };

  }else{

    event.start = {
      date
    };

    event.end = {
      date:addOneDay(date)
    };

  }

  return event;

}

async function refreshAccessToken(pool, connection){

  if(
    connection.expires_at &&
    new Date(connection.expires_at).getTime() > Date.now() + 60000
  ){
    return connection.access_token;
  }

  if(!connection.refresh_token){
    return connection.access_token;
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: connection.refresh_token,
    grant_type: "refresh_token"
  });

  const res = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method:"POST",
      headers:{
        "Content-Type":"application/x-www-form-urlencoded"
      },
      body:params.toString()
    }
  );

  const data = await res.json();

  if(!res.ok){
    throw new Error(data.error_description || "Google token refresh failed");
  }

  const expiresAt =
    new Date(Date.now() + (data.expires_in || 3600) * 1000);

  await pool.query(
    `
    UPDATE crm_google_calendar_connections
    SET access_token = $1,
        expires_at = $2,
        updated_at = NOW()
    WHERE agent_id = $3
    `,
    [
      data.access_token,
      expiresAt,
      connection.agent_id
    ]
  );

  return data.access_token;

}

async function getConnection(pool, agentId){

  const result = await pool.query(
    `
    SELECT *
    FROM crm_google_calendar_connections
    WHERE agent_id = $1
    LIMIT 1
    `,
    [String(agentId)]
  );

  return result.rows[0];

}

async function getAppointment(pool, appointmentId){

  const result = await pool.query(
    `
    SELECT
      a.*,
      c.first_name,
      c.last_name
    FROM crm_appointments a
    LEFT JOIN crm_clients c
      ON c.id = a.client_id
    WHERE a.id = $1
    LIMIT 1
    `,
    [appointmentId]
  );

  return result.rows[0];

}

async function syncGoogleAppointment(pool, appointmentId){

  await ensureGoogleCalendarTables(pool);

  const appointment =
    await getAppointment(pool, appointmentId);

  if(!appointment){
    return;
  }

  const connection =
    await getConnection(pool, appointment.agent_id);

  if(!connection){
    return;
  }

  const accessToken =
    await refreshAccessToken(pool, connection);

  const calendarId =
    encodeURIComponent(connection.calendar_id || "primary");

  const event =
    buildGoogleEvent(appointment);

  const hasGoogleEvent =
    !!appointment.google_event_id;

  const url = hasGoogleEvent
    ? `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(appointment.google_event_id)}`
    : `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;

  const res = await fetch(
    url,
    {
      method:hasGoogleEvent ? "PATCH" : "POST",
      headers:{
        "Authorization":`Bearer ${accessToken}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify(event)
    }
  );

  const data = await res.json();

  if(!res.ok){
    throw new Error(data.error?.message || "Google Calendar sync failed");
  }

  if(!hasGoogleEvent && data.id){

    await pool.query(
      `
      UPDATE crm_appointments
      SET google_event_id = $1
      WHERE id = $2
      `,
      [
        data.id,
        appointment.id
      ]
    );

  }

}

async function deleteGoogleAppointment(pool, appointmentId){

  await ensureGoogleCalendarTables(pool);

  const appointment =
    await getAppointment(pool, appointmentId);

  if(!appointment || !appointment.google_event_id){
    return;
  }

  const connection =
    await getConnection(pool, appointment.agent_id);

  if(!connection){
    return;
  }

  const accessToken =
    await refreshAccessToken(pool, connection);

  const calendarId =
    encodeURIComponent(connection.calendar_id || "primary");

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(appointment.google_event_id)}`,
    {
      method:"DELETE",
      headers:{
        "Authorization":`Bearer ${accessToken}`
      }
    }
  );

  if(!res.ok && res.status !== 410 && res.status !== 404){

    const data = await res.json();
    throw new Error(data.error?.message || "Google Calendar delete failed");

  }

}

module.exports = {
  ensureGoogleCalendarTables,
  getRedirectUri,
  syncGoogleAppointment,
  deleteGoogleAppointment
};
