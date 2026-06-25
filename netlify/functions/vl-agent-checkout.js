const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://myvitalink.app",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function getPlan(body = {}) {
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
    return {
      priceId:
        isAnnual
          ? process.env.STRIPE_FOUNDERS_APP_CRM_ANNUAL_PRICE_ID
          : process.env.STRIPE_FOUNDERS_APP_CRM_PRICE_ID,
      type: "app_crm_subscription",
      product: "app_crm",
      billing: isAnnual ? "annual" : "monthly"
    };
  }

  return {
    priceId:
      isAnnual
        ? process.env.STRIPE_FOUNDERS_AGENT_ANNUAL_PRICE_ID
        : process.env.STRIPE_FOUNDERS_AGENT_PRICE_ID,
    type: "agent_subscription",
    product: "agent",
    billing: isAnnual ? "annual" : "monthly"
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
    let body = {};

    try {
      body = JSON.parse(event.body || "{}");
    } catch (_) {}

    const agentId = body.agentId || "";
    const email = body.email || "";
    const plan = getPlan(body);

    if (!plan.priceId) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Stripe price is not configured"
        })
      };
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["us_bank_account", "card"],
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
      customer_email: email || undefined,
      metadata: {
        agentId: String(agentId),
        type: plan.type,
        product: plan.product,
        billing: plan.billing
      },
      subscription_data: {
        metadata: {
          agentId: String(agentId),
          type: plan.type,
          product: plan.product,
          billing: plan.billing
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
      body: JSON.stringify({
        url: session.url
      })
    };
  } catch (err) {
    console.error("Stripe agent checkout error:", err);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: err.message
      })
    };
  }
};

