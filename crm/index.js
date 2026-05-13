if(!sessionStorage.getItem("crm_uuid")){

  window.location = "login.html";

}

async function loadRecentClients(){

  const agent_id = sessionStorage.getItem("crm_uuid");

  const res = await fetch(
    `/.netlify/functions/get-crm-clients?agent_id=${agent_id}`
  );

  const data = await res.json();

  if(!data.success){
    return;
  }


  document.getElementById("totalClients").innerText =
  data.clients.length;
  document.getElementById("upcomingRenewals").innerText = "0";
document.getElementById("pendingFollowUps").innerText = "0";
document.getElementById("recentActivity").innerText = "0";
  const table = document.getElementById("recentClientsTable");

  table.innerHTML = "";

  data.clients.forEach(client => {

    table.innerHTML += `

      <tr>

        <td>
          ${client.first_name || ""} ${client.last_name || ""}
        </td>

        <td>
          ${client.mobile_phone || ""}
        </td>

        <td>
          <span class="status active">
            Active
          </span>
        </td>

        <td>
          --
        </td>

        <td>
          <button onclick="viewClient('${client.id}')">
            View
          </button>
        </td>

      </tr>

    `;

  });

}

function viewClient(id){

  window.location.href = `client-view.html?id=${id}`;

}

loadRecentClients();

document.getElementById("agentName").innerText =
  sessionStorage.getItem("agentName") || "";

  function logout(){

  sessionStorage.clear();

  window.location.href = "login.html";

}

