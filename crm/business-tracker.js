if(!sessionStorage.getItem("crm_uuid")){
  window.location = "login.html";
}

let businessPolicies = [];

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

function isPendingStatus(status){
  return ["pending", "submitted"].includes(status.toLowerCase());
}

function isPaidStatus(status){
  return status.toLowerCase() === "paid";
}

function isChargebackStatus(status){
  return status.toLowerCase() === "chargeback";
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

  if(status && normalizedStatus(policy) !== status){
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
      (sum, policy) => sum + moneyValue(policy.commission_amount),
      0
    );

  const pendingCommission =
    businessPolicies
      .filter(policy => isPendingStatus(normalizedStatus(policy)))
      .reduce((sum, policy) => sum + moneyValue(policy.commission_amount), 0);

  const paidCommission =
    businessPolicies
      .filter(policy => isPaidStatus(normalizedStatus(policy)))
      .reduce(
        (sum, policy) =>
          sum + moneyValue(policy.paid_amount || policy.commission_amount),
        0
      );

  const chargebacks =
    businessPolicies
      .filter(policy => isChargebackStatus(normalizedStatus(policy)))
      .reduce((sum, policy) => sum + moneyValue(policy.commission_amount), 0);

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
          normalizedStatus(policy);

        const effective =
          formatDate(policy.effective_date) || "No effective date";

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
              <strong>${formatMoney(policy.paid_amount || policy.commission_amount)}</strong>
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

loadBusinessPolicies();
