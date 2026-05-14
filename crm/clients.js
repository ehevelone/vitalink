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

          <button
            onclick="viewClient('${client.id}')"
          >
            View
          </button>

           <button
            class="danger-btn"
            onclick="deleteClient('${client.id}')"
            style="
              margin-left:8px;
              background:#ef4444;
              color:#fff;
            "
          >
            Remove
          </button>

        </td>

      </tr>

    `;

  });

}

function viewClient(id){

  window.location.href =
    `client-view.html?id=${id}`;

}

window.onclick = function(event){

  const modal =
    document.getElementById("clientModal");

  if(event.target === modal){

    closeClientModal();

  }

}

loadClients();

