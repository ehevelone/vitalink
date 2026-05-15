if(!sessionStorage.getItem("crm_uuid")){
  window.location = "login.html";
}

function exportVitalinkClients(){
  const agentId =
    sessionStorage.getItem("crm_uuid");

  if(!agentId){
    alert("CRM login is missing. Please log out and back in.");
    return;
  }

  window.location.href =
    `/.netlify/functions/export-vitalink-clients-csv?agent_id=${encodeURIComponent(agentId)}`;
}
