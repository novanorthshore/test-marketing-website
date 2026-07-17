const {
  isVotingOpen,
} = require("./lib/vote-config");
const { hasPhoneVoted } = require("./lib/voting-sheet");
const {
  normalizePhoneE164,
  sendVoteVerificationCode,
} = require("./lib/twilio-verify");

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

// Best-effort throttle across warm function instances.
const recentSends = new Map();
const SEND_COOLDOWN_MS = 45 * 1000;

const pruneRecentSends = (now) => {
  for (const [phone, timestamp] of recentSends.entries()) {
    if (now - timestamp > SEND_COOLDOWN_MS) {
      recentSends.delete(phone);
    }
  }
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  if (!isVotingOpen()) {
    return jsonResponse(403, { error: "Voting is closed right now." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return jsonResponse(400, { error: "Invalid request body." });
  }

  const phoneE164 = normalizePhoneE164(payload.phone);
  if (!phoneE164) {
    return jsonResponse(400, {
      error: "Enter a valid mobile phone number with area code.",
    });
  }

  try {
    if (await hasPhoneVoted(phoneE164)) {
      return jsonResponse(409, {
        error: "This phone number has already voted.",
        alreadyVoted: true,
      });
    }

    const now = Date.now();
    pruneRecentSends(now);
    const lastSent = recentSends.get(phoneE164) || 0;
    const waitMs = SEND_COOLDOWN_MS - (now - lastSent);

    if (waitMs > 0) {
      return jsonResponse(429, {
        error: `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another code.`,
        retryAfterSeconds: Math.ceil(waitMs / 1000),
      });
    }

    await sendVoteVerificationCode(phoneE164);
    recentSends.set(phoneE164, now);

    return jsonResponse(200, {
      ok: true,
      message: "Verification code sent.",
      phoneMasked: `${phoneE164.slice(0, 2)}•••••${phoneE164.slice(-4)}`,
    });
  } catch (error) {
    console.error("Unable to send vote verification code", {
      message: error.message,
      code: error.code,
    });

    return jsonResponse(500, {
      error: "Unable to send a verification code right now. Please try again.",
    });
  }
};
