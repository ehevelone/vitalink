const state = {
  steps: ["age", "earners", "coverage", "dependents", "debt", "finalExpenses", "college", "income", "incomeYears"],
  index: 0,
  answers: {},
  result: null
};

const incomeValues = {
  none: { label: "No income", value: 0 },
  lt50: { label: "Less than $50k", value: 40000 },
  "50-75": { label: "$50k-$75k", value: 62500 },
  "75-100": { label: "$75k-$100k", value: 87500 },
  "100-125": { label: "$100k-$125k", value: 112500 },
  "125-150": { label: "$125k-$150k", value: 137500 },
  "150-200": { label: "$150k-$200k", value: 175000 },
  "200plus": { label: "$200k+", value: 225000 }
};

const finalPlanValues = {
  cremation: { label: "Cremation / simple services", value: 15000 },
  burial: { label: "Full funeral / burial", value: 30000 }
};

const consentLanguage =
  "By submitting, you agree to receive email/text/call from Eric Hevelone about your life insurance needs quiz result, insurability, and scheduling a conversation.";

const introPanel = document.getElementById("introPanel");
const quizPanel = document.getElementById("quizPanel");
const gatePanel = document.getElementById("gatePanel");
const resultsPanel = document.getElementById("resultsPanel");
const formError = document.getElementById("formError");
const leadError = document.getElementById("leadError");
const progressFill = document.getElementById("progressFill");
const progressPercent = document.getElementById("progressPercent");
const stepLabel = document.getElementById("stepLabel");
const nextBtn = document.getElementById("nextBtn");
const backBtn = document.getElementById("backBtn");
const leadPhoneInput = document.getElementById("leadPhone");
const phoneRequirement = document.getElementById("phoneRequirement");

resultsPanel.after(gatePanel);
document.getElementById("consentText").textContent = consentLanguage;

document.getElementById("startQuiz").addEventListener("click", () => {
  introPanel.classList.add("hidden");
  document.getElementById("storyPanel").classList.add("hidden");
  quizPanel.classList.remove("hidden");
  renderStep();
});

document.getElementById("storyStartQuiz").addEventListener("click", () => {
  introPanel.classList.add("hidden");
  document.getElementById("storyPanel").classList.add("hidden");
  quizPanel.classList.remove("hidden");
  renderStep();
});

document.querySelectorAll('input[name="hasCoverage"]').forEach((input) => {
  input.addEventListener("change", () => {
    document
      .getElementById("coverageAmountWrap")
      .classList.toggle("hidden", input.value !== "yes" || !input.checked);
  });
});

document.querySelectorAll('input[name="contactPreference"]').forEach((input) => {
  input.addEventListener("change", updatePhoneRequirement);
});

leadPhoneInput.addEventListener("input", () => {
  leadPhoneInput.value = formatPhoneNumber(leadPhoneInput.value);
});

updatePhoneRequirement();

nextBtn.addEventListener("click", () => {
  if (!saveCurrentStep()) return;

  if (state.index < state.steps.length - 1) {
    state.index += 1;
    renderStep();
    return;
  }

  state.result = calculateResult();
  quizPanel.classList.add("hidden");
  renderResults();
  resultsPanel.classList.remove("hidden");
  gatePanel.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

backBtn.addEventListener("click", () => {
  if (state.index > 0) {
    state.index -= 1;
    renderStep();
  }
});

document.getElementById("leadForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  leadError.textContent = "";

  const form = event.currentTarget;
  const lead = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    contactPreference: selectedValue("contactPreference")
  };

  if (!lead.name || !lead.email) {
    leadError.textContent = "Name and email are required.";
    return;
  }

  if (!lead.contactPreference) {
    leadError.textContent = "Please choose how you would like to be contacted.";
    return;
  }

  if ((lead.contactPreference === "text" || lead.contactPreference === "call") && !isValidPhone(lead.phone)) {
    leadError.textContent = "Please enter a valid phone number for text or call follow-up.";
    return;
  }

  if (!form.consent.checked) {
    leadError.textContent = "Please confirm the contact permission before continuing.";
    return;
  }

  const submitButton = form.querySelector("button");
  submitButton.disabled = true;
  submitButton.textContent = "Sending...";

  try {
    const payload = {
      lead,
      answers: state.answers,
      result: state.result,
      consent: {
        accepted: true,
        language: consentLanguage,
        page: window.location.href,
        capturedAt: new Date().toISOString()
      }
    };

    const response = await fetch("/.netlify/functions/life-needs-quiz-lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok || data.success !== true) {
      throw new Error(data.error || "Unable to send your result.");
    }

    leadError.style.color = "#4ade80";
    leadError.textContent = "Got it. Your quiz result has been sent to Eric for a real conversation.";
    submitButton.textContent = "Submitted";
  } catch (error) {
    leadError.style.color = "";
    leadError.textContent = error.message || "Unable to send your result.";
    submitButton.disabled = false;
    submitButton.textContent = "Talk Through My Results";
  }
});

document.getElementById("restartBtn").addEventListener("click", () => {
  window.location.reload();
});

function renderStep() {
  formError.textContent = "";
  document
    .getElementById("spouseFinalPlanWrap")
    ?.classList.toggle("hidden", state.answers.earners !== "two");

  document.querySelectorAll(".question-step").forEach((step) => {
    step.classList.toggle("active", step.dataset.step === state.steps[state.index]);
  });

  const total = state.steps.length;
  const current = state.index + 1;
  const percent = Math.round((current / total) * 100);

  progressFill.style.width = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
  stepLabel.textContent = `Question ${current} of ${total}`;
  backBtn.style.visibility = state.index === 0 ? "hidden" : "visible";
  nextBtn.textContent = state.index === total - 1 ? "See my estimate" : "Next";
}

function saveCurrentStep() {
  const step = state.steps[state.index];
  formError.textContent = "";

  if (step === "age") {
    const age = Number(document.getElementById("age").value);
    if (!age || age < 18 || age > 85) {
      formError.textContent = "Please enter an age between 18 and 85.";
      return false;
    }
    state.answers.age = age;
  }

  if (step === "coverage") {
    const selected = selectedValue("hasCoverage");
    if (!selected) {
      formError.textContent = "Please choose Yes or No.";
      return false;
    }
    const amount = Number(document.getElementById("coverageAmount").value || 0);
    if (selected === "yes" && amount < 0) {
      formError.textContent = "Please enter a valid coverage amount.";
      return false;
    }
    state.answers.hasCoverage = selected;
    state.answers.currentCoverage = selected === "yes" ? amount : 0;
  }

  if (step === "dependents") {
    const value = selectedValue("dependents");
    if (value === null) {
      formError.textContent = "Please choose a dependent count.";
      return false;
    }
    state.answers.dependents = Number(value);
  }

  if (step === "debt") {
    const mortgageBalance = numberValue("mortgageBalance");
    const personalDebt = numberValue("personalDebt");
    const otherLoans = numberValue("otherLoans");
    const studentLoans = numberValue("studentLoans");

    if ([mortgageBalance, personalDebt, otherLoans, studentLoans].some((value) => value < 0)) {
      formError.textContent = "Please enter valid debt amounts.";
      return false;
    }

    state.answers.mortgageBalance = mortgageBalance;
    state.answers.personalDebt = personalDebt;
    state.answers.otherLoans = otherLoans;
    state.answers.studentLoans = studentLoans;
  }

  if (step === "finalExpenses") {
    const finalPlan = selectedValue("finalPlan");
    if (!finalPlan) {
      formError.textContent = "Please choose cremation or full funeral/burial.";
      return false;
    }
    state.answers.finalPlan = finalPlan;
    state.answers.finalPlanLabel = finalPlanValues[finalPlan].label;
    state.answers.finalExpenses = finalPlanValues[finalPlan].value;

    if (state.answers.earners === "two") {
      const spouseFinalPlan = selectedValue("spouseFinalPlan");
      if (!spouseFinalPlan) {
        formError.textContent = "Please choose funeral wishes for your spouse or partner.";
        return false;
      }
      state.answers.spouseFinalPlan = spouseFinalPlan;
      state.answers.spouseFinalPlanLabel = finalPlanValues[spouseFinalPlan].label;
      state.answers.spouseFinalExpenses = finalPlanValues[spouseFinalPlan].value;
    }
  }

  if (step === "college") {
    const collegeGoal = numberValue("collegeGoal");
    if (collegeGoal < 0) {
      formError.textContent = "Please enter a valid college planning amount.";
      return false;
    }
    state.answers.collegeGoal = collegeGoal;
  }

  if (step === "earners") {
    const value = selectedValue("earners");
    if (!value) {
      formError.textContent = "Please choose single or married/partnered.";
      return false;
    }
    state.answers.earners = value;
    state.answers.relationshipStatus = value === "two" ? "Married / partnered" : "Single";
    if (value === "two" && !state.steps.includes("spouseAge")) {
      state.steps.splice(state.steps.indexOf("coverage"), 0, "spouseAge");
    }
    if (value === "two" && !state.steps.includes("spouseIncome")) {
      state.steps.splice(state.steps.indexOf("incomeYears"), 0, "spouseIncome");
    }
    if (value === "single") {
      state.steps = state.steps.filter((item) => item !== "spouseAge" && item !== "spouseIncome");
      delete state.answers.spouseAge;
      delete state.answers.spouseIncome;
      delete state.answers.spouseFinalPlan;
      delete state.answers.spouseFinalPlanLabel;
      delete state.answers.spouseFinalExpenses;
    }
  }

  if (step === "spouseAge") {
    const spouseAge = Number(document.getElementById("spouseAge").value);
    if (!spouseAge || spouseAge < 18 || spouseAge > 85) {
      formError.textContent = "Please enter a spouse or partner age between 18 and 85.";
      return false;
    }
    state.answers.spouseAge = spouseAge;
  }

  if (step === "income") {
    const value = selectedValue("income");
    if (!value) {
      formError.textContent = "Please choose your annual income range.";
      return false;
    }
    state.answers.income = value;
  }

  if (step === "spouseIncome") {
    const value = selectedValue("spouseIncome");
    if (!value) {
      formError.textContent = "Please choose your spouse or partner's annual income range.";
      return false;
    }
    state.answers.spouseIncome = value;
  }

  if (step === "incomeYears") {
    const years = numberValue("incomeYears") || 5;
    if (years < 5 || years > 40) {
      formError.textContent = "Please enter a number between 5 and 40, or leave it blank.";
      return false;
    }
    state.answers.incomeYears = Math.max(5, years);
  }

  return true;
}

function selectedValue(name) {
  const input = document.querySelector(`input[name="${name}"]:checked`);
  return input ? input.value : null;
}

function numberValue(id) {
  const input = document.getElementById(id);
  return Number(input?.value || 0);
}

function updatePhoneRequirement() {
  const preference = selectedValue("contactPreference");
  const requiresPhone = preference === "text" || preference === "call";
  leadPhoneInput.required = requiresPhone;
  phoneRequirement.textContent = requiresPhone ? "(required)" : "(optional)";
}

function formatPhoneNumber(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 10);

  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function isValidPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

function calculateResult() {
  const age = state.answers.age;
  const yearsToRetirement = Math.max(0, Math.min(40, 67 - age));
  const spouseAge = state.answers.spouseAge ? Number(state.answers.spouseAge) : null;
  const spouseYearsToRetirement = spouseAge ? Math.max(0, Math.min(40, 67 - spouseAge)) : yearsToRetirement;
  const incomeYears = Math.min(Number(state.answers.incomeYears || 5), yearsToRetirement || 5);
  const spouseIncomeYears = Math.min(Number(state.answers.incomeYears || 5), spouseYearsToRetirement || 5);
  const dependents = state.answers.dependents;
  const mortgageDebt = Number(state.answers.mortgageBalance || 0);
  const personalDebt = Number(state.answers.personalDebt || 0);
  const otherLoans = Number(state.answers.otherLoans || 0);
  const studentLoans = Number(state.answers.studentLoans || 0);
  const finalExpenses = Number(state.answers.finalExpenses || 15000);
  const spouseFinalExpenses = Number(state.answers.spouseFinalExpenses || finalExpenses);
  const collegeGoal = Number(state.answers.collegeGoal || 0);
  const debt = mortgageDebt + personalDebt + otherLoans + studentLoans;
  const currentCoverage = Number(state.answers.currentCoverage || 0);
  const household = {
    age,
    spouseAge,
    yearsToRetirement,
    spouseYearsToRetirement,
    incomeYears,
    spouseIncomeYears,
    dependents,
    debt,
    mortgageDebt,
    personalDebt,
    otherLoans,
    studentLoans,
    finalExpenses,
    spouseFinalExpenses,
    finalPlanLabel: state.answers.finalPlanLabel,
    spouseFinalPlanLabel: state.answers.spouseFinalPlanLabel,
    collegeGoal,
    currentCoverage,
    incomeLabel: incomeValues[state.answers.income].label,
    spouseIncomeLabel: state.answers.spouseIncome
      ? incomeValues[state.answers.spouseIncome].label
      : null
  };

  const primary = calculateNeed({
    label: "If You Passed",
    income: incomeValues[state.answers.income].value,
    mortgageDebt,
    personalDebt,
    otherLoans,
    studentLoans,
    finalExpenses,
    collegeGoal,
    dependents,
    yearsToRetirement,
    incomeYears,
    currentCoverage
  });

  const estimates = [primary];
  if (state.answers.earners === "two") {
    estimates.push(
      calculateNeed({
        label: "If Your Spouse Or Partner Passed",
        income: incomeValues[state.answers.spouseIncome].value,
        mortgageDebt,
        personalDebt,
        otherLoans,
        studentLoans,
        finalExpenses: spouseFinalExpenses,
        collegeGoal,
        dependents,
        yearsToRetirement: spouseYearsToRetirement,
        incomeYears: spouseIncomeYears,
        currentCoverage
      })
    );
  }

  const combined = estimates.length > 1
    ? {
        label: "Combined Household View",
        low: estimates.reduce((sum, item) => sum + item.low, 0),
        high: estimates.reduce((sum, item) => sum + item.high, 0),
        currentCoverage,
      }
    : null;

  return {
    household,
    estimates,
    combined,
    disclaimer: "This is an educational estimate, not a quote."
  };
}

function calculateNeed({
  label,
  income,
  mortgageDebt,
  personalDebt,
  otherLoans,
  studentLoans,
  finalExpenses,
  collegeGoal,
  dependents,
  yearsToRetirement,
  incomeYears,
  currentCoverage
}) {
  const debt = mortgageDebt + personalDebt + otherLoans + studentLoans;
  const years = Math.max(5, Number(incomeYears || 5));
  const incomeReplacement = income * years;
  const dependentSupport = dependents * Math.min(yearsToRetirement, 18) * 12000;
  const grossNeed = incomeReplacement + debt + dependentSupport + finalExpenses + collegeGoal;
  const netNeed = Math.max(0, grossNeed - currentCoverage);
  const low = roundCoverage(netNeed * 0.85);
  const high = roundCoverage(netNeed * 1.15);

  return {
    label,
    income,
    incomeYears: years,
    incomeReplacement,
    mortgageDebt,
    personalDebt,
    otherLoans,
    studentLoans,
    debt,
    finalExpenses,
    collegeGoal,
    dependentSupport,
    currentCoverage,
    grossNeed,
    netNeed,
    low,
    high,
    points: buildCurve(netNeed, yearsToRetirement)
  };
}

function buildCurve(need, yearsToRetirement) {
  const points = [];
  const duration = Math.max(5, yearsToRetirement || 5);
  for (let year = 0; year <= duration; year += 1) {
    const progress = year / duration;
    const earlyRise = 1 + Math.min(progress * 2.2, 0.22);
    const taper = Math.pow(1 - progress, 0.82);
    const value = Math.max(0, need * earlyRise * taper);
    points.push({ year, value });
  }
  return points;
}

function roundCoverage(value) {
  return Math.round(value / 25000) * 25000;
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function renderResults() {
  const grid = document.getElementById("estimateGrid");
  const breakdown = document.getElementById("breakdownGrid");
  const notes = document.getElementById("resultNotes");
  const result = state.result;

  const estimateCards = result.estimates
    .map((estimate) => `
      <article class="estimate-card">
        <strong>${estimate.label}</strong>
        <div class="estimate-number">${money(estimate.low)}-${money(estimate.high).replace("$", "")}</div>
        <p class="estimate-sub">After subtracting current coverage reported in the quiz.</p>
      </article>
    `)
    .join("");
  const combinedCard = result.combined
    ? `
      <article class="estimate-card combined-card">
        <strong>${result.combined.label}</strong>
        <div class="estimate-number">${money(result.combined.low)}-${money(result.combined.high).replace("$", "")}</div>
        <p class="estimate-sub">A combined planning view for a two-earner household.</p>
      </article>
    `
    : "";
  grid.innerHTML = estimateCards + combinedCard;
  grid.classList.toggle("has-combined", Boolean(result.combined));

  const primary = result.estimates[0];
  breakdown.innerHTML = [
    ["Mortgage protection", primary.mortgageDebt],
    ["Credit cards / personal debt", primary.personalDebt],
    ["Auto / personal / other loans", primary.otherLoans],
    ["Student loans / anything else", primary.studentLoans],
    ["Income replacement", primary.incomeReplacement],
    ["Kids / dependent support", primary.dependentSupport],
    ["College planning", primary.collegeGoal],
    [`Final expenses (${result.household.finalPlanLabel || "planning estimate"})`, primary.finalExpenses],
    ["Existing coverage credit", -primary.currentCoverage],
  ].map(([label, value]) => `
    <article class="breakdown-card ${value < 0 ? "credit-card" : ""}">
      <span>${label}</span>
      <strong>${money(value)}</strong>
    </article>
  `).join("");

  notes.innerHTML = [
    `Income replacement years used: ${result.household.incomeYears}.`,
    `Years to retirement considered: ${result.household.yearsToRetirement}.`,
    `Current coverage entered: ${money(result.household.currentCoverage)}.`,
    result.disclaimer
  ]
    .map((note) => `<p>${note}</p>`)
    .join("");

  drawChart(result);
}

function drawChart(result) {
  const canvas = document.getElementById("needsChart");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const pad = 54;
  const estimates = result.estimates;
  const maxValue = Math.max(...estimates.flatMap((item) => item.points.map((p) => p.value)), 1);
  const maxYear = Math.max(...estimates.map((item) => item.points[item.points.length - 1].year), 5);
  const colors = ["#7cc6e8", "#4ade80"];

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#03070d";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#223247";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad + ((height - pad * 2) / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 18px Segoe UI, Arial";
  ctx.fillText("Today", pad, height - 18);
  ctx.fillText("Retirement", width - pad - 96, height - 18);

  estimates.forEach((estimate, index) => {
    ctx.beginPath();
    estimate.points.forEach((point, pointIndex) => {
      const x = pad + (point.year / maxYear) * (width - pad * 2);
      const y = height - pad - (point.value / maxValue) * (height - pad * 2);
      if (pointIndex === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = colors[index] || "#f5c85c";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.stroke();

    const firstPoint = estimate.points[0];
    const markerY = height - pad - (firstPoint.value / maxValue) * (height - pad * 2);
    ctx.fillStyle = colors[index] || "#f5c85c";
    ctx.beginPath();
    ctx.arc(pad, markerY, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = colors[index] || "#f5c85c";
    ctx.font = "800 16px Segoe UI, Arial";
    ctx.fillText(estimate.label, pad + 18, markerY - 12 + index * 24);
  });
}
