if(!sessionStorage.getItem("crm_uuid")){
  window.location = "login.html";
}

const APP_API =
  "https://vitalink-app.netlify.app/.netlify/functions";

document.getElementById("agentEmailValue").innerText =
  sessionStorage.getItem("agentEmail") || "Log out and back in to refresh agent email.";

async function sendNotification(){
  const agentEmail =
    sessionStorage.getItem("agentEmail");

  if(!agentEmail){
    alert("Agent email is missing. Please log out and back in.");
    return;
  }

  const button =
    document.getElementById("sendNotificationBtn");

  const result =
    document.getElementById("notificationResult");

  button.disabled = true;
  button.innerText = "Sending...";
  result.innerText = "";

  try{
    const res = await fetch(
      `${APP_API}/send_notification`,
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          agentEmail,
          campaign:document.getElementById("campaign").value
        })
      }
    );

    const data = await res.json();

    if(!data.success){
      result.innerText = data.error || "Notification failed.";
      return;
    }

    const delivered =
      data.successCount ?? data.sent ?? 0;

    const failed =
      data.failureCount ?? data.failed ?? 0;

    const targeted =
      data.devicesTargeted ?? delivered + failed;

    result.innerText =
      `Notification sent. Targeted ${targeted}. Delivered ${delivered}. Failed ${failed}.`;

  }catch(err){
    console.error(err);
    result.innerText = "Notification failed.";
  }finally{
    button.disabled = false;
    button.innerText = "Send Notification";
  }
}
