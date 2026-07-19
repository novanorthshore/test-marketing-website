const {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} = require("crypto");
const { requiredEnv } = require("./google-auth");

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_CODE_LENGTH = 6;

const getSecret = () => (
  process.env.VOTE_EMAIL_OTP_SECRET
  || requiredEnv("VOTE_PHONE_HASH_SECRET")
);

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const isValidEmail = (value) => {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const normalizeDeviceId = (value) => String(value || "").trim();

const isValidDeviceId = (value) => {
  const deviceId = normalizeDeviceId(value);
  return /^[A-Za-z0-9_-]{16,128}$/.test(deviceId);
};

const hmac = (value) => (
  createHmac("sha256", getSecret()).update(String(value || "")).digest("hex")
);

const hashEmail = (email) => hmac(`email:${normalizeEmail(email)}`);
const hashDevice = (deviceId) => hmac(`device:${normalizeDeviceId(deviceId)}`);
const hashIp = (ip) => hmac(`ip:${String(ip || "").trim()}`);

const encodePayload = (payload) => (
  Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
);

const signPayload = (encodedPayload) => hmac(`challenge:${encodedPayload}`);

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
};

const generateEmailOtpChallenge = ({ email, deviceId, now = Date.now() }) => {
  const code = String(randomInt(0, 10 ** OTP_CODE_LENGTH))
    .padStart(OTP_CODE_LENGTH, "0");
  const nonce = randomBytes(18).toString("base64url");
  const payload = {
    v: 1,
    emailHash: hashEmail(email),
    deviceHash: hashDevice(deviceId),
    codeHash: hmac(`code:${nonce}:${code}`),
    nonce,
    exp: now + OTP_TTL_MS,
  };
  const encodedPayload = encodePayload(payload);

  return {
    code,
    challenge: `${encodedPayload}.${signPayload(encodedPayload)}`,
    expiresAt: payload.exp,
  };
};

const verifyEmailOtpChallenge = ({
  challenge,
  code,
  email,
  deviceId,
  now = Date.now(),
}) => {
  const [encodedPayload, signature, ...extra] = String(challenge || "").split(".");
  if (!encodedPayload || !signature || extra.length) {
    return { valid: false, reason: "invalid" };
  }

  if (!safeEqual(signature, signPayload(encodedPayload))) {
    return { valid: false, reason: "invalid" };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch (error) {
    return { valid: false, reason: "invalid" };
  }

  if (
    payload.v !== 1
    || !payload.exp
    || !payload.nonce
    || !payload.emailHash
    || !payload.deviceHash
    || !payload.codeHash
  ) {
    return { valid: false, reason: "invalid" };
  }

  if (Number(payload.exp) < now) {
    return { valid: false, reason: "expired" };
  }

  const expectedEmailHash = hashEmail(email);
  const expectedDeviceHash = hashDevice(deviceId);
  const expectedCodeHash = hmac(`code:${payload.nonce}:${String(code || "").trim()}`);

  if (
    !safeEqual(payload.emailHash, expectedEmailHash)
    || !safeEqual(payload.deviceHash, expectedDeviceHash)
    || !safeEqual(payload.codeHash, expectedCodeHash)
  ) {
    return { valid: false, reason: "invalid" };
  }

  return {
    valid: true,
    emailHash: payload.emailHash,
    deviceHash: payload.deviceHash,
    expiresAt: Number(payload.exp),
  };
};

module.exports = {
  OTP_TTL_MS,
  generateEmailOtpChallenge,
  hashDevice,
  hashEmail,
  hashIp,
  isValidDeviceId,
  isValidEmail,
  normalizeDeviceId,
  normalizeEmail,
  verifyEmailOtpChallenge,
};
