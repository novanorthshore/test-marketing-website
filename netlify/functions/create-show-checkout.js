const { BLOCK_PARTY_CONFIG } = require("./lib/event-config");

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  // Advance applications are free. Payment checkout is disabled; walk-ins pay $10 day of.
  return jsonResponse(410, {
    error: "Advance registration is free. If you were approved, your spot is already secured and no online payment is needed. Walk-ins day of the show are $10 at check-in. If you already paid, contact info@novanorthshore.com for a refund.",
    advanceRegistrationFree: true,
    walkInAmountDisplay: BLOCK_PARTY_CONFIG.walkIn.amountDisplay,
  });
};
