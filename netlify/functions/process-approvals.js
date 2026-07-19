const {
  getApprovedUnsentApplications,
  markAcceptanceEmailSent,
  markPaymentStatus,
  syncApplicationRowColor,
  syncAllApplicationRowColors,
} = require("./lib/applications-sheet");
const { sendAcceptanceEmail } = require("./lib/email");

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

      // Advance applications are free. Mark unpaid approved rows as Free so the
      // sheet turns green and no payment link is required. Leave Paid alone so
      // already-paid applicants can be refunded manually in Stripe.
      if (paymentStatus !== "paid" && paymentStatus !== "free") {
        await markPaymentStatus(application.applicationId, "Free");
        application.paymentStatus = "Free";
      }

      await sendAcceptanceEmail({ application });
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
