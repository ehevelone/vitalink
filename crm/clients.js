if(!sessionStorage.getItem("crm_uuid")){

  window.location = "login.html";

}

let clients = [];
let appointments = [];
let crmSettings = {};
let importRows = [];

function normalizeClientStatus(status){

  if(status === "Active"){
    return "Client";
  }

  if(status === "Follow-Up"){
    return "Follow Up";
  }

  if(status === "Prospect - Cold" ||
    status === "Prospect - Warm" ||
    status === "Prospect - Hot"){
    return "Prospect";
  }

  return status || "Client";

}

function getClientStatusClass(status){

  return normalizeClientStatus(status)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

}

function getPushHealth(client){

  return client.push_health || "No Device";

}

function getPushHealthClass(client){

  return getPushHealth(client)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

}

function clientRequestHeaders(extraHeaders = {}){

  const headers = {
    ...extraHeaders
  };

  if(typeof getCrmSessionHeaders === "function"){
    return {
      ...headers,
      ...getCrmSessionHeaders()
    };
  }

  const token =
    sessionStorage.getItem("agentSessionToken") || "";

  const crmAgentId =
    sessionStorage.getItem("crm_uuid") || "";

  if(token){
    headers["x-agent-session"] = token;
  }

  if(crmAgentId){
    headers["x-crm-agent-id"] = crmAgentId;
  }

  return headers;

}

function formatPhone(phone){

  if(!phone) return "";

  let digits =
    phone.replace(/\D/g,"");

  if(digits.length === 11 && digits.startsWith("1")){
    digits = digits.slice(1);
  }

  if(digits.length !== 10){
    return phone;
  }

  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;

}

function openClientModal(){

  document.getElementById("clientStatus").value =
    crmSettings.default_client_status || "Client";

  document.getElementById(
    "clientModal"
  ).style.display = "flex";

}

function closeClientModal(){

  document.getElementById(
    "clientModal"
  ).style.display = "none";

}

async function saveClient(){

  const client = {

    first_name:
      document.getElementById("firstName").value,

    last_name:
      document.getElementById("lastName").value,

    dob:
      document.getElementById("dob").value,

    mobile_phone:
      normalizePhoneForStorage(document.getElementById("mobilePhone").value),

    landline_phone:
      normalizePhoneForStorage(document.getElementById("landlinePhone").value),

    email:
      document.getElementById("email").value,

    address:
      document.getElementById("address").value,

    city:
      document.getElementById("city").value,

    state:
      document.getElementById("state").value,

    zip:
      document.getElementById("zip").value,

    status:
      document.getElementById("clientStatus").value ||
      crmSettings.default_client_status ||
      "Client"

  };

  client.agent_id =
    sessionStorage.getItem("crm_uuid");

  const res = await fetch(
    "/.netlify/functions/create-crm-client",
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify(client)
    }
  );

  const data = await res.json();

  if(!data.success){

    alert("Failed to save client");

    return;

  }

  alert("Client saved successfully.");

  document.getElementById("firstName").value = "";
  document.getElementById("lastName").value = "";
  document.getElementById("dob").value = "";
  document.getElementById("mobilePhone").value = "";
  document.getElementById("landlinePhone").value = "";
  document.getElementById("email").value = "";
  document.getElementById("address").value = "";
  document.getElementById("city").value = "";
  document.getElementById("state").value = "";
  document.getElementById("zip").value = "";
  document.getElementById("clientStatus").value =
    crmSettings.default_client_status || "Client";

  closeClientModal();

  loadClients();

}

function normalizePhoneForStorage(phone){

  if(!phone) return "";

  let digits =
    String(phone).replace(/\D/g,"");

  if(digits.length === 11 && digits.startsWith("1")){
    digits = digits.slice(1);
  }

  return digits.length === 10 ? digits : String(phone).trim();

}

async function importClients(){

  if(importRows.length === 0){
    alert("Choose a CSV file first.");
    return;
  }

  const button =
    document.getElementById("importClientsBtn");

  button.disabled = true;
  button.innerText = "Importing...";

  const res = await fetch(
    "/.netlify/functions/import-crm-clients",
    {
      method:"POST",
      headers:clientRequestHeaders({
        "Content-Type":"application/json"
      }),
      body:JSON.stringify({
        agent_id:sessionStorage.getItem("crm_uuid"),
        default_status:crmSettings.default_client_status || "Client",
        clients:importRows
      })
    }
  );

  const data = await res.json();

  button.disabled = false;
  button.innerText = "Import Clients";

  if(!data.success){

    alert(data.error || "Failed to import clients.");
    return;

  }

  document.getElementById("importSummary").innerText =
    `Imported ${data.imported}. Skipped ${data.skipped}. Duplicates ${data.duplicates}.`;

  document.getElementById("importClientsBtn").style.display = "none";

  loadClients();

}

async function syncVitalinkClients(){

  const button =
    document.getElementById("syncVitalinkBtn");

  const agentId =
    sessionStorage.getItem("crm_uuid");

  if(!agentId){
    alert("Please log in again before syncing.");
    return;
  }

  button.disabled = true;
  button.innerText = "Syncing...";

  try{

    const res = await fetch(
      "/.netlify/functions/sync-vitalink-clients",
      {
        method:"POST",
        headers:clientRequestHeaders({
          "Content-Type":"application/json"
        }),
        body:JSON.stringify({
          agent_id:agentId,
          default_status:crmSettings.default_client_status || "Client"
        })
      }
    );

    const data = await res.json();

    if(!data.success){
      alert(data.error || "Failed to sync VitaLink clients.");
      return;
    }

    alert(
      `VitaLink sync complete. Created ${data.created}. Updated ${data.updated}. Skipped ${data.skipped}.`
    );

    loadClients();

  }catch(err){

    console.error(err);
    alert("Failed to sync VitaLink clients.");

  }finally{

    button.disabled = false;
    button.innerText = "Sync VitaLink";

  }

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

function exportClientsCsv(){

  downloadCsv(
    "vitalink-clients.csv",
    convertRowsToCsv(clients)
  );

}

async function loadClients(){

  const agent_id =
    sessionStorage.getItem("crm_uuid");

  const [
    clientsRes,
    appointmentsRes
  ] = await Promise.all([

    fetch(
      `/.netlify/functions/get-crm-clients?agent_id=${agent_id}`,
      {
        headers:clientRequestHeaders()
      }
    ),

    fetch(
      `/.netlify/functions/get-crm-appointments?agent_id=${agent_id}`,
      {
        headers:clientRequestHeaders()
      }
    )

  ]);

  const data = await clientsRes.json();
  const appointmentsData = await appointmentsRes.json();

  if(!data.success){

    alert(data.error || "Failed to load clients");

    return;

  }

  clients =
    data.clients || [];

  appointments =
    appointmentsData.success ? appointmentsData.appointments || [] : [];

  renderClients();

}

function openImportModal(){

  importRows = [];

  document.getElementById("clientImportFile").value = "";
  document.getElementById("importSummary").innerText = "";
  document.getElementById("importPreviewTable").innerHTML = "";
  document.getElementById("importPreviewCard").style.display = "none";
  document.getElementById("importClientsBtn").style.display = "none";
  document.getElementById("importModal").style.display = "flex";

}

function closeImportModal(){

  document.getElementById("importModal").style.display = "none";

}

function parseCsv(text){

  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for(let i = 0; i < text.length; i++){

    const char = text[i];
    const next = text[i + 1];

    if(char === '"' && inQuotes && next === '"'){
      value += '"';
      i += 1;
      continue;
    }

    if(char === '"'){
      inQuotes = !inQuotes;
      continue;
    }

    if(char === "," && !inQuotes){
      row.push(value);
      value = "";
      continue;
    }

    if((char === "\n" || char === "\r") && !inQuotes){

      if(char === "\r" && next === "\n"){
        i += 1;
      }

      row.push(value);

      if(row.some(cell => cell.trim())){
        rows.push(row);
      }

      row = [];
      value = "";
      continue;

    }

    value += char;

  }

  row.push(value);

  if(row.some(cell => cell.trim())){
    rows.push(row);
  }

  return rows;

}

function normalizeHeader(value){

  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

}

function getImportValue(row, aliases){

  for(const alias of aliases){

    const value =
      row[alias];

    if(value){
      return value.trim();
    }

  }

  return "";

}

function splitFullName(name){

  const parts =
    String(name || "").trim().split(/\s+/);

  if(parts.length <= 1){
    return {
      first_name:parts[0] || "",
      last_name:""
    };
  }

  return {
    first_name:parts.slice(0, -1).join(" "),
    last_name:parts[parts.length - 1]
  };

}

function mapImportRow(row){

  const fullName =
    getImportValue(row, [
      "name",
      "fullname",
      "clientname",
      "membername"
    ]);

  const splitName =
    splitFullName(fullName);

  return {
    first_name:
      getImportValue(row, [
        "firstname",
        "first"
      ]) || splitName.first_name,
    last_name:
      getImportValue(row, [
        "lastname",
        "last"
      ]) || splitName.last_name,
    dob:
      getImportValue(row, [
        "dob",
        "dateofbirth",
        "birthdate"
      ]),
    mobile_phone:
      normalizePhoneForStorage(getImportValue(row, [
        "mobilephone",
        "mobile",
        "cellphone",
        "cell",
        "phone",
        "primaryphone"
      ])),
    landline_phone:
      normalizePhoneForStorage(getImportValue(row, [
        "landlinephone",
        "homephone",
        "secondaryphone"
      ])),
    email:
      getImportValue(row, [
        "email",
        "emailaddress"
      ]),
    address:
      getImportValue(row, [
        "address",
        "street",
        "streetaddress",
        "address1"
      ]),
    city:
      getImportValue(row, [
        "city"
      ]),
    state:
      getImportValue(row, [
        "state"
      ]),
    zip:
      getImportValue(row, [
        "zip",
        "zipcode",
        "postalcode"
      ]),
    status:
      normalizeClientStatus(getImportValue(row, [
        "status",
        "clientstatus"
      ]) || crmSettings.default_client_status || "Client")
  };

}

function renderImportPreview(){

  const table =
    document.getElementById("importPreviewTable");

  table.innerHTML = "";

  importRows.slice(0, 8).forEach(client => {

    table.innerHTML += `
      <tr>
        <td>${client.first_name || ""} ${client.last_name || ""}</td>
        <td>${formatPhone(client.mobile_phone)}</td>
        <td>${client.email || ""}</td>
        <td>${client.city || ""}</td>
        <td>${normalizeClientStatus(client.status)}</td>
      </tr>
    `;

  });

  document.getElementById("importPreviewCard").style.display =
    importRows.length ? "block" : "none";

  document.getElementById("importClientsBtn").style.display =
    importRows.length ? "block" : "none";

  document.getElementById("importSummary").innerText =
    importRows.length
      ? `${importRows.length} client row${importRows.length === 1 ? "" : "s"} ready to import. Previewing the first ${Math.min(importRows.length, 8)}.`
      : "No client rows found in this file.";

}

function handleImportFile(){

  const file =
    document.getElementById("clientImportFile").files[0];

  if(!file){
    return;
  }

  const reader =
    new FileReader();

  reader.onload = () => {

    const parsed =
      parseCsv(reader.result || "");

    const headers =
      (parsed[0] || []).map(normalizeHeader);

    importRows =
      parsed.slice(1)
        .map(row => {

          const keyed = {};

          headers.forEach((header, index) => {
            keyed[header] = String(row[index] || "");
          });

          return mapImportRow(keyed);

        })
        .filter(client =>
          client.first_name ||
          client.last_name ||
          client.email ||
          client.mobile_phone
        );

    renderImportPreview();

  };

  reader.readAsText(file);

}

async function loadCrmSettings(){

  const agent_id =
    sessionStorage.getItem("crm_uuid");

  const res = await fetch(
    `/.netlify/functions/get-crm-settings?agent_id=${agent_id}`,
    {
      headers:clientRequestHeaders()
    }
  );

  const data = await res.json();

  if(data.success){
    crmSettings = data.settings || {};
  }

}

function getClientAppointments(clientId){

  return appointments.filter(appointment =>
    String(appointment.client_id) === String(clientId)
  );

}

function getScheduleLabel(clientId){

  const clientAppointments =
    getClientAppointments(clientId);

  if(clientAppointments.length === 0){
    return "No Schedule";
  }

  const nextAppointment =
    clientAppointments
      .filter(appointment =>
        new Date(appointment.appointment_date) >= new Date()
      )
      .sort((a, b) =>
        new Date(a.appointment_date) - new Date(b.appointment_date)
      )[0];

  if(!nextAppointment){
    return "No Upcoming";
  }

  return formatDate(nextAppointment.appointment_date);

}

function matchesScheduleFilter(client, filter){

  if(!filter || filter === "All Schedules"){
    return true;
  }

  const clientAppointments =
    getClientAppointments(client.id);

  if(filter === "No Schedule"){
    return clientAppointments.length === 0;
  }

  const today =
    new Date();

  today.setHours(0,0,0,0);

  const weekEnd =
    new Date(today);

  weekEnd.setDate(today.getDate() + 7);

  const monthEnd =
    new Date(today);

  monthEnd.setMonth(today.getMonth() + 1);

  return clientAppointments.some(appointment => {

    const date =
      new Date(
        `${String(appointment.appointment_date).split("T")[0]}T00:00:00`
      );

    if(filter === "Today"){
      return date.getTime() === today.getTime();
    }

    if(filter === "This Week"){
      return date >= today && date <= weekEnd;
    }

    if(filter === "This Month"){
      return date >= today && date <= monthEnd;
    }

    return true;

  });

}

function renderClients(){

  const search =
    (document.getElementById("clientSearch")?.value || "").toLowerCase();

  const statusFilter =
    document.getElementById("clientStatusFilter")?.value || "";

  const scheduleFilter =
    document.getElementById("clientScheduleFilter")?.value || "";

  const table =
    document.getElementById("clientsTable");

  table.innerHTML = "";

  const filteredClients = clients.filter(client => {

    const name =
      `${client.first_name || ""} ${client.last_name || ""}`.toLowerCase();

    const matchesSearch =
      !search ||
      name.includes(search) ||
      (client.email || "").toLowerCase().includes(search) ||
      (client.mobile_phone || "").toLowerCase().includes(search) ||
      (client.city || "").toLowerCase().includes(search);

    const clientStatus =
      normalizeClientStatus(client.status);

    const matchesStatus =
      !statusFilter ||
      statusFilter === "All Statuses" ||
      clientStatus === statusFilter;

    return matchesSearch &&
      matchesStatus &&
      matchesScheduleFilter(client, scheduleFilter);

  });

  if(filteredClients.length === 0){

    table.innerHTML = `
      <tr>
        <td colspan="7">
          No clients found.
        </td>
      </tr>
    `;

    return;

  }

  filteredClients.forEach(client => {

    table.innerHTML += `

      <tr>

        <td>

          <div class="client-name">
            ${client.first_name || ""}
            ${client.last_name || ""}
          </div>

          <div class="client-meta">
            ${client.city || ""},
            ${client.state || ""}
          </div>

        </td>

        <td>
          ${formatPhone(client.mobile_phone)}
        </td>

        <td>
          ${client.email || ""}
        </td>

        <td>

          <span class="status ${getClientStatusClass(client.status)}">
            ${normalizeClientStatus(client.status)}
          </span>

        </td>

        <td>

          <span class="status push-${getPushHealthClass(client)}">
            ${getPushHealth(client)}
          </span>

        </td>

        <td>
          ${getScheduleLabel(client.id)}
        </td>

        <td>

          <span class="tag">
            Client
          </span>

        </td>

        <td>

          <button
            class="secondary"
            onclick="viewClient('${client.id}')"
          >
            View
          </button>

        </td>

      </tr>

    `;

  });

}

/* =========================================
   MINI WEEK CALENDAR
========================================= */

async function loadMiniWeek(){

  const container =
    document.getElementById(
      "miniWeekDays"
    );

  if(!container){
    return;
  }

  const agent_id =
    sessionStorage.getItem("crm_uuid");

  const res = await fetch(
    `/.netlify/functions/get-crm-appointments?agent_id=${agent_id}`,
    {
      headers:clientRequestHeaders()
    }
  );

  const data = await res.json();

  if(!data.success){
    return;
  }

  const appointments =
    data.appointments || [];

  const today = new Date();

  const start =
    new Date(today);

  start.setDate(
    today.getDate() - today.getDay()
  );

  const dayNames = [
    "Sun","Mon","Tue",
    "Wed","Thu","Fri","Sat"
  ];

  container.innerHTML = "";

  for(let i = 0; i < 7; i++){

    const current =
      new Date(start);

    current.setDate(
      start.getDate() + i
    );

    const dateKey =
      current.getFullYear() +
      "-" +
      String(current.getMonth() + 1)
        .padStart(2,"0") +
      "-" +
      String(current.getDate())
        .padStart(2,"0");

    const dayAppointments =
      appointments.filter(a =>
        String(a.appointment_date)
          .split("T")[0] === dateKey
      );

    const isToday =
      current.toDateString() ===
      today.toDateString();

    container.innerHTML += `

      <div class="
        mini-day
        ${isToday ? "active" : ""}
      ">

        <div class="mini-day-name">
          ${dayNames[i]}
        </div>

    
        <div class="mini-date">
          ${current.getDate()}
        </div>

        <div class="mini-count">

          ${dayAppointments.length}
          appt${dayAppointments.length !== 1 ? "s" : ""}

        </div>

      </div>

    `;

  }

}

function viewClient(id){

  window.location.href =
    `client-view.html?id=${id}`;

}

async function deleteClient(id){

  const confirmed = confirm(
    "Remove this client?"
  );

  if(!confirmed){
    return;
  }

  const res = await fetch(
    "/.netlify/functions/delete-crm-client",
    {
      method:"POST",
      headers:clientRequestHeaders({
        "Content-Type":"application/json"
      }),
      body:JSON.stringify({ id })
    }
  );

  const data = await res.json();

  if(!data.success){

    alert("Failed to remove client.");
    return;

  }

  loadClients();

}

window.onclick = function(event){

  const modal =
    document.getElementById("clientModal");

  if(event.target === modal){

    closeClientModal();

  }

  const importModal =
    document.getElementById("importModal");

  if(event.target === importModal){

    closeImportModal();

  }

}

document.getElementById("clientSearch")
  ?.addEventListener("input", renderClients);

document.getElementById("clientStatusFilter")
  ?.addEventListener("change", renderClients);

document.getElementById("clientScheduleFilter")
  ?.addEventListener("change", renderClients);

loadCrmSettings().then(() => {
  loadClients();
});

loadMiniWeek();
