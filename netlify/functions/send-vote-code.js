const {
  getVotingVerificationMode,
  isVotingOpen,
} = require("./lib/vote-config");
const {
  hasEmailOrDeviceVoted,
  hasPhoneVoted,
  hashPhone,
  isRetryableSheetsError,
} = require("./lib/voting-sheet");
const {
  normalizePhoneE164,
  sendVoteVerificationCode,
} = require("./lib/twilio-verify");
const {
  generateEmailOtpChallenge,
  hashDevice,
  hashEmail,
  hashIp,
  isValidDeviceId,
  isValidEmail,
  normalizeDeviceId,
  normalizeEmail,
} = require("./lib/email-otp");
const { sendVotingOtpEmail } = require("./lib/email");
const {
  hasRedisIdentityVoted,
  isVotingRedisConfigured,
} = require("./lib/voting-redis");

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

// Best-effort throttles across warm function instances. Ballot uniqueness is
// also enforced persistently in Google Sheets.
const recentSends = new Map();
const SEND_COOLDOWN_MS = 45 * 1000;
const recentIpSends = new Map();
const IP_WINDOW_MS = 60 * 1000;
const IP_MAX_SENDS = 20;

const pruneRecentSends = (now) => {
  for (const [key, timestamp] of recentSends.entries()) {
    if (now - timestamp > SEND_COOLDOWN_MS) {
      recentSends.delete(key);
    }
  }

  for (const [key, timestamps] of recentIpSends.entries()) {
    const active = timestamps.filter((timestamp) => now - timestamp < IP_WINDOW_MS);
    if (active.length) {
      recentIpSends.set(key, active);
    } else {
      recentIpSends.delete(key);
    }
  }
};

const getRequestIp = (event) => {
  const forwarded = String(event.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return String(
    event.headers["x-nf-client-connection-ip"]
    || forwarded
    || event.headers["client-ip"]
    || "unknown"
  ).trim();
};

const maskEmail = (email) => {
  const [local, domain] = normalizeEmail(email).split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
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

  const verificationMode = getVotingVerificationMode();
  let stage = 'request-validation';

  try {
    const now = Date.now();
    pruneRecentSends(now);
    const ipKey = hashIp(getRequestIp(event));
    const ipSends = recentIpSends.get(ipKey) || [];
    if (ipSends.length >= IP_MAX_SENDS) {
      return jsonResponse(429, {
        error: "Too many code requests from this network. Please wait one minute.",
        retryAfterSeconds: 60,
      });
    }

    if (verificationMode === "email") {
      const email = normalizeEmail(payload.email);
      const deviceId = normalizeDeviceId(payload.deviceId);

      if (!isValidEmail(email)) {
        return jsonResponse(400, { error: "Enter a valid email address." });
      }
      if (!isValidDeviceId(deviceId)) {
        return jsonResponse(400, { error: "Unable to identify this browser. Refresh and try again." });
      }

      const emailHash = hashEmail(email);
      const deviceHash = hashDevice(deviceId);
      let alreadyVoted = false;
      if (isVotingRedisConfigured()) {
        stage = 'redis-duplicate-check';
        try {
          alreadyVoted = await hasRedisIdentityVoted({ identityHash: emailHash, deviceHash });
        } catch (redisError) {
          console.error("Redis already-voted check failed; falling back to Sheets", {
            message: redisError.message,
            code: redisError.code || redisError.cause?.code,
          });
          stage = 'sheets-duplicate-check';
          alreadyVoted = await hasEmailOrDeviceVoted({ emailHash, deviceHash });
        }
      } else {
        stage = 'sheets-duplicate-check';
        alreadyVoted = await hasEmailOrDeviceVoted({ emailHash, deviceHash });
      }
      if (alreadyVoted) {
        return jsonResponse(409, {
          error: "This email or device has already voted.",
          alreadyVoted: true,
        });
      }

      const cooldownKeys = [`email:${emailHash}`, `device:${deviceHash}`];
      const lastSent = Math.max(...cooldownKeys.map((key) => recentSends.get(key) || 0));
      const waitMs = SEND_COOLDOWN_MS - (now - lastSent);
      if (waitMs > 0) {
        return jsonResponse(429, {
          error: `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another code.`,
          retryAfterSeconds: Math.ceil(waitMs / 1000),
        });
      }

      const { code, challenge } = generateEmailOtpChallenge({ email, deviceId, now });
      stage = 'email-delivery';
      await sendVotingOtpEmail({ email, code });
      cooldownKeys.forEach((key) => recentSends.set(key, now));
      recentIpSends.set(ipKey, [...ipSends, now]);

      return jsonResponse(200, {
        ok: true,
        verificationMode,
        challenge,
        message: "Verification code sent.",
        destinationMasked: maskEmail(email),
      });
    }

    const phoneE164 = normalizePhoneE164(payload.phone);
    if (!phoneE164) {
      return jsonResponse(400, {
        error: "Enter a valid mobile phone number with area code.",
      });
    }
    stage = 'phone-duplicate-check';
    const alreadyVoted = isVotingRedisConfigured()
      ? await hasRedisIdentityVoted({ identityHash: hashPhone(phoneE164) }).catch(async (redisError) => {
        console.error("Redis already-voted check failed; falling back to Sheets", {
          message: redisError.message,
          code: redisError.code,
        });
        return hasPhoneVoted(phoneE164);
      })
      : await hasPhoneVoted(phoneE164);
    if (alreadyVoted) {
      return jsonResponse(409, {
        error: "This phone number has already voted.",
        alreadyVoted: true,
      });
    }

    const phoneKey = `phone:${phoneE164}`;
    const lastSent = recentSends.get(phoneKey) || 0;
    const waitMs = SEND_COOLDOWN_MS - (now - lastSent);
    if (waitMs > 0) {
      return jsonResponse(429, {
        error: `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another code.`,
        retryAfterSeconds: Math.ceil(waitMs / 1000),
      });
    }

    stage = 'sms-delivery';
    await sendVoteVerificationCode(phoneE164);
    recentSends.set(phoneKey, now);
    recentIpSends.set(ipKey, [...ipSends, now]);

    return jsonResponse(200, {
      ok: true,
      verificationMode,
      message: "Verification code sent.",
      destinationMasked: `${phoneE164.slice(0, 2)}•••••${phoneE164.slice(-4)}`,
    });
  } catch (error) {
    console.error("Unable to send vote verification code", {
      stage,
      message: error.message,
      code: error.code || error.cause?.code,
    });

    if (isRetryableSheetsError(error)) {
      return jsonResponse(503, {
        error: "Voting is busy right now. Please wait a moment and try again.",
        retryable: true,
      });
    }

    const message = String(error.message || "");
    if (/Missing required environment variable:\s*VOTE_PHONE_HASH_SECRET/i.test(message)) {
      return jsonResponse(500, {
        error: "Voting email codes are missing VOTE_PHONE_HASH_SECRET in Netlify. Set a long random value and redeploy.",
      });
    }
    if (/Missing required environment variable:\s*RESEND_API_KEY/i.test(message)) {
      return jsonResponse(500, {
        error: "Voting email codes are missing RESEND_API_KEY in Netlify.",
      });
    }
    if (/^Resend failed:/i.test(message)) {
      return jsonResponse(500, {
        error: "The email provider rejected the verification send. Check EMAIL_FROM and Resend domain settings.",
        detail: message.replace(/^Resend failed:\s*/i, "").slice(0, 180),
      });
    }

    return jsonResponse(500, {
      error: "Unable to send a verification code right now. Please try again.",
      detail: message.slice(0, 180),
    });
  }
};
