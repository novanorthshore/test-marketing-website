const {
  getApprovedUnsentApplications,
  getApplicationById,
  markAcceptanceEmailSent,
  markPaymentStatus,
  syncApplicationRowColor,
  syncAllApplicationRowColors,
} = require("./lib/applications-sheet");
const { sendAcceptanceEmail } = require("./lib/email");
const { getFinaleRegistrationType } = require("./lib/event-config");
const { signToken } = require("./lib/tokens");

const processApprovals = async () => {
  const applications = await getApprovedUnsentApplications();

  const results = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  for (const candidate of applications) {
    results.processed += 1;

    try {
      const application = await getApplicationById(candidate.applicationId);
      if (!application || application.status.trim().toLowerCase() !== "approved" || application.acceptanceEmailSent) {
        results.skipped += 1;
        continue;
      }
      const paymentStatus = String(application.paymentStatus || "").trim().toLowerCase();
      if (paymentStatus === "paid") {
        results.skipped += 1;
        continue;
      }
      const registrationOption = getFinaleRegistrationType(application.registrationType);
      let paymentUrl;

      if (registrationOption && paymentStatus !== "free") {
        const siteUrl = String(process.env.SITE_URL || "").replace(/\/$/, "");
        if (!siteUrl) {
          throw new Error("SITE_URL is required to send Finale payment links.");
        }

        const token = signToken({ applicationId: application.applicationId });
        paymentUrl = `${siteUrl}/show-payment.html?token=${encodeURIComponent(token)}`;
      } else if (paymentStatus !== "paid" && paymentStatus !== "free") {
        await markPaymentStatus(application.applicationId, "Free");
        application.paymentStatus = "Free";
      }

      await sendAcceptanceEmail({ application, paymentUrl });
      const marked = await markAcceptanceEmailSent(
        application.applicationId,
        new Date().toISOString(),
      );
      if (!marked) throw new Error("Application disappeared before acceptance email was recorded.");
      await syncApplicationRowColor(application);
      results.sent += 1;
    } catch (error) {
      results.failed += 1;
      console.error("Failed to send acceptance email", {
        applicationId: candidate.applicationId,
        email: candidate.email,
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
