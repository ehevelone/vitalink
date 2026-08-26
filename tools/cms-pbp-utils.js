const MEDICARE_PLAN_ID_PATTERN =
  /\b([HSR]\d{4})[\s-]?(\d{3})(?:[\s-]?(\d{1,3}))?\b/gi;

const IDENTITY_KEYWORDS = [
  "contract",
  "hnumber",
  "pbp",
  "plan",
  "segment",
];

const COST_KEYWORDS = [
  "ambulance",
  "benefit",
  "coins",
  "copay",
  "cost",
  "deduct",
  "emergency",
  "er",
  "hospital",
  "inpatient",
  "lab",
  "max",
  "moop",
  "oop",
  "outpatient",
  "pcp",
  "primary",
  "specialist",
  "urgent",
  "xray",
];

function parseMedicarePlanId(value) {
  const text = String(value || "").trim().toUpperCase();
  const match = text.match(/^([HSR]\d{4})[\s-]?(\d{3})(?:[\s-]?(\d{1,3}))?$/);

  if (!match) {
    throw new Error(
      "Plan ID must look like H2802-001-0, H9802-001, H2802001, or H2802 001 000"
    );
  }

  const segmentProvided = Boolean(match[3]);
  const segment = String(match[3] || "0").padStart(3, "0");

  return {
    raw: text,
    normalized: `${match[1]}-${match[2]}-${segment}`,
    display: segmentProvided ? `${match[1]}-${match[2]}-${match[3]}` : `${match[1]}-${match[2]}`,
    contract: match[1],
    plan: match[2],
    segment,
    segmentProvided,
  };
}

function extractMedicarePlanIds(text) {
  const found = [];
  const seen = new Set();
  const source = String(text || "");

  for (const match of source.matchAll(MEDICARE_PLAN_ID_PATTERN)) {
    try {
      const parsed = parseMedicarePlanId(
        [match[1], match[2], match[3]].filter(Boolean).join("-")
      );

      if (seen.has(parsed.normalized)) continue;
      seen.add(parsed.normalized);
      found.push(parsed);
    } catch (_) {
      // Ignore near-matches. The caller only wants usable plan IDs.
    }
  }

  return found;
}

function normalizeKey(key) {
  return String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeValue(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function normalizeNumberString(value, width) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(width, "0");
}

function keyMatchesAny(key, keywords) {
  const normalized = normalizeKey(key);
  return keywords.some((keyword) => normalized.includes(keyword));
}

function compactValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return "";
  return String(value).trim();
}

function extractFieldsByKeywords(obj, keywords) {
  const fields = {};

  for (const [key, value] of Object.entries(obj || {})) {
    if (!keyMatchesAny(key, keywords)) continue;

    const compact = compactValue(value);
    if (compact) fields[key] = compact;
  }

  return fields;
}

function objectMatchesPlan(obj, plan) {
  let contractHit = false;
  let planHit = false;
  let segmentHit = !plan.segmentProvided || plan.segment === "000";

  for (const [key, value] of Object.entries(obj || {})) {
    const normalizedKey = normalizeKey(key);
    const normalizedValue = normalizeValue(value);

    if (
      (normalizedKey.includes("contract") ||
        normalizedKey.includes("hnumber")) &&
      normalizedValue === plan.contract
    ) {
      contractHit = true;
    }

    if (
      (normalizedKey.includes("plan") ||
        normalizedKey.includes("pbp") ||
        normalizedKey.includes("package")) &&
      normalizeNumberString(value, 3) === plan.plan
    ) {
      planHit = true;
    }

    if (
      normalizedKey.includes("segment") &&
      normalizeNumberString(value, 3) === plan.segment
    ) {
      segmentHit = true;
    }
  }

  return contractHit && planHit && segmentHit;
}

function buildMatchPreview(obj) {
  return {
    identity: extractFieldsByKeywords(obj, IDENTITY_KEYWORDS),
    costSharePreview: extractFieldsByKeywords(obj, COST_KEYWORDS),
  };
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value).trim();
  return `$${num.toFixed(2)}`;
}

function formatPercent(value) {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(value);
  if (!Number.isFinite(num)) return `${String(value).trim()}%`;
  return `${num}%`;
}

function getNestedValue(obj, path) {
  let current = obj;

  for (const part of path) {
    if (!current || typeof current !== "object") return "";
    current = current[part];
  }

  return current;
}

function firstNestedValue(obj, paths) {
  for (const path of paths) {
    const value = getNestedValue(obj, path);
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }

  return "";
}

function directCostShareForDetails(details) {
  const copay = firstNestedValue(details, [
    ["CopaymentComponent", "bdCopaymentAmount"],
    ["CopayAdmWaivedTimelineComponent", "CopayAdmWaivedTimelineComptCopayment", "bdCopaymentAmount"],
    ["CopayMultiServiceLocationComponent", "CopayMutliServiceCopay", "bdCopaymentAmount"],
    ["CopayMultiServiceLocation8BComponent", "bdCopaymentAmount8B"],
    ["CostShareABComponent", "bdCopaymentAmt"],
    ["TierCopaymentComponent", "bdCopaymentTier1Amt"],
  ]);

  const copayMin = firstNestedValue(details, [
    ["CopaymentComponent", "bdCopaymentMinAmount"],
    ["OutOfNetworkCostShareComponent", "copayment", "bdCopaymentMinAmount"],
  ]);

  const copayMax = firstNestedValue(details, [
    ["CopaymentComponent", "bdCopaymentMaxAmount"],
    ["OutOfNetworkCostShareComponent", "copayment", "bdCopaymentMaxAmount"],
  ]);

  const coinsurance = firstNestedValue(details, [
    ["CoinsuranceComponent", "bdCoinsuranceAmount"],
    ["OutOfNetworkCostShareComponent", "coinsurance", "bdCoinsuranceAmount"],
    ["CostShareABComponent", "bdCoinsAmt"],
  ]);

  const coinsuranceMin = firstNestedValue(details, [
    ["CoinsuranceComponent", "bdCoinsuranceMinAmount"],
    ["OutOfNetworkCostShareComponent", "coinsurance", "bdCoinsuranceMinAmount"],
  ]);

  const coinsuranceMax = firstNestedValue(details, [
    ["CoinsuranceComponent", "bdCoinsuranceMaxAmount"],
    ["OutOfNetworkCostShareComponent", "coinsurance", "bdCoinsuranceMaxAmount"],
  ]);

  if (copayMin !== "" && copayMax !== "") {
    return `${formatCurrency(copayMin)} - ${formatCurrency(copayMax)}`;
  }

  if (copay !== "") {
    return formatCurrency(copay);
  }

  if (coinsuranceMin !== "" && coinsuranceMax !== "") {
    return `${formatPercent(coinsuranceMin)} - ${formatPercent(coinsuranceMax)}`;
  }

  if (coinsurance !== "") {
    return formatPercent(coinsurance);
  }

  return "";
}

function dayIntervalCostShare(details) {
  const intervals = firstNestedValue(details, [
    ["CostShareABComponent", "bdCopaymentDayIntervalStay"],
    ["TierCopaymentComponent", "bdCopaymentTier1DayIntervalStay"],
  ]);

  if (!intervals || typeof intervals !== "object") return "";

  const count = Number(intervals.bdDayIntervalCopaymentNumber || 0);
  const parts = [];

  for (let i = 1; i <= count; i += 1) {
    const begin = intervals[`bdDayInterval${i}BeginDay`];
    const end = intervals[`bdDayInterval${i}EndDay`];
    const amount = intervals[`bdDayInterval${i}CopaymentAmount`];

    if (begin && end && amount !== undefined && amount !== null) {
      parts.push(`Days ${begin}-${end}: ${formatCurrency(amount)}`);
    }
  }

  return parts.join("; ");
}

function extractMedicalCostShareSnapshot(pbpPlan) {
  const characteristics = pbpPlan.planCharacteristics || {};
  const planLevel = pbpPlan.planLevelCostSharing || {};
  const lppoMoop =
    planLevel.lppoRppoMaxEnrolleeCostLimit?.lppoRppoMaxEnrolleeCostLimitDetails ||
    {};
  const benefitInfo =
    pbpPlan.benefitDetails?.benefitDetailsInfo || [];

  const categories = [];

  for (const item of benefitInfo) {
    if (!item || !item.categoryCode || !item.benefitDetails) continue;

    const direct = directCostShareForDetails(item.benefitDetails);
    const interval = dayIntervalCostShare(item.benefitDetails);

    if (!direct && !interval) continue;

    categories.push({
      categoryCode: item.categoryCode,
      categoryTypeId: item.categoryTypeId,
      costShare: interval || direct,
    });
  }

  return {
    planName: characteristics.planName || "",
    carrierName:
      characteristics.organizationMarketingName ||
      characteristics.contractLegalName ||
      "",
    contractLegalName: characteristics.contractLegalName || "",
    planType: characteristics.planTypeLabel || "",
    geography: characteristics.geographicName || "",
    moop: {
      inNetwork: formatCurrency(lppoMoop.meclInnMoopAmount),
      combined: formatCurrency(lppoMoop.meclCombMoopAmount),
      outOfNetwork: formatCurrency(lppoMoop.meclOonMoopAmount),
    },
    rawMedicalCostShareByCategory: categories,
  };
}

module.exports = {
  COST_KEYWORDS,
  IDENTITY_KEYWORDS,
  buildMatchPreview,
  compactValue,
  extractFieldsByKeywords,
  extractMedicarePlanIds,
  normalizeKey,
  normalizeNumberString,
  normalizeValue,
  objectMatchesPlan,
  parseMedicarePlanId,
  extractMedicalCostShareSnapshot,
};
