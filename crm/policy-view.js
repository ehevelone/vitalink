if(!sessionStorage.getItem("crm_uuid")){
  window.location = "login.html";
}

const params =
  new URLSearchParams(window.location.search);

const policyId =
  params.get("id");

let clientId =
  params.get("client_id");

let currentPolicy = null;

function setValue(id, value){
  const field =
    document.getElementById(id);

  if(field){
    field.value = value ?? "";
  }
}

function formatDate(value){
  if(!value){
    return "";
  }

  return String(value).split("T")[0];
}

function moneyValue(value){
  const number =
    Number(String(value ?? "").replace(/[^0-9.-]/g, ""));

  return Number.isFinite(number) ? number : 0;
}

function flatCommissionTypes(){
  return [
    "medicare advantage",
    "mapd",
    "ma-only",
    "prescription drug plan",
    "pdp",
    "dsnp",
    "csnp"
  ];
}

function commissionTypeForPolicy(){
  const type =
    document.getElementById("policyType").value
      .trim()
      .toLowerCase();

  return flatCommissionTypes().some(item => type.includes(item)) ?
    "flat" :
    "percent";
}

function updateCommissionFields(){
  const commissionType =
    commissionTypeForPolicy();

  const rate =
    document.getElementById("commissionRate");

  const amount =
    document.getElementById("commissionAmount");

  if(commissionType === "flat"){
    rate.disabled = true;
    rate.value = "";
    rate.placeholder = "Not used for MA/PDP";
    amount.placeholder = "Expected Flat Commission";
    return;
  }

  rate.disabled = false;
  rate.placeholder = "Commission Rate %";
  amount.placeholder = "Expected Commission";

  calculateExpectedCommission();
}

function calculateExpectedCommission(){
  if(commissionTypeForPolicy() !== "percent"){
    return;
  }

  const annualPremium =
    moneyValue(document.getElementById("annualPremium").value);

  const rate =
    moneyValue(document.getElementById("commissionRate").value);

  if(!annualPremium || !rate){
    return;
  }

  document.getElementById("commissionAmount").value =
    (annualPremium * (rate / 100)).toFixed(2);
}

function policyBody(){
  return {
    id:policyId || undefined,
    agent_id:sessionStorage.getItem("crm_uuid"),
    client_id:clientId,
    carrier:document.getElementById("carrier").value,
    plan_name:document.getElementById("planName").value,
    policy_type:document.getElementById("policyType").value,
    policy_number:document.getElementById("policyNumber").value,
    member_id:document.getElementById("memberId").value,
    effective_date:document.getElementById("effectiveDate").value,
    renewal_month:document.getElementById("renewalMonth").value,
    monthly_premium:document.getElementById("monthlyPremium").value,
    annual_premium:document.getElementById("annualPremium").value,
    commission_type:commissionTypeForPolicy(),
    commission_rate:document.getElementById("commissionRate").value,
    commission_amount:document.getElementById("commissionAmount").value,
    paid_amount:document.getElementById("paidAmount").value,
    paid_date:document.getElementById("paidDate").value,
    status:document.getElementById("status").value,
    notes:document.getElementById("notes").value
  };
}

function fillPolicy(policy){
  currentPolicy = policy;
  clientId = String(policy.client_id);

  setValue("carrier", policy.carrier);
  setValue("planName", policy.plan_name);
  setValue("policyType", policy.policy_type);
  setValue("policyNumber", policy.policy_number);
  setValue("memberId", policy.member_id);
  setValue("effectiveDate", formatDate(policy.effective_date));
  setValue("renewalMonth", policy.renewal_month);
  setValue("monthlyPremium", policy.monthly_premium);
  setValue("annualPremium", policy.annual_premium);
  setValue("commissionRate", policy.commission_rate);
  setValue("commissionAmount", policy.commission_amount);
  setValue("paidAmount", policy.paid_amount);
  setValue("paidDate", formatDate(policy.paid_date));
  setValue("status", policy.status || "Active");
  setValue("notes", policy.notes);

  updateCommissionFields();

  document.getElementById("policyPageTitle").innerText =
    policy.carrier || "Policy";

  document.getElementById("policyPageSubtitle").innerText =
    [policy.plan_name, policy.policy_type].filter(Boolean).join(" - ") ||
    "Policy details";
}

async function loadPolicy(){
  if(!policyId){
    document.getElementById("deletePolicyBtn").style.display = "none";
    return;
  }

  const agentId =
    sessionStorage.getItem("crm_uuid");

  const res = await fetch(
    `/.netlify/functions/get-crm-policies?agent_id=${agentId}`,
    {
      headers:getCrmSessionHeaders()
    }
  );

  const data = await res.json();

  if(!data.success){
    alert(data.error || "Unable to load policy.");
    return;
  }

  const policy =
    (data.policies || []).find(item =>
      String(item.id) === String(policyId)
    );

  if(!policy){
    alert("Policy not found.");
    return;
  }

  fillPolicy(policy);
}

async function savePolicy(){
  if(!clientId){
    alert("Missing client.");
    return;
  }

  const res = await fetch(
    "/.netlify/functions/save-crm-policy",
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        ...getCrmSessionHeaders()
      },
      body:JSON.stringify(policyBody())
    }
  );

  const data = await res.json();

  if(!data.success){
    alert(data.error || "Unable to save policy.");
    return;
  }

  window.location.href =
    `client-view.html?id=${clientId}`;
}

async function deletePolicy(){
  if(!policyId){
    return;
  }

  if(!confirm("Delete this policy?")){
    return;
  }

  const res = await fetch(
    "/.netlify/functions/delete-crm-policy",
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        ...getCrmSessionHeaders()
      },
      body:JSON.stringify({ id:policyId })
    }
  );

  const data = await res.json();

  if(!data.success){
    alert(data.error || "Unable to delete policy.");
    return;
  }

  returnToClient();
}

function returnToClient(){
  if(clientId){
    window.location.href =
      `client-view.html?id=${clientId}`;
    return;
  }

  window.location.href =
    "clients.html";
}

document
  .getElementById("policyType")
  .addEventListener("change", updateCommissionFields);

document
  .getElementById("annualPremium")
  .addEventListener("input", calculateExpectedCommission);

document
  .getElementById("commissionRate")
  .addEventListener("input", calculateExpectedCommission);

updateCommissionFields();

loadPolicy();
