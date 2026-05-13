const { EVENT_CONFIG } = require("./lib/event-config");
const { getConfirmedRsvpCount } = require("./lib/google-sheets");

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

  try {
    const bookedCount = await getConfirmedRsvpCount(EVENT_CONFIG.name);
    const remainingCount = Math.max(EVENT_CONFIG.maxCapacity - bookedCount, 0);

    return jsonResponse(200, {
      eventId: EVENT_CONFIG.id,
      eventName: EVENT_CONFIG.name,
      bookedCount,
      maxCapacity: EVENT_CONFIG.maxCapacity,
      remainingCount,
      soldOut: remainingCount <= 0,
    });
  } catch (error) {
    console.error("Unable to get RSVP availability", error);
    return jsonResponse(500, {
      error: "Availability could not be loaded. Please try again.",
    });
  }
};
