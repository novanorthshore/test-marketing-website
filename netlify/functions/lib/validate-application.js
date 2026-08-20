const MAX_FIELD_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 800;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const ALLOWED_PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const REGISTRATION_TYPES = new Set(["showCar", "marketplace", "vipParking"]);
const TRANSMISSION_TYPES = new Set(["manual", "auto"]);
const DRIVETRAIN_TYPES = new Set(["FWD", "RWD", "AWD", "4WD"]);

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

const normalizePhone = (value) => {
  const trimmed = cleanText(value, 24);
  const digits = trimmed.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if (trimmed.startsWith("+") && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  return "";
};

const extensionFromMimeType = (mimeType) => {
  if (mimeType === "image/png") {
    return "png";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return "jpg";
};

const validatePhoto = (payloadPhoto, errors) => {
  if (!payloadPhoto) {
    errors.photo = "Car photo is required.";
    return null;
  }

  const mimeType = cleanText(payloadPhoto.mimeType || "", 40);
  const base64 = typeof payloadPhoto.base64 === "string" ? payloadPhoto.base64.trim() : "";

  if (!mimeType || !ALLOWED_PHOTO_MIME_TYPES.has(mimeType)) {
    errors.photo = "Upload a JPG, PNG, or WebP photo.";
    return null;
  }

  if (!base64) {
    errors.photo = "The selected photo could not be read.";
    return null;
  }

  let buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch (error) {
    errors.photo = "The selected photo could not be read.";
    return null;
  }

  if (!buffer.length) {
    errors.photo = "The selected photo is empty.";
    return null;
  }

  if (buffer.length > MAX_PHOTO_BYTES) {
    errors.photo = "Photo must be 4 MB or smaller.";
    return null;
  }

  return {
    buffer,
    mimeType,
    extension: extensionFromMimeType(mimeType),
  };
};

const validateApplication = (payload = {}) => {
  const registrationType = cleanText(payload.registrationType || "", 24);
  const data = {
    registrationType,
    name: cleanText(payload.name),
    email: cleanText(payload.email, 180).toLowerCase(),
    phone: normalizePhone(payload.phone || ""),
    vehicleYear: cleanText(payload.vehicleYear, 4),
    vehicleMake: cleanText(payload.vehicleMake),
    vehicleModel: cleanText(payload.vehicleModel),
    licensePlate: cleanText(payload.licensePlate, 24).toUpperCase(),
    instagram: cleanText(payload.instagram || "", 80),
    description: cleanText(payload.description || "", MAX_DESCRIPTION_LENGTH),
    askingPrice: cleanText(payload.askingPrice || "", 40),
    mileage: cleanText(payload.mileage || "", 24),
    transmission: cleanText(payload.transmission || "", 16).toLowerCase(),
    drivetrain: cleanText(payload.drivetrain || "", 8).toUpperCase(),
    majorModifications: cleanText(payload.majorModifications || "", MAX_DESCRIPTION_LENGTH),
    listingDescription: cleanText(payload.listingDescription || "", MAX_DESCRIPTION_LENGTH),
    photo: null,
  };

  const errors = {};

  if (data.registrationType && !REGISTRATION_TYPES.has(data.registrationType)) {
    errors.registrationType = "Choose a registration type.";
  }

  if (!data.name) {
    errors.name = "Name is required.";
  }

  if (!data.email || !isValidEmail(data.email)) {
    errors.email = "A valid email is required.";
  }

  if (!data.phone) {
    errors.phone = "A valid phone number is required.";
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

  if (data.registrationType === "marketplace") {
    if (!data.askingPrice) {
      errors.askingPrice = "Asking price is required.";
    }

    if (!data.mileage) {
      errors.mileage = "Mileage is required.";
    }

    if (!TRANSMISSION_TYPES.has(data.transmission)) {
      errors.transmission = "Choose manual or auto.";
    }

    if (!DRIVETRAIN_TYPES.has(data.drivetrain)) {
      errors.drivetrain = "Choose a drivetrain.";
    }

    if (!data.listingDescription) {
      errors.listingDescription = "Listing description is required.";
    }
  } else {
    data.askingPrice = "";
    data.mileage = "";
    data.transmission = "";
    data.drivetrain = "";
    data.majorModifications = "";
    data.listingDescription = "";
  }

  if (data.registrationType === "vipParking") {
    data.description = "";
    data.photo = null;
  } else {
    data.photo = validatePhoto(payload.photo, errors);
  }

  return {
    ok: Object.keys(errors).length === 0,
    data,
    errors,
  };
};

module.exports = {
  validateApplication,
};
