if(!sessionStorage.getItem("crm_uuid")){

  window.location = "login.html";

}

const params = new URLSearchParams(window.location.search);

const clientId = params.get("id");
let currentClient = null;
let clientPolicies = [];
let vitalinkDocuments = {};

console.log("VitaLink client view loaded: notes sync enabled");

function normalizePhoneForStorage(phone){

  if(!phone) return "";

  let digits =
    String(phone).replace(/\D/g,"");

  if(digits.length === 11 && digits.startsWith("1")){
    digits = digits.slice(1);
  }

  return digits.length === 10 ? digits : String(phone).trim();

}

function normalizeClientStatus(status){

  if(status === "Active"){
    return "Client";
  }

  if(status === "Follow-Up"){
    return "Follow Up";
  }

  if(status === "Prospect - Cold" ||
    status === "Prospect - Warm" ||
    status === "Prospect - Hot"){
    return "Prospect";
  }

  return status || "Client";

}

const leadSourceDetailLabels = {
  "Referral":"Referred By",
  "Seminar/Event":"Event / Seminar Location",
  "Facebook":"Campaign / Ad Name",
  "Google":"Campaign / Search Term",
  "Website":"Website Page / Form",
  "Direct Mail":"Mailer / Campaign",
  "Phone Call":"Call Source",
  "Walk-In":"Office / Event Location",
  "Existing Client":"Existing Client Name",
  "Purchased Lead":"Lead Vendor / Purchase Source",
  "Other":"Source Details"
};

function updateLeadSourceDetailLabel(){

  const source =
    document.getElementById("leadSource")?.value || "";

  const label =
    document.getElementById("leadSourceDetailLabel");

  if(label){
    label.innerText =
      leadSourceDetailLabels[source] || "Source Details";
  }

}

function setFieldEditable(id, editable){

  const field =
    document.getElementById(id);

  if(!field){
    return;
  }

  field.disabled =
    !editable;

  if(editable){
    field.removeAttribute("disabled");
  }else{
    field.setAttribute("disabled", "disabled");
  }

}

function leadSourceDetailFromClient(client){

  return client.lead_source_detail ||
    client.referral_source ||
    client.seminar_event ||
    "";

}

async function loadClient(){

  const res = await fetch(
    `/.netlify/functions/get-client?id=${clientId}`
  );

  const data = await res.json();

  const client = data.client;
  currentClient = client;

  if(!client){

    alert("Client not found");
    return;

  }

  document.getElementById("clientName").innerText =
  `${client.first_name || ""} ${client.last_name || ""}`;

  document.getElementById("clientSub").innerText =
  `${client.city || ""}, ${client.state || ""}`;

  document.getElementById("clientAvatar").innerText =
  `${client.first_name?.[0] || ""}${client.last_name?.[0] || ""}`.toUpperCase();

  document.getElementById("firstName").value =
    client.first_name || "";

  document.getElementById("lastName").value =
    client.last_name || "";

  document.getElementById("clientStatus").value =
    normalizeClientStatus(client.status);

  document.getElementById("dob").value =
    formatDate(client.dob);

  document.getElementById("mobilePhone").value =
    formatPhone(client.mobile_phone);

  document.getElementById("landlinePhone").value =
    formatPhone(client.landline_phone);

  document.getElementById("email").value =
    client.email || "";

  document.getElementById("address").value =
    client.address || "";

  document.getElementById("city").value =
    client.city || "";

  document.getElementById("state").value =
    client.state || "";

  document.getElementById("zip").value =
    client.zip || "";

  /* =========================================
     HOUSEHOLD
  ========================================= */

  if(document.getElementById("maritalStatus")){

    document.getElementById("maritalStatus").value =
      client.marital_status || "";

  }

  if(document.getElementById("spouseName")){

    document.getElementById("spouseName").value =
      client.spouse_name || "";

  }

  if(document.getElementById("spouseDob")){

    document.getElementById("spouseDob").value =
      client.spouse_dob || "";

  }

  setValue("leadSource", client.lead_source);
  updateLeadSourceDetailLabel();
  setValue("leadSourceDetail", leadSourceDetailFromClient(client));
  setValue("leadCost", client.lead_cost);
  setValue("dateAdded", formatDate(client.date_added));

  setValue("preferredContactMethod", client.preferred_contact_method);
  setValue("bestTimeToCall", client.best_time_to_call);
  setValue("textMessaging", client.text_messaging);
  setValue("emailCommunication", client.email_communication);

  setText("soaSigned", client.soa_signed || "Not Recorded");
  setText("hipaaSigned", client.hipaa_signed || "Not Recorded");
  setText("lastPolicyReview", formatDate(client.last_policy_review) || "Not Recorded");
  setText("profileLinked", client.vitalink_connected ? "Connected" : (client.profile_linked || "Not Linked"));
  setText("emergencyProfile", client.emergency_profile || "Not Recorded");
  setText("insuranceCardsUploaded", client.insurance_cards_uploaded || "Not Recorded");
  setValue("medicationList", client.medication_list);
  setValue("doctorList", client.doctor_list);
  setText("lastSync", formatDate(client.last_vitalink_import_at || client.last_sync) || "Not Imported");
  setText("lastVitalinkPackage", formatDate(client.last_vitalink_package_at) || "Not Received");
  setText("vitalinkEmergencyContacts", client.vitalink_emergency_contacts || "Not Received");
  setText("vitalinkPharmacies", client.vitalink_pharmacy_list || "Not Received");

  /* =========================================
     FAMILY
  ========================================= */

  if(document.getElementById("familyNote1")){

    document.getElementById("familyNote1").value =
      client.family_note_1 || "";

  }

  if(document.getElementById("familyNote2")){

    document.getElementById("familyNote2").value =
      client.family_note_2 || "";

  }

  if(document.getElementById("familyNote3")){

    document.getElementById("familyNote3").value =
      client.family_note_3 || "";

  }

  renderLeadRoi();
  loadVitalinkStatus();

}

/* =========================================
   CLIENT EDIT
========================================= */

let clientEdit = false;

function toggleClientEdit(){

  clientEdit = !clientEdit;

  const fields = [

    "firstName",
    "lastName",
    "clientStatus",
    "dob",
    "mobilePhone",
    "landlinePhone",
    "email",
    "address",
    "city",
    "state",
    "zip"

  ];

  fields.forEach(id => {

    document.getElementById(id).disabled =
      !clientEdit;

  });

  document.getElementById(
    "saveClientBtn"
  ).style.display =
    clientEdit ? "block" : "none";

}

function setValue(id, value){

  if(document.getElementById(id)){
    document.getElementById(id).value = value || "";
  }

}

function setText(id, value){

  if(document.getElementById(id)){
    document.getElementById(id).innerText = value || "";
  }

}

function escapeHtml(value){

  return (value || "").toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}

function setButtonEnabled(id, enabled){

  const button =
    document.getElementById(id);

  if(button){
    button.disabled = !enabled;
  }

}

async function loadVitalinkStatus(){

  const agentId =
    sessionStorage.getItem("crm_uuid");

  try{

    const res = await fetch(
      `/.netlify/functions/get-crm-vitalink-status?agent_id=${agentId}&client_id=${clientId}`
    );

    const data = await res.json();

    if(!data.success){
      return;
    }

    const client =
      data.client || {};

    const pkg =
      data.package || {};

    vitalinkDocuments =
      data.documents || {};

    setText("profileLinked", client.vitalink_connected ? "Connected" : "Not Linked");
    setText("lastVitalinkPackage", formatDate(pkg.received_at || client.last_vitalink_package_at) || "Not Received");
    setText("lastSync", formatDate(pkg.imported_at || client.last_vitalink_import_at) || "Not Imported");
    setText("hipaaSigned", formatDate(client.hipaa_signed_at || vitalinkDocuments.hipaa?.signed_at) || "Not Recorded");
    setText("soaSigned", formatDate(client.soa_signed_at || vitalinkDocuments.soa?.signed_at) || "Not Recorded");
    setText("vitalinkEmergencyContacts", client.vitalink_emergency_contacts || "Not Received");
    setText("vitalinkPharmacies", client.vitalink_pharmacy_list || "Not Received");

    setButtonEnabled("viewHipaaBtn", Boolean(vitalinkDocuments.hipaa?.id));
    setButtonEnabled("viewSoaBtn", Boolean(vitalinkDocuments.soa?.id));
    setButtonEnabled("printHipaaBtn", Boolean(vitalinkDocuments.hipaa?.id));
    setButtonEnabled("printSoaBtn", Boolean(vitalinkDocuments.soa?.id));

  }catch(err){

    console.warn("Unable to load VitaLink status", err);

  }

}

async function fetchVitalinkDocumentBlob(type){

  const doc =
    vitalinkDocuments[type];

  if(!doc?.id){
    alert("No VitaLink document is stored for this client yet.");
    return null;
  }

  const agentId =
    sessionStorage.getItem("crm_uuid");

  const res = await fetch(
    `/.netlify/functions/get-crm-client-document?agent_id=${agentId}&client_id=${clientId}&document_id=${doc.id}`
  );

  if(!res.ok){
    alert("Unable to open this VitaLink document.");
    return null;
  }

  return res.blob();

}

async function viewVitalinkDocument(type){

  const blob = await fetchVitalinkDocumentBlob(type);

  if(!blob){
    return;
  }

  const url = URL.createObjectURL(blob);

  window.open(url, "_blank", "noopener");

  setTimeout(() => URL.revokeObjectURL(url), 60000);

}

async function printVitalinkDocument(type){

  const blob = await fetchVitalinkDocumentBlob(type);

  if(!blob){
    return;
  }

  const url = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");

  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.src = url;

  frame.onload = () => {
    try{
      frame.contentWindow.focus();
      frame.contentWindow.print();
    }catch(err){
      window.open(url, "_blank", "noopener");
    }

    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 60000);
  };

  document.body.appendChild(frame);

}

async function loadClientTasks(){

  const container =
    document.getElementById("clientTasksList");

  if(!container){
    return;
  }

  const agent_id =
    sessionStorage.getItem("crm_uuid");

  const res = await fetch(
    `/.netlify/functions/get-crm-tasks?agent_id=${agent_id}&client_id=${clientId}`
  );

  const data = await res.json();

  if(!data.success){
    return;
  }

  const openTasks =
    (data.tasks || []).filter(task =>
      task.status !== "Complete"
    );

  container.innerHTML = "";

  if(openTasks.length === 0){

    container.innerHTML = `
      <div class="client-sub">
        No open tasks for this client.
      </div>
    `;

    return;

  }

  openTasks.slice(0,5).forEach(task => {

    container.innerHTML += `
      <div class="task">
        <div>
          <div class="client-name">
            ${task.title || ""}
          </div>
          <div class="client-meta">
            ${task.due_date ? formatDate(task.due_date) : "No due date"}
          </div>
        </div>

        <span class="status ${(task.priority || "medium").toLowerCase()}">
          ${task.priority || "Medium"}
        </span>
      </div>
    `;

  });

}

async function loadClientNotes(){

  console.log("Loading client notes for", clientId);

  const container =
    document.getElementById("clientNotesList");

  if(!container){
    return;
  }

  const agent_id =
    sessionStorage.getItem("crm_uuid");

  const res = await fetch(
    `/.netlify/functions/get-crm-notes?agent_id=${agent_id}&client_id=${clientId}`
  );

  const data = await res.json();

  if(!data.success){
    return;
  }

  const notes =
    data.notes || [];

  container.innerHTML = "";

  if(notes.length === 0){

    container.innerHTML = `
      <div class="client-sub">
        No notes for this client.
      </div>
    `;

    return;

  }

  notes.forEach(note => {

    container.innerHTML += `
      <div class="note">
        <div>
          ${escapeHtml(note.note)}
        </div>
        <div class="note-footer">
          <div class="note-date">
            ${note.created_at ? formatDate(note.created_at) : ""}
            ${note.source ? ` - ${escapeHtml(note.source)}` : ""}
          </div>
          <button
            class="edit-btn danger-btn"
            onclick="deleteClientNote('${note.id}')"
          >
            Delete
          </button>
        </div>
      </div>
    `;

  });

}

async function deleteClientNote(id){

  const confirmed = confirm(
    "Delete this note?"
  );

  if(!confirmed){
    return;
  }

  const res = await fetch(
    "/.netlify/functions/delete-crm-note",
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

    alert("Failed to delete note.");
    return;

  }

  loadClientNotes();

}

function newClientTask(){

  window.location.href =
    `tasks.html?client_id=${clientId}`;

}

async function saveClientPatch(patch){

  patch.id = clientId;

  const res = await fetch(
    "/.netlify/functions/update-crm-client",
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify(patch)
    }
  );

  const data = await res.json();

  if(!data.success){

    alert("Failed to update client.");
    return false;

  }

  loadClient();

  return true;

}

async function saveClientInfo(){

  const client = {

    id: clientId,

    first_name:
      document.getElementById("firstName").value,

    last_name:
      document.getElementById("lastName").value,

    dob:
      document.getElementById("dob").value,

    mobile_phone:
      normalizePhoneForStorage(document.getElementById("mobilePhone").value),

    landline_phone:
      normalizePhoneForStorage(document.getElementById("landlinePhone").value),

    email:
      document.getElementById("email").value,

    address:
      document.getElementById("address").value,

    city:
      document.getElementById("city").value,

    state:
      document.getElementById("state").value,

    zip:
      document.getElementById("zip").value,

    status:
      document.getElementById("clientStatus").value

  };

  const res = await fetch(
    "/.netlify/functions/update-crm-client",
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

    alert("Failed to update client.");
    return;

  }

  alert("Client updated.");

  toggleClientEdit();

  loadClient();

}

/* =========================================
   CLINICAL EDIT
========================================= */

let clinicalEdit = false;

function toggleClinicalEdit(){

  clinicalEdit = !clinicalEdit;

  [
    "medicationList",
    "doctorList"
  ].forEach(id => {

    document.getElementById(id).disabled =
      !clinicalEdit;

  });

  document.getElementById(
    "saveClinicalBtn"
  ).style.display =
    clinicalEdit ? "block" : "none";

}

async function saveClinicalInfo(){

  const saved = await saveClientPatch({
    medication_list:
      document.getElementById("medicationList").value,
    doctor_list:
      document.getElementById("doctorList").value
  });

  if(saved){
    toggleClinicalEdit();
  }

}

/* =========================================
   HOUSEHOLD EDIT
========================================= */

let householdEdit = false;

function toggleHouseholdEdit(){

  householdEdit = !householdEdit;

  const fields = [

    "maritalStatus",
    "spouseName",
    "spouseDob"
    

  ];

  fields.forEach(id => {

    if(document.getElementById(id)){

      document.getElementById(id).disabled =
        !householdEdit;

    }

  });

  if(document.getElementById("saveHouseholdBtn")){

    document.getElementById(
      "saveHouseholdBtn"
    ).style.display =
      householdEdit ? "block" : "none";

  }

}

async function saveHousehold(){

  const saved = await saveClientPatch({
    marital_status:
      document.getElementById("maritalStatus").value,
    spouse_name:
      document.getElementById("spouseName").value,
    spouse_dob:
      document.getElementById("spouseDob").value
  });

  if(saved){
    toggleHouseholdEdit();
  }

}

/* =========================================
   CREATE SPOUSE PROFILE
========================================= */

async function createSpouseProfile(){

  const spouseName =
    document.getElementById("spouseName").value;

  if(!spouseName){

    alert("Enter spouse name first.");
    return;

  }

  const parts = spouseName.trim().split(" ");

  const first_name = parts[0] || "";

  const last_name =
    parts.slice(1).join(" ") || "";

  const newClient = {

    first_name,
    last_name,

    dob:
      document.getElementById("spouseDob").value,

    agent_id:
      sessionStorage.getItem("crm_uuid"),

    linked_spouse_id: clientId

  };

  const res = await fetch(
    "/.netlify/functions/create-crm-client",
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify(newClient)
    }
  );

  const data = await res.json();

  if(!data.success){

    alert("Failed to create spouse profile.");
    return;

  }

  alert("Spouse profile created and linked.");

  window.location.href =
    `client-view.html?id=${data.client.id}`;

}

loadClient();
loadClientTasks();
loadClientNotes();
loadClientPolicies();

/* =========================================
   LEAD EDIT
========================================= */

let leadEdit = false;

function toggleLeadEdit(){

  leadEdit = !leadEdit;

  const fields = [

    "leadSource",
    "leadSourceDetail",
    "leadCost",
    "dateAdded",    

  ];

  fields.forEach(id => {

    setFieldEditable(id, leadEdit);

  });

  updateLeadSourceDetailLabel();

  document.getElementById(
    "saveLeadBtn"
  ).style.display =
    leadEdit ? "block" : "none";

}

async function saveLead(){

  const leadSource =
    document.getElementById("leadSource").value;

  const leadSourceDetail =
    document.getElementById("leadSourceDetail").value;

  const saved = await saveClientPatch({
    lead_source:leadSource,
    lead_source_detail:leadSourceDetail,
    referral_source:
      leadSource === "Referral" ? leadSourceDetail : "",
    seminar_event:
      leadSource === "Seminar/Event" ? leadSourceDetail : "",
    lead_cost:
      document.getElementById("leadCost").value,
    date_added:
      document.getElementById("dateAdded").value
  });

  if(saved){
    toggleLeadEdit();
  }

}

/* =========================================
   POLICIES / ROI
========================================= */

function moneyValue(value){

  const number =
    Number(String(value ?? "").replace(/[$,]/g, ""));

  return Number.isFinite(number) ? number : 0;

}

function formatMoney(value){

  return moneyValue(value).toLocaleString("en-US", {
    style:"currency",
    currency:"USD"
  });

}

function formatRoi(value){

  if(!Number.isFinite(value)){
    return "N/A";
  }

  return `${value.toFixed(1)}%`;

}

function newPolicy(){

  window.location.href =
    `policy-view.html?client_id=${clientId}`;

}

function openPolicy(policyId){

  window.location.href =
    `policy-view.html?id=${policyId}`;

}

function renderLeadRoi(){

  const container =
    document.getElementById("leadRoiSummary");

  if(!container){
    return;
  }

  const leadCost =
    moneyValue(currentClient?.lead_cost);

  const commission =
    clientPolicies.reduce(
      (total, policy) => total + moneyValue(policy.commission_amount),
      0
    );

  const net =
    commission - leadCost;

  const roi =
    leadCost > 0 ? (net / leadCost) * 100 : NaN;

  container.innerHTML = `
    <div class="billing-summary-card">
      <div class="label">Lead Cost</div>
      <div class="value">${formatMoney(leadCost)}</div>
    </div>
    <div class="billing-summary-card">
      <div class="label">Commission</div>
      <div class="value">${formatMoney(commission)}</div>
    </div>
    <div class="billing-summary-card">
      <div class="label">Net Return</div>
      <div class="value">${formatMoney(net)}</div>
    </div>
    <div class="billing-summary-card">
      <div class="label">ROI</div>
      <div class="value">${formatRoi(roi)}</div>
    </div>
  `;

}

function renderPolicies(){

  const container =
    document.getElementById("policiesList");

  if(!container){
    return;
  }

  if(clientPolicies.length === 0){
    container.innerHTML = `
      <div class="client-sub">
        No policies saved for this client.
      </div>
    `;
    return;
  }

  container.innerHTML = "";

  clientPolicies.forEach(policy => {

    container.innerHTML += `
      <div class="policy-row">
        <div>
          <div class="client-name">
            ${escapeHtml(policy.carrier || "Policy")}
          </div>
          <div class="client-meta">
            ${escapeHtml([policy.plan_name, policy.policy_type].filter(Boolean).join(" - "))}
          </div>
          <div class="client-meta">
            ${policy.effective_date ? formatDate(policy.effective_date) : "No effective date"}
            ${policy.monthly_premium ? ` · ${formatMoney(policy.monthly_premium)}/mo` : ""}
          </div>
        </div>
        <button
          class="edit-btn secondary"
          onclick="openPolicy('${policy.id}')"
        >
          View
        </button>
      </div>
    `;

  });

}

async function loadClientPolicies(){

  const agentId =
    sessionStorage.getItem("crm_uuid");

  const res = await fetch(
    `/.netlify/functions/get-crm-policies?agent_id=${agentId}&client_id=${clientId}`
  );

  const data = await res.json();

  if(!data.success){
    document.getElementById("policiesList").innerHTML =
      data.error || "Unable to load policies.";
    return;
  }

  clientPolicies =
    data.policies || [];

  renderPolicies();
  renderLeadRoi();

}

/* =========================================
   COMMUNICATION EDIT
========================================= */

let communicationEdit = false;

function toggleCommunicationEdit(){

  communicationEdit = !communicationEdit;

  const fields = [

    "preferredContactMethod",
    "bestTimeToCall",
    "textMessaging",
    "emailCommunication"

  ];

  fields.forEach(id => {

    if(document.getElementById(id)){

      document.getElementById(id).disabled =
        !communicationEdit;

    }

  });

  document.getElementById(
    "saveCommunicationBtn"
  ).style.display =
    communicationEdit ? "block" : "none";

}

async function saveCommunication(){

  const saved = await saveClientPatch({
    preferred_contact_method:
      document.getElementById("preferredContactMethod").value,
    best_time_to_call:
      document.getElementById("bestTimeToCall").value,
    text_messaging:
      document.getElementById("textMessaging").value,
    email_communication:
      document.getElementById("emailCommunication").value
  });

  if(saved){
    toggleCommunicationEdit();
  }

}

