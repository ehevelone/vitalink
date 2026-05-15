if(!sessionStorage.getItem("crm_uuid")){

    

  window.location = "login.html";

}

function formatPhone(phone){

  if(!phone) return "";

  let digits =
    phone.replace(/\D/g,"");

  if(digits.length === 11 && digits.startsWith("1")){
    digits = digits.slice(1);
  }

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
    tasksRes
  ] = await Promise.all([

    fetch(
      `/.netlify/functions/get-crm-clients?agent_id=${agent_id}`
    ),

    fetch(
      `/.netlify/functions/get-crm-tasks?agent_id=${agent_id}`
    )

  ]);

  const data = await clientsRes.json();
  const tasksData = await tasksRes.json();

  if(!data.success){
    return;
  }

  const clients =
    data.clients || [];

  const tasks =
    tasksData.success ? tasksData.tasks || [] : [];

  document.getElementById("totalClients").innerText =
    clients.length;

  document.getElementById("upcomingRenewals").innerText =
    countUpcomingRenewals(clients);

  document.getElementById("pendingFollowUps").innerText =
    countOpenTasks(tasks);

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

function renderDashboardTasks(tasks){

  const list =
    document.getElementById("dashboardTaskList");

  const summary =
    document.getElementById("dashboardTaskSummary");

  const allOpenTasks =
    tasks.filter(task => task.status !== "Complete");

  const today =
    new Date();

  today.setHours(0,0,0,0);

  const tomorrow =
    new Date(today);

  tomorrow.setDate(today.getDate() + 1);

  const overdueCount =
    allOpenTasks.filter(task => {
      if(!task.due_date){
        return false;
      }

      const dueDate =
        new Date(task.due_date);

      dueDate.setHours(0,0,0,0);

      return dueDate < today;
    }).length;

  const dueTodayCount =
    allOpenTasks.filter(task => {
      if(!task.due_date){
        return false;
      }

      const dueDate =
        new Date(task.due_date);

      return dueDate >= today && dueDate < tomorrow;
    }).length;

  const highPriorityCount =
    allOpenTasks.filter(task =>
      String(task.priority || "").toLowerCase() === "high"
    ).length;

  summary.innerHTML = `
    <div>
      <strong>${overdueCount}</strong>
      <span>Overdue</span>
    </div>
    <div>
      <strong>${dueTodayCount}</strong>
      <span>Today</span>
    </div>
    <div>
      <strong>${highPriorityCount}</strong>
      <span>High</span>
    </div>
  `;

  const openTasks =
    allOpenTasks
      .sort((a,b) => {
        const aDate =
          a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;

        const bDate =
          b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;

        return aDate - bDate;
      })
      .slice(0,3);

  list.innerHTML = "";

  if(openTasks.length === 0){

    list.innerHTML = `
      <div class="empty-state">
        No open tasks.
      </div>
    `;

    return;

  }

  openTasks.forEach(task => {

    const clientName =
      `${task.first_name || ""} ${task.last_name || ""}`.trim();

    list.innerHTML += `
      <button class="dashboard-task-row" onclick="window.location.href='tasks.html'">
        <span>
          <strong>${task.title || "Task"}</strong>
          <small>${clientName || "No client"} • ${formatDate(task.due_date) || "No due date"}</small>
        </span>
        <span class="status ${(task.priority || "medium").toLowerCase()}">
          ${task.priority || "Medium"}
        </span>
      </button>
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



