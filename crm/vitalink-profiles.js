if(!sessionStorage.getItem("crm_uuid")){
  window.location = "login.html";
}

let profiles = [];

function formatDate(value){
  const date = new Date(value);

  if(!value || Number.isNaN(date.getTime())){
    return "--";
  }

  return date.toLocaleDateString();
}

function clientName(profile){
  return `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
    profile.email ||
    "Client";
}

async function loadProfiles(){
  const agentId =
    sessionStorage.getItem("crm_uuid");

  const res = await fetch(
    `/.netlify/functions/get-vitalink-linked-profiles?agent_id=${agentId}`
  );

  const data = await res.json();

  if(!data.success){
    alert(data.error || "Failed to load linked profiles.");
    return;
  }

  profiles =
    data.profiles || [];

  document.getElementById("totalProfiles").innerText =
    data.total || 0;

  document.getElementById("linkedProfiles").innerText =
    data.linked || 0;

  document.getElementById("deviceProfiles").innerText =
    profiles.filter(profile => profile.has_device).length;

  renderProfiles();
}

function renderProfiles(){
  const table =
    document.getElementById("profilesTable");

  table.innerHTML = "";

  if(profiles.length === 0){
    table.innerHTML = `
      <tr>
        <td colspan="7">No VitaLink app clients found for this agent.</td>
      </tr>
    `;
    return;
  }

  profiles.forEach(profile => {
    table.innerHTML += `
      <tr>
        <td>
          <div class="client-name">${clientName(profile)}</div>
          <div class="client-meta">App ID ${profile.app_client_id}</div>
        </td>
        <td>${profile.phone || ""}</td>
        <td>${profile.email || ""}</td>
        <td>
          <span class="status ${profile.linked ? "client" : "prospect"}">
            ${profile.linked ? "Linked" : "Needs Sync"}
          </span>
        </td>
        <td>${profile.has_device ? "Available" : "No device"}</td>
        <td>${formatDate(profile.last_sync)}</td>
        <td>
          ${
            profile.crm_client_id
              ? `<button class="secondary" onclick="viewClient('${profile.crm_client_id}')">View</button>`
              : ""
          }
        </td>
      </tr>
    `;
  });
}

function viewClient(id){
  window.location.href = `client-view.html?id=${id}`;
}

async function syncVitalinkClients(){
  const agentId =
    sessionStorage.getItem("crm_uuid");

  const res = await fetch(
    "/.netlify/functions/sync-vitalink-clients",
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        agent_id:agentId
      })
    }
  );

  const data = await res.json();

  if(!data.success){
    alert(data.error || "Failed to sync VitaLink clients.");
    return;
  }

  alert(`Sync complete. Created ${data.created}. Updated ${data.updated}. Skipped ${data.skipped}.`);
  loadProfiles();
}

loadProfiles();
