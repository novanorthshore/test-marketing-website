const stripeFactory = require("stripe");
const { FINALE_CONFIG } = require("./lib/event-config");

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const requiredEnv = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  try {
    const option = FINALE_CONFIG.registrationTypes.vipParking;
    const stripe = stripeFactory(requiredEnv("STRIPE_SECRET_KEY"));
    const siteUrl = requiredEnv("SITE_URL").replace(/\/$/, "");
    const configuredPriceId = process.env[option.priceEnv]?.trim();
    const metadata = {
      eventId: FINALE_CONFIG.id,
      eventName: FINALE_CONFIG.name,
      registrationType: option.id,
      directPurchase: "true",
    };
    const lineItems = configuredPriceId
      ? [{ price: configuredPriceId, quantity: 1 }]
      : [{
          price_data: {
            currency: "cad",
            unit_amount: option.amountCents,
            product_data: { name: `${FINALE_CONFIG.name} ${option.label}` },
          },
          quantity: 1,
        }];

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      payment_method_types: ["card"],
      allow_promotion_codes: false,
      automatic_tax: { enabled: false },
      custom_fields: [
        {
          key: "vehicle",
          label: { type: "custom", custom: "Vehicle year, make, and model" },
          type: "text",
          optional: false,
          text: { maximum_length: 100 },
        },
        {
          key: "license_plate",
          label: { type: "custom", custom: "License plate" },
          type: "text",
          optional: false,
          text: { maximum_length: 20 },
        },
      ],
      success_url: `${siteUrl}/payment-success.html?type=vipParking&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/finale-submissions.html#apply`,
      metadata,
      payment_intent_data: { metadata },
    });

    return jsonResponse(200, { url: session.url });
  } catch (error) {
    console.error("Unable to create VIP Parking checkout", error.message);
    return jsonResponse(500, { error: "VIP Parking checkout could not be started. Please try again." });
  }
};
