const twilio = require("twilio");
const { requiredEnv } = require("./google-auth");

let twilioClient;

const getTwilioClient = () => {
  if (twilioClient) {
    return twilioClient;
  }

  twilioClient = twilio(
    requiredEnv("TWILIO_ACCOUNT_SID"),
    requiredEnv("TWILIO_AUTH_TOKEN")
  );

  return twilioClient;
};

const getVerifyServiceSid = () => requiredEnv("TWILIO_VERIFY_SERVICE_SID");

/**
 * Normalize North American phone numbers to E.164.
 * Accepts 10-digit local, 11-digit starting with 1, or already +1...
 */
const normalizePhoneE164 = (rawPhone) => {
  const digits = String(rawPhone || "").replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if (String(rawPhone || "").trim().startsWith("+") && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
};

const sendVoteVerificationCode = async (phoneE164) => {
  const client = getTwilioClient();
  const verification = await client.verify.v2
    .services(getVerifyServiceSid())
    .verifications.create({
      to: phoneE164,
      channel: "sms",
    });

  return {
    status: verification.status,
    to: verification.to,
  };
};

const checkVoteVerificationCode = async (phoneE164, code) => {
  const client = getTwilioClient();
  const check = await client.verify.v2
    .services(getVerifyServiceSid())
    .verificationChecks.create({
      to: phoneE164,
      code: String(code || "").trim(),
    });

  return {
    status: check.status,
    valid: check.status === "approved",
  };
};

module.exports = {
  normalizePhoneE164,
  sendVoteVerificationCode,
  checkVoteVerificationCode,
};
