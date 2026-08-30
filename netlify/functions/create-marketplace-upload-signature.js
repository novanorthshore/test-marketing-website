const { createMarketplaceUploadSignature } = require("./lib/cloudinary");

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    return jsonResponse(200, { ok: true, ...createMarketplaceUploadSignature({ slot: payload.slot }) });
  } catch (error) {
    console.error("Unable to create Marketplace upload signature", error.message);
    return jsonResponse(400, { ok: false, error: "Unable to prepare this photo upload." });
  }
};
