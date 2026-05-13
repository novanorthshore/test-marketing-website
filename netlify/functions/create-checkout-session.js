const stripeFactory = require("stripe");
const { EVENT_CONFIG, getRsvpOption } = require("./lib/event-config");
const { getConfirmedRsvpCount } = require("./lib/google-sheets");
const { metadataFromRsvp, validatePaidRsvp } = require("./lib/validate-rsvp");

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

  const validation = validatePaidRsvp(payload);
  if (!validation.ok) {
    return jsonResponse(400, {
      error: "Please fix the highlighted RSVP fields.",
      fields: validation.errors,
    });
  }

  try {
    const bookedCount = await getConfirmedRsvpCount(EVENT_CONFIG.name);
    if (bookedCount >= EVENT_CONFIG.maxCapacity) {
      return jsonResponse(409, {
        error: "This event is sold out. No new paid RSVPs are being accepted.",
        soldOut: true,
        bookedCount,
        maxCapacity: EVENT_CONFIG.maxCapacity,
        remainingCount: 0,
      });
    }

    const stripe = stripeFactory(requiredEnv("STRIPE_SECRET_KEY"));
    const option = getRsvpOption(validation.data.rsvpType);
    const priceId = requiredEnv(option.priceEnv);
    const siteUrl = requiredEnv("SITE_URL").replace(/\/$/, "");
    const metadata = metadataFromRsvp(validation.data);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: validation.data.email,
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
    console.error("Unable to create Stripe Checkout Session", error);
    return jsonResponse(500, {
      error: "Checkout could not be started. Please try again or contact Nova North Shore.",
    });
  }
};
