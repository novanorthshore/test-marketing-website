const EVENT_CONFIG = {
  id: "cypress-event-2026",
  name: "Nova Cypress Event",
  priceOptions: {
    standard: {
      label: "Standard RSVP",
      priceEnv: "STRIPE_STANDARD_PRICE_ID",
      amountCents: 1000,
      amountDisplay: "$10.00 CAD",
      photographyPackage: "No",
    },
    photography: {
      label: "RSVP with professional photography",
      priceEnv: "STRIPE_PHOTOGRAPHY_PRICE_ID",
      amountCents: 3000,
      amountDisplay: "$30.00 CAD",
      photographyPackage: "Yes",
    },
  },
};

const getRsvpOption = (rsvpType) => EVENT_CONFIG.priceOptions[rsvpType] || null;

module.exports = {
  EVENT_CONFIG,
  getRsvpOption,
};
