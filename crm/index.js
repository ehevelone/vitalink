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

  const agent_id =
    sessionStorage.getItem("crm_uuid");

  const [
    clientsRes,
    tasksRes,
    appointmentsRes
  ] = await Promise.all([

    fetch(
      `/.netlify/functions/get-crm-clients?agent_id=${agent_id}`
    ),

    fetch(
      `/.netlify/functions/get-crm-tasks?agent_id=${agent_id}`
    ),

    fetch(
      `/.netlify/functions/get-crm-appointments?agent_id=${agent_id}`
    )

  ]);

  const data = await clientsRes.json();
  const tasksData = await tasksRes.json();
  const appointmentsData = await appointmentsRes.json();

  if(!data.success){
    return;
  }

  const clients =
    data.clients || [];

  const tasks =
    tasksData.success ? tasksData.tasks || [] : [];

  const appointments =
    appointmentsData.success ? appointmentsData.appointments || [] : [];


  document.getElementById("totalClients").innerText =
    clients.length;

  document.getElementById("upcomingRenewals").innerText =
    countUpcomingRenewals(clients);

  document.getElementById("pendingFollowUps").innerText =
    countOpenTasks(tasks);

  document.getElementById("recentActivity").innerText =
    countRecentActivity(
      clients,
      tasks,
      appointments
    );

  renderDashboardTasks(tasks);

  const table = document.getElementById("recentClientsTable");

  table.innerHTML = "";

  clients.slice(0,8).forEach(client => {

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

function countOpenTasks(tasks){

  return tasks.filter(task =>
    task.status !== "Complete"
  ).length;

}

function getRenewalMonthIndex(value){

  if(!value){
    return null;
  }

  const monthNames = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december"
  ];

  const normalized =
    String(value).trim().toLowerCase();

  if(!normalized){
    return null;
  }

  const numeric =
    Number(normalized);

  if(Number.isInteger(numeric) && numeric >= 1 && numeric <= 12){
    return numeric - 1;
  }

  return monthNames.findIndex(month =>
    month.startsWith(normalized) ||
    normalized.startsWith(month.slice(0,3))
  );

}

function countUpcomingRenewals(clients){

  const today =
    new Date();

  today.setHours(0,0,0,0);

  const rangeEnd =
    new Date(today);

  rangeEnd.setDate(today.getDate() + 60);

  return clients.filter(client => {

    const monthIndex =
      getRenewalMonthIndex(client.renewal_month);

    if(monthIndex === null || monthIndex < 0){
      return false;
    }

    const renewalDate =
      new Date(today.getFullYear(), monthIndex, 1);

    if(renewalDate < today){
      renewalDate.setFullYear(today.getFullYear() + 1);
    }

    return renewalDate >= today && renewalDate <= rangeEnd;

  }).length;

}

function countRecentActivity(
  clients,
  tasks,
  appointments
){

  const weekAgo =
    new Date();

  weekAgo.setDate(weekAgo.getDate() - 7);

  const allItems = [
    ...clients,
    ...tasks,
    ...appointments
  ];

  return allItems.filter(item => {

    const value =
      item.updated_at ||
      item.created_at;

    if(!value){
      return false;
    }

    return new Date(value) >= weekAgo;

  }).length;

}

function renderDashboardTasks(tasks){

  const table =
    document.getElementById("dashboardTasksTable");

  const openTasks =
    tasks
      .filter(task => task.status !== "Complete")
      .slice(0,5);

  table.innerHTML = "";

  if(openTasks.length === 0){

    table.innerHTML = `
      <tr>
        <td colspan="5">
          No open tasks.
        </td>
      </tr>
    `;

    return;

  }

  openTasks.forEach(task => {

    const clientName =
      `${task.first_name || ""} ${task.last_name || ""}`.trim();

    table.innerHTML += `
      <tr>
        <td>${task.title || ""}</td>
        <td>${clientName || "--"}</td>
        <td>
          <span class="status ${(task.priority || "medium").toLowerCase()}">
            ${task.priority || "Medium"}
          </span>
        </td>
        <td>${formatDate(task.due_date) || "--"}</td>
        <td>
          <button onclick="window.location.href='tasks.html'">
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



