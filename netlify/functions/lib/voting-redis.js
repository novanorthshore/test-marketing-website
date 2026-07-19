const { BLOCK_PARTY_CONFIG } = require("./event-config");

const REDIS_RETRIES = 4;
const CAR_CACHE_SECONDS = 6 * 60 * 60;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getRedisConfig = () => {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/$/, "");
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  return { url, token };
};

const isVotingRedisConfigured = () => {
  const { url, token } = getRedisConfig();
  return Boolean(url && token);
};

const redisCommand = async (command) => {
  const { url, token } = getRedisConfig();
  if (!url || !token) {
    throw new Error("Voting Redis is not configured.");
  }

  let lastError;
  for (let attempt = 1; attempt <= REDIS_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(command),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.error) {
        const error = new Error(payload?.error || `Redis request failed (${response.status}).`);
        error.status = response.status;
        throw error;
      }
      return payload?.result;
    } catch (error) {
      lastError = error;
      const retryable = error.status === 429
        || error.status >= 500
        || /fetch failed|timed out|timeout|rate limit/i.test(String(error.message || ""));
      if (!retryable || attempt === REDIS_RETRIES) {
        throw error;
      }
      await sleep((200 * (2 ** (attempt - 1))) + Math.floor(Math.random() * 100));
    }
  }

  throw lastError;
};

const eventTag = () => `{${BLOCK_PARTY_CONFIG.id}}`;
const key = (suffix) => `nova:voting:${eventTag()}:${suffix}`;
const identityKey = (identityHash) => key(`identity:${identityHash}`);
const deviceKey = (deviceHash) => key(`device:${deviceHash}`);
const ballotKey = (ballotId) => key(`ballot:${ballotId}`);
const talliesKey = () => key("tallies");
const ballotIdsKey = () => key("ballot-ids");
const carsKey = () => key("cars");
const fingerprintKey = (fingerprintHash) => key(`fingerprint:${fingerprintHash}`);
const networkKey = (networkHash) => key(`network:${networkHash}`);

const hasRedisIdentityVoted = async ({
  identityHash,
  deviceHash = "",
}) => {
  if (!isVotingRedisConfigured()) {
    return false;
  }

  const keys = [identityKey(identityHash)];
  if (deviceHash) {
    keys.push(deviceKey(deviceHash));
  }
  const result = await redisCommand(["MGET", ...keys]);
  return Array.isArray(result) && result.some(Boolean);
};

const RECORD_BALLOT_SCRIPT = `
  local existingIdentity = redis.call("GET", KEYS[1])
  if existingIdentity == ARGV[1] then
    return {"OK", ARGV[1]}
  end
  if existingIdentity ~= false then
    return {"ALREADY_VOTED", "identity"}
  end
  if ARGV[3] == "1" then
    local existingDevice = redis.call("GET", KEYS[2])
    if existingDevice == ARGV[1] then
      return {"OK", ARGV[1]}
    end
    if existingDevice ~= false then
      return {"ALREADY_VOTED", "device"}
    end
  end

  local riskScore = 0
  local reasons = {}
  if ARGV[5] == "1" then
    if redis.call("SCARD", KEYS[6]) > 0 and redis.call("SISMEMBER", KEYS[6], ARGV[4]) == 0 then
      riskScore = riskScore + 3
      table.insert(reasons, "same fingerprint")
    end
    redis.call("SADD", KEYS[6], ARGV[4])
  end
  if ARGV[6] == "1" then
    if redis.call("SCARD", KEYS[7]) > 0 and redis.call("SISMEMBER", KEYS[7], ARGV[4]) == 0 then
      riskScore = riskScore + 1
      table.insert(reasons, "same network + browser")
    end
    redis.call("SADD", KEYS[7], ARGV[4])
    redis.call("EXPIRE", KEYS[7], 21600)
  end

  local possibleDuplicate = riskScore >= 3
  local reasonText = table.concat(reasons, ", ")
  local ballot = cjson.decode(ARGV[2])
  ballot.possibleDuplicate = possibleDuplicate
  ballot.riskScore = riskScore
  ballot.riskReasons = reasonText

  redis.call("SET", KEYS[1], ARGV[1])
  if ARGV[3] == "1" then
    redis.call("SET", KEYS[2], ARGV[1])
  end
  redis.call("SET", KEYS[3], cjson.encode(ballot))
  redis.call("SADD", KEYS[5], ARGV[1])

  local i = 7
  while i <= #ARGV do
    redis.call("HINCRBY", KEYS[4], ARGV[i], 1)
    i = i + 1
  end

  return {"OK", ARGV[1], tostring(riskScore), reasonText, possibleDuplicate and "1" or "0"}
`;

const recordRedisBallot = async ({
  ballotId,
  identityHash,
  deviceHash = "",
  fingerprintHash = "",
  networkHash = "",
  ballot,
  selections,
}) => {
  const tallyFields = Object.entries(selections).map(
    ([categoryId, applicationId]) => `${categoryId}:${applicationId}`
  );
  const placeholderDeviceKey = deviceHash
    ? deviceKey(deviceHash)
    : key(`device-unused:${ballotId}`);
  const keys = [
    identityKey(identityHash),
    placeholderDeviceKey,
    ballotKey(ballotId),
    talliesKey(),
    ballotIdsKey(),
    fingerprintHash ? fingerprintKey(fingerprintHash) : key(`fingerprint-unused:${ballotId}`),
    networkHash ? networkKey(networkHash) : key(`network-unused:${ballotId}`),
  ];
  const args = [
    ballotId,
    JSON.stringify(ballot),
    deviceHash ? "1" : "0",
    identityHash,
    fingerprintHash ? "1" : "0",
    networkHash ? "1" : "0",
    ...tallyFields,
  ];
  const result = await redisCommand([
    "EVAL",
    RECORD_BALLOT_SCRIPT,
    String(keys.length),
    ...keys,
    ...args,
  ]);

  if (Array.isArray(result) && result[0] === "ALREADY_VOTED") {
    const error = new Error("This voter has already voted.");
    error.code = "ALREADY_VOTED";
    error.reason = result[1] || "identity";
    throw error;
  }
  if (!Array.isArray(result) || result[0] !== "OK") {
    throw new Error("Redis did not confirm the ballot.");
  }

  return {
    ballotId,
    riskScore: Number(result[2] || 0),
    riskReasons: String(result[3] || ""),
    possibleDuplicate: result[4] === "1",
  };
};

const cacheVotingCars = async (cars) => {
  if (!isVotingRedisConfigured()) {
    return false;
  }
  await redisCommand([
    "SET",
    carsKey(),
    JSON.stringify(cars),
    "EX",
    String(CAR_CACHE_SECONDS),
  ]);
  return true;
};

const getCachedVotingCars = async () => {
  if (!isVotingRedisConfigured()) {
    return null;
  }
  const value = await redisCommand(["GET", carsKey()]);
  if (!value) {
    return null;
  }
  try {
    const cars = JSON.parse(value);
    return Array.isArray(cars) ? cars : null;
  } catch (error) {
    return null;
  }
};

const getRedisTallies = async () => {
  if (!isVotingRedisConfigured()) {
    return {};
  }
  const result = await redisCommand(["HGETALL", talliesKey()]);
  if (!Array.isArray(result)) {
    return {};
  }

  const tallies = {};
  for (let index = 0; index < result.length; index += 2) {
    tallies[result[index]] = Number(result[index + 1] || 0);
  }
  return tallies;
};

const getRedisBallots = async () => {
  if (!isVotingRedisConfigured()) {
    return [];
  }

  const ballotIds = await redisCommand(["SMEMBERS", ballotIdsKey()]);
  if (!Array.isArray(ballotIds) || !ballotIds.length) {
    return [];
  }

  const values = await redisCommand([
    "MGET",
    ...ballotIds.map((ballotId) => ballotKey(ballotId)),
  ]);
  if (!Array.isArray(values)) {
    return [];
  }

  return values.flatMap((value) => {
    if (!value) {
      return [];
    }
    try {
      return [JSON.parse(value)];
    } catch (error) {
      console.error("Skipping malformed Redis ballot during sync");
      return [];
    }
  });
};

module.exports = {
  cacheVotingCars,
  getCachedVotingCars,
  getRedisBallots,
  getRedisTallies,
  hasRedisIdentityVoted,
  isVotingRedisConfigured,
  recordRedisBallot,
  redisCommand,
};
