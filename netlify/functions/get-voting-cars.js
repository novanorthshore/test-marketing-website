const { listApprovedVotingCars } = require("./lib/applications-sheet");
const {
  VOTING_CATEGORIES,
  VOTING_EVENT_ID,
  VOTING_EVENT_NAME,
  getVotingVerificationMode,
  isVotingOpen,
} = require("./lib/vote-config");
const {
  cacheVotingCars,
  isVotingRedisConfigured,
} = require("./lib/voting-redis");

const jsonResponse = (statusCode, body, cacheControl = "no-store") => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": cacheControl,
  },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  try {
    if (!isVotingOpen()) {
      return jsonResponse(403, {
        ok: false,
        open: false,
        error: "Voting is closed right now.",
        categories: VOTING_CATEGORIES.map(({ id, label }) => ({ id, label })),
        eventId: VOTING_EVENT_ID,
        eventName: VOTING_EVENT_NAME,
        verificationMode: getVotingVerificationMode(),
        cars: [],
      });
    }

    const cars = (await listApprovedVotingCars()).map((car) => ({
      applicationId: car.applicationId,
      carNumber: car.carNumber,
      vehicleLabel: car.vehicleLabel,
      vehicleYear: car.vehicleYear,
      vehicleMake: car.vehicleMake,
      vehicleModel: car.vehicleModel,
      licensePlate: car.licensePlate,
      instagram: car.instagram,
      photoUrl: car.photoUrl,
      eligibleCategoryIds: car.eligibleCategoryIds || [],
    }));

    if (isVotingRedisConfigured()) {
      try {
        await cacheVotingCars(cars);
      } catch (error) {
        console.error("Unable to refresh Redis voting car cache", {
          message: error.message,
        });
      }
    }

    return jsonResponse(200, {
      ok: true,
      open: true,
      categories: VOTING_CATEGORIES.map(({ id, label }) => ({ id, label })),
      eventId: VOTING_EVENT_ID,
      eventName: VOTING_EVENT_NAME,
      verificationMode: getVotingVerificationMode(),
      cars,
    }, "public, max-age=5, s-maxage=5");
  } catch (error) {
    console.error("Unable to load voting cars", error);
    return jsonResponse(500, {
      ok: false,
      error: "Unable to load show cars right now. Please try again.",
    });
  }
};
