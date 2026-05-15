if(!sessionStorage.getItem("crm_uuid")){

  window.location = "login.html";

}

let clients = [];
let appointments = [];

function formatPhone(phone){

  if(!phone) return "";

  const digits =
    phone.replace(/\D/g,"");

  if(digits.length !== 10){
    return phone;
  }

  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;

}

function openClientModal(){

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
      document.getElementById("mobilePhone").value,

    landline_phone:
      document.getElementById("landlinePhone").value,

    email:
      document.getElementById("email").value,

    address:
      document.getElementById("address").value,

    city:
      document.getElementById("city").value,

    state:
      document.getElementById("state").value,

    zip:
      document.getElementById("zip").value

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

  closeClientModal();

  loadClients();

}

async function loadClients(){

  const agent_id =
    sessionStorage.getItem("crm_uuid");

  const [
    clientsRes,
    appointmentsRes
  ] = await Promise.all([

    fetch(
      `/.netlify/functions/get-crm-clients?agent_id=${agent_id}`
    ),

    fetch(
      `/.netlify/functions/get-crm-appointments?agent_id=${agent_id}`
    )

  ]);

  const data = await clientsRes.json();
  const appointmentsData = await appointmentsRes.json();

  if(!data.success){

    alert("Failed to load clients");

    return;

  }

  clients =
    data.clients || [];

  appointments =
    appointmentsData.success ? appointmentsData.appointments || [] : [];

  renderClients();

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

    const matchesStatus =
      !statusFilter ||
      statusFilter === "All Statuses" ||
      statusFilter === "Active";

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

          <span class="status active">
            Active
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

          <div class="row-options">

            <button
              class="options-btn secondary"
              onclick="toggleClientOptions(event, '${client.id}')"
            >
              ...
            </button>

            <div
              class="options-menu"
              id="clientOptions-${client.id}"
            >

              <button onclick="viewClient('${client.id}')">
                View
              </button>

              <button onclick="newAppointmentForClient('${client.id}')">
                New Appointment
              </button>

              <button onclick="followUpForClient('${client.id}')">
                Follow-Up
              </button>

              <button onclick="taskForClient('${client.id}')">
                Task
              </button>

              <button onclick="deleteClient('${client.id}')">
                Remove
              </button>

            </div>

          </div>

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
    `/.netlify/functions/get-crm-appointments?agent_id=${agent_id}`
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

function newAppointmentForClient(id){

  window.location.href =
    `schedule.html?client_id=${id}&new_appointment=1`;

}

function followUpForClient(id){

  window.location.href =
    `schedule.html?client_id=${id}&new_appointment=1&type=Follow-Up`;

}

function taskForClient(id){

  window.location.href =
    `tasks.html?client_id=${id}`;

}

function toggleClientOptions(event, id){

  event.stopPropagation();

  document
    .querySelectorAll(".options-menu.open")
    .forEach(menu => {

      if(menu.id !== `clientOptions-${id}`){
        menu.classList.remove("open");
      }

    });

  document
    .getElementById(`clientOptions-${id}`)
    .classList.toggle("open");

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
      headers:{
        "Content-Type":"application/json"
      },
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

  document
    .querySelectorAll(".options-menu.open")
    .forEach(menu => {
      menu.classList.remove("open");
    });

}

document.getElementById("clientSearch")
  ?.addEventListener("input", renderClients);

document.getElementById("clientStatusFilter")
  ?.addEventListener("change", renderClients);

document.getElementById("clientScheduleFilter")
  ?.addEventListener("change", renderClients);

loadClients();

loadMiniWeek();
