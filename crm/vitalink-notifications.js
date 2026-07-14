if(!sessionStorage.getItem("crm_uuid")){
  window.location = "login.html";
}

const APP_API =
  "https://vitalink-app.netlify.app/.netlify/functions";

const campaignNames = {
  GENERAL:"General Info Request",
  PREP:"Enrollment Prep",
  AEP:"AEP Review",
  OEP:"OEP Review",
  UPDATE:"App Update"
};

const agentEmail =
  sessionStorage.getItem("agentEmail") || "";

document.getElementById("agentEmailValue").innerText =
  agentEmail || "Log out and back in to refresh agent email.";

document.querySelectorAll(".notification-option input").forEach(input => {
  input.addEventListener("change", () => {
    document.querySelectorAll(".notification-option")
      .forEach(option => option.classList.remove("active"));
    input.closest(".notification-option").classList.add("active");
  });
});

function selectedCampaign(){
  return document.querySelector("input[name='campaignChoice']:checked").value;
}

function setStatus(text, mode = "ready"){
  const pill = document.getElementById("notificationStatusPill");
  pill.innerText = text;
  pill.className = `notification-status-pill ${mode}`;
}

function setResult(text, mode = "info"){
  const result = document.getElementById("notificationResult");
  result.innerText = text;
  result.className = `notification-result ${mode}`;
}

function addLogEntry({campaign, targeted, delivered, failed}){
  const log = document.getElementById("notificationLog");
  const time = new Date().toLocaleString([], {
    month:"short",
    day:"numeric",
    hour:"numeric",
    minute:"2-digit"
  });

  log.innerHTML = `
    <div class="notification-log-entry">
      <div>
        <strong>${campaignNames[campaign] || campaign}</strong>
        <span>${time}</span>
      </div>
      <div>${delivered} delivered · ${failed} failed · ${targeted} targeted</div>
    </div>
  ` + log.innerHTML.replace('<div class="empty-state">No notification has been sent from this session yet.</div>', "");
}

async function sendNotification(){
  if(!agentEmail){
    setResult("Agent email is missing. Please log out and back in.", "error");
    return;
  }

  const button =
    document.getElementById("sendNotificationBtn");

  const campaign = selectedCampaign();

  button.disabled = true;
  button.innerText = "Sending...";
  setStatus("Sending", "busy");
  setResult("", "info");

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
          campaign
        })
      }
    );

    const data = await res.json();

    if(!data.success){
      const message = data.error || "Notification failed.";
      setResult(message, "error");
      setStatus("Failed", "error");
      return;
    }

    const delivered =
      data.successCount ?? data.sent ?? 0;

    const failed =
      data.failureCount ?? data.failed ?? 0;

    const targeted =
      data.devicesTargeted ?? delivered + failed;

    document.getElementById("statDelivered").innerText = delivered;
    document.getElementById("statFailed").innerText = failed;
    document.getElementById("statTargeted").innerText = targeted;

    setResult(
      `Notification sent. Targeted ${targeted}. Delivered ${delivered}. Failed ${failed}.`,
      failed > 0 ? "warning" : "success"
    );
    setStatus("Sent", failed > 0 ? "warning" : "success");
    addLogEntry({campaign, targeted, delivered, failed});

  }catch(err){
    console.error(err);
    setResult("Notification failed. Please check the connection and try again.", "error");
    setStatus("Failed", "error");
  }finally{
    button.disabled = false;
    button.innerText = "Send Notification";
  }
}
