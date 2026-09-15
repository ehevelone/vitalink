const nodemailer = require("nodemailer");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
  };
}

function clean(value) {
  const text = String(value || "").trim();
  return text || null;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(value) {
  const number = Number(value || 0);
  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return String(value).trim();
}

function estimateLines(result) {
  const estimates = Array.isArray(result?.estimates) ? result.estimates : [];
  return estimates.map((estimate) => {
    const low = money(estimate.low);
    const high = money(estimate.high).replace("$", "");
    return `${estimate.label || "Estimate"}: ${low}-${high}`;
  });
}

function answerRows(answers) {
  return [
    ["Age", answers.age],
    ["Spouse/partner age", answers.spouseAge],
    ["Existing coverage", answers.hasCoverage],
    ["Current coverage amount", money(answers.currentCoverage)],
    ["Dependents/kids at home", answers.dependents],
    ["Relationship status", answers.relationshipStatus],
    ["Mortgage balance", money(answers.mortgageBalance)],
    ["Credit cards/personal debt", money(answers.personalDebt)],
    ["Auto/personal/other loans", money(answers.otherLoans)],
    ["Student loans/anything else", money(answers.studentLoans)],
    ["Funeral wishes", answers.finalPlanLabel],
    ["Final expenses estimate", money(answers.finalExpenses)],
    ["Spouse/partner funeral wishes", answers.spouseFinalPlanLabel],
    ["Spouse/partner final expenses estimate", answers.spouseFinalExpenses !== undefined ? money(answers.spouseFinalExpenses) : null],
    ["College planning goal", money(answers.collegeGoal)],
    ["Household earners", answers.earners],
    ["Income range", answers.income],
    ["Spouse/partner income range", answers.spouseIncome],
    ["Income replacement years", answers.incomeYears],
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");
}

function emailText({ leadId, lead, answers, result, consent }) {
  const estimates = estimateLines(result).join("\n") || "No estimate returned.";
  const answerText = answerRows(answers)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");

  return `New Life Insurance Needs Quiz Lead

Lead ID: ${leadId}
Name: ${lead.name}
Email: ${lead.email}
Phone: ${lead.phone || "Not provided"}
Preferred contact: ${lead.contactPreference || "Not provided"}

Estimate:
${estimates}

Quiz answers:
${answerText}

Consent record:
${consent.language}
Consent page: ${consent.page}
Consent captured at: ${consent.capturedAt}
`;
}

function emailHtml({ leadId, lead, answers, result, consent }) {
  const estimateItems = estimateLines(result)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("");
  const rows = answerRows(answers)
    .map(([label, value]) => `
      <tr>
        <td style="padding:8px 10px;color:#8b949e;border-bottom:1px solid #243244;">${escapeHtml(label)}</td>
        <td style="padding:8px 10px;color:#ffffff;border-bottom:1px solid #243244;">${escapeHtml(value)}</td>
      </tr>
    `)
    .join("");

  return `
    <div style="background:#071018;color:#ffffff;font-family:Arial,Helvetica,sans-serif;padding:24px;">
      <div style="max-width:760px;background:#0d1722;border:1px solid #223247;border-radius:18px;padding:24px;">
        <h1 style="margin:0 0 8px;">New Life Insurance Needs Quiz Lead</h1>
        <p style="margin:0 0 20px;color:#94a3b8;">Lead ID: ${escapeHtml(leadId)}</p>
        <h2 style="margin:18px 0 8px;color:#7cc6e8;">Contact</h2>
        <p style="line-height:1.6;">
          <strong>${escapeHtml(lead.name)}</strong><br>
          Email: ${escapeHtml(lead.email)}<br>
          Phone: ${escapeHtml(lead.phone || "Not provided")}<br>
          Preferred contact: ${escapeHtml(lead.contactPreference || "Not provided")}
        </p>
        <h2 style="margin:18px 0 8px;color:#7cc6e8;">Estimate</h2>
        <ul style="line-height:1.7;">${estimateItems || "<li>No estimate returned.</li>"}</ul>
        <h2 style="margin:18px 0 8px;color:#7cc6e8;">Quiz Answers</h2>
        <table style="border-collapse:collapse;width:100%;max-width:720px;">${rows}</table>
        <h2 style="margin:18px 0 8px;color:#7cc6e8;">Consent Record</h2>
        <p style="line-height:1.6;color:#cbd5e1;">
          ${escapeHtml(consent.language)}<br>
          Page: ${escapeHtml(consent.page)}<br>
          Captured: ${escapeHtml(consent.capturedAt)}
        </p>
      </div>
    </div>
  `;
}

function createMailer() {
  const host = getRequiredEnv("SMTP_HOST");
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = port === 465;
  const isGmail = /gmail/i.test(host) || /gmail/i.test(process.env.SMTP_USER || "");

  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure || isGmail,
    auth: {
      user: getRequiredEnv("SMTP_USER"),
      pass: getRequiredEnv("SMTP_PASS"),
    },
    authMethod: isGmail ? "LOGIN" : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    tls: {
      minVersion: "TLSv1.2",
      servername: host,
    },
  });
}

function fromAddress(label = "VitaLink Life") {
  const from = String(
    process.env.LIFE_LEAD_FROM_EMAIL ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    "ehevelone@gmail.com"
  ).trim();
  if (!from) {
    throw new Error("LIFE_LEAD_FROM_EMAIL, SMTP_FROM, or SMTP_USER is not configured.");
  }
  return `"${label}" <${from}>`;
}

async function sendEmail({ to, subject, text, html }) {
  const transporter = createMailer();
  return transporter.sendMail({
    from: fromAddress("VitaLink Life"),
    to,
    subject,
    text,
    html,
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return reply(405, { success: false, error: "Method not allowed." });
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const rawLead = body.lead || {};
    const rawConsent = body.consent || {};
    const lead = {
      name: clean(rawLead.name),
      email: clean(rawLead.email)?.toLowerCase(),
      phone: clean(rawLead.phone),
      contactPreference: clean(rawLead.contactPreference),
    };
    const consent = {
      accepted: rawConsent.accepted === true,
      language: clean(rawConsent.language),
      page: clean(rawConsent.page),
      capturedAt: clean(rawConsent.capturedAt),
    };

    if (!lead.name || !lead.email) {
      return reply(400, {
        success: false,
        error: "Name and email are required.",
      });
    }

    if (!lead.contactPreference || !["email", "text", "call"].includes(lead.contactPreference)) {
      return reply(400, {
        success: false,
        error: "Please choose how you would like to be contacted.",
      });
    }

    if ((lead.contactPreference === "text" || lead.contactPreference === "call") && !/^\D*(\d\D*){10,}$/.test(lead.phone || "")) {
      return reply(400, {
        success: false,
        error: "A valid phone number is required for text or call follow-up.",
      });
    }

    if (!consent.accepted || !consent.language || !consent.page || !consent.capturedAt) {
      return reply(400, {
        success: false,
        error: "Consent is required.",
      });
    }

    const answers = body.answers || {};
    const result = body.result || {};
    const leadId = `life-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const notification = { leadId, lead, answers, result, consent };
    await sendEmail({
      to: process.env.LIFE_LEAD_TO_EMAIL || "ehevelone@asb.insure",
      subject: `New life insurance quiz lead: ${lead.name}`,
      text: emailText(notification),
      html: emailHtml(notification),
    });

    return reply(200, {
      success: true,
      leadId,
      notification: "email_sent",
    });
  } catch (error) {
    console.error("life-needs-quiz-lead error:", error);

    return reply(500, {
      success: false,
      error: "Unable to send this result right now.",
    });
  }
};
