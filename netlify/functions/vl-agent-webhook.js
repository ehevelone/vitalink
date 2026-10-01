const Stripe = require("stripe");
const db = require("./services/db");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function generateAgentCode() {
  return "AG-" + Math.random().toString(36).substring(2, 10).toUpperCase();
}

function generateClientCode() {
  return "CL-" + Math.random().toString(36).substring(2, 12).toUpperCase();
}

async function ensureAgentBillingColumns() {
  await db.query(`
    ALTER TABLE agents
    ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
    ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
    ADD COLUMN IF NOT EXISTS subscription_status TEXT,
    ADD COLUMN IF NOT EXISTS subscription_valid BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS billing_owner TEXT,
    ADD COLUMN IF NOT EXISTS crm_subscription_status TEXT,
    ADD COLUMN IF NOT EXISTS crm_subscription_valid BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS crm_stripe_customer_id TEXT,
    ADD COLUMN IF NOT EXISTS crm_stripe_subscription_id TEXT
  `);
}

function isActiveStatus(status) {
  return ["active", "trialing"].includes(status);
}

function includesAgentAccess(type) {
  return !type ||
    type === "agent_subscription" ||
    type === "app_crm_subscription";
}

function includesCrmAccess(type) {
  return type === "crm_subscription" ||
    type === "app_crm_subscription";
}

async function getSubscriptionFromInvoice(invoice) {
  const subscriptionId =
    typeof invoice.subscription === "string" ? invoice.subscription : null;

  if (!subscriptionId) {
    return null;
  }

  return stripe.subscriptions.retrieve(subscriptionId);
}

async function handleCrmCheckout(session) {
  let agentId =
    session.metadata?.agentId || session.client_reference_id;
  const email =
    session.customer_details?.email ||
    session.customer_email ||
    "";

  const subscription =
    await stripe.subscriptions.retrieve(session.subscription);

  if (!agentId) {
    const agentRes = await db.query(
      `
      SELECT id
      FROM agents
      WHERE stripe_customer_id = $1
         OR LOWER(email) = LOWER($2)
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [session.customer, email]
    );

    agentId = agentRes.rows[0]?.id;
  }

  if (!agentId) {
    console.warn("CRM subscription checkout could not find agent:", session.id);
    return;
  }

  await db.query(
    `
    UPDATE agents
    SET crm_stripe_customer_id = $1,
        crm_stripe_subscription_id = $2,
        crm_subscription_status = $3,
        crm_subscription_valid = $4
    WHERE id = $5
    `,
    [
      session.customer,
      subscription.id,
      subscription.status,
      isActiveStatus(subscription.status),
      agentId
    ]
  );

  console.log("CRM subscription activated for agent:", agentId);
}

async function handleAgentCheckout(session) {
  const email =
    session.customer_details?.email ||
    session.customer_email ||
    "";

  const agentId = session.metadata?.agentId || session.client_reference_id || "";
  const customerId = session.customer;
  const subscriptionId = session.subscription;
  const agentCode = generateAgentCode();
  const clientCode = generateClientCode();

  if (agentId) {
    const updated = await db.query(
      `
      UPDATE agents
      SET stripe_customer_id = $1,
          stripe_subscription_id = $2,
          subscription_status = 'active',
          subscription_valid = true,
          billing_owner = 'agent',
          active = true,
          promo_code = COALESCE(promo_code, $3),
          unlock_code = COALESCE(unlock_code, $4)
      WHERE id = $5
      RETURNING id
      `,
      [customerId, subscriptionId, agentCode, clientCode, agentId]
    );

    if (updated.rows.length > 0) {
      console.log("Agent subscription activated:", agentId);
      return;
    }
  }

  await db.query(
    `
    INSERT INTO agents
    (
      email,
      role,
      active,
      created_at,
      promo_code,
      unlock_code,
      stripe_customer_id,
      stripe_subscription_id,
      subscription_status,
      subscription_valid,
      billing_owner
    )
    VALUES
    (
      $1,
      'agent',
      true,
      NOW(),
      $2,
      $3,
      $4,
      $5,
      'active',
      true,
      'agent'
    )
    ON CONFLICT (email)
    DO UPDATE SET
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      promo_code = EXCLUDED.promo_code,
      unlock_code = EXCLUDED.unlock_code,
      subscription_status = 'active',
      subscription_valid = true,
      billing_owner = 'agent',
      active = true
    `,
    [
      email,
      agentCode,
      clientCode,
      customerId,
      subscriptionId
    ]
  );

  console.log("Agent subscription activated:", email);
}

async function updateCrmSubscription(subscription) {
  await db.query(
    `
    UPDATE agents
    SET crm_subscription_status = $1,
        crm_subscription_valid = $2,
        crm_stripe_customer_id = COALESCE(crm_stripe_customer_id, $3),
        crm_stripe_subscription_id = $4
    WHERE crm_stripe_subscription_id = $4
       OR id::TEXT = $5
    `,
    [
      subscription.status,
      isActiveStatus(subscription.status),
      subscription.customer,
      subscription.id,
      subscription.metadata?.agentId || ""
    ]
  );
}

async function updateAgentSubscription(subscription) {
  await db.query(
    `
    UPDATE agents
    SET stripe_subscription_id = $1,
        subscription_status = $2,
        subscription_valid = $3
    WHERE stripe_customer_id = $4
       OR stripe_subscription_id = $1
    `,
    [
      subscription.id,
      subscription.status,
      isActiveStatus(subscription.status),
      subscription.customer
    ]
  );
}

async function handleInvoicePaid(invoice) {
  const subscription =
    await getSubscriptionFromInvoice(invoice);
  const type = subscription?.metadata?.type;

  if (includesCrmAccess(type)) {
    await updateCrmSubscription({
      ...subscription,
      status: "active"
    });
  }

  if (includesAgentAccess(type)) {
    await db.query(
      `
      UPDATE agents
      SET subscription_status = 'active',
          subscription_valid = true
      WHERE stripe_customer_id = $1
         OR stripe_subscription_id = $2
      `,
      [invoice.customer, subscription?.id || ""]
    );
  }

  if (subscription) {
    return;
  }

  await db.query(
    `
    UPDATE agents
    SET subscription_status = 'active',
        subscription_valid = true
    WHERE stripe_customer_id = $1
    `,
    [invoice.customer]
  );
}

async function handleInvoiceFailed(invoice) {
  const subscription =
    await getSubscriptionFromInvoice(invoice);
  const type = subscription?.metadata?.type;

  if (includesCrmAccess(type)) {
    await db.query(
      `
      UPDATE agents
      SET crm_subscription_status = 'past_due',
          crm_subscription_valid = false
      WHERE crm_stripe_subscription_id = $1
         OR crm_stripe_customer_id = $2
      `,
      [subscription.id, invoice.customer]
    );
  }

  if (includesAgentAccess(type)) {
    await db.query(
      `
      UPDATE agents
      SET subscription_status = 'past_due',
          subscription_valid = false
      WHERE stripe_customer_id = $1
         OR stripe_subscription_id = $2
      `,
      [invoice.customer, subscription?.id || ""]
    );
  }
}

exports.handler = async (event) => {
  const sig =
    event.headers["stripe-signature"] ||
    event.headers["Stripe-Signature"];

  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET_AGENT
    );
  } catch (err) {
    console.error("Agent webhook signature failed:", err);

    return {
      statusCode: 400,
      body: "Webhook Error"
    };
  }

  const data = stripeEvent.data.object;

  try {
    await ensureAgentBillingColumns();

    switch (stripeEvent.type) {
      case "checkout.session.completed":
        if (includesAgentAccess(data.metadata?.type)) {
          await handleAgentCheckout(data);
        }

        if (includesCrmAccess(data.metadata?.type)) {
          await handleCrmCheckout(data);
        }
        break;

      case "checkout.session.async_payment_succeeded":
        console.log("Async payment succeeded:", data.id);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        if (includesAgentAccess(data.metadata?.type)) {
          await updateAgentSubscription(data);
        }

        if (includesCrmAccess(data.metadata?.type)) {
          await updateCrmSubscription(data);
        }
        break;

      case "invoice.paid":
        await handleInvoicePaid(data);
        break;

      case "invoice.payment_failed":
        await handleInvoiceFailed(data);
        break;

      default:
        console.log("Unhandled agent billing event:", stripeEvent.type);
        break;
    }

    return {
      statusCode: 200,
      body: "Webhook received"
    };

  } catch (err) {
    console.error("Agent webhook error:", err);

    return {
      statusCode: 500,
      body: "Server error"
    };
  }
};
