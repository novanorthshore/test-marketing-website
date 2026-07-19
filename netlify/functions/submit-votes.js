const { randomUUID } = require("crypto");
const { listApprovedVotingCars } = require("./lib/applications-sheet");
const {
  VOTING_CATEGORIES,
  getVotingVerificationMode,
  getVotingCategoryIds,
  isVotingOpen,
} = require("./lib/vote-config");
const {
  appendBallot,
  hasEmailOrDeviceVoted,
  hasPhoneVoted,
  hashPhone,
  isRetryableSheetsError,
  mirrorBallotToSheet,
} = require("./lib/voting-sheet");
const {
  normalizePhoneE164,
  checkVoteVerificationCode,
} = require("./lib/twilio-verify");
const {
  hashDevice,
  hashEmail,
  isValidDeviceId,
  isValidEmail,
  normalizeDeviceId,
  normalizeEmail,
  verifyEmailOtpChallenge,
} = require("./lib/email-otp");
const {
  cacheVotingCars,
  getCachedVotingCars,
  hasRedisIdentityVoted,
  isVotingRedisConfigured,
  recordRedisBallot,
} = require("./lib/voting-redis");
const { buildRiskHashes } = require("./lib/voting-risk");

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const withTimeout = (promise, milliseconds, message) => (
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  })
);

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
  const phoneE164 = verificationMode === "twilio"
    ? normalizePhoneE164(payload.phone)
    : "";
  const email = verificationMode === "email"
    ? normalizeEmail(payload.email)
    : "";
  const deviceId = verificationMode === "email"
    ? normalizeDeviceId(payload.deviceId)
    : "";
  const code = String(payload.code || "").trim();
  const selections = payload.selections && typeof payload.selections === "object"
    ? payload.selections
    : null;

  if (verificationMode === "twilio" && !phoneE164) {
    return jsonResponse(400, {
      error: "Enter a valid mobile phone number with area code.",
    });
  }

  if (verificationMode === "email" && !isValidEmail(email)) {
    return jsonResponse(400, { error: "Enter a valid email address." });
  }

  if (verificationMode === "email" && !isValidDeviceId(deviceId)) {
    return jsonResponse(400, {
      error: "Unable to identify this browser. Refresh and try again.",
    });
  }

  if (!/^\d{4,8}$/.test(code)) {
    return jsonResponse(400, {
      error: "Enter the verification code from your text message.",
    });
  }

  if (!selections) {
    return jsonResponse(400, {
      error: "Pick one car in each category before submitting.",
    });
  }

  const categoryIds = getVotingCategoryIds();
  for (const categoryId of categoryIds) {
    if (!String(selections[categoryId] || "").trim()) {
      return jsonResponse(400, {
        error: "Pick one car in each category before submitting.",
      });
    }
  }

  try {
    let emailHash = "";
    let deviceHash = "";

    if (verificationMode === "email") {
      emailHash = hashEmail(email);
      deviceHash = hashDevice(deviceId);

      const alreadyVoted = isVotingRedisConfigured()
        ? await hasRedisIdentityVoted({ identityHash: emailHash, deviceHash })
        : await hasEmailOrDeviceVoted({ emailHash, deviceHash });
      if (alreadyVoted) {
        return jsonResponse(409, {
          error: "This email or device has already voted.",
          alreadyVoted: true,
        });
      }

      const verification = verifyEmailOtpChallenge({
        challenge: payload.challenge,
        code,
        email,
        deviceId,
      });
      if (!verification.valid) {
        const expired = verification.reason === "expired";
        return jsonResponse(400, {
          error: expired
            ? "That code has expired. Request a new code and try again."
            : "That verification code is invalid. Check the email and try again.",
        });
      }
    } else {
      // Reject already-voted phones before burning a Twilio Verify check when possible.
      const phoneHash = hashPhone(phoneE164);
      const alreadyVoted = isVotingRedisConfigured()
        ? await hasRedisIdentityVoted({ identityHash: phoneHash })
        : await hasPhoneVoted(phoneE164);
      if (alreadyVoted) {
        return jsonResponse(409, {
          error: "This phone number has already voted.",
          alreadyVoted: true,
        });
      }

      const verification = await checkVoteVerificationCode(phoneE164, code);
      if (!verification.valid) {
        return jsonResponse(400, {
          error: "That verification code is invalid or expired. Request a new code and try again.",
        });
      }
    }

    let cars = isVotingRedisConfigured()
      ? await getCachedVotingCars()
      : null;
    if (!cars) {
      cars = await listApprovedVotingCars();
      if (isVotingRedisConfigured()) {
        await cacheVotingCars(cars);
      }
    }
    const carsById = new Map(cars.map((car) => [car.applicationId, car]));
    const carLabelsById = {};

    for (const category of VOTING_CATEGORIES) {
      const applicationId = String(selections[category.id] || "").trim();
      const car = carsById.get(applicationId);

      if (!car) {
        return jsonResponse(400, {
          error: "One of your selected cars is no longer available. Refresh and try again.",
        });
      }

      const eligible = Array.isArray(car.eligibleCategoryIds)
        ? car.eligibleCategoryIds
        : [];
      if (!eligible.includes(category.id)) {
        return jsonResponse(400, {
          error: `"${car.vehicleLabel}" is not eligible for ${category.label}. Refresh and try again.`,
        });
      }

      carLabelsById[applicationId] = car.carNumber
        ? `#${car.carNumber} ${car.vehicleLabel}`
        : car.vehicleLabel;
    }

    const ballotId = randomUUID();
    const normalizedSelections = Object.fromEntries(
      VOTING_CATEGORIES.map((category) => [
        category.id,
        String(selections[category.id] || "").trim(),
      ])
    );

    const userAgent = event.headers["user-agent"] || "";
    const { fingerprintHash, networkHash } = buildRiskHashes(
      event,
      payload.deviceSignature
    );
    const ballotInput = {
      ballotId,
      phoneE164,
      emailHash,
      deviceHash,
      verificationMethod: verificationMode,
      selections: normalizedSelections,
      carLabelsById,
      userAgent,
      possibleDuplicate: false,
      riskScore: 0,
      riskReasons: "",
      fingerprintHash,
      networkHash,
    };

    if (isVotingRedisConfigured()) {
      const identityHash = verificationMode === "email"
        ? emailHash
        : hashPhone(phoneE164);
      const redisResult = await recordRedisBallot({
        ballotId,
        identityHash,
        deviceHash,
        fingerprintHash,
        networkHash,
        selections: normalizedSelections,
        ballot: {
          ballotId,
          timestamp: new Date().toISOString(),
          identityHash,
          deviceHash,
          verificationMethod: verificationMode,
          selections: normalizedSelections,
          carLabelsById,
          userAgent: String(userAgent).slice(0, 240),
          fingerprintHash,
          networkHash,
        },
      });
      ballotInput.possibleDuplicate = redisResult.possibleDuplicate;
      ballotInput.riskScore = redisResult.riskScore;
      ballotInput.riskReasons = redisResult.riskReasons;

      // Redis is authoritative. A Sheets quota problem must never reject a vote.
      try {
        await withTimeout(
          mirrorBallotToSheet(ballotInput),
          2500,
          "Sheets mirror timed out after Redis commit."
        );
      } catch (error) {
        console.error("Ballot saved to Redis but Sheets mirror failed", {
          ballotId,
          message: error.message,
        });
      }
    } else {
      await appendBallot(ballotInput);
    }

    return jsonResponse(200, {
      ok: true,
      ballotId,
      message: "Your votes have been submitted. Thank you!",
    });
  } catch (error) {
    if (error.code === "ALREADY_VOTED") {
      return jsonResponse(409, {
        error: verificationMode === "email"
          ? "This email or device has already voted."
          : "This phone number has already voted.",
        alreadyVoted: true,
      });
    }

    console.error("Unable to submit votes", {
      message: error.message,
      code: error.code,
    });

    if (isRetryableSheetsError(error)) {
      return jsonResponse(503, {
        error: "Voting is busy right now. Please wait a moment and submit again.",
        retryable: true,
      });
    }

    return jsonResponse(500, {
      error: "Unable to submit your votes right now. Please try again.",
    });
  }
};
