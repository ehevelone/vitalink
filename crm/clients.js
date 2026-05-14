if(!sessionStorage.getItem("crm_uuid")){

  window.location = "login.html";

}

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

  const res = await fetch(
    `/.netlify/functions/get-crm-clients?agent_id=${agent_id}`
  );

  const data = await res.json();

  if(!data.success){

    alert("Failed to load clients");

    return;

  }

  const table =
    document.getElementById("clientsTable");

  table.innerHTML = "";

  data.clients.forEach(client => {

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
          No Schedule
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
              ⋯
            </button>

            <div
              class="options-menu"
              id="clientOptions-${client.id}"
            >

              <button onclick="newAppointmentForClient('${client.id}')">
                New Appointment
              </button>

              <button onclick="followUpForClient('${client.id}')">
                Follow-Up
              </button>

              <button
                onclick="taskForClient('${client.id}')"
              >
                Task
              </button>

            </div>

          </div>

        </td>

      </tr>

    `;

  });

}

function sendClientNotification(){

  alert("Client notifications are not connected yet.");

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

loadClients();

loadMiniWeek();
