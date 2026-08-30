const { listPublishedMarketplaceListings } = require("./lib/applications-sheet");

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
    return jsonResponse(200, { ok: true, listings: await listPublishedMarketplaceListings() }, "public, max-age=60, s-maxage=60");
  } catch (error) {
    console.error("Unable to load Marketplace listings", error.message);
    return jsonResponse(500, { ok: false, error: "Marketplace listings are unavailable right now." });
  }
};
