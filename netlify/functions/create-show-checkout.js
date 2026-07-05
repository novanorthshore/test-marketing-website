const stripeFactory = require("stripe");
const { BLOCK_PARTY_CONFIG } = require("./lib/event-config");
const { getApplicationById } = require("./lib/applications-sheet");
const { verifyToken } = require("./lib/tokens");

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return jsonResponse(400, { error: "Invalid request body." });
  }

  const verification = verifyToken(payload.token);
  if (!verification.ok) {
    return jsonResponse(400, {
      error: "This payment link is invalid or has expired. Please contact Nova North Shore.",
    });
  }

  try {
    const application = await getApplicationById(verification.data.applicationId);

    if (!application) {
      return jsonResponse(404, { error: "We could not find your application." });
    }

    if (application.status.toLowerCase() !== "approved") {
      return jsonResponse(409, { error: "This application is not approved for payment." });
    }

    if (application.paymentStatus.toLowerCase() === "paid") {
      return jsonResponse(409, {
        error: "This registration has already been paid. Check your email for your confirmation.",
        alreadyPaid: true,
      });
    }

    const stripe = stripeFactory(requiredEnv("STRIPE_SECRET_KEY"));
    const priceId = requiredEnv(BLOCK_PARTY_CONFIG.price.priceEnv);
    const siteUrl = requiredEnv("SITE_URL").replace(/\/$/, "");

    const metadata = {
      eventId: BLOCK_PARTY_CONFIG.id,
      eventName: BLOCK_PARTY_CONFIG.name,
      applicationId: application.applicationId,
      name: application.name,
      email: application.email,
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: application.email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      payment_method_types: ["card"],
      allow_promotion_codes: false,
      automatic_tax: {
        enabled: false,
      },
      success_url: `${siteUrl}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/payment-cancelled.html`,
      metadata,
      payment_intent_data: {
        metadata,
      },
    });

    return jsonResponse(200, { url: session.url });
  } catch (error) {
    console.error("Unable to create Block Party checkout session", error);
    return jsonResponse(500, {
      error: "Checkout could not be started. Please try again or contact Nova North Shore.",
    });
  }
};
