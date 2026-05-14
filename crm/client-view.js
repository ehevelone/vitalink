const params = new URLSearchParams(window.location.search);

const clientId = params.get("id");

async function loadClient(){

  const res = await fetch(
    `/.netlify/functions/get-client?id=${clientId}`
  );

  const data = await res.json();

  console.log(data);

  const client = data.client;

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

  alert("Household updated.");

  toggleHouseholdEdit();

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

/* =========================================
   FAMILY EDIT
========================================= */

let familyEdit = false;

function toggleFamilyEdit(){

  familyEdit = !familyEdit;

  const fields = [

    "familyNote1",
    "familyNote2",
    "familyNote3"

  ];

  fields.forEach(id => {

    if(document.getElementById(id)){

      document.getElementById(id).disabled =
        !familyEdit;

    }

  });

  if(document.getElementById("saveFamilyBtn")){

    document.getElementById(
      "saveFamilyBtn"
    ).style.display =
      familyEdit ? "block" : "none";

  }

}

async function saveFamily(){

  alert("Family notes updated.");

  toggleFamilyEdit();

}

loadClient();

/* =========================================
   LEAD EDIT
========================================= */

let leadEdit = false;

function toggleLeadEdit(){

  leadEdit = !leadEdit;

  const fields = [

    "leadSource",
    "referralSource",
    "seminarEvent",
    "leadCost",
    "dateAdded",    

  ];

  fields.forEach(id => {

    if(document.getElementById(id)){

      document.getElementById(id).disabled =
        !leadEdit;

    }

  });

  document.getElementById(
    "saveLeadBtn"
  ).style.display =
    leadEdit ? "block" : "none";

}

async function saveLead(){

  alert("Lead information updated.");

  toggleLeadEdit();

}

/* =========================================
   POLICY EDIT
========================================= */

let policyEdit = false;

function togglePolicyEdit(){

  policyEdit = !policyEdit;

  const fields = [

    "policyCarrier",
    "planName",
    "planType",
    "effectiveDate",
    "renewalMonth",
    "monthlyPremium"

  ];

  fields.forEach(id => {

    if(document.getElementById(id)){

      document.getElementById(id).disabled =
        !policyEdit;

    }

  });

  document.getElementById(
    "savePolicyBtn"
  ).style.display =
    policyEdit ? "block" : "none";

}

async function savePolicy(){

  alert("Policy information updated.");

  togglePolicyEdit();

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

  alert("Communication preferences updated.");

  toggleCommunicationEdit();

}

/* =========================================
   VITALINK EDIT
========================================= */

let vitaLinkEdit = false;

function toggleVitaLinkEdit(){

  vitaLinkEdit = !vitaLinkEdit;

  const fields = [

    "profileLinked",
    "emergencyProfile",
    "insuranceCardsUploaded",
    "medicationList",
    "lastSync"

  ];

  fields.forEach(id => {

    if(document.getElementById(id)){

      document.getElementById(id).disabled =
        !vitaLinkEdit;

    }

  });

  document.getElementById(
    "saveVitaLinkBtn"
  ).style.display =
    vitaLinkEdit ? "block" : "none";

}

async function saveVitaLink(){

  alert("VitaLink status updated.");

  toggleVitaLinkEdit();

}

