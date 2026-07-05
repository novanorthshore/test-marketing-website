const crypto = require("crypto");

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const base64UrlEncode = (buffer) => buffer
  .toString("base64")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");

const base64UrlDecode = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
};

const signBody = (body) => {
  const secret = requiredEnv("APP_TOKEN_SECRET");
  return base64UrlEncode(crypto.createHmac("sha256", secret).update(body).digest());
};

const safeEqual = (a, b) => {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufferA, bufferB);
};

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 45;

const signToken = (data, ttlSeconds = DEFAULT_TTL_SECONDS) => {
  const payload = {
    ...data,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const signature = signBody(body);

  return `${body}.${signature}`;
};

const verifyToken = (token) => {
  try {
    const [body, signature] = String(token || "").split(".");

    if (!body || !signature) {
      return { ok: false, error: "malformed" };
    }

    if (!safeEqual(signature, signBody(body))) {
      return { ok: false, error: "bad-signature" };
    }

    const payload = JSON.parse(base64UrlDecode(body).toString("utf8"));

    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return { ok: false, error: "expired" };
    }

    return { ok: true, data: payload };
  } catch (error) {
    return { ok: false, error: "invalid" };
  }
};

module.exports = {
  signToken,
  verifyToken,
};
