const fs = require("fs");
const path = require("path");
const {
  getApprovedUnsentEventInfoApplications,
  markEventInfoEmailSent,
} = require("./lib/applications-sheet");
const { sendEventInfoEmail } = require("./lib/email");

const SEND_GAP_MS = 1200;
const QUOTA_RETRY_WAIT_MS = 65000;
const MAX_QUOTA_RETRIES = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isSheetsQuotaError = (error) => {
  const message = String(error?.message || error || "");
  return /quota exceeded|rate limit|429/i.test(message);
};

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

const sendOneEventInfoEmail = async ({ application, flyerBuffer }) => {
  let attempt = 0;

  while (true) {
    try {
      await sendEventInfoEmail({ application, flyerBuffer });
      await markEventInfoEmailSent(
        application.applicationId,
        new Date().toISOString(),
        application.rowNumber,
      );
      return;
    } catch (error) {
      if (!isSheetsQuotaError(error) || attempt >= MAX_QUOTA_RETRIES) {
        throw error;
      }

      attempt += 1;
      console.warn("Sheets quota hit; waiting before retry", {
        applicationId: application.applicationId,
        attempt,
        message: error.message,
      });
      await sleep(QUOTA_RETRY_WAIT_MS);
    }
  }
};

const processEventInfoEmails = async () => {
  const applications = await getApprovedUnsentEventInfoApplications();
  const flyerBuffer = loadEventInfoFlyer();

  const results = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    remaining: 0,
  };

  for (let index = 0; index < applications.length; index += 1) {
    const application = applications[index];
    results.processed += 1;

    if (!String(application.email || "").trim()) {
      results.skipped += 1;
      continue;
    }

    try {
      await sendOneEventInfoEmail({ application, flyerBuffer });
      results.sent += 1;
    } catch (error) {
      results.failed += 1;
      console.error("Failed to send event info email", {
        applicationId: application.applicationId,
        email: application.email,
        message: error.message,
      });
    }

    // Stay under Sheets write/read per-minute quotas across the blast.
    if (index < applications.length - 1) {
      await sleep(SEND_GAP_MS);
    }
  }

  results.remaining = Math.max(applications.length - results.sent - results.skipped, 0);
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
