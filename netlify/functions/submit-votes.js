const { randomUUID } = require("crypto");
const { listApprovedVotingCars } = require("./lib/applications-sheet");
const {
  VOTING_CATEGORIES,
  getVotingCategoryIds,
  isVotingOpen,
} = require("./lib/vote-config");
const { appendBallot } = require("./lib/voting-sheet");
const {
  normalizePhoneE164,
  checkVoteVerificationCode,
} = require("./lib/twilio-verify");

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

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
  const code = String(payload.code || "").trim();
  const selections = payload.selections && typeof payload.selections === "object"
    ? payload.selections
    : null;

  if (!phoneE164) {
    return jsonResponse(400, {
      error: "Enter a valid mobile phone number with area code.",
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
    const verification = await checkVoteVerificationCode(phoneE164, code);
    if (!verification.valid) {
      return jsonResponse(400, {
        error: "That verification code is invalid or expired. Request a new code and try again.",
      });
    }

    const cars = await listApprovedVotingCars();
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

    await appendBallot({
      ballotId,
      phoneE164,
      selections: normalizedSelections,
      carLabelsById,
      userAgent: event.headers["user-agent"] || "",
    });

    return jsonResponse(200, {
      ok: true,
      ballotId,
      message: "Your votes have been submitted. Thank you!",
    });
  } catch (error) {
    if (error.code === "ALREADY_VOTED") {
      return jsonResponse(409, {
        error: "This phone number has already voted.",
        alreadyVoted: true,
      });
    }

    console.error("Unable to submit votes", {
      message: error.message,
      code: error.code,
    });

    return jsonResponse(500, {
      error: "Unable to submit your votes right now. Please try again.",
    });
  }
};
