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

  if(data.connected){

    loadGoogleCalendars();

  }else{

    document.getElementById(
      "googleCalendarPickerRow"
    ).style.display = "none";

  }

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

async function loadGoogleCalendars(){

  const agent_id =
    sessionStorage.getItem("crm_uuid");

  const res = await fetch(
    `/.netlify/functions/google-calendar-list?agent_id=${agent_id}`
  );

  const data = await res.json();

  if(!data.success || !data.connected){
    return;
  }

  const row =
    document.getElementById(
      "googleCalendarPickerRow"
    );

  const select =
    document.getElementById(
      "googleCalendarSelect"
    );

  select.innerHTML = "";

  data.calendars.forEach(calendar => {

    const option =
      document.createElement("option");

    option.value =
      calendar.id;

    option.textContent =
      calendar.primary
        ? `${calendar.summary} (Primary)`
        : calendar.summary;

    if(calendar.id === data.selected_calendar_id){
      option.selected = true;
    }

    select.appendChild(option);

  });

  row.style.display =
    data.calendars.length ? "block" : "none";

  updateGoogleCalendarSelectedLabel();

}

function updateGoogleCalendarSelectedLabel(){

  const select =
    document.getElementById(
      "googleCalendarSelect"
    );

  const label =
    document.getElementById(
      "googleCalendarSelectedLabel"
    );

  if(!select.value){
    label.innerText = "";
    return;
  }

  label.innerText =
    `Appointments will sync to: ${select.options[select.selectedIndex].text}`;

}

async function saveGoogleCalendarSelection(){

  const res = await fetch(
    "/.netlify/functions/google-calendar-select",
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        agent_id:sessionStorage.getItem("crm_uuid"),
        calendar_id:document.getElementById(
          "googleCalendarSelect"
        ).value
      })
    }
  );

  const data = await res.json();

  if(!data.success){

    alert(data.error || "Unable to save calendar selection.");
    return;

  }

  updateGoogleCalendarSelectedLabel();

}

loadGoogleCalendarStatus();
