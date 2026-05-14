if(!sessionStorage.getItem("crm_uuid")){

  window.location = "login.html";

}

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

  const container =
    document.getElementById("appointmentsGrid");

  container.innerHTML = "";

  data.appointments.forEach(appt => {

    const clientName = `
      ${appt.first_name || ""}
      ${appt.last_name || ""}
    `;

    const location = `
      ${appt.city || ""}
      ${appt.state || ""}
    `;

    container.innerHTML += `

      <div class="renewal-card">

        <div class="card-top">

          <div>

            <div class="client-name">
              ${clientName}
            </div>

            <div class="client-sub">
              ${appt.appointment_type || ""}
              •
              ${location}
            </div>

          </div>

          <span class="badge ready">
            ${formatDate(appt.appointment_date)}
          </span>

        </div>

        <div class="info-row">
          <div class="label">Time</div>
          <div class="value">
            ${appt.appointment_time || ""}
          </div>
        </div>

        <div class="info-row">
          <div class="label">Location</div>
          <div class="value">
            ${appt.location || ""}
          </div>
        </div>

        <div class="info-row">
          <div class="label">Notes</div>
          <div class="value">
            ${appt.notes || ""}
          </div>
        </div>

        <div class="card-actions">

          <button
            onclick="viewClient('${appt.client_id}')"
          >
            View Client
          </button>

          <button class="secondary">
            Complete
          </button>

        </div>

      </div>

    `;

  });

}

function viewClient(id){

  window.location.href =
    `client-view.html?id=${id}`;

}

loadAppointments();