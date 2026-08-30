const MAX_FIELD_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 800;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const ALLOWED_PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const REGISTRATION_TYPES = new Set(["showCar", "marketplace", "vipParking"]);
const TRANSMISSION_TYPES = new Set(["manual", "auto"]);
const DRIVETRAIN_TYPES = new Set(["FWD", "RWD", "AWD", "4WD"]);
const MARKETPLACE_CONTACT_METHODS = new Set(["phone", "email", "instagram"]);

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

const isWholeNumber = (value) => /^\d+$/.test(String(value || "").replace(/[,$\s]/g, ""));

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

const validateMarketplacePhotos = (photos, errors) => {
  if (!Array.isArray(photos) || photos.length < 1 || photos.length > 5) {
    errors.photos = "Upload between one and five vehicle photos.";
    return [];
  }

  const cleanPhotos = photos.map((photo) => ({
    photoUrl: cleanText(photo?.photoUrl || "", 600),
    fileId: cleanText(photo?.fileId || "", 240),
  }));

  if (cleanPhotos.some((photo) => !/^https:\/\/res\.cloudinary\.com\//.test(photo.photoUrl) || !photo.fileId)) {
    errors.photos = "One or more Marketplace photos could not be verified.";
    return [];
  }

  return cleanPhotos;
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
    knownIssues: cleanText(payload.knownIssues || "", MAX_DESCRIPTION_LENGTH),
    marketplaceDisplayName: cleanText(payload.marketplaceDisplayName || "", 120),
    publicContactMethods: Array.isArray(payload.publicContactMethods)
      ? payload.publicContactMethods.map((value) => cleanText(value, 20).toLowerCase())
      : [],
    marketplacePhotos: [],
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
    if (!isWholeNumber(data.askingPrice) || Number(data.askingPrice.replace(/[,\s$]/g, "")) < 1) {
      errors.askingPrice = "Enter a whole-dollar asking price.";
    } else {
      data.askingPrice = String(Number(data.askingPrice.replace(/[,\s$]/g, "")));
    }

    if (!isWholeNumber(data.mileage)) {
      errors.mileage = "Enter mileage in kilometres.";
    } else {
      data.mileage = String(Number(data.mileage.replace(/[,$\s]/g, "")));
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

    if (!data.knownIssues) {
      errors.knownIssues = "Describe known issues or enter None known.";
    }

    if (!data.marketplaceDisplayName) {
      errors.marketplaceDisplayName = "A public seller name is required.";
    }

    data.publicContactMethods = [...new Set(data.publicContactMethods)];
    if (!data.publicContactMethods.length || data.publicContactMethods.some((value) => !MARKETPLACE_CONTACT_METHODS.has(value))) {
      errors.publicContactMethods = "Choose at least one public contact method.";
    }

    if (data.publicContactMethods.includes("instagram") && !data.instagram) {
      errors.instagram = "Add an Instagram username or choose another contact method.";
    }

    data.marketplacePhotos = validateMarketplacePhotos(payload.marketplacePhotos, errors);
  } else {
    data.askingPrice = "";
    data.mileage = "";
    data.transmission = "";
    data.drivetrain = "";
    data.majorModifications = "";
    data.listingDescription = "";
    data.knownIssues = "";
    data.marketplaceDisplayName = "";
    data.publicContactMethods = [];
    data.marketplacePhotos = [];
  }

  if (data.registrationType === "marketplace") {
    data.photo = null;
  } else if (data.registrationType === "vipParking") {
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
