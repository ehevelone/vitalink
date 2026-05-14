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
          ${formatPhone(client.mobile_phone)}
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

document.addEventListener("DOMContentLoaded", () => {

  const agentName =
    sessionStorage.getItem("agentName") || "";

  if(agentName){

    document.getElementById("agentName").innerText =
      agentName;

    document.getElementById("agentBox").style.display =
      "block";

  }

  loadRecentClients();

});



