const { EVENT_CONFIG, getRsvpOption } = require("./event-config");

const MAX_FIELD_LENGTH = 120;

const cleanText = (value, maxLength = MAX_FIELD_LENGTH) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
};

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const validateVehicleYear = (value) => {
  if (!/^\d{4}$/.test(value)) {
    return false;
  }

  const year = Number(value);
  return year >= 1886 && year <= 2100;
};

const validatePaidRsvp = (payload = {}) => {
  const data = {
    name: cleanText(payload.name),
    email: cleanText(payload.email, 180).toLowerCase(),
    vehicleYear: cleanText(payload.vehicleYear, 4),
    vehicleMake: cleanText(payload.vehicleMake),
    vehicleModel: cleanText(payload.vehicleModel),
    licensePlate: cleanText(payload.licensePlate, 24).toUpperCase(),
    instagram: cleanText(payload.instagram || "", 80),
    rsvpType: cleanText(payload.rsvpType, 40),
    noRefundAccepted: payload.noRefundAccepted === true || payload.noRefundAccepted === "true",
  };

  const errors = {};

  if (!data.name) {
    errors.name = "Name is required.";
  }

  if (!data.email || !isValidEmail(data.email)) {
    errors.email = "A valid email is required.";
  }

  if (!data.vehicleYear || !validateVehicleYear(data.vehicleYear)) {
    errors.vehicleYear = "Vehicle year is required.";
  }

  if (!data.vehicleMake) {
    errors.vehicleMake = "Vehicle make is required.";
  }

  if (!data.vehicleModel) {
    errors.vehicleModel = "Vehicle model is required.";
  }

  if (!data.licensePlate) {
    errors.licensePlate = "License plate is required.";
  }

  if (!getRsvpOption(data.rsvpType)) {
    errors.rsvpType = "Select a valid RSVP type.";
  }

  if (!data.noRefundAccepted) {
    errors.noRefundAccepted = "You must accept the no-refund policy before continuing.";
  }

  return {
    ok: Object.keys(errors).length === 0,
    data,
    errors,
  };
};

const metadataFromRsvp = (data) => ({
  eventId: EVENT_CONFIG.id,
  eventName: EVENT_CONFIG.name,
  name: data.name,
  email: data.email,
  vehicleYear: data.vehicleYear,
  vehicleMake: data.vehicleMake,
  vehicleModel: data.vehicleModel,
  licensePlate: data.licensePlate,
  instagram: data.instagram || "",
  rsvpType: data.rsvpType,
  noRefundAccepted: String(data.noRefundAccepted),
});

const rsvpFromMetadata = (metadata = {}) => validatePaidRsvp({
  name: metadata.name,
  email: metadata.email,
  vehicleYear: metadata.vehicleYear,
  vehicleMake: metadata.vehicleMake,
  vehicleModel: metadata.vehicleModel,
  licensePlate: metadata.licensePlate,
  instagram: metadata.instagram || "",
  rsvpType: metadata.rsvpType,
  noRefundAccepted: metadata.noRefundAccepted,
});

module.exports = {
  metadataFromRsvp,
  rsvpFromMetadata,
  validatePaidRsvp,
};
