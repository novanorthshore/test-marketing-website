const { VOTING_CATEGORIES } = require("./lib/vote-config");
const {
  getCachedVotingCars,
  getRedisTallies,
  isVotingRedisConfigured,
} = require("./lib/voting-redis");

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  if (!isVotingRedisConfigured()) {
    return jsonResponse(503, {
      error: "Redis voting results are not configured.",
    });
  }

  try {
    const [tallies, cars] = await Promise.all([
      getRedisTallies(),
      getCachedVotingCars(),
    ]);
    const carsById = new Map((cars || []).map((car) => [car.applicationId, car]));

    const categories = VOTING_CATEGORIES.map((category) => {
      const prefix = `${category.id}:`;
      const standings = Object.entries(tallies)
        .filter(([field]) => field.startsWith(prefix))
        .map(([field, votes]) => {
          const applicationId = field.slice(prefix.length);
          const car = carsById.get(applicationId);
          return {
            applicationId,
            car: car
              ? `${car.carNumber ? `#${car.carNumber} ` : ""}${car.vehicleLabel}`
              : applicationId,
            votes,
          };
        })
        .sort((left, right) => (
          right.votes - left.votes
          || left.car.localeCompare(right.car)
        ));

      return {
        id: category.id,
        label: category.label,
        leader: standings[0] || null,
        standings,
      };
    });

    return jsonResponse(200, {
      ok: true,
      categories,
    });
  } catch (error) {
    console.error("Unable to load Redis voting results", {
      message: error.message,
    });
    return jsonResponse(500, {
      error: "Unable to load voting results.",
    });
  }
};
