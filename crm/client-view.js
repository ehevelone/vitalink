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

  document.getElementById("firstName").innerText =
    client.first_name || "";

  document.getElementById("lastName").innerText =
    client.last_name || "";

  document.getElementById("dob").innerText =
    formatDate(client.dob);

  document.getElementById("mobilePhone").innerText =
    formatPhone(client.mobile_phone);

  document.getElementById("landlinePhone").innerText =
    formatPhone(client.landline_phone);

  document.getElementById("email").innerText =
    client.email || "";

  document.getElementById("address").innerText =
    client.address || "";

  document.getElementById("city").innerText =
    client.city || "";

  document.getElementById("state").innerText =
    client.state || "";

  document.getElementById("zip").innerText =
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

  if(document.getElementById("linkedSpouseProfile")){

    document.getElementById("linkedSpouseProfile").value =
      client.linked_spouse_profile || "";

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
   HOUSEHOLD EDIT
========================================= */

let householdEdit = false;

function toggleHouseholdEdit(){

  householdEdit = !householdEdit;

  const fields = [

    "maritalStatus",
    "spouseName",
    "spouseDob",
    "linkedSpouseProfile"

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