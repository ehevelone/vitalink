if(!sessionStorage.getItem("crm_uuid")){

  window.location = "login.html";

}

async function loadGoogleCalendarStatus(){

  const agent_id =
    sessionStorage.getItem("crm_uuid");

  const status =
    document.getElementById("googleCalendarStatus");

  const res = await fetch(
    `/.netlify/functions/google-calendar-status?agent_id=${agent_id}`
  );

  const data = await res.json();

  if(!data.success){

    status.innerText =
      data.error || "Unable to check Google Calendar.";

    return;

  }

  status.innerText = data.connected
    ? "Connected"
    : "Not connected";

}

async function connectGoogleCalendar(){

  const agent_id =
    sessionStorage.getItem("crm_uuid");

  const res = await fetch(
    `/.netlify/functions/google-calendar-auth-url?agent_id=${agent_id}`
  );

  const data = await res.json();

  if(!data.success){

    alert(data.error || "Unable to connect Google Calendar.");
    return;

  }

  window.location.href = data.url;

}

async function disconnectGoogleCalendar(){

  const confirmed = confirm(
    "Disconnect Google Calendar?"
  );

  if(!confirmed){
    return;
  }

  const res = await fetch(
    "/.netlify/functions/google-calendar-disconnect",
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        agent_id:sessionStorage.getItem("crm_uuid")
      })
    }
  );

  const data = await res.json();

  if(!data.success){

    alert(data.error || "Unable to disconnect Google Calendar.");
    return;

  }

  loadGoogleCalendarStatus();

}

loadGoogleCalendarStatus();
