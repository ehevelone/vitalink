const state = {
  sessionToken: sessionStorage.getItem("marketingCrmSession") || "",
  currentUser: JSON.parse(sessionStorage.getItem("marketingCrmUser") || "null"),
  contacts: [],
  activities: [],
  appointments: [],
  researchMatches: [],
  researchQuery: "",
  researchOffset: 0,
  view: "dashboard"
};

const endpoint = "/.netlify/functions/marketing-crm";

const contactTypes = [
  "FMO",
  "Agency Owner",
  "Podcast",
  "Conference",
  "Referral",
  "Marketing Partner",
  "Carrier Contact",
  "Other"
];

const stages = [
  "New",
  "Researching",
  "Contacted",
  "Demo Scheduled",
  "Demo Completed",
  "Proposal Sent",
  "Active Partner",
  "Nurture",
  "Not A Fit"
];

function $(id){
  return document.getElementById(id);
}

function toast(message){
  const node = $("toast");
  node.textContent = message;
  node.classList.add("show");
  setTimeout(() => node.classList.remove("show"), 2600);
}

function formatDate(value){
  if(!value){
    return "";
  }

  return String(value).split("T")[0];
}

function formatDateTime(value){
  if(!value){
    return "";
  }

  const date = new Date(value);

  if(Number.isNaN(date.getTime())){
    return formatDate(value);
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function todayIso(){
  return new Date().toISOString().split("T")[0];
}

function isDue(value){
  const date = formatDate(value);
  return date && date <= todayIso();
}

function contactName(id){
  const contact = state.contacts.find((item) => item.id === id);
  return contact ? `${contact.name}${contact.organization ? ` - ${contact.organization}` : ""}` : "No contact";
}

async function api(action, body = null){
  const options = {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "x-marketing-session": state.sessionToken
    }
  };

  if(body){
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${endpoint}?action=${encodeURIComponent(action)}`, options);
  const data = await res.json().catch(() => ({}));

  if(!res.ok || data.success === false){
    throw new Error(data.error || `Request failed with ${res.status}`);
  }

  return data;
}

async function publicApi(action, body = null){
  const options = {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json"
    }
  };

  if(body){
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${endpoint}?action=${encodeURIComponent(action)}`, options);
  const data = await res.json().catch(() => ({}));

  if(!res.ok || data.success === false){
    throw new Error(data.error || `Request failed with ${res.status}`);
  }

  return data;
}

async function loadData(){
  const data = await api("load");
  state.contacts = data.contacts || [];
  state.activities = data.activities || [];
  state.appointments = data.appointments || [];
  renderAll();
}

function setView(view){
  state.view = view;

  document.querySelectorAll(".view").forEach((node) => {
    node.classList.toggle("active", node.id === `${view}View`);
  });

  document.querySelectorAll(".nav-item[data-view]").forEach((node) => {
    node.classList.toggle("active", node.dataset.view === view);
  });
}

function renderAll(){
  renderMetrics();
  renderPipelineSnapshot();
  renderPriorityFollowUps();
  renderUpcomingSchedule();
  renderContactsTable();
  renderSchedule();
  renderActivities();
  renderSettings();
  populateContactSelects();
}

function renderMetrics(){
  $("totalContacts").textContent = state.contacts.length;
  $("demoCount").textContent = state.appointments.filter((item) => item.appointment_type === "Demo").length;
  $("followUpsDue").textContent = state.contacts.filter((item) => isDue(item.follow_up_date)).length;
  $("referralCount").textContent = state.contacts.filter((item) => item.contact_type === "Referral").length;
}

function renderPipelineSnapshot(){
  $("pipelineSnapshot").innerHTML = stages.map((stage) => {
    const count = state.contacts.filter((item) => item.stage === stage).length;
    return `
      <div class="pipeline-card">
        <span>${stage}</span>
        <strong>${count}</strong>
      </div>
    `;
  }).join("");
}

function renderPriorityFollowUps(){
  const items = state.contacts
    .filter((item) => item.follow_up_date)
    .sort((a, b) => String(a.follow_up_date).localeCompare(String(b.follow_up_date)))
    .slice(0, 8);

  $("priorityFollowUps").innerHTML = items.length ? items.map((item) => `
    <div class="list-row">
      <div>
        <strong>${item.name}</strong>
        <small>${item.organization || item.contact_type} ${item.follow_up_date ? `- Follow up ${formatDate(item.follow_up_date)}` : ""}</small>
      </div>
      <span class="badge ${String(item.priority || "").toLowerCase()}">${item.priority || "Medium"}</span>
    </div>
  `).join("") : `<div class="list-row"><small>No follow-ups scheduled yet.</small></div>`;
}

function renderUpcomingSchedule(){
  const items = state.appointments
    .filter((item) => formatDate(item.appointment_date) >= todayIso())
    .slice(0, 8);

  $("upcomingSchedule").innerHTML = items.length ? items.map((item) => `
    <div class="list-row">
      <div>
        <strong>${item.title}</strong>
        <small>${formatDate(item.appointment_date)} ${item.appointment_time || ""} - ${item.contact_name || "No contact"}</small>
      </div>
      <span class="badge">${item.appointment_type}</span>
    </div>
  `).join("") : `<div class="list-row"><small>No upcoming schedule items.</small></div>`;
}

function filteredContacts(){
  const search = $("searchInput").value.trim().toLowerCase();
  const type = $("typeFilter").value;
  const stage = $("stageFilter").value;

  return state.contacts.filter((item) => {
    const blob = [
      item.name,
      item.organization,
      item.email,
      item.phone,
      item.notes,
      item.source,
      item.referral_source
    ].join(" ").toLowerCase();

    return (!search || blob.includes(search)) &&
      (!type || item.contact_type === type) &&
      (!stage || item.stage === stage);
  });
}

function renderContactsTable(){
  const rows = filteredContacts();

  $("contactsTable").innerHTML = rows.length ? rows.map((item) => `
    <tr>
      <td>
        <strong>${item.name}</strong>
        <div class="muted">${item.organization || ""}</div>
        <div class="muted">${item.email || item.phone || ""}</div>
      </td>
      <td><span class="badge">${item.contact_type}</span></td>
      <td>${item.stage || ""}</td>
      <td>${formatDateTime(item.demo_date)}</td>
      <td>${formatDate(item.follow_up_date)}</td>
      <td>
        <button class="secondary compact" onclick="editContact('${item.id}')">Edit</button>
        <button class="secondary compact" onclick="quickActivity('${item.id}')">Log</button>
        <button class="secondary compact danger" onclick="deleteRow('contact','${item.id}')">Delete</button>
      </td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="6">No relationships match this view yet.</td>
    </tr>
  `;
}

function populateContactSelects(){
  const options = [
    `<option value="">No contact selected</option>`,
    ...state.contacts.map((item) => `<option value="${item.id}">${item.name}${item.organization ? ` - ${item.organization}` : ""}</option>`)
  ].join("");

  $("appointmentContactId").innerHTML = options;
  $("activityContactId").innerHTML = options;
}

function renderSchedule(){
  $("scheduleList").innerHTML = state.appointments.length ? state.appointments.map((item) => `
    <div class="list-row">
      <div>
        <strong>${item.title}</strong>
        <small>${item.appointment_type} - ${formatDate(item.appointment_date)} ${item.appointment_time || ""}</small>
        <small>${item.contact_name || ""}${item.location ? ` - ${item.location}` : ""}</small>
      </div>
      <button class="secondary compact" onclick="deleteRow('appointment','${item.id}')">Delete</button>
    </div>
  `).join("") : `<div class="list-row"><small>No schedule items yet.</small></div>`;
}

function renderActivities(){
  $("activityList").innerHTML = state.activities.length ? state.activities.map((item) => `
    <div class="list-row">
      <div>
        <strong>${item.title}</strong>
        <small>${item.activity_type} - ${formatDateTime(item.activity_date)}</small>
        <small>${item.contact_name || ""}${item.outcome ? ` - ${item.outcome}` : ""}</small>
        ${item.notes ? `<small>${item.notes}</small>` : ""}
      </div>
      <button class="secondary compact" onclick="deleteRow('activity','${item.id}')">Delete</button>
    </div>
  `).join("") : `<div class="list-row"><small>No activity logged yet.</small></div>`;
}

function renderSettings(){
  if($("currentUserName")){
    $("currentUserName").textContent = state.currentUser?.name || "Admin user";
  }

  if($("currentUserEmail")){
    $("currentUserEmail").textContent = state.currentUser?.email || "";
  }
}

function escapeHtml(value){
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderResearchResults(){
  const results = $("researchResults");

  if(!state.researchMatches.length){
    results.innerHTML = "";
    return;
  }

  results.innerHTML = state.researchMatches.map((item, index) => {
    const links = (item.source_links || []).map((link) => `
      <a href="${escapeHtml(link)}" target="_blank" rel="noopener">${escapeHtml(link)}</a>
    `).join("");

    return `
      <article class="research-card">
        <div class="research-card-header">
          <div>
            <h3>${escapeHtml(item.name || item.organization || "Possible Match")}</h3>
            <p>${escapeHtml(item.organization || "")}</p>
          </div>
          <span class="badge">${escapeHtml(item.confidence || "Low")}</span>
        </div>
        <div class="research-fields">
          <span><strong>Type:</strong> ${escapeHtml(item.contact_type || "Other")}</span>
          <span><strong>Phone:</strong> ${escapeHtml(item.phone || "Unknown")}</span>
          <span><strong>Email:</strong> ${escapeHtml(item.email || "Unknown")}</span>
          <span><strong>Website:</strong> ${item.website ? `<a href="${escapeHtml(item.website)}" target="_blank" rel="noopener">${escapeHtml(item.website)}</a>` : "Unknown"}</span>
          <span><strong>Location:</strong> ${escapeHtml([item.city, item.state].filter(Boolean).join(", ") || "Unknown")}</span>
        </div>
        ${item.notes ? `<p class="research-notes">${escapeHtml(item.notes)}</p>` : ""}
        ${item.research_summary ? `<p class="research-notes"><strong>Deep dive:</strong> ${escapeHtml(item.research_summary)}</p>` : ""}
        ${item.suggested_outreach ? `<p class="research-notes"><strong>Suggested outreach:</strong> ${escapeHtml(item.suggested_outreach)}</p>` : ""}
        ${(item.missing_fields || []).length ? `<p class="research-notes"><strong>Missing:</strong> ${escapeHtml(item.missing_fields.join(", "))}</p>` : ""}
        ${links ? `<div class="research-links">${links}</div>` : ""}
        <div class="research-actions">
          <button class="secondary compact" onclick="deepResearchMatch(${index})">More Research</button>
          <button class="compact" onclick="useResearchMatch(${index})">Review / Add To Pipeline</button>
        </div>
      </article>
    `;
  }).join("") + `
    <div class="research-more">
      <button id="findMoreBtn" class="secondary">Find More</button>
    </div>
  `;

  $("findMoreBtn").addEventListener("click", () => runResearch(true));
}

window.useResearchMatch = (index) => {
  const match = state.researchMatches[index];

  if(!match){
    return;
  }

  openContactModal({
    name: match.name || "",
    organization: match.organization || "",
    contact_type: match.contact_type || "Other",
    stage: "Researching",
    priority: "Medium",
    phone: match.phone || "",
    email: match.email || "",
    website: match.website || "",
    city: match.city || "",
    state: match.state || "",
    source: match.source || "AI Research",
    notes: [
      match.notes,
      match.research_summary ? `Deep research: ${match.research_summary}` : "",
      match.suggested_outreach ? `Suggested outreach: ${match.suggested_outreach}` : "",
      ...(match.source_links || []).map((link) => `Source: ${link}`)
    ].filter(Boolean).join("\n")
  });
};

window.deepResearchMatch = async (index) => {
  const match = state.researchMatches[index];

  if(!match){
    return;
  }

  $("researchStatus").textContent = "Running deeper research on that match...";

  try{
    const data = await api("deep-research-contact", {
      query: state.researchQuery || $("researchQuery").value.trim(),
      target: match
    });

    state.researchMatches[index] = {
      ...match,
      ...(data.match || {})
    };
    $("researchStatus").textContent = "Deep research added to the selected match.";
    renderResearchResults();
  }catch(err){
    $("researchStatus").textContent = err.message;
  }
};

async function runResearch(findMore = false){
  const query = findMore ? state.researchQuery : $("researchQuery").value.trim();

  if(!query){
    $("researchStatus").textContent = "Enter something to research first.";
    return;
  }

  if(!findMore){
    state.researchQuery = query;
    state.researchOffset = 0;
    state.researchMatches = [];
    renderResearchResults();
  }else{
    state.researchOffset += 5;
  }

  $("researchStatus").textContent = findMore
    ? "Looking for more possible matches..."
    : "Researching public sources...";
  $("researchBtn").disabled = true;

  const moreBtn = $("findMoreBtn");

  if(moreBtn){
    moreBtn.disabled = true;
  }

  try{
    const data = await api("research-contact", {
      query,
      offset: state.researchOffset
    });
    const matches = data.matches || [];
    state.researchMatches = findMore
      ? [...state.researchMatches, ...matches]
      : matches;
    $("researchStatus").textContent = matches.length
      ? `${matches.length} possible match${matches.length === 1 ? "" : "es"} ${findMore ? "added" : "found"}. Review before adding.`
      : "No additional strong matches found.";
    renderResearchResults();
  }catch(err){
    $("researchStatus").textContent = err.message;
  }finally{
    $("researchBtn").disabled = false;
    const refreshedMoreBtn = $("findMoreBtn");

    if(refreshedMoreBtn){
      refreshedMoreBtn.disabled = false;
    }
  }
}

function openContactModal(contact = null){
  $("contactModalTitle").textContent = contact ? "Edit Relationship" : "Add Relationship";
  $("contactId").value = contact?.id || "";
  $("contactName").value = contact?.name || "";
  $("contactOrganization").value = contact?.organization || "";
  $("contactType").value = contact?.contact_type || "Agency Owner";
  $("contactStage").value = contact?.stage || "New";
  $("contactPriority").value = contact?.priority || "Medium";
  $("contactOwner").value = contact?.owner || "";
  $("contactPhone").value = contact?.phone || "";
  $("contactEmail").value = contact?.email || "";
  $("contactWebsite").value = contact?.website || "";
  $("contactSource").value = contact?.source || "";
  $("contactCity").value = contact?.city || "";
  $("contactState").value = contact?.state || "";
  $("contactDemoDate").value = contact?.demo_date ? String(contact.demo_date).slice(0, 16) : "";
  $("contactFollowUpDate").value = formatDate(contact?.follow_up_date);
  $("contactLastContactDate").value = formatDate(contact?.last_contact_date);
  $("contactReferralSource").value = contact?.referral_source || "";
  $("contactNotes").value = contact?.notes || "";
  $("contactModal").classList.add("open");
}

function closeContactModal(){
  $("contactModal").classList.remove("open");
}

window.editContact = (id) => {
  const contact = state.contacts.find((item) => item.id === id);
  if(contact){
    openContactModal(contact);
  }
};

window.quickActivity = (id) => {
  setView("activities");
  $("activityContactId").value = id;
  $("activityDate").value = new Date().toISOString().slice(0, 16);
  $("activityTitle").focus();
};

window.deleteRow = async (table, id) => {
  if(!confirm("Delete this item?")){
    return;
  }

  await api("delete", { table, id });
  await loadData();
  toast("Deleted.");
};

function wireEvents(){
  $("unlockBtn").addEventListener("click", async () => {
    try{
      const login = await publicApi("login", {
        email: $("emailInput").value.trim(),
        password: $("passwordInput").value
      });

      state.sessionToken = login.session_token;
      state.currentUser = login.user;
      sessionStorage.setItem("marketingCrmSession", state.sessionToken);
      sessionStorage.setItem("marketingCrmUser", JSON.stringify(state.currentUser));

      await loadData();
      $("loginCard").hidden = true;
      $("appShell").hidden = false;
      toast("Growth CRM unlocked.");
    }catch(err){
      $("loginMessage").textContent = err.message;
    }
  });

  if(state.sessionToken){
    loadData()
      .then(() => {
        $("loginCard").hidden = true;
        $("appShell").hidden = false;
      })
      .catch(() => {
        sessionStorage.removeItem("marketingCrmSession");
        sessionStorage.removeItem("marketingCrmUser");
        state.sessionToken = "";
        state.currentUser = null;
      });
  }

  document.querySelectorAll("[data-view]").forEach((node) => {
    node.addEventListener("click", () => setView(node.dataset.view));
  });

  document.querySelectorAll("[data-view-jump]").forEach((node) => {
    node.addEventListener("click", () => {
      setView(node.dataset.viewJump);

      if(node.dataset.contactFilter && $("typeFilter")){
        $("typeFilter").value = node.dataset.contactFilter;
        renderContactsTable();
      }
    });
  });

  document.querySelectorAll(".small-filter").forEach((node) => {
    node.addEventListener("click", () => {
      setView("contacts");
      $("typeFilter").value = node.dataset.filterType;
      renderContactsTable();
    });
  });

  $("refreshBtn").addEventListener("click", loadData);
  $("newContactBtn").addEventListener("click", () => openContactModal());
  $("newContactBtn2").addEventListener("click", () => openContactModal());
  $("researchBtn").addEventListener("click", () => runResearch(false));
  $("closeContactModal").addEventListener("click", closeContactModal);
  $("searchInput").addEventListener("input", renderContactsTable);
  $("typeFilter").addEventListener("change", renderContactsTable);
  $("stageFilter").addEventListener("change", renderContactsTable);

  $("contactForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    await api("save-contact", {
      id: $("contactId").value || undefined,
      name: $("contactName").value,
      organization: $("contactOrganization").value,
      contact_type: $("contactType").value,
      stage: $("contactStage").value,
      priority: $("contactPriority").value,
      owner: $("contactOwner").value,
      phone: $("contactPhone").value,
      email: $("contactEmail").value,
      website: $("contactWebsite").value,
      source: $("contactSource").value,
      city: $("contactCity").value,
      state: $("contactState").value,
      demo_date: $("contactDemoDate").value,
      follow_up_date: $("contactFollowUpDate").value,
      last_contact_date: $("contactLastContactDate").value,
      referral_source: $("contactReferralSource").value,
      notes: $("contactNotes").value
    });

    closeContactModal();
    await loadData();
    setView("contacts");
    toast("Relationship saved.");
  });

  $("activityForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    await api("save-activity", {
      contact_id: $("activityContactId").value || null,
      activity_type: $("activityType").value,
      activity_date: $("activityDate").value || new Date().toISOString(),
      title: $("activityTitle").value,
      notes: $("activityNotes").value,
      outcome: $("activityOutcome").value,
      next_follow_up_date: $("activityNextFollowUp").value
    });

    $("activityForm").reset();
    await loadData();
    toast("Activity saved.");
  });

  $("appointmentForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    await api("save-appointment", {
      id: $("appointmentId").value || undefined,
      contact_id: $("appointmentContactId").value || null,
      title: $("appointmentTitle").value,
      appointment_type: $("appointmentType").value,
      appointment_date: $("appointmentDate").value,
      appointment_time: $("appointmentTime").value,
      location: $("appointmentLocation").value,
      notes: $("appointmentNotes").value,
      status: "Scheduled"
    });

    $("appointmentForm").reset();
    await loadData();
    toast("Schedule item saved.");
  });

  $("logoutBtn").addEventListener("click", async () => {
    await api("logout").catch(() => {});
    sessionStorage.removeItem("marketingCrmSession");
    sessionStorage.removeItem("marketingCrmUser");
    state.sessionToken = "";
    state.currentUser = null;
    $("appShell").hidden = true;
    $("loginCard").hidden = false;
    toast("Signed out.");
  });
}

wireEvents();
