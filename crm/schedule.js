if(!sessionStorage.getItem("crm_uuid")){

  window.location = "login.html";

}

let appointments = [];

let currentDate = new Date();

let selectedDate = new Date();

/* =========================================
   LOAD APPOINTMENTS
========================================= */

async function loadAppointments(){

  const agent_id =
    sessionStorage.getItem("crm_uuid");

  const res = await fetch(
    `/.netlify/functions/get-crm-appointments?agent_id=${agent_id}`
  );

  const data = await res.json();

  if(!data.success){

    alert("Failed to load appointments");
    return;

  }

  appointments = data.appointments || [];

  renderCalendar();

  renderDailySchedule();

  updateMetrics();

}

/* =========================================
   CALENDAR
========================================= */

function renderCalendar(){

  const monthNames = [

    "January","February","March",
    "April","May","June",
    "July","August","September",
    "October","November","December"

  ];

  const year =
    currentDate.getFullYear();

  const month =
    currentDate.getMonth();

  const firstDay =
    new Date(year, month, 1).getDay();

  const daysInMonth =
    new Date(year, month + 1, 0).getDate();

  document.getElementById(
    "calendarTitle"
  ).innerText =
    `${monthNames[month]} ${year}`;

  const tbody =
    document.getElementById("calendarBody");

  tbody.innerHTML = "";

  let date = 1;

  for(let i = 0; i < 6; i++){

    let row = "<tr>";

    for(let j = 0; j < 7; j++){

      if(i === 0 && j < firstDay){

        row += "<td></td>";

      }else if(date > daysInMonth){

        row += "<td></td>";

      }else{

        const dateString =
          `${year}-${String(month + 1).padStart(2,"0")}-${String(date).padStart(2,"0")}`;

        const hasEvent =
          appointments.some(a =>
            a.appointment_date === dateString
          );

        const isSelected =
          selectedDate.toDateString() ===
          new Date(dateString).toDateString();

        row += `

          <td
            class="
              calendar-day
              ${hasEvent ? "has-event" : ""}
              ${isSelected ? "selected-day" : ""}
            "
            onclick="selectDate('${dateString}')"
          >
            ${date}
          </td>

        `;

        date++;

      }

    }

    row += "</tr>";

    tbody.innerHTML += row;

  }

}

/* =========================================
   SELECT DATE
========================================= */

function selectDate(dateString){

  selectedDate =
    new Date(dateString);

  renderCalendar();

  renderDailySchedule();

}

/* =========================================
   DAILY SCHEDULE
========================================= */

function renderDailySchedule(){

  const container =
    document.getElementById(
      "dailySchedule"
    );

  const selected =
    selectedDate.toISOString().split("T")[0];

  const filtered =
    appointments.filter(a =>
      a.appointment_date === selected
    );

  container.innerHTML = "";

  if(filtered.length === 0){

    container.innerHTML = `

      <div class="timeline-slot">
        No appointments scheduled.
      </div>

    `;

    return;

  }

  filtered.forEach(appt => {

    const clientName = `
      ${appt.first_name || ""}
      ${appt.last_name || ""}
    `;

    container.innerHTML += `

      <div class="timeline-row">

        <div class="timeline-time">
          ${appt.appointment_time || ""}
        </div>

        <div class="timeline-slot active-slot">

          <div class="slot-title">
            ${appt.appointment_type || ""}
          </div>

          <div class="slot-sub">
            ${clientName}
          </div>

          <div
            class="slot-sub"
            style="margin-top:6px;"
          >
            ${appt.notes || ""}
          </div>

        </div>

      </div>

    `;

  });

}

/* =========================================
   METRICS
========================================= */

function updateMetrics(){

  const today =
    new Date().toISOString().split("T")[0];

  const todayCount =
    appointments.filter(a =>
      a.appointment_date === today
    ).length;

  document.getElementById(
    "appointmentsToday"
  ).innerText =
    todayCount;

  document.getElementById(
    "upcomingAppointments"
  ).innerText =
    appointments.length;

  const annuals =
    appointments.filter(a =>
      a.appointment_type ===
      "Annual Review"
    ).length;

  document.getElementById(
    "weeklyReviews"
  ).innerText =
    annuals;

}

/* =========================================
   APPOINTMENT MODAL
========================================= */

function openAppointmentModal(){

  document.getElementById(
    "appointmentModal"
  ).style.display = "flex";

}

function closeAppointmentModal(){

  document.getElementById(
    "appointmentModal"
  ).style.display = "none";

}

/* =========================================
   SAVE APPOINTMENT
========================================= */

async function saveAppointment(){

  const appointment = {

    agent_id:
      sessionStorage.getItem("crm_uuid"),

    client_id:
      document.getElementById(
        "appointmentClientId"
      ).value,

    appointment_type:
      document.getElementById(
        "appointmentType"
      ).value,

    appointment_date:
      document.getElementById(
        "appointmentDate"
      ).value,

    appointment_time:
      document.getElementById(
        "appointmentTime"
      ).value,

    location:
      document.getElementById(
        "appointmentLocation"
      ).value,

    notes:
      document.getElementById(
        "appointmentNotes"
      ).value

  };

  const res = await fetch(

    "/.netlify/functions/create-crm-appointment",

    {
      method:"POST",

      headers:{
        "Content-Type":"application/json"
      },

      body:JSON.stringify(appointment)
    }

  );

  const data = await res.json();

  if(!data.success){

    alert("Failed to save appointment");
    return;

  }

  closeAppointmentModal();

  loadAppointments();

}

loadAppointments();