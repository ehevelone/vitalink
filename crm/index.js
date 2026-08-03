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

function normalizePhoneForStorage(phone){

  if(!phone) return "";

  let digits =
    String(phone).replace(/\D/g,"");

  if(digits.length === 11 && digits.startsWith("1")){
    digits = digits.slice(1);
  }

  return digits.length === 10 ? digits : phone;

}

function moneyValue(value){

  const number =
    Number(String(value ?? "").replace(/[^0-9.-]/g, ""));

  return Number.isFinite(number) ? number : 0;

}

function formatMoney(value){

  return moneyValue(value).toLocaleString("en-US", {
    style:"currency",
    currency:"USD"
  });

}

async function loadRecentClients(){

  const agent_id =
    sessionStorage.getItem("crm_uuid");

  const [
    clientsRes,
    tasksRes,
    policiesRes
  ] = await Promise.all([

    fetch(
      `/.netlify/functions/get-crm-clients?agent_id=${agent_id}`
    ),

    fetch(
      `/.netlify/functions/get-crm-tasks?agent_id=${agent_id}`
    ),

    fetch(
      `/.netlify/functions/get-crm-policies?agent_id=${agent_id}`,
      {
        headers:getCrmSessionHeaders()
      }
    )

  ]);

  const data = await clientsRes.json();
  const tasksData = await tasksRes.json();
  const policiesData = await policiesRes.json();

  if(!data.success){
    return;
  }

  const clients =
    data.clients || [];

  const tasks =
    tasksData.success ? tasksData.tasks || [] : [];

  const policies =
    policiesData.success ? policiesData.policies || [] : [];

  document.getElementById("totalClients").innerText =
    clients.length;

  document.getElementById("upcomingRenewals").innerText =
    countUpcomingRenewals(clients);

  document.getElementById("pendingFollowUps").innerText =
    countOpenTasks(tasks);

  renderDashboardTasks(tasks);
  renderDashboardBusiness(policies);

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

function normalizedPolicyStatus(policy){

  if(policy.paid_date){
    return "Paid";
  }

  return String(policy.status || "Active").trim();

}

function isPolicyPaid(policy){

  return normalizedPolicyStatus(policy).toLowerCase() === "paid";

}

function isPolicyPending(policy){

  const status =
    normalizedPolicyStatus(policy).toLowerCase();

  return ["pending", "submitted"].includes(status);

}

function policyExpectedAmount(policy){

  return moneyValue(policy.commission_amount);

}

function policyPaidAmount(policy){

  if(!isPolicyPaid(policy)){
    return 0;
  }

  return moneyValue(policy.paid_amount) ||
    policyExpectedAmount(policy);

}

function paidDate(policy){

  if(!policy.paid_date){
    return null;
  }

  const date =
    new Date(policy.paid_date);

  if(Number.isNaN(date.getTime())){
    return null;
  }

  date.setHours(0,0,0,0);
  return date;

}

function renderDashboardBusiness(policies){

  const container =
    document.getElementById("dashboardBusinessSummary");

  if(!container){
    return;
  }

  const today =
    new Date();

  today.setHours(0,0,0,0);

  const thirtyDaysAgo =
    new Date(today);

  thirtyDaysAgo.setDate(today.getDate() - 30);

  const thisMonthStart =
    new Date(today.getFullYear(), today.getMonth(), 1);

  const lastMonthStart =
    new Date(today.getFullYear(), today.getMonth() - 1, 1);

  const pending =
    policies
      .filter(policy => isPolicyPending(policy))
      .reduce((sum, policy) => sum + policyExpectedAmount(policy), 0);

  const paidLast30 =
    policies
      .filter(policy => {
        const date =
          paidDate(policy);

        return date && date >= thirtyDaysAgo && date <= today;
      })
      .reduce((sum, policy) => sum + policyPaidAmount(policy), 0);

  const paidLastMonth =
    policies
      .filter(policy => {
        const date =
          paidDate(policy);

        return date && date >= lastMonthStart && date < thisMonthStart;
      })
      .reduce((sum, policy) => sum + policyPaidAmount(policy), 0);

  container.innerHTML = `
    <div>
      <strong>${formatMoney(pending)}</strong>
      <span>Pending</span>
    </div>
    <div>
      <strong>${formatMoney(paidLast30)}</strong>
      <span>Paid 30 Days</span>
    </div>
    <div>
      <strong>${formatMoney(paidLastMonth)}</strong>
      <span>Last Month</span>
    </div>
  `;

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

function getValue(id){

  return document.getElementById(id)?.value.trim() || "";

}

function openOnboardClientModal(){

  document.getElementById("onboardClientModal").style.display = "flex";

}

function closeOnboardClientModal(){

  document.getElementById("onboardClientModal").style.display = "none";

}

function resetOnboardClientForm(){

  [
    "onboardFullName",
    "onboardDob",
    "onboardPhone",
    "onboardEmail",
    "onboardAddress",
    "onboardCity",
    "onboardState",
    "onboardZip",
    "onboardEmergencyName1",
    "onboardEmergencyPhone1",
    "onboardEmergencyName2",
    "onboardEmergencyPhone2",
    "onboardEmergencyName3",
    "onboardEmergencyPhone3",
    "onboardBloodType",
    "onboardAllergies",
    "onboardConditions",
    "onboardImplants",
    "onboardProcedures"
  ].forEach(id => {
    const input = document.getElementById(id);
    if(input) input.value = "";
  });

  document.getElementById("onboardOrganDonor").checked = false;
  document.getElementById("onboardSaveToCrm").checked = true;

}

function collectEmergencyContacts(){

  return [1,2,3]
    .map(index => ({
      name:getValue(`onboardEmergencyName${index}`),
      phone:normalizePhoneForStorage(getValue(`onboardEmergencyPhone${index}`))
    }))
    .filter(contact => contact.name || contact.phone);

}

async function copyOnboardingLink(link){

  if(navigator.clipboard && window.isSecureContext){
    await navigator.clipboard.writeText(link);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = link;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  textarea.remove();

  if(!copied){
    throw new Error("Unable to copy onboarding link");
  }

}

async function createAssistedOnboarding(){

  const button =
    document.getElementById("createOnboardingBtn");

  const resultBox =
    document.getElementById("onboardResult");

  const fullName =
    getValue("onboardFullName");

  const phone =
    normalizePhoneForStorage(getValue("onboardPhone"));

  if(!fullName || !phone){
    alert("Client name and phone are required.");
    return;
  }

  button.disabled = true;
  button.innerText = "Creating Onboarding Link...";
  resultBox.style.display = "none";
  resultBox.innerHTML = "";

  try{

    const body = {
      agent_id:sessionStorage.getItem("crm_uuid"),
      crmAgentId:sessionStorage.getItem("crm_uuid"),
      appAgentId:sessionStorage.getItem("agentId"),
      agentEmail:sessionStorage.getItem("agentEmail"),
      agentSessionToken:sessionStorage.getItem("agentSessionToken"),
      saveToCrm:document.getElementById("onboardSaveToCrm").checked,
      status:"Prospect",
      profile:{
        fullName,
        dob:getValue("onboardDob"),
        userPhone:phone,
        email:getValue("onboardEmail"),
        address:getValue("onboardAddress"),
        city:getValue("onboardCity"),
        state:getValue("onboardState"),
        zip:getValue("onboardZip")
      },
      emergency:{
        contacts:collectEmergencyContacts(),
        allergies:getValue("onboardAllergies"),
        conditions:getValue("onboardConditions"),
        bloodType:getValue("onboardBloodType"),
        implants:getValue("onboardImplants"),
        procedures:getValue("onboardProcedures"),
        organDonor:document.getElementById("onboardOrganDonor").checked
      }
    };

    const res = await fetch(
      "/.netlify/functions/create-assisted-client-onboarding",
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "x-agent-session":sessionStorage.getItem("agentSessionToken") || "",
          "x-crm-agent-id":sessionStorage.getItem("crm_uuid") || ""
        },
        body:JSON.stringify(body)
      }
    );

    const data = await res.json();

    if(!res.ok || !data.success){
      throw new Error(data.error || "Unable to create onboarding link.");
    }

    const expiresAt =
      data.expiresAt ? new Date(data.expiresAt) : null;

    resultBox.style.display = "block";
    resultBox.innerHTML = `
      <strong>Onboarding link created.</strong>
      <div>${data.onboardingUrl}</div>
      <div class="client-sub">
        Expires ${expiresAt ? expiresAt.toLocaleString() : "in 2 hours"}.
        If it expires, this onboarding session cannot be reopened.
      </div>
      <div class="onboard-link-actions">
        <button class="secondary compact-btn" onclick="copyOnboardingLink('${data.onboardingUrl}')">
          Copy Link
        </button>
        <button class="secondary compact-btn" onclick="window.open('${data.onboardingUrl}', '_blank', 'noopener')">
          Open Link
        </button>
      </div>
    `;

    if(data.crmClient?.id){
      loadRecentClients();
    }

    resetOnboardClientForm();

  }catch(err){
    alert(err.message || "Unable to create onboarding link.");
  }finally{
    button.disabled = false;
    button.innerText = "Create 2-Hour Onboarding Link";
  }

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



