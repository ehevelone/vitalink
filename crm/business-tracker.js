if(!sessionStorage.getItem("crm_uuid")){
  window.location = "login.html";
}

let businessPolicies = [];
let uploadedSchedules = [];

function setUploadMessage(message){
  const container =
    document.getElementById("commissionUploadMessage");

  if(container){
    container.innerHTML =
      message ? safeText(message) : "";
  }
}

function safeText(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function moneyValue(value){
  const number =
    Number(String(value ?? "").replace(/[^0-9.-]/g, ""));

  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value){
  return moneyValue(value).toLocaleString("en-US", {
    style:"currency",
    currency:"USD"
  });
}

function clientName(policy){
  return [policy.first_name, policy.last_name]
    .filter(Boolean)
    .join(" ") || "Unassigned Client";
}

function normalizedStatus(policy){
  return String(policy.status || "Active").trim();
}

function trackerStatus(policy){
  const status =
    normalizedStatus(policy);

  if(isChargebackStatus(status)){
    return status;
  }

  if(policy.paid_date){
    return "Paid";
  }

  return status;
}

function isPendingStatus(status){
  return ["pending", "submitted"].includes(status.toLowerCase());
}

function isPaidPolicy(policy){
  return Boolean(policy.paid_date) ||
    trackerStatus(policy).toLowerCase() === "paid";
}

function isChargebackStatus(status){
  return status.toLowerCase() === "chargeback";
}

function policyExpectedCommission(policy){
  return moneyValue(policy.commission_amount);
}

function policyPaidAmount(policy){
  if(!isPaidPolicy(policy)){
    return 0;
  }

  return moneyValue(policy.paid_amount) ||
    policyExpectedCommission(policy);
}

function policyPendingAmount(policy){
  if(isPaidPolicy(policy) || isChargebackStatus(normalizedStatus(policy))){
    return 0;
  }

  return isPendingStatus(normalizedStatus(policy)) ?
    policyExpectedCommission(policy) :
    0;
}

function policyDisplayAmount(policy){
  return isPaidPolicy(policy) ?
    policyPaidAmount(policy) :
    policyExpectedCommission(policy);
}

function policyMatchesFilters(policy){
  const search =
    document.getElementById("businessSearch")?.value
      ?.trim()
      ?.toLowerCase() || "";

  const status =
    document.getElementById("businessStatusFilter")?.value || "";

  const type =
    document.getElementById("businessTypeFilter")?.value || "";

  const haystack = [
    clientName(policy),
    policy.carrier,
    policy.plan_name,
    policy.policy_type,
    policy.policy_number,
    policy.member_id
  ].join(" ").toLowerCase();

  if(search && !haystack.includes(search)){
    return false;
  }

  if(status && trackerStatus(policy) !== status){
    return false;
  }

  if(type && policy.policy_type !== type){
    return false;
  }

  return true;
}

function renderPolicyTypeFilter(){
  const select =
    document.getElementById("businessTypeFilter");

  if(!select){
    return;
  }

  const selected =
    select.value;

  const types =
    [...new Set(
      businessPolicies
        .map(policy => policy.policy_type)
        .filter(Boolean)
    )].sort();

  select.innerHTML =
    `<option value="">All policy types</option>` +
    types
      .map(type =>
        `<option ${type === selected ? "selected" : ""}>${safeText(type)}</option>`
      )
      .join("");
}

function renderBusinessSummary(){
  const totalPolicies =
    businessPolicies.length;

  const expectedCommission =
    businessPolicies.reduce(
      (sum, policy) => sum + policyExpectedCommission(policy),
      0
    );

  const pendingCommission =
    businessPolicies.reduce(
      (sum, policy) => sum + policyPendingAmount(policy),
      0
    );

  const paidCommission =
    businessPolicies.reduce(
      (sum, policy) => sum + policyPaidAmount(policy),
      0
    );

  const chargebacks =
    businessPolicies
      .filter(policy => isChargebackStatus(normalizedStatus(policy)))
      .reduce((sum, policy) => sum + policyExpectedCommission(policy), 0);

  const activeClients =
    new Set(
      businessPolicies
        .map(policy => policy.client_id)
        .filter(Boolean)
    ).size;

  document.getElementById("businessSummary").innerHTML = `
    <div class="card settings-card business-metric-card">
      <div class="label">Policies</div>
      <div class="metric">${totalPolicies}</div>
      <div class="client-sub">Tracked policy records</div>
    </div>

    <div class="card settings-card business-metric-card">
      <div class="label">Expected Commission</div>
      <div class="metric">${formatMoney(expectedCommission)}</div>
      <div class="client-sub">Total commission entered</div>
    </div>

    <div class="card settings-card business-metric-card">
      <div class="label">Pending</div>
      <div class="metric">${formatMoney(pendingCommission)}</div>
      <div class="client-sub">Submitted or pending business</div>
    </div>

    <div class="card settings-card business-metric-card">
      <div class="label">Paid</div>
      <div class="metric">${formatMoney(paidCommission)}</div>
      <div class="client-sub">Marked as paid</div>
    </div>

    <div class="card settings-card business-metric-card">
      <div class="label">Chargebacks</div>
      <div class="metric">${formatMoney(chargebacks)}</div>
      <div class="client-sub">Marked as chargeback</div>
    </div>

    <div class="card settings-card business-metric-card">
      <div class="label">Clients</div>
      <div class="metric">${activeClients}</div>
      <div class="client-sub">Clients with tracked policies</div>
    </div>
  `;
}

function renderBusinessTracker(){
  renderBusinessSummary();
  renderPolicyTypeFilter();

  const list =
    document.getElementById("businessPolicyList");

  const policies =
    businessPolicies.filter(policyMatchesFilters);

  if(!policies.length){
    list.innerHTML = `
      <div class="empty-state">
        No policies match this view yet.
      </div>
    `;
    return;
  }

  list.innerHTML =
    policies
      .map(policy => {
        const name =
          clientName(policy);

        const status =
          trackerStatus(policy);

        const effective =
          formatDate(policy.effective_date) || "No effective date";

        const paid =
          formatDate(policy.paid_date);

        const amountLabel =
          isPaidPolicy(policy) ? "Paid" : "Expected";

        return `
          <div class="business-policy-row">
            <div>
              <strong>${safeText(name)}</strong>
              <small>
                ${safeText(policy.carrier || "Carrier not set")}
                ${policy.plan_name ? ` - ${safeText(policy.plan_name)}` : ""}
              </small>
              <small>
                ${safeText(policy.policy_type || "Policy type not set")}
                ${policy.policy_number ? ` - ${safeText(policy.policy_number)}` : ""}
              </small>
            </div>

            <div class="business-policy-meta">
              <span class="tag">${safeText(status)}</span>
              <strong>${formatMoney(policyDisplayAmount(policy))}</strong>
              <small>${safeText(amountLabel)}</small>
              ${paid ? `<small>Paid ${safeText(paid)}</small>` : ""}
              <small>${safeText(effective)}</small>
            </div>

            <div class="business-policy-actions">
              <button
                class="compact-btn secondary"
                onclick="window.location.href='client-view.html?id=${encodeURIComponent(policy.client_id)}'"
              >
                Client
              </button>

              <button
                class="compact-btn"
                onclick="window.location.href='policy-view.html?id=${encodeURIComponent(policy.id)}'"
              >
                Policy
              </button>
            </div>
          </div>
        `;
      })
      .join("");
}

function parseCsv(text){
  const rows = [];
  let current = "";
  let row = [];
  let quoted = false;

  for(let index = 0; index < text.length; index += 1){
    const char =
      text[index];

    const next =
      text[index + 1];

    if(char === "\"" && quoted && next === "\""){
      current += "\"";
      index += 1;
      continue;
    }

    if(char === "\""){
      quoted = !quoted;
      continue;
    }

    if(char === "," && !quoted){
      row.push(current);
      current = "";
      continue;
    }

    if((char === "\n" || char === "\r") && !quoted){
      if(char === "\r" && next === "\n"){
        index += 1;
      }

      row.push(current);

      if(row.some(value => String(value).trim())){
        rows.push(row);
      }

      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current);

  if(row.some(value => String(value).trim())){
    rows.push(row);
  }

  if(rows.length < 2){
    return [];
  }

  const headers =
    rows[0].map(header => String(header || "").trim());

  return rows.slice(1).map(values => {
    const item = {};

    headers.forEach((header, index) => {
      if(header){
        item[header] = values[index] ?? "";
      }
    });

    return item;
  });
}

async function readScheduleFile(file){
  const name =
    file.name || "commission-schedule";

  const lowerName =
    name.toLowerCase();

  if(lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")){
    const buffer =
      await file.arrayBuffer();

    let binary = "";
    const bytes =
      new Uint8Array(buffer);

    bytes.forEach(byte => {
      binary += String.fromCharCode(byte);
    });

    return {
      name,
      contentBase64:btoa(binary)
    };
  }

  const text =
    await file.text();

  return {
    name,
    rows:parseCsv(text)
  };
}

function renderCommissionSchedules(){
  const status =
    document.getElementById("commissionScheduleStatus");

  if(!status){
    return;
  }

  if(!uploadedSchedules.length){
    status.innerHTML = `
      <div class="empty-state">
        No carrier/product uploads shown yet.
      </div>
    `;
    return;
  }

  status.innerHTML =
    uploadedSchedules
      .map(schedule => `
        <div class="business-schedule-row">
          <strong>${safeText(schedule.source_file || "Carrier schedule")}</strong>
          <small>${safeText(schedule.row_count)} imported rows</small>
        </div>
      `)
      .join("");
}

async function loadCommissionSchedules(){
  const agentId =
    sessionStorage.getItem("crm_uuid");

  try{
    const res = await fetch(
      `/.netlify/functions/get-crm-commission-schedules?agent_id=${encodeURIComponent(agentId)}`,
      {
        headers:getCrmSessionHeaders()
      }
    );

    const data = await res.json();

    if(!data.success){
      throw new Error(data.error || "Unable to load commission schedules.");
    }

    uploadedSchedules =
      data.schedules || [];

    renderCommissionSchedules();
  }catch(err){
    document.getElementById("commissionScheduleStatus").innerHTML = `
      <div class="empty-state">
        ${safeText(err.message || "Unable to load commission schedules.")}
      </div>
    `;
  }
}

async function uploadCommissionSchedules(){
  const input =
    document.getElementById("commissionScheduleFiles");

  const button =
    document.getElementById("uploadCommissionSchedulesBtn");

  const files =
    Array.from(input.files || []);

  if(!files.length){
    setUploadMessage("Choose one or more CSV or Excel files first.");
    return;
  }

  button.disabled = true;
  setUploadMessage("Reading selected schedule file...");

  try{
    const parsedFiles =
      await Promise.all(files.map(readScheduleFile));

    const emptyFile =
      parsedFiles.find(file =>
        Array.isArray(file.rows) && !file.rows.length
      );

    if(emptyFile){
      setUploadMessage(`${emptyFile.name} did not have readable rows.`);
      return;
    }

    setUploadMessage("Uploading and importing carrier/product names...");

    const res = await fetch(
      "/.netlify/functions/import-crm-commission-schedules",
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          ...getCrmSessionHeaders()
        },
        body:JSON.stringify({
          agent_id:sessionStorage.getItem("crm_uuid"),
          files:parsedFiles
        })
      }
    );

    const data =
      await res.json().catch(() => ({
        success:false,
        error:`Import failed with status ${res.status}. Check Netlify function logs.`
      }));

    if(!res.ok || !data.success){
      setUploadMessage(data.error || "Unable to import commission schedules.");
      return;
    }

    input.value = "";
    setUploadMessage(
      `Imported ${data.names_imported || data.imported || 0} carrier/product name rows.` +
      (data.unique_products ? ` Found ${data.unique_products} unique carrier/product combinations.` : "") +
      (data.rows_skipped ? ` Skipped ${data.rows_skipped} blank/unmatched rows.` : "")
    );
    loadCommissionSchedules();
  }catch(err){
    setUploadMessage(err.message || "Unable to import commission schedules.");
  }finally{
    button.disabled = false;
  }
}

async function loadBusinessPolicies(){
  const agentId =
    sessionStorage.getItem("crm_uuid");

  try{
    const res = await fetch(
      `/.netlify/functions/get-crm-policies?agent_id=${encodeURIComponent(agentId)}`,
      {
        headers:getCrmSessionHeaders()
      }
    );

    const data = await res.json();

    if(!data.success){
      throw new Error(data.error || "Unable to load business tracker.");
    }

    businessPolicies =
      data.policies || [];

    renderBusinessTracker();
  }catch(err){
    document.getElementById("businessSummary").innerHTML = `
      <div class="card settings-card">
        Unable to load business summary.
      </div>
    `;

    document.getElementById("businessPolicyList").innerHTML = `
      <div class="empty-state">
        ${safeText(err.message || "Unable to load policies.")}
      </div>
    `;
  }
}

loadCommissionSchedules();
loadBusinessPolicies();
