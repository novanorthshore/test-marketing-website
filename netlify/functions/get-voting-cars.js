const { listApprovedVotingCars } = require("./lib/applications-sheet");
const {
  VOTING_CATEGORIES,
  VOTING_EVENT_ID,
  VOTING_EVENT_NAME,
  isVotingOpen,
} = require("./lib/vote-config");

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

    return jsonResponse(200, {
      ok: true,
      open: true,
      categories: VOTING_CATEGORIES.map(({ id, label }) => ({ id, label })),
      eventId: VOTING_EVENT_ID,
      eventName: VOTING_EVENT_NAME,
      cars,
    }, "public, max-age=20, s-maxage=60, stale-while-revalidate=120");
  } catch (error) {
    console.error("Unable to load voting cars", error);
    return jsonResponse(500, {
      ok: false,
      error: "Unable to load show cars right now. Please try again.",
    });
  }
};
