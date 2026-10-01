const Stripe = require("stripe");
const { Pool } = require("pg");
const { getAgentPriceId, getAppCrmPriceId } = require("./services/stripe-prices");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL || process.env.SUPABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://myvitalink.app",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function normalizePricingTier(value) {
  return value === "regular" ? "regular" : "founders";
}

function getPlan(body = {}, pricingTier = "founders") {
  const plan =
    (body.plan || body.product || body.subscription || "")
      .toString()
      .trim()
      .toLowerCase();

  const billing =
    (body.billing || body.interval || body.frequency || "monthly")
      .toString()
      .trim()
      .toLowerCase();

  const isAnnual =
    ["annual", "annually", "year", "yearly"].includes(billing);

  if (["app_crm", "app-crm", "combo", "appcrm"].includes(plan)) {
    const billingInterval = isAnnual ? "annual" : "monthly";
    const priceId = getAppCrmPriceId({ pricingTier, billingInterval });

    return {
      priceId,
      type: "app_crm_subscription",
      product: "app_crm",
      billing: billingInterval,
      pricingTier
    };
  }

  const billingInterval = isAnnual ? "annual" : "monthly";
  const priceId = getAgentPriceId({ pricingTier, billingInterval });

  return {
    priceId,
    type: "agent_subscription",
    product: "agent",
    billing: billingInterval,
    pricingTier
  };
}

exports.handler = async (event) => {

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ""
    };
  }

  try {

    // 🔥 ADD BODY (needed for agent linkage)
    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch (_) {}

    const agentId = body.agentId || "";
    let email = body.email || "";
    let pricingTier = normalizePricingTier(body.pricingTier);

    if (agentId) {
      const client = await pool.connect();
      try {
        await client.query(`
          ALTER TABLE agents
          ADD COLUMN IF NOT EXISTS pricing_tier TEXT DEFAULT 'founders'
        `);

        const agentResult = await client.query(
          `SELECT email, pricing_tier FROM agents WHERE id = $1 LIMIT 1`,
          [agentId]
        );

        const agent = agentResult.rows[0];
        if (agent) {
          email = email || agent.email || "";
          pricingTier = normalizePricingTier(agent.pricing_tier);
        }
      } finally {
        client.release();
      }
    }

    const plan = getPlan(body, pricingTier);

    if (!plan.priceId) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Stripe price is not configured" })
      };
    }

    const session = await stripe.checkout.sessions.create({

      // 🔥 ACH FIRST
      payment_method_types: ["us_bank_account", "card"],

      // 🔥 SMOOTH ACH FLOW
      payment_method_options: {
        us_bank_account: {
          verification_method: "automatic"
        }
      },

      mode: "subscription",

      line_items: [
        {
          price: plan.priceId,
          quantity: 1
        }
      ],

      // 🔥 helps Stripe + receipts
      customer_email: email || undefined,
      client_reference_id: agentId ? String(agentId) : undefined,

      // 🔥 CRITICAL FOR WEBHOOK MATCHING
      metadata: {
        agentId: String(agentId),
        type: plan.type,
        product: plan.product,
        billing: plan.billing,
        pricing_tier: plan.pricingTier
      },

      subscription_data: {
        metadata: {
          agentId: String(agentId),
          type: plan.type,
          product: plan.product,
          billing: plan.billing,
          pricing_tier: plan.pricingTier
        }
      },

      success_url:
        "https://myvitalink.app/agent-success.html?session_id={CHECKOUT_SESSION_ID}",

      cancel_url:
        `https://myvitalink.app/agent-access?plan=${encodeURIComponent(plan.product)}&billing=${encodeURIComponent(plan.billing)}`

    });

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ url: session.url })
    };

  } catch (err) {

    console.error("Stripe agent checkout error:", err);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message })
    };

  }

};
