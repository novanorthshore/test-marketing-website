const EVENT_CONFIG = {
  id: "cypress-event-2026",
  name: "Nova Cypress Event",
  maxCapacity: 120,
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

// Block Party Car Show pricing:
// Advance applications (through this form) are free once approved.
// Walk-ins on event day are $10 cash/card at check-in.
const BLOCK_PARTY_CONFIG = {
  id: "block-party-2026",
  name: "Nova North Shore Block Party Car Show",
  maxCapacity: 150,
  dateDisplay: "Sunday, July 19, 2026",
  location: "Lloyd Avenue & West 14th Street, North Vancouver BC (3rd St W to 15th St W)",
  showHours: "3:00 PM to 7:00 PM",
  checkIn: "2:00 PM (please arrive by 2:30 PM at the latest)",
  advanceRegistration: {
    amountCents: 0,
    amountDisplay: "Free",
    label: "Advance application (approved show cars)",
  },
  walkIn: {
    amountCents: 1000,
    amountDisplay: "$10.00 CAD",
    label: "Walk-in day of show",
  },
  // Kept for legacy Stripe payment tooling / receipts for anyone who paid before the fee drop.
  price: {
    label: "Block Party Car Show Registration",
    priceEnv: "SHOW_STRIPE_PRICE_ID",
    amountCents: 0,
    amountDisplay: "Free",
  },
};

module.exports = {
  EVENT_CONFIG,
  BLOCK_PARTY_CONFIG,
  getRsvpOption,
};
