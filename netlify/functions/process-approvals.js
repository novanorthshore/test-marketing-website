const {
  getApprovedUnsentApplications,
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
  };

  for (const application of applications) {
    results.processed += 1;

    try {
      const paymentStatus = String(application.paymentStatus || "").trim().toLowerCase();
      const registrationOption = getFinaleRegistrationType(application.registrationType);
      let paymentUrl;

      if (registrationOption) {
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
      await markAcceptanceEmailSent(
        application.applicationId,
        new Date().toISOString(),
        application.rowNumber,
      );
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
