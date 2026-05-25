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

let productLibraryCarriers = [];
let productLibraryProducts = [];
let productLibraryLoaded = false;
let productLibraryLoadError = "";
let syncingPremiumFields = false;

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

function formatCurrency(value){
  const number =
    moneyValue(value);

  if(!number){
    return "";
  }

  return number.toLocaleString("en-US", {
    style:"currency",
    currency:"USD",
    minimumFractionDigits:2,
    maximumFractionDigits:2
  });
}

function formatMoneyField(id){
  const field =
    document.getElementById(id);

  if(field){
    field.value = formatCurrency(field.value);
  }
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
    formatCurrency(annualPremium * (rate / 100));
}

function syncPremiumFromMonthly(){
  if(syncingPremiumFields){
    return;
  }

  syncingPremiumFields = true;

  const monthly =
    moneyValue(document.getElementById("monthlyPremium").value);

  document.getElementById("annualPremium").value =
    monthly ? formatCurrency(monthly * 12) : "";

  syncingPremiumFields = false;
  calculateExpectedCommission();
}

function syncPremiumFromAnnual(){
  if(syncingPremiumFields){
    return;
  }

  syncingPremiumFields = true;

  const annual =
    moneyValue(document.getElementById("annualPremium").value);

  document.getElementById("monthlyPremium").value =
    annual ? formatCurrency(annual / 12) : "";

  syncingPremiumFields = false;
  calculateExpectedCommission();
}

function escapeAttribute(value){
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[char]));
}

function renderCarrierOptions(searchText = ""){
  const menu =
    document.getElementById("carrierSuggestions");

  if(!menu){
    return;
  }

  const search =
    String(searchText || "").trim().toLowerCase();

  if(productLibraryLoadError){
    menu.innerHTML =
      `<div class="typeahead-empty">${escapeAttribute(productLibraryLoadError)}</div>`;
    menu.classList.add("active");
    return;
  }

  if(!productLibraryLoaded){
    menu.innerHTML =
      `<div class="typeahead-empty">Loading carrier library...</div>`;
    menu.classList.add("active");
    return;
  }

  if(!productLibraryCarriers.length){
    menu.innerHTML =
      `<div class="typeahead-empty">Carrier library is empty. Upload names from Business Tracker or preload ASB from Admin.</div>`;
    menu.classList.add("active");
    return;
  }

  const matches =
    productLibraryCarriers
      .filter(carrier =>
        !search ||
        String(carrier.name || "").toLowerCase().includes(search)
      )
      .slice(0, 12);

  if(!matches.length){
    menu.innerHTML =
      `<div class="typeahead-empty">No matching companies found.</div>`;
    menu.classList.add("active");
    return;
  }

  menu.innerHTML =
    matches
      .map(carrier =>
        `<button class="typeahead-option" type="button" data-carrier="${escapeAttribute(carrier.name)}">${escapeAttribute(carrier.name)}</button>`
      )
      .join("");

  menu.classList.add("active");
}

function selectCarrierSuggestion(value){
  setValue("carrier", value);
  hideCarrierOptions();

  if(document.activeElement === document.getElementById("planName")){
    renderProductOptions(document.getElementById("planName").value);
  }
}

function hideCarrierOptions(){
  const menu =
    document.getElementById("carrierSuggestions");

  if(menu){
    menu.classList.remove("active");
  }
}

function selectedCarrierText(){
  return String(document.getElementById("carrier")?.value || "")
    .trim()
    .toLowerCase();
}

function renderProductOptions(searchText = ""){
  const menu =
    document.getElementById("productSuggestions");

  if(!menu){
    return;
  }

  const search =
    String(searchText || "").trim().toLowerCase();

  if(productLibraryLoadError){
    menu.innerHTML =
      `<div class="typeahead-empty">${escapeAttribute(productLibraryLoadError)}</div>`;
    menu.classList.add("active");
    return;
  }

  if(!productLibraryLoaded){
    menu.innerHTML =
      `<div class="typeahead-empty">Loading product library...</div>`;
    menu.classList.add("active");
    return;
  }

  if(!productLibraryProducts.length){
    menu.innerHTML =
      `<div class="typeahead-empty">Product library is empty. Upload names from Business Tracker or preload ASB from Admin.</div>`;
    menu.classList.add("active");
    return;
  }

  const carrier =
    selectedCarrierText();

  const seen =
    new Set();

  const matches =
    productLibraryProducts
      .filter(product => {
        const productName =
          String(product.name || "");

        const productCarrier =
          String(product.carrier_name || "").trim().toLowerCase();

        if(carrier && productCarrier !== carrier){
          return false;
        }

        return !search ||
          productName.toLowerCase().includes(search);
      })
      .filter(product => {
        const key =
          `${String(product.carrier_name || "").toLowerCase()}|${String(product.name || "").toLowerCase()}`;

        if(seen.has(key)){
          return false;
        }

        seen.add(key);
        return true;
      })
      .slice(0, 12);

  if(!matches.length){
    menu.innerHTML =
      `<div class="typeahead-empty">No matching products found.</div>`;
    menu.classList.add("active");
    return;
  }

  menu.innerHTML =
    matches
      .map(product =>
        `<button class="typeahead-option" type="button" data-product="${escapeAttribute(product.name)}" data-policy-type="${escapeAttribute(product.product_type || "")}">${escapeAttribute(product.name)}</button>`
      )
      .join("");

  menu.classList.add("active");
}

function selectProductSuggestion(value, policyType = ""){
  setValue("planName", value);

  if(policyType){
    setValue("policyType", policyType);
    updateCommissionFields();
  }

  hideProductOptions();
}

function hideProductOptions(){
  const menu =
    document.getElementById("productSuggestions");

  if(menu){
    menu.classList.remove("active");
  }
}

async function loadProductLibrary(){
  const agentId =
    sessionStorage.getItem("crm_uuid");

  if(!agentId){
    return;
  }

  productLibraryLoaded = false;
  productLibraryLoadError = "";

  try{
    const res =
      await fetch(
        `/.netlify/functions/get-crm-product-library?agent_id=${encodeURIComponent(agentId)}`,
        {
          headers:getCrmSessionHeaders()
        }
      );

    const data =
      await res.json().catch(() => null);

    if(!res.ok || !data || !data.success){
      productLibraryLoadError =
        data?.error ?
          `Carrier library failed to load: ${data.error}` :
          `Carrier library failed to load (${res.status}).`;
      productLibraryLoaded = true;
      renderCarrierOptions(document.getElementById("carrier")?.value || "");
      return;
    }

    productLibraryCarriers =
      Array.isArray(data.carriers) ? data.carriers : [];

    productLibraryProducts =
      Array.isArray(data.products) ? data.products : [];

    productLibraryLoaded = true;

    console.info(
      `Loaded ${data.carrier_count ?? productLibraryCarriers.length} carriers and ${data.product_count ?? 0} products.`
    );

    if(document.activeElement === document.getElementById("carrier")){
      renderCarrierOptions(document.getElementById("carrier").value);
    }

    if(document.activeElement === document.getElementById("planName")){
      renderProductOptions(document.getElementById("planName").value);
    }
  }catch(err){
    console.warn("Unable to load product library carriers", err);
    productLibraryLoadError =
      "Carrier library failed to load. Check the product library function deploy.";
    productLibraryLoaded = true;
    renderCarrierOptions(document.getElementById("carrier")?.value || "");
    renderProductOptions(document.getElementById("planName")?.value || "");
  }
}

async function findCommissionMatch(){
  const res = await fetch(
    "/.netlify/functions/match-crm-commission",
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        ...getCrmSessionHeaders()
      },
      body:JSON.stringify({
        agent_id:sessionStorage.getItem("crm_uuid"),
        carrier:document.getElementById("carrier").value,
        plan_name:document.getElementById("planName").value,
        policy_type:document.getElementById("policyType").value,
        annual_premium:moneyValue(document.getElementById("annualPremium").value)
      })
    }
  );

  const data = await res.json();

  if(!data.success){
    alert(data.error || "Unable to find commission match.");
    return;
  }

  if(!data.match){
    alert("No schedule match found yet.");
    return;
  }

  const match =
    data.match;

  if(match.commission_type === "percent"){
    setValue("commissionRate", match.commission_rate);
  }

  if(match.expected_commission){
    setValue("commissionAmount", formatCurrency(match.expected_commission));
  }else if(match.commission_amount){
    setValue("commissionAmount", formatCurrency(match.commission_amount));
  }

  alert(
    `Matched ${match.carrier || "schedule"} from ${match.source_file || "uploaded schedule"}.`
  );
}

function policyBody(){
  const paidDate =
    document.getElementById("paidDate").value;

  let status =
    document.getElementById("status").value;

  if(
    paidDate &&
    ["active", "pending", "submitted"].includes(String(status || "").toLowerCase())
  ){
    status = "Paid";
  }

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
    monthly_premium:moneyValue(document.getElementById("monthlyPremium").value),
    annual_premium:moneyValue(document.getElementById("annualPremium").value),
    commission_type:commissionTypeForPolicy(),
    commission_rate:document.getElementById("commissionRate").value,
    commission_amount:moneyValue(document.getElementById("commissionAmount").value),
    paid_amount:moneyValue(document.getElementById("paidAmount").value),
    paid_date:paidDate,
    status,
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
  setValue("monthlyPremium", formatCurrency(policy.monthly_premium));
  setValue("annualPremium", formatCurrency(policy.annual_premium));
  setValue("commissionRate", policy.commission_rate);
  setValue("commissionAmount", formatCurrency(policy.commission_amount));
  setValue("paidAmount", formatCurrency(policy.paid_amount));
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
  .addEventListener("input", syncPremiumFromAnnual);

document
  .getElementById("monthlyPremium")
  .addEventListener("input", syncPremiumFromMonthly);

document
  .getElementById("commissionRate")
  .addEventListener("input", calculateExpectedCommission);

document
  .getElementById("paidDate")
  .addEventListener("change", event => {
    const status =
      document.getElementById("status");

    if(
      event.target.value &&
      ["Active", "Pending", "Submitted"].includes(status.value)
    ){
      status.value = "Paid";
    }
  });

[
  "monthlyPremium",
  "annualPremium",
  "commissionAmount",
  "paidAmount"
].forEach(id => {
  document
    .getElementById(id)
    .addEventListener("blur", () => formatMoneyField(id));
});

document
  .getElementById("carrier")
  .addEventListener("input", event => {
    renderCarrierOptions(event.target.value);

    if(document.activeElement === document.getElementById("planName")){
      renderProductOptions(document.getElementById("planName").value);
    }
  });

document
  .getElementById("carrier")
  .addEventListener("focus", event => renderCarrierOptions(event.target.value));

document
  .getElementById("carrier")
  .addEventListener("click", event => renderCarrierOptions(event.target.value));

document
  .getElementById("carrierSuggestions")
  .addEventListener("mousedown", event => {
    const option =
      event.target.closest(".typeahead-option");

    if(option){
      event.preventDefault();
      selectCarrierSuggestion(option.dataset.carrier);
    }
  });

document
  .getElementById("planName")
  .addEventListener("input", event => renderProductOptions(event.target.value));

document
  .getElementById("planName")
  .addEventListener("focus", event => renderProductOptions(event.target.value));

document
  .getElementById("planName")
  .addEventListener("click", event => renderProductOptions(event.target.value));

document
  .getElementById("productSuggestions")
  .addEventListener("mousedown", event => {
    const option =
      event.target.closest(".typeahead-option");

    if(option){
      event.preventDefault();
      selectProductSuggestion(option.dataset.product, option.dataset.policyType);
    }
  });

document.addEventListener("click", event => {
  if(!event.target.closest(".typeahead-field")){
    hideCarrierOptions();
    hideProductOptions();
  }
});

updateCommissionFields();

loadProductLibrary();

loadPolicy();
