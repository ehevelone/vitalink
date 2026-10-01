const CONFIGURED_PRICE_IDS = {
  activation: "price_1TDCvF2eFONDuxiMThOrbzVk",
  legacyOffice: "price_1TDCvH2eFONDuxiMez56vGW3",
  agent: {
    founders: {
      monthly: "price_1TDCvF2eFONDuxiMVjMqVP4g",
      annual: "price_1TmH282eFONDuxiMSVkzpmTk"
    },
    regular: {
      monthly: "price_1TXusG2eFONDuxiMWb1pjwJk",
      annual: "price_1TmH7U2eFONDuxiM9ZJZb9fJ"
    }
  },
  appCrm: {
    founders: {
      monthly: "price_1TXv0P2eFONDuxiMyJTG9mUO",
      annual: "price_1TmH5D2eFONDuxiMV015UQ75"
    },
    regular: {
      monthly: "price_1TXv4D2eFONDuxiMyGR2tBWb",
      annual: "price_1TmH8x2eFONDuxiMxT3uDRPd"
    }
  },
  crm: {
    founders: {
      monthly: "price_1TXuv22eFONDuxiMF3y99PHQ",
      annual: ""
    },
    regular: {
      monthly: "price_1TXuwB2eFONDuxiMxeIQXc49",
      annual: ""
    }
  },
  rsm: {
    founders: {
      monthly: "price_1TDCvH2eFONDuxiMez56vGW3",
      annual: "price_1Ttuc32eFONDuxiMnA1AqNUr"
    },
    regular: {
      monthly: "price_1TXuri2eFONDuxiM1vyK4PZi",
      annual: "price_1TtugJ2eFONDuxiMZzkCTgLY"
    }
  }
};

function firstValue(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) || "";
}

function normalizeTier(value) {
  return value === "regular" ? "regular" : "founders";
}

function normalizeInterval(value) {
  return value === "annual" ? "annual" : "monthly";
}

function getActivationPriceId() {
  return firstValue(CONFIGURED_PRICE_IDS.activation);
}

function getLegacyOfficePriceId() {
  return firstValue(
    CONFIGURED_PRICE_IDS.legacyOffice,
    CONFIGURED_PRICE_IDS.rsm.founders.monthly
  );
}

function getAgentPriceId({ pricingTier = "founders", billingInterval = "monthly" } = {}) {
  const tier = normalizeTier(pricingTier);
  const interval = normalizeInterval(billingInterval);

  return firstValue(
    CONFIGURED_PRICE_IDS.agent[tier][interval]
  );
}

function getAppCrmPriceId({ pricingTier = "founders", billingInterval = "monthly" } = {}) {
  const tier = normalizeTier(pricingTier);
  const interval = normalizeInterval(billingInterval);

  return firstValue(
    CONFIGURED_PRICE_IDS.appCrm[tier][interval]
  );
}

function getCrmPriceId({ pricingTier = "founders", billingInterval = "monthly" } = {}) {
  const tier = normalizeTier(pricingTier);
  const interval = normalizeInterval(billingInterval);

  return firstValue(
    CONFIGURED_PRICE_IDS.crm[tier][interval]
  );
}

function getRsmPriceId({ pricingTier = "founders", billingInterval = "monthly" } = {}) {
  const tier = normalizeTier(pricingTier);
  const interval = normalizeInterval(billingInterval);

  return firstValue(
    CONFIGURED_PRICE_IDS.rsm[tier][interval]
  );
}

module.exports = {
  getActivationPriceId,
  getLegacyOfficePriceId,
  getAgentPriceId,
  getAppCrmPriceId,
  getCrmPriceId,
  getRsmPriceId,
  normalizeInterval,
  normalizeTier
};
