const { isVotingOpen } = require("./lib/vote-config");
const {
  getRedisBallots,
  isVotingRedisConfigured,
} = require("./lib/voting-redis");
const { syncRedisBallotsToSheet } = require("./lib/voting-sheet");

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
    return jsonResponse(405, { error: "Method not allowed. Use POST." });
  }

  if (isVotingOpen()) {
    return jsonResponse(409, {
      error: "Close voting before running the final Results sync.",
    });
  }

  if (!isVotingRedisConfigured()) {
    return jsonResponse(503, {
      error: "Redis voting storage is not configured.",
    });
  }

  try {
    const ballots = await getRedisBallots();
    const results = await syncRedisBallotsToSheet(ballots);
    console.log("Final Redis-to-Sheets vote sync complete", results);

    return jsonResponse(200, {
      ok: true,
      ...results,
      message: "All Redis ballots are present in Google Sheets. Results are final.",
    });
  } catch (error) {
    console.error("Final Redis-to-Sheets vote sync failed", {
      message: error.message,
      code: error.code,
    });
    return jsonResponse(500, {
      error: "Unable to complete the final vote sync. Try again.",
    });
  }
};
