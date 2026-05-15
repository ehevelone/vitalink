if(!sessionStorage.getItem("crm_uuid")){

  window.location = "login.html";

}

let tasks = [];
let editingTaskId = null;
let crmSettings = {};

function getClientName(task){

  return `${task.first_name || ""} ${task.last_name || ""}`.trim();

}

function formatTaskDate(value){

  if(!value){
    return "";
  }

  return String(value).split("T")[0];

}

async function loadCrmSettings(){

  const agent_id =
    sessionStorage.getItem("crm_uuid");

  const res = await fetch(
    `/.netlify/functions/get-crm-settings?agent_id=${agent_id}`
  );

  const data = await res.json();

  if(data.success){
    crmSettings = data.settings || {};
  }

}

function clearTaskForm(){

  document.getElementById("taskTitle").value = "";
  document.getElementById("taskPriority").value =
    crmSettings.default_task_priority || "Medium";
  document.getElementById("taskClientId").value =
    new URLSearchParams(window.location.search).get("client_id") || "";
  document.getElementById("taskDueDate").value =
    getDefaultTaskDueDate();
  document.getElementById("taskStatus").value = "Open";
  document.getElementById("taskNotes").value = "";

}

function getDefaultTaskDueDate(){

  const dueDays =
    Number(crmSettings.default_task_due_days);

  if(!Number.isFinite(dueDays)){
    return "";
  }

  const date =
    new Date();

  date.setDate(date.getDate() + dueDays);

  return date.toISOString().split("T")[0];

}

function openTaskModal(){

  editingTaskId = null;
  clearTaskForm();

  document.getElementById("taskModal").style.display = "flex";

}

function closeTaskModal(){

  document.getElementById("taskModal").style.display = "none";

}

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
    document.getElementById("taskClientId");

  const selectedClientId =
    new URLSearchParams(window.location.search).get("client_id") || "";

  select.innerHTML = `
    <option value="">No Client</option>
  `;

  data.clients.forEach(client => {

    const name =
      `${client.first_name || ""} ${client.last_name || ""}`.trim();

    select.innerHTML += `
      <option
        value="${client.id}"
        ${String(client.id) === selectedClientId ? "selected" : ""}
      >
        ${name}
      </option>
    `;

  });

}

async function loadTasks(){

  const agent_id =
    sessionStorage.getItem("crm_uuid");

  const params =
    new URLSearchParams(window.location.search);

  const client_id =
    params.get("client_id");

  let url =
    `/.netlify/functions/get-crm-tasks?agent_id=${agent_id}`;

  if(client_id){
    url += `&client_id=${client_id}`;
  }

  const res = await fetch(url);
  const data = await res.json();

  if(!data.success){

    alert("Failed to load tasks.");
    return;

  }

  tasks = data.tasks || [];

  renderTasks();

}

function renderTasks(){

  const search =
    document.getElementById("taskSearch").value.toLowerCase();

  const priority =
    document.getElementById("priorityFilter").value;

  const status =
    document.getElementById("statusFilter").value;

  const table =
    document.getElementById("tasksTable");

  table.innerHTML = "";

  const filtered = tasks.filter(task => {

    const clientName =
      getClientName(task);

    const matchesSearch =
      !search ||
      (task.title || "").toLowerCase().includes(search) ||
      clientName.toLowerCase().includes(search) ||
      (task.notes || "").toLowerCase().includes(search);

    const matchesPriority =
      !priority || task.priority === priority;

    const matchesStatus =
      !status || task.status === status;

    return matchesSearch && matchesPriority && matchesStatus;

  });

  if(filtered.length === 0){

    table.innerHTML = `
      <tr>
        <td colspan="6">
          No tasks found.
        </td>
      </tr>
    `;

    return;

  }

  filtered.forEach(task => {

    table.innerHTML += `
      <tr>
        <td>
          <span class="status ${(task.priority || "medium").toLowerCase()}">
            ${task.priority || "Medium"}
          </span>
        </td>

        <td>
          <div class="client-name">
            ${task.title || ""}
          </div>
          <div class="client-meta">
            ${task.notes || ""}
          </div>
        </td>

        <td>
          ${getClientName(task) || "--"}
        </td>

        <td>
          ${formatTaskDate(task.due_date) || "--"}
        </td>

        <td>
          <span class="status ${(task.status || "open").toLowerCase()}">
            ${task.status || "Open"}
          </span>
        </td>

        <td>
          <button onclick="editTask('${task.id}')">
            Edit
          </button>

          <button
            class="secondary"
            onclick="completeTask('${task.id}')"
            style="margin-left:8px;"
          >
            Complete
          </button>

          <button
            class="danger-btn"
            onclick="deleteTask('${task.id}')"
            style="margin-left:8px;"
          >
            Delete
          </button>
        </td>
      </tr>
    `;

  });

}

async function saveTask(){

  const task = {

    agent_id:
      sessionStorage.getItem("crm_uuid"),

    client_id:
      document.getElementById("taskClientId").value,

    title:
      document.getElementById("taskTitle").value.trim(),

    notes:
      document.getElementById("taskNotes").value,

    due_date:
      document.getElementById("taskDueDate").value,

    priority:
      document.getElementById("taskPriority").value,

    status:
      document.getElementById("taskStatus").value

  };

  if(!task.title){

    alert("Enter a task title.");
    return;

  }

  const endpoint = editingTaskId
    ? "/.netlify/functions/update-crm-task"
    : "/.netlify/functions/create-crm-task";

  if(editingTaskId){
    task.id = editingTaskId;
  }

  const res = await fetch(
    endpoint,
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify(task)
    }
  );

  const data = await res.json();

  if(!data.success){

    alert("Failed to save task.");
    return;

  }

  closeTaskModal();
  loadTasks();

}

function editTask(id){

  const task =
    tasks.find(item => String(item.id) === String(id));

  if(!task){
    return;
  }

  editingTaskId = id;

  document.getElementById("taskTitle").value =
    task.title || "";

  document.getElementById("taskPriority").value =
    task.priority || "Medium";

  document.getElementById("taskClientId").value =
    task.client_id || "";

  document.getElementById("taskDueDate").value =
    formatTaskDate(task.due_date);

  document.getElementById("taskStatus").value =
    task.status || "Open";

  document.getElementById("taskNotes").value =
    task.notes || "";

  document.getElementById("taskModal").style.display = "flex";

}

async function completeTask(id){

  const task =
    tasks.find(item => String(item.id) === String(id));

  if(!task){
    return;
  }

  const res = await fetch(
    "/.netlify/functions/update-crm-task",
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        ...task,
        status:"Complete"
      })
    }
  );

  const data = await res.json();

  if(!data.success){

    alert("Failed to complete task.");
    return;

  }

  loadTasks();

}

async function deleteTask(id){

  const confirmed = confirm(
    "Delete this task?"
  );

  if(!confirmed){
    return;
  }

  const res = await fetch(
    "/.netlify/functions/delete-crm-task",
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

    alert("Failed to delete task.");
    return;

  }

  loadTasks();

}

window.onclick = function(event){

  const modal =
    document.getElementById("taskModal");

  if(event.target === modal){
    closeTaskModal();
  }

}

document.getElementById("taskSearch")
  .addEventListener("input", renderTasks);

document.getElementById("priorityFilter")
  .addEventListener("change", renderTasks);

document.getElementById("statusFilter")
  .addEventListener("change", renderTasks);

Promise.all([
  loadCrmSettings(),
  loadClientDropdown()
]).then(() => {

  const params =
    new URLSearchParams(window.location.search);

  if(params.get("client_id")){
    openTaskModal();
  }

});

loadTasks();
