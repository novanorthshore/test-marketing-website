const { Readable } = require("stream");
const { getDriveClient, requiredEnv } = require("./google-auth");

const sanitizeFilenamePart = (value, maxLength = 40) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, maxLength);

const buildPhotoFilename = ({ name, vehicleYear, vehicleMake, vehicleModel, licensePlate, extension }) => {
  const parts = [
    sanitizeFilenamePart(name),
    sanitizeFilenamePart(vehicleYear, 4),
    sanitizeFilenamePart(vehicleMake),
    sanitizeFilenamePart(vehicleModel),
  ].filter(Boolean);

  let base = parts.join("-") || "application-photo";

  const plate = sanitizeFilenamePart(licensePlate, 12);
  if (plate) {
    base = `${base}-${plate}`;
  }

  return `${base}.${extension}`;
};

const buildDriveViewUrl = (fileId) => `https://drive.google.com/file/d/${fileId}/view`;

const uploadApplicationPhoto = async ({ buffer, mimeType, filename }) => {
  const drive = await getDriveClient();
  const folderId = requiredEnv("GOOGLE_DRIVE_FOLDER_ID");

  const file = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id, name, webViewLink",
    supportsAllDrives: true,
  });

  await drive.permissions.create({
    fileId: file.data.id,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
    supportsAllDrives: true,
  });

  return {
    fileId: file.data.id,
    fileName: file.data.name,
    photoUrl: file.data.webViewLink || buildDriveViewUrl(file.data.id),
  };
};

module.exports = {
  buildPhotoFilename,
  uploadApplicationPhoto,
};
