const { createHmac } = require("crypto");
const { requiredEnv } = require("./google-auth");

const getSecret = () => (
  process.env.VOTE_EMAIL_OTP_SECRET
  || requiredEnv("VOTE_PHONE_HASH_SECRET")
);

const hmac = (value) => (
  createHmac("sha256", getSecret()).update(String(value || "")).digest("hex")
);

const clean = (value, maxLength = 120) => (
  String(value ?? "").trim().toLowerCase().slice(0, maxLength)
);

const number = (value, min, max) => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(min, Math.min(max, parsed))
    : 0;
};

const getRequestIp = (event) => {
  const headers = event.headers || {};
  const forwarded = clean(headers["x-forwarded-for"], 200).split(",")[0].trim();
  return clean(
    headers["x-nf-client-connection-ip"]
    || forwarded
    || headers["client-ip"]
    || "unknown",
    80
  );
};

const buildRiskHashes = (event, rawSignature = {}) => {
  const headers = event.headers || {};
  const signature = {
    platform: clean(rawSignature.platform),
    screen: clean(rawSignature.screen, 40),
    timezone: clean(rawSignature.timezone, 80),
    language: clean(rawSignature.language, 30),
    touchPoints: number(rawSignature.touchPoints, 0, 20),
    hardwareConcurrency: number(rawSignature.hardwareConcurrency, 0, 128),
    deviceMemory: number(rawSignature.deviceMemory, 0, 128),
    colorDepth: number(rawSignature.colorDepth, 0, 64),
    pixelRatio: number(rawSignature.pixelRatio, 0, 10),
    mobile: clean(headers["sec-ch-ua-mobile"], 20),
    clientPlatform: clean(headers["sec-ch-ua-platform"], 50),
    userAgent: clean(headers["user-agent"], 300),
  };
  const ip = getRequestIp(event);
  const browser = [
    signature.userAgent,
    signature.mobile,
    signature.clientPlatform,
  ].join("|");

  return {
    fingerprintHash: hmac(`fingerprint:${JSON.stringify(signature)}`),
    networkHash: hmac(`network:${ip}|${browser}`),
  };
};

module.exports = {
  buildRiskHashes,
  getRequestIp,
};
