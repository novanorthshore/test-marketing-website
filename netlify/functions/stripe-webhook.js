const stripeFactory = require("stripe");
const { EVENT_CONFIG, BLOCK_PARTY_CONFIG, FINALE_CONFIG, getRsvpOption } = require("./lib/event-config");
const { rsvpFromMetadata } = require("./lib/validate-rsvp");
const { appendConfirmedRsvp, getSessionRow, markSessionNotes } = require("./lib/google-sheets");
const {
  markPaymentStatus, getApplicationById, syncApplicationRowColor,
  preparePaymentConfirmation, markPaymentConfirmationSent,
} = require("./lib/applications-sheet");
const { buildPaymentConfirmationPayload, sendPaymentConfirmationEmail, sendVipParkingConfirmationEmail } = require("./lib/email");

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

const getRawBody = (event) => {
  if (event.isBase64Encoded) {
    return Buffer.from(event.body || "", "base64");
  }

  return event.body || "";
};

const formatAmount = (amountTotal, currency) => {
  const amount = Number(amountTotal || 0) / 100;
  return `${amount.toFixed(2)} ${String(currency || "cad").toUpperCase()}`;
};

const buildSheetRow = ({ session, rsvp, option, amountPaid }) => [
  new Date().toISOString(),
  session.payment_status || "paid",
  session.id,
  typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || "",
  option.label,
  amountPaid,
  rsvp.name,
  rsvp.email,
  rsvp.vehicleYear,
  rsvp.vehicleMake,
  rsvp.vehicleModel,
  rsvp.licensePlate,
  rsvp.instagram || "",
  option.photographyPackage,
  EVENT_CONFIG.name,
  "Not checked in",
  "Confirmed by Stripe webhook",
];

const verifySessionPayment = async ({ stripe, session }) => {
  const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ["line_items.data.price", "payment_intent"],
  });

  if (expandedSession.payment_status !== "paid") {
    throw new Error(`Checkout Session ${session.id} is not paid.`);
  }

  if (expandedSession.metadata?.eventId !== EVENT_CONFIG.id) {
    throw new Error(`Checkout Session ${session.id} is not for ${EVENT_CONFIG.id}.`);
  }

  const validation = rsvpFromMetadata(expandedSession.metadata);
  if (!validation.ok) {
    throw new Error(`Checkout Session ${session.id} has invalid RSVP metadata.`);
  }

  const option = getRsvpOption(validation.data.rsvpType);
  const expectedPriceId = requiredEnv(option.priceEnv);
  const lineItem = expandedSession.line_items?.data?.[0];

  if (!lineItem || lineItem.price?.id !== expectedPriceId) {
    throw new Error(`Checkout Session ${session.id} has an unexpected price.`);
  }

  if (expandedSession.amount_total !== option.amountCents || expandedSession.currency !== "cad") {
    throw new Error(`Checkout Session ${session.id} has an unexpected amount or currency.`);
  }

  return {
    session: expandedSession,
    rsvp: validation.data,
    option,
    amountPaid: formatAmount(expandedSession.amount_total, expandedSession.currency),
  };
};

const handleShowCheckoutCompleted = async ({ stripe, session }) => {
  const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ["payment_intent"],
  });

  if (expandedSession.payment_status !== "paid") {
    throw new Error(`Checkout Session ${session.id} is not paid.`);
  }

  const applicationId = expandedSession.metadata?.applicationId;
  if (!applicationId) {
    throw new Error(`Checkout Session ${session.id} is missing an application ID.`);
  }

  const application = await getApplicationById(applicationId);
  if (!application) {
    throw new Error(`Application ${applicationId} was not found.`);
  }

  if (application.stripeSessionId && application.stripeSessionId !== expandedSession.id) {
    throw new Error(`Application ${applicationId} is linked to another Stripe session.`);
  }

  if (application.paymentStatus.toLowerCase() !== "paid" || !application.stripeSessionId) {
    const marked = await markPaymentStatus(applicationId, "Paid", expandedSession.id);
    if (!marked) throw new Error(`Application ${applicationId} disappeared before payment was recorded.`);
  }

  const updatedApplication = {
    ...application,
    paymentStatus: "Paid",
    stripeSessionId: expandedSession.id,
  };

  const amountPaid = formatAmount(expandedSession.amount_total, expandedSession.currency);
  const payload = buildPaymentConfirmationPayload({
    application: updatedApplication,
    sessionId: expandedSession.id,
    amountPaid,
  });
  const receipt = await preparePaymentConfirmation(applicationId, expandedSession.id, payload);
  if (!receipt.sent) {
    await sendPaymentConfirmationEmail({ payload: receipt.payload, sessionId: expandedSession.id });
    await markPaymentConfirmationSent(applicationId, expandedSession.id);
  }

  try {
    await syncApplicationRowColor(updatedApplication);
  } catch (error) {
    console.warn("Payment recorded; application color update failed", { applicationId, message: error.message });
  }
};

const getCustomFieldValue = (session, key) => (
  session.custom_fields?.find((field) => field.key === key)?.text?.value || ""
);

const handleDirectVipParkingCompleted = async ({ stripe, session }) => {
  const expandedSession = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ["line_items.data.price", "payment_intent"],
  });
  const option = FINALE_CONFIG.registrationTypes.vipParking;

  if (expandedSession.payment_status !== "paid") {
    throw new Error(`Checkout Session ${session.id} is not paid.`);
  }
  if (expandedSession.metadata?.registrationType !== option.id || expandedSession.metadata?.directPurchase !== "true") {
    throw new Error(`Checkout Session ${session.id} is not a direct VIP Parking purchase.`);
  }

  const lineItem = expandedSession.line_items?.data?.[0];
  const configuredPriceId = process.env[option.priceEnv]?.trim();
  if (configuredPriceId && lineItem?.price?.id !== configuredPriceId) {
    throw new Error(`Checkout Session ${session.id} has an unexpected VIP Parking price.`);
  }
  if (expandedSession.amount_total !== option.amountCents || expandedSession.currency !== "cad") {
    throw new Error(`Checkout Session ${session.id} has an unexpected VIP Parking amount or currency.`);
  }

  const existingRow = await getSessionRow(expandedSession.id);
  if ((existingRow?.layout?.notes || "").includes("Processed direct VIP Parking webhook")) return;

  const email = expandedSession.customer_details?.email || expandedSession.customer_email || "";
  const name = expandedSession.customer_details?.name || "VIP Parking guest";
  const vehicle = getCustomFieldValue(expandedSession, "vehicle");
  const licensePlate = getCustomFieldValue(expandedSession, "license_plate").toUpperCase();
  const amountPaid = formatAmount(expandedSession.amount_total, expandedSession.currency);
  const paymentIntentId = typeof expandedSession.payment_intent === "string"
    ? expandedSession.payment_intent
    : expandedSession.payment_intent?.id || "";

  if (!existingRow) {
    await appendConfirmedRsvp([
      new Date().toISOString(),
      expandedSession.payment_status,
      expandedSession.id,
      paymentIntentId,
      option.label,
      amountPaid,
      name,
      email,
      "",
      "",
      vehicle,
      licensePlate,
      "",
      "No",
      FINALE_CONFIG.name,
      "Not checked in",
      "Direct VIP Parking purchase",
    ]);
  }

  if (email) {
    await sendVipParkingConfirmationEmail({ email, name, vehicle, licensePlate, sessionId: expandedSession.id, amountPaid });
  }
  await markSessionNotes(expandedSession.id, `Processed direct VIP Parking webhook: ${new Date().toISOString()}`);
};

const handleCheckoutSessionCompleted = async ({ stripe, session }) => {
  if (session.metadata?.eventId === FINALE_CONFIG.id && session.metadata?.directPurchase === "true") {
    await handleDirectVipParkingCompleted({ stripe, session });
    return;
  }

  if (
    session.metadata?.eventId === FINALE_CONFIG.id ||
    session.metadata?.eventId === BLOCK_PARTY_CONFIG.id
  ) {
    await handleShowCheckoutCompleted({ stripe, session });
    return;
  }

  const verified = await verifySessionPayment({ stripe, session });
  const existingRow = await getSessionRow(verified.session.id);

  if (!existingRow) {
    await appendConfirmedRsvp(buildSheetRow(verified));
  } else if ((existingRow.layout?.notes || "").includes("Processed webhook")) {
    return;
  }

  await markSessionNotes(verified.session.id, `Processed webhook: ${new Date().toISOString()}`);
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const stripe = stripeFactory(requiredEnv("STRIPE_SECRET_KEY"));
  const signature = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      getRawBody(event),
      signature,
      requiredEnv("STRIPE_WEBHOOK_SECRET")
    );
  } catch (error) {
    console.error("Stripe webhook signature verification failed", error.message);
    return jsonResponse(400, { error: "Invalid webhook signature." });
  }

  try {
    if (stripeEvent.type === "checkout.session.completed") {
      await handleCheckoutSessionCompleted({
        stripe,
        session: stripeEvent.data.object,
      });
    }

    return jsonResponse(200, { received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", {
      eventId: stripeEvent.id,
      eventType: stripeEvent.type,
      message: error.message,
    });

    return jsonResponse(500, { error: "Webhook processing failed." });
  }
};
