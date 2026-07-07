const MAX_FIELD_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 800;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const ALLOWED_PHOTO_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

const validateApplication = (payload = {}) => {
  const data = {
    name: cleanText(payload.name),
    email: cleanText(payload.email, 180).toLowerCase(),
    phone: normalizePhone(payload.phone || ""),
    vehicleYear: cleanText(payload.vehicleYear, 4),
    vehicleMake: cleanText(payload.vehicleMake),
    vehicleModel: cleanText(payload.vehicleModel),
    licensePlate: cleanText(payload.licensePlate, 24).toUpperCase(),
    instagram: cleanText(payload.instagram || "", 80),
    description: cleanText(payload.description || "", MAX_DESCRIPTION_LENGTH),
    photo: null,
  };

  const errors = {};

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

  if (!payload.photo) {
    errors.photo = "Car photo is required.";
  } else {
    const mimeType = cleanText(payload.photo.mimeType || "", 40);
    const base64 = typeof payload.photo.base64 === "string" ? payload.photo.base64.trim() : "";

    if (!mimeType || !ALLOWED_PHOTO_MIME_TYPES.has(mimeType)) {
      errors.photo = "Upload a JPG, PNG, or WebP photo.";
    } else if (!base64) {
      errors.photo = "The selected photo could not be read.";
    } else {
      let buffer;
      try {
        buffer = Buffer.from(base64, "base64");
      } catch (error) {
        errors.photo = "The selected photo could not be read.";
      }

      if (!errors.photo) {
        if (!buffer.length) {
          errors.photo = "The selected photo is empty.";
        } else if (buffer.length > MAX_PHOTO_BYTES) {
          errors.photo = "Photo must be 4 MB or smaller.";
        } else {
          data.photo = {
            buffer,
            mimeType,
            extension: extensionFromMimeType(mimeType),
          };
        }
      }
    }
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
