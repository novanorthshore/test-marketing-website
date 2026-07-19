const fs = require("fs");
const path = require("path");
const {
  getApprovedUnsentEventInfoApplications,
  markEventInfoEmailSent,
} = require("./lib/applications-sheet");
const { sendEventInfoEmail } = require("./lib/email");

const loadEventInfoFlyer = () => {
  const candidates = [
    path.join(process.cwd(), "assets", "event_info.png"),
    path.join(__dirname, "..", "..", "assets", "event_info.png"),
    path.join(__dirname, "assets", "event_info.png"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate);
    }
  }

  throw new Error(
    "Could not find assets/event_info.png. Redeploy with the flyer included for process-event-info.",
  );
};

const processEventInfoEmails = async () => {
  const applications = await getApprovedUnsentEventInfoApplications();
  const flyerBuffer = loadEventInfoFlyer();

  const results = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  for (const application of applications) {
    results.processed += 1;

    if (!String(application.email || "").trim()) {
      results.skipped += 1;
      continue;
    }

    try {
      await sendEventInfoEmail({ application, flyerBuffer });
      await markEventInfoEmailSent(application.applicationId);
      results.sent += 1;
    } catch (error) {
      results.failed += 1;
      console.error("Failed to send event info email", {
        applicationId: application.applicationId,
        email: application.email,
        message: error.message,
      });
    }
  }

  return results;
};

exports.handler = async () => {
  try {
    const results = await processEventInfoEmails();
    console.log("process-event-info complete", results);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, ...results }),
    };
  } catch (error) {
    console.error("process-event-info failed", error.message);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: error.message }),
    };
  }
};
