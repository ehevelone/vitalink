if(!sessionStorage.getItem("crm_uuid")){

  window.location = "login.html";

}

let appointments = [];

let currentDate = new Date();

let selectedDate = new Date();

function formatTime(time){

  if(!time) return "";

  const parts = time.split(":");

  let hour = Number(parts[0]);

  const minutes = parts[1];

  const suffix =
    hour >= 12 ? "PM" : "AM";

  hour = hour % 12;

  if(hour === 0){
    hour = 12;
  }

  return `${hour}:${minutes} ${suffix}`;

}

function getAppointmentClass(type){

  switch(type){

    case "New Appointment":
      return "appointment-new";

    case "Annual Review":
      return "appointment-annual";

    case "Follow-Up":
      return "appointment-followup";

    case "Enrollment Meeting":
      return "appointment-enrollment";

    case "T65 Consultation":
      return "appointment-t65";

    default:
      return "";

  }

}

function truncateText(text, maxLength){

  if(!text) return "";

  if(text.length <= maxLength){
    return text;
  }

  return text.substring(0, maxLength) + "...";

}

function toDateKey(value){

  if(!value) return "";

  if(value instanceof Date){

    return value.getFullYear() +
      "-" +
      String(value.getMonth() + 1).padStart(2,"0") +
      "-" +
      String(value.getDate()).padStart(2,"0");

  }

  return String(value).split("T")[0];

}

function selectedDateKey(){

  return selectedDate.getFullYear() +
    "-" +
    String(selectedDate.getMonth() + 1).padStart(2,"0") +
    "-" +
    String(selectedDate.getDate()).padStart(2,"0");

}

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

  renderUpcomingAppointments();

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

  for(let i = 0; i < 6 && date <= daysInMonth; i++){

    let row = "<tr>";

    for(let j = 0; j < 7; j++){

      if(i === 0 && j < firstDay){

        row += "<td></td>";

      }else if(date > daysInMonth){

        row += "<td></td>";

      }else{

        const dateString =
          `${year}-${String(month + 1).padStart(2,"0")}-${String(date).padStart(2,"0")}`;

        const dayAppointments =
          appointments.filter(a =>
            toDateKey(a.appointment_date) === dateString
          );

        const hasEvent =
          dayAppointments.length > 0;

        const isSelected =
          selectedDateKey() === dateString;

        const isToday =
          toDateKey(new Date()) === dateString;

        row += `

<td
  class="
    calendar-day
    ${hasEvent ? "has-event" : ""}
    ${isSelected ? "selected-day" : ""}
    ${isToday ? "today-day" : ""}
  "
  onclick="selectDate('${dateString}')"
>

  <div>
    ${date}
  </div>

  ${
    hasEvent
      ? `
        <div class="calendar-events">

          ${dayAppointments
            .slice(0,3)
            .map(appt => `

              <div class="calendar-event-dot">

                • ${formatTime(appt.appointment_time)}

              </div>

            `)
            .join("")}

        </div>
      `
      : ""
  }

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

    

  const parts = dateString.split("-");

  selectedDate = new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2])
  );

  renderCalendar();

  renderDailySchedule();

}

/* =========================================
   MONTH NAVIGATION
========================================= */

function previousMonth(){

  currentDate = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() - 1,
    1
  );

  selectedDate = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1
  );

  renderCalendar();

  renderDailySchedule();

}

function nextMonth(){

  currentDate = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    1
  );

  selectedDate = new Date(
  currentDate.getFullYear(),
  currentDate.getMonth(),
  1
);

  renderCalendar();
  renderDailySchedule();


}

function goToToday(){

  const now = new Date();

  currentDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  );

  selectedDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

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
  selectedDateKey();

  document.getElementById(
  "selectedDateLabel"
).innerText =
  selectedDate.toLocaleDateString(
    "en-US",
    {
      weekday:"long",
      month:"long",
      day:"numeric",
      year:"numeric"
    }
  );

const filtered =
  appointments
    .filter(a =>
      toDateKey(a.appointment_date) === selected
    )
    .sort((a,b) =>
      (a.appointment_time || "")
        .localeCompare(
          b.appointment_time || ""
        )
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
          ${formatTime(appt.appointment_time)}
        </div>

        <div
  class="
  timeline-slot
  active-slot
  ${getAppointmentClass(appt.appointment_type)}
"
  onclick="editAppointment('${appt.id}')"
  style="cursor:pointer;"
>

          <div class="slot-title">
            ${appt.appointment_type || ""}
          </div>

          <div class="slot-sub">
            ${clientName}
          </div>

          <div class="slot-sub">
           📍 ${appt.location || "No location"}
          </div>

          <div
            class="slot-sub"
            style="margin-top:6px;"
          >
            ${truncateText(appt.notes, 120)}
          </div>

          <div
  style="
    margin-top:10px;
    display:flex;
    gap:8px;
  "
>

  <button
    onclick="
  event.stopPropagation();
  editAppointment('${appt.id}');
"
  >
    Edit
  </button>

  <button
    class="danger-btn"
    onclick="
  event.stopPropagation();
  deleteAppointment('${appt.id}');
"
  >
    Delete
  </button>

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
  toDateKey(new Date());

  const todayCount =
    appointments.filter(a =>
      toDateKey(a.appointment_date) === today
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

  if(!window.editingAppointmentId){

    document.getElementById(
      "appointmentClientId"
    ).value = "";

    document.getElementById(
      "appointmentType"
    ).value = "";

    document.getElementById(
      "appointmentDate"
    ).value =
      selectedDateKey();

    const now = new Date();

    const roundedMinutes =
      Math.round(now.getMinutes() / 15) * 15;

    if(roundedMinutes === 60){

      now.setHours(now.getHours() + 1);
      now.setMinutes(0);

    }else{

      now.setMinutes(roundedMinutes);

    }

    document.getElementById(
      "appointmentTime"
    ).value =
      String(now.getHours()).padStart(2,"0") +
      ":" +
      String(now.getMinutes()).padStart(2,"0");

    document.getElementById(
      "appointmentLocation"
    ).value = "";

    document.getElementById(
      "appointmentNotes"
    ).value = "";

  }

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

  const conflictingAppointment =
  appointments.find(a =>

    toDateKey(a.appointment_date) ===
      appointment.appointment_date &&

    a.appointment_time ===
      appointment.appointment_time &&

    a.id !== window.editingAppointmentId

  );

if(conflictingAppointment){

  const confirmed = confirm(
    "Another appointment already exists at this time. Continue anyway?"
  );

  if(!confirmed){
    return;
  }

}

const endpoint =
  window.editingAppointmentId
    ? "/.netlify/functions/update-crm-appointment"
    : "/.netlify/functions/create-crm-appointment";

if(window.editingAppointmentId){

  appointment.id =
    window.editingAppointmentId;

}

const res = await fetch(

  endpoint,

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

  if(data.google_sync_error){

    alert(
      "Appointment saved, but Google Calendar did not sync: " +
      data.google_sync_error
    );

  }else if(data.google_sync_status){

    if(data.google_event_link){

      const openEvent = confirm(
        "Appointment saved. Google Calendar event was created. Open it?"
      );

      if(openEvent){
        window.open(data.google_event_link, "_blank");
      }

    }else{

      alert(
        "Appointment saved. Google Calendar sync status: " +
        data.google_sync_status +
        "\nCalendar: " +
        (data.google_calendar_id || "unknown") +
        "\nEvent ID: " +
        (data.google_event_id || "none")
      );

    }

  }else{

    alert(
      "Appointment saved, but no Google Calendar sync response was returned."
    );

  }

  closeAppointmentModal();

  window.editingAppointmentId = null;

loadAppointments();

}

  /* =========================================
   LOAD CLIENTS
========================================= */

async function loadClientDropdown(){

  const agent_id =
    sessionStorage.getItem("crm_uuid");

  const res = await fetch(
    `/.netlify/functions/get-crm-clients?agent_id=${agent_id}`
  );

  const data = await res.json();

  if(!data.success){

    return;

  }

  const select =
    document.getElementById(
      "appointmentClientId"
    );

  select.innerHTML = `
    <option value="">
      Select Client
    </option>
  `;

  data.clients.forEach(client => {

    select.innerHTML += `

      <option value="${client.id}">

        ${client.first_name || ""}
        ${client.last_name || ""}

      </option>

    `;

  });

}

/* =========================================
   DELETE APPOINTMENT
========================================= */

async function deleteAppointment(id){

  const confirmed = confirm(
    "Delete this appointment?"
  );

  if(!confirmed){
    return;
  }

  const res = await fetch(

    "/.netlify/functions/delete-crm-appointment",

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

    alert("Failed to delete appointment");
    return;

  }

  loadAppointments();

}

/* =========================================
   EDIT APPOINTMENT
========================================= */

function editAppointment(id){

  const appt =
    appointments.find(a => a.id === id);

  if(!appt){
    return;
  }

  document.getElementById(
    "appointmentClientId"
  ).value =
    appt.client_id || "";

  document.getElementById(
    "appointmentType"
  ).value =
    appt.appointment_type || "";

  document.getElementById(
    "appointmentDate"
  ).value =
    toDateKey(appt.appointment_date);

  document.getElementById(
    "appointmentTime"
  ).value =
    appt.appointment_time || "";

  document.getElementById(
    "appointmentLocation"
  ).value =
    appt.location || "";

  document.getElementById(
    "appointmentNotes"
  ).value =
    appt.notes || "";

  window.editingAppointmentId =
    id;

  openAppointmentModal();

}

/* =========================================
   UPCOMING APPOINTMENTS
========================================= */

function renderUpcomingAppointments(){

  const container =
    document.getElementById(
      "upcomingAppointmentsList"
    );

  if(!container){
    return;
  }

  const upcoming =
    [...appointments]

      .sort((a,b) => {

        const aDate =
          new Date(
            `${toDateKey(a.appointment_date)}T${a.appointment_time || "00:00"}`
          );

        const bDate =
          new Date(
            `${toDateKey(b.appointment_date)}T${b.appointment_time || "00:00"}`
          );

        return aDate - bDate;

      })

      .slice(0,10);

  container.innerHTML = "";

  if(upcoming.length === 0){

    container.innerHTML = `
      <div class="client-sub">
        No upcoming appointments.
      </div>
    `;

    return;

  }

  upcoming.forEach(appt => {

    container.innerHTML += `

      <div class="timeline-row">

        <div class="timeline-time">
          ${formatTime(appt.appointment_time)}
        </div>

        <div
          class="
            timeline-slot
            ${getAppointmentClass(appt.appointment_type)}
          "
        >

          <div class="slot-title">
            ${appt.appointment_type || ""}
          </div>

          <div class="slot-sub">
            ${appt.first_name || ""}
            ${appt.last_name || ""}
          </div>

          <div class="slot-sub">

            ${toDateKey(appt.appointment_date)}

          </div>

        </div>

      </div>

    `;

  });

}

loadClientDropdown();

loadAppointments();
