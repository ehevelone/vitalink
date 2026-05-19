if(!sessionStorage.getItem("crm_uuid")){
  window.location = "login.html";
}

function billingRequestBody(){
  return {
    agentId:sessionStorage.getItem("agentId"),
    agentSessionToken:
      sessionStorage.getItem("agentSessionToken")
  };
}

function agentSessionHeader(){
  return sessionStorage.getItem("agentSessionToken") || "";
}

function safeText(value){
  return String(value ?? "").replace(/[&<>"']/g,(char)=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[char]));
}

async function loadBillingSummary(){
  const status =
    document.getElementById("billingStatus");

  if(!status){
    return;
  }

  try{
    const res = await fetch(
      "https://vitalink-app.netlify.app/.netlify/functions/get-crm-billing-summary",
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "x-agent-session":agentSessionHeader()
        },
        body:JSON.stringify(billingRequestBody())
      }
    );

    const data = await res.json();

    if(!res.ok || !data.success){
      throw new Error(data.error || "Unable to load billing summary.");
    }

    const billing =
      data.billing || {};

    status.innerHTML = `
      <div class="info-row">
        <div class="label">Subscription</div>
        <div class="value">${safeText(billing.status || "Inactive")}</div>
      </div>
      <div class="info-row">
        <div class="label">Plan</div>
        <div class="value">${safeText(billing.plan || "CRM Access")}</div>
      </div>
      <div class="info-row">
        <div class="label">Payment Method</div>
        <div class="value">${safeText(billing.payment_method || "No payment method on file")}</div>
      </div>
      <div class="info-row">
        <div class="label">Next Billing Date</div>
        <div class="value">${safeText(billing.next_billing_date || "Not scheduled")}</div>
      </div>
    `;
  }catch(err){
    status.innerText =
      err.message || "Unable to load billing summary.";
  }
}

async function openCrmBilling(){
  const button =
    document.getElementById("crmBillingBtn");
  const status =
    document.getElementById("billingStatus");

  if(button){
    button.disabled = true;
    button.textContent = "Opening Billing...";
  }

  if(status){
    status.innerText = "Opening secure Stripe billing portal...";
  }

  try{
    const res = await fetch(
      "https://vitalink-app.netlify.app/.netlify/functions/create-crm-billing-session",
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "x-agent-session":agentSessionHeader()
        },
        body:JSON.stringify(billingRequestBody())
      }
    );

    const data = await res.json();

    if(!res.ok || !data.url){
      throw new Error(data.error || "Unable to open CRM billing.");
    }

    window.location.href = data.url;
  }catch(err){
    alert(err.message || "Unable to open CRM billing.");

    if(button){
      button.disabled = false;
      button.textContent = "Update Billing in Stripe";
    }

    if(status){
      loadBillingSummary();
    }
  }
}

loadBillingSummary();
