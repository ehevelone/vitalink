if(!sessionStorage.getItem("crm_uuid")){

  window.location = "login.html";

}

let crmSettings = {};

function getAgentId(){

  return sessionStorage.getItem("crm_uuid");

}

function setInputValue(id, value){

  const field =
    document.getElementById(id);

  if(field){
    field.value = value || "";
  }

}

function setCheckedValue(id, value){

  const field =
    document.getElementById(id);

  if(field){
    field.checked = value === true;
  }

}

function showSettingsSaved(message){

  const status =
    document.getElementById("settingsSaveStatus");

  if(!status){
    return;
  }

  status.innerText = message;

  setTimeout(() => {
    status.innerText = "";
  }, 2400);

}

function updateSettingsSummaries(){

  const appointmentType =
    document.getElementById("defaultAppointmentType")?.value || "Follow-Up";

  const duration =
    document.getElementById("defaultAppointmentDuration")?.value || "60";

  const location =
    document.getElementById("defaultAppointmentLocation")?.value || "no preset location";

  const calendarSummary =
    document.getElementById("calendarDefaultsSummary");

  if(calendarSummary){
    calendarSummary.innerText =
      `New appointments will start as ${appointmentType}, ${duration} minutes, with ${location}.`;
  }

  const priority =
    document.getElementById("defaultTaskPriority")?.value || "Medium";

  const dueDays =
    document.getElementById("defaultTaskDueDays")?.value || "7";

  const taskSummary =
    document.getElementById("taskDefaultsSummary");

  if(taskSummary){
    taskSummary.innerText =
      `New tasks will start as ${priority} priority and due ${dueDays} day${String(dueDays) === "1" ? "" : "s"} after creation.`;
  }

}

async function loadCrmSettings(){

  const res = await fetch(
    `/.netlify/functions/get-crm-settings?agent_id=${getAgentId()}`
  );

  const data = await res.json();

  if(!data.success){
    return;
  }

  crmSettings =
    data.settings || {};

  setInputValue(
    "agentNameInput",
    crmSettings.agent_name || sessionStorage.getItem("agentName")
  );
  setInputValue("agentEmailInput", crmSettings.agent_email);
  setInputValue("agentPhoneInput", crmSettings.agent_phone);
  setInputValue("agencyNameInput", crmSettings.agency_name);
  setInputValue("npnInput", crmSettings.npn);
  setInputValue("licenseNumberInput", crmSettings.license_number);
  setInputValue("timezoneInput", crmSettings.timezone || "America/Chicago");

  setInputValue(
    "defaultAppointmentType",
    crmSettings.default_appointment_type || "Follow-Up"
  );
  setInputValue(
    "defaultAppointmentDuration",
    crmSettings.default_appointment_duration || 60
  );
  setInputValue(
    "defaultAppointmentLocation",
    crmSettings.default_appointment_location
  );
  setCheckedValue(
    "syncNotesToGoogle",
    crmSettings.sync_notes_to_google !== false
  );

  setInputValue(
    "defaultTaskPriority",
    crmSettings.default_task_priority || "Medium"
  );
  setInputValue(
    "defaultTaskDueDays",
    crmSettings.default_task_due_days || 7
  );
  setCheckedValue(
    "showCompletedTasks",
    crmSettings.show_completed_tasks === true
  );

  setInputValue(
    "defaultClientStatus",
    crmSettings.default_client_status || "Active"
  );
  setInputValue(
    "renewalReminderDays",
    crmSettings.renewal_reminder_days || 60
  );

  setCheckedValue(
    "notifyAppointments",
    crmSettings.notify_appointments !== false
  );
  setCheckedValue(
    "notifyOverdueTasks",
    crmSettings.notify_overdue_tasks !== false
  );
  setCheckedValue(
    "notifyRenewals",
    crmSettings.notify_renewals !== false
  );
  setCheckedValue(
    "notifyGoogleSyncErrors",
    crmSettings.notify_google_sync_errors !== false
  );

  setInputValue(
    "customAppointmentTypes",
    crmSettings.custom_appointment_types
  );
  setInputValue(
    "customTaskPriorities",
    crmSettings.custom_task_priorities
  );
  setInputValue(
    "customLeadSources",
    crmSettings.custom_lead_sources
  );
  setInputValue(
    "customCarriers",
    crmSettings.custom_carriers
  );

  updateSettingsSummaries();

}

async function saveCrmSettings(patch, message){

  const res = await fetch(
    "/.netlify/functions/update-crm-settings",
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        agent_id:getAgentId(),
        ...patch
      })
    }
  );

  const data = await res.json();

  if(!data.success){
    alert(data.error || "Unable to save settings.");
    return false;
  }

  crmSettings =
    data.settings || crmSettings;

  showSettingsSaved(message);

  return true;

}

async function saveAgentProfile(){

  const agentName =
    document.getElementById("agentNameInput").value;

  const saved = await saveCrmSettings(
    {
      agent_name:agentName,
      agent_email:document.getElementById("agentEmailInput").value,
      agent_phone:document.getElementById("agentPhoneInput").value,
      agency_name:document.getElementById("agencyNameInput").value,
      npn:document.getElementById("npnInput").value,
      license_number:document.getElementById("licenseNumberInput").value,
      timezone:document.getElementById("timezoneInput").value
    },
    "Agent profile saved."
  );

  if(saved && agentName){
    sessionStorage.setItem("agentName", agentName);
  }

}

async function saveCalendarDefaults(){

  await saveCrmSettings(
    {
      default_appointment_type:
        document.getElementById("defaultAppointmentType").value,
      default_appointment_duration:
        document.getElementById("defaultAppointmentDuration").value,
      default_appointment_location:
        document.getElementById("defaultAppointmentLocation").value,
      sync_notes_to_google:
        document.getElementById("syncNotesToGoogle").checked
    },
    "Calendar defaults saved."
  );

  updateSettingsSummaries();

}

async function saveTaskDefaults(){

  await saveCrmSettings(
    {
      default_task_priority:
        document.getElementById("defaultTaskPriority").value,
      default_task_due_days:
        document.getElementById("defaultTaskDueDays").value,
      show_completed_tasks:
        document.getElementById("showCompletedTasks").checked
    },
    "Task defaults saved."
  );

  updateSettingsSummaries();

}

async function saveClientDefaults(){

  await saveCrmSettings(
    {
      default_client_status:
        document.getElementById("defaultClientStatus").value,
      renewal_reminder_days:
        document.getElementById("renewalReminderDays").value
    },
    "Client defaults saved."
  );

}

async function saveNotificationPreferences(){

  await saveCrmSettings(
    {
      notify_appointments:
        document.getElementById("notifyAppointments").checked,
      notify_overdue_tasks:
        document.getElementById("notifyOverdueTasks").checked,
      notify_renewals:
        document.getElementById("notifyRenewals").checked,
      notify_google_sync_errors:
        document.getElementById("notifyGoogleSyncErrors").checked
    },
    "Notification preferences saved."
  );

}

async function saveCrmCustomization(){

  await saveCrmSettings(
    {
      custom_appointment_types:
        document.getElementById("customAppointmentTypes").value,
      custom_task_priorities:
        document.getElementById("customTaskPriorities").value,
      custom_lead_sources:
        document.getElementById("customLeadSources").value,
      custom_carriers:
        document.getElementById("customCarriers").value
    },
    "CRM customization saved."
  );

}

function convertRowsToCsv(rows){

  if(!rows.length){
    return "";
  }

  const columns =
    Array.from(
      rows.reduce((set, row) => {

        Object.keys(row).forEach(key =>
          set.add(key)
        );

        return set;

      }, new Set())
    );

  const escapeCell = value => {

    if(value === null || value === undefined){
      return "";
    }

    return `"${String(value).replace(/"/g, '""')}"`;

  };

  return [
    columns.join(","),
    ...rows.map(row =>
      columns.map(column =>
        escapeCell(row[column])
      ).join(",")
    )
  ].join("\n");

}

function downloadCsv(filename, csv){

  const blob =
    new Blob([csv], {
      type:"text/csv;charset=utf-8;"
    });

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);

}

async function exportCrmData(type){

  const agent_id =
    getAgentId();

  const endpoints = {
    clients:`/.netlify/functions/get-crm-clients?agent_id=${agent_id}`,
    tasks:`/.netlify/functions/get-crm-tasks?agent_id=${agent_id}`,
    appointments:`/.netlify/functions/get-crm-appointments?agent_id=${agent_id}`
  };

  const res =
    await fetch(endpoints[type]);

  const data =
    await res.json();

  if(!data.success){
    alert("Unable to export CRM data.");
    return;
  }

  const rows =
    data[type] || [];

  downloadCsv(
    `vitalink-${type}.csv`,
    convertRowsToCsv(rows)
  );

}

[
  "defaultAppointmentType",
  "defaultAppointmentDuration",
  "defaultAppointmentLocation",
  "defaultTaskPriority",
  "defaultTaskDueDays"
].forEach(id => {

  document.getElementById(id)
    ?.addEventListener("input", updateSettingsSummaries);

  document.getElementById(id)
    ?.addEventListener("change", updateSettingsSummaries);

});

async function loadGoogleCalendarStatus(){

  const agent_id =
    getAgentId();

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
    getAgentId();

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
        agent_id:getAgentId()
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
    getAgentId();

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
        agent_id:getAgentId(),
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

loadCrmSettings();
loadGoogleCalendarStatus();
