const assert = require("assert");

process.env.VOTE_EMAIL_OTP_SECRET = "test-only-secret-that-is-long-enough-for-hmac";

const {
  generateEmailOtpChallenge,
  isValidDeviceId,
  isValidEmail,
  verifyEmailOtpChallenge,
} = require("../netlify/functions/lib/email-otp");

const email = "voter@example.com";
const deviceId = "test_device_1234567890";
const generated = generateEmailOtpChallenge({ email, deviceId, now: 1_000 });

assert.equal(isValidEmail(email), true);
assert.equal(isValidEmail("not-an-email"), false);
assert.equal(isValidDeviceId(deviceId), true);
assert.equal(isValidDeviceId("short"), false);

assert.equal(verifyEmailOtpChallenge({
  challenge: generated.challenge,
  code: generated.code,
  email,
  deviceId,
  now: 2_000,
}).valid, true);

assert.equal(verifyEmailOtpChallenge({
  challenge: generated.challenge,
  code: generated.code === "000000" ? "111111" : "000000",
  email,
  deviceId,
  now: 2_000,
}).valid, false);

assert.equal(verifyEmailOtpChallenge({
  challenge: generated.challenge,
  code: generated.code,
  email: "other@example.com",
  deviceId,
  now: 2_000,
}).valid, false);

assert.equal(verifyEmailOtpChallenge({
  challenge: generated.challenge,
  code: generated.code,
  email,
  deviceId: "other_device_123456789",
  now: 2_000,
}).valid, false);

assert.equal(verifyEmailOtpChallenge({
  challenge: generated.challenge,
  code: generated.code,
  email,
  deviceId,
  now: generated.expiresAt + 1,
}).reason, "expired");

assert.equal(verifyEmailOtpChallenge({
  challenge: `${generated.challenge}x`,
  code: generated.code,
  email,
  deviceId,
  now: 2_000,
}).valid, false);

console.log("Email OTP challenge tests passed.");
