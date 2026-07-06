const {
  getApprovedUnsentApplications,
  markAcceptanceEmailSent,
  syncApplicationRowColor,
  syncAllApplicationRowColors,
} = require("./lib/applications-sheet");
const { sendAcceptanceEmail } = require("./lib/email");
const { signToken } = require("./lib/tokens");

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const getPaymentDeadlineDays = () => {
  const parsed = Number(process.env.SHOW_PAYMENT_DEADLINE_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
};

const formatDeadline = (date) => {
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch (error) {
    return date.toISOString().slice(0, 10);
  }
};

const processApprovals = async () => {
  const siteUrl = requiredEnv("SITE_URL").replace(/\/$/, "");
  const deadlineDays = getPaymentDeadlineDays();
  const deadline = formatDeadline(new Date(Date.now() + deadlineDays * 24 * 60 * 60 * 1000));

  const applications = await getApprovedUnsentApplications();

  const results = {
    processed: 0,
    sent: 0,
    failed: 0,
  };

  for (const application of applications) {
    results.processed += 1;

    try {
      const token = signToken({ applicationId: application.applicationId });
      const paymentUrl = `${siteUrl}/show-payment.html?token=${encodeURIComponent(token)}`;

      await sendAcceptanceEmail({
        application,
        paymentUrl,
        paymentDeadline: deadline,
      });

      await markAcceptanceEmailSent(application.applicationId);
      await syncApplicationRowColor(application);
      results.sent += 1;
    } catch (error) {
      results.failed += 1;
      console.error("Failed to send acceptance email", {
        applicationId: application.applicationId,
        email: application.email,
        message: error.message,
      });
    }
  }

  await syncAllApplicationRowColors();

  return results;
};

exports.handler = async () => {
  try {
    const results = await processApprovals();
    console.log("process-approvals complete", results);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, ...results }),
    };
  } catch (error) {
    console.error("process-approvals failed", error.message);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: error.message }),
    };
  }
};
