function clean(value){
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeNumberString(value){
  const text =
    String(value ?? "")
      .replace(/[$,%]/g, "")
      .replace(/,/g, "")
      .trim();

  if(!text){
    return null;
  }

  const number =
    Number(text);

  return Number.isFinite(number) ? number : null;
}

function formatCurrency(value){
  const number =
    normalizeNumberString(value);

  if(number === null){
    return "";
  }

  return `$${number.toFixed(2)}`;
}

function formatPercent(value){
  const number =
    normalizeNumberString(value);

  if(number === null){
    return "";
  }

  return `${number}%`;
}

function parseMedicarePlanId(value){
  const text =
    String(value ?? "").toUpperCase();

  const dashed =
    text.match(/\b([HSR]\d{4})[-\s]?(\d{3})(?:[-\s]?(\d{1,3}))?\b/);

  if(!dashed){
    return null;
  }

  const contract =
    dashed[1];
  const plan =
    dashed[2].padStart(3, "0");
  const segmentProvided =
    dashed[3] !== undefined;
  const segment =
    String(dashed[3] ?? "0").padStart(3, "0");

  return {
    contract,
    plan,
    segment,
    plan_key:`${contract}-${plan}-${segment}`,
    display:segmentProvided ?
      `${contract}-${plan}-${Number(segment)}` :
      `${contract}-${plan}`,
    segmentProvided
  };
}

function directCopay(details){
  const components = [
    details.CopaymentComponent,
    details.CostShareABComponent,
    details.TierCopaymentComponent
  ].filter(Boolean);

  for(const component of components){
    const amount =
      component.bdCopaymentAmount ??
      component.bdCopaymentAmt ??
      component.bdCopaymentTier1Amt;

    if(amount !== undefined && amount !== null){
      return formatCurrency(amount);
    }
  }

  return "";
}

function directCoinsurance(details){
  const components = [
    details.CoinsuranceComponent,
    details.CostShareABComponent,
    details.TierCoinsuranceComponent
  ].filter(Boolean);

  for(const component of components){
    const amount =
      component.bdCoinsuranceAmount ??
      component.bdCoinsAmt ??
      component.bdCoinsuranceTier1Amt;

    if(amount !== undefined && amount !== null){
      return formatPercent(amount);
    }
  }

  return "";
}

function intervalCopays(details){
  const buckets = [
    details.CostShareABComponent?.bdCopaymentDayIntervalStay,
    details.TierCopaymentComponent?.bdCopaymentTier1DayIntervalStay
  ].filter(Boolean);

  for(const bucket of buckets){
    const count =
      Number(bucket.bdDayIntervalCopaymentNumber || 0);

    if(!count){
      continue;
    }

    const parts = [];

    for(let index = 1; index <= count; index += 1){
      const begin =
        bucket[`bdDayInterval${index}BeginDay`];
      const end =
        bucket[`bdDayInterval${index}EndDay`];
      const amount =
        bucket[`bdDayInterval${index}CopaymentAmount`];

      if(begin && end && amount !== undefined){
        parts.push(`Days ${begin}-${end}: ${formatCurrency(amount)}`);
      }
    }

    if(parts.length){
      return parts.join("; ");
    }
  }

  return "";
}

function categoryCostShare(details){
  return intervalCopays(details) || directCopay(details) || directCoinsurance(details);
}

function extractMedicalCostShareSnapshot(pbpPlan){
  const characteristics =
    pbpPlan.planCharacteristics || {};
  const planLevel =
    pbpPlan.planLevelCostSharing || {};
  const lppoMoop =
    planLevel.lppoRppoMaxEnrolleeCostLimit?.lppoRppoMaxEnrolleeCostLimitDetails || {};
  const hmoMoop =
    planLevel.hmoMsaMaxEnrolleeCostLimit?.hmoMsaMaxEnrolleeCostLimitDetails || {};
  const details =
    pbpPlan.benefitDetails?.benefitDetailsInfo || [];

  const rawMedicalCostShareByCategory = [];

  details.forEach(item => {
    const benefitDetails =
      item.benefitDetails || {};
    const costShare =
      categoryCostShare(benefitDetails);

    if(!costShare){
      return;
    }

    rawMedicalCostShareByCategory.push({
      categoryCode:item.categoryCode,
      categoryTypeId:item.categoryTypeId,
      costShare
    });
  });

  return {
    planName:clean(characteristics.planName),
    carrierName:clean(characteristics.organizationMarketingName),
    contractLegalName:clean(characteristics.contractLegalName),
    planType:clean(characteristics.planTypeLabel),
    geography:clean(characteristics.geographicName),
    moop:{
      inNetwork:
        formatCurrency(lppoMoop.meclInnMoopAmount) ||
        formatCurrency(hmoMoop.meclInnMoopAmount),
      combined:
        formatCurrency(lppoMoop.meclCombMoopAmount) ||
        formatCurrency(hmoMoop.meclCombMoopAmount),
      outOfNetwork:
        formatCurrency(lppoMoop.meclOonMoopAmount) ||
        formatCurrency(hmoMoop.meclOonMoopAmount)
    },
    rawMedicalCostShareByCategory
  };
}

function normalizePlanRecord(pbpPlan, fallbackYear){
  const parsed =
    parseMedicarePlanId(
      `${pbpPlan.contractId || ""}-${pbpPlan.planId || ""}-${pbpPlan.segmentId ?? "0"}`
    );

  if(!parsed){
    return null;
  }

  const snapshot =
    extractMedicalCostShareSnapshot(pbpPlan);
  const characteristics =
    pbpPlan.planCharacteristics || {};

  return {
    plan_year:Number(pbpPlan.contractYear || fallbackYear),
    contract_id:parsed.contract,
    plan_id:parsed.plan,
    segment_id:parsed.segment,
    plan_key:parsed.plan_key,
    plan_name:snapshot.planName,
    carrier_name:snapshot.carrierName,
    contract_legal_name:snapshot.contractLegalName,
    plan_type:snapshot.planType,
    geography:snapshot.geography,
    cms_status:clean(characteristics.status),
    cms_last_updated_at:clean(characteristics.lastUpdatedAt),
    moop_in_network:snapshot.moop.inNetwork || null,
    moop_combined:snapshot.moop.combined || null,
    moop_out_of_network:snapshot.moop.outOfNetwork || null,
    normalized_benefits_json:snapshot,
    raw_benefits_json:{
      categories:snapshot.rawMedicalCostShareByCategory
    }
  };
}

module.exports = {
  normalizePlanRecord,
  parseMedicarePlanId,
  extractMedicalCostShareSnapshot
};
