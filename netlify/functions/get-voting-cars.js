const { listApprovedVotingCars } = require("./lib/applications-sheet");
const {
  VOTING_CATEGORIES,
  VOTING_EVENT_ID,
  VOTING_EVENT_NAME,
  isVotingOpen,
} = require("./lib/vote-config");

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
    if (!isVotingOpen()) {
      return jsonResponse(403, {
        ok: false,
        open: false,
        error: "Voting is closed right now.",
        categories: VOTING_CATEGORIES,
        eventId: VOTING_EVENT_ID,
        eventName: VOTING_EVENT_NAME,
        cars: [],
      });
    }

    const cars = await listApprovedVotingCars();

    return jsonResponse(200, {
      ok: true,
      open: true,
      categories: VOTING_CATEGORIES,
      eventId: VOTING_EVENT_ID,
      eventName: VOTING_EVENT_NAME,
      cars,
    });
  } catch (error) {
    console.error("Unable to load voting cars", error);
    return jsonResponse(500, {
      ok: false,
      error: "Unable to load show cars right now. Please try again.",
    });
  }
};
