const { v2: cloudinary } = require("cloudinary");
const { buildPhotoFilename } = require("./google-drive");

const requiredEnv = (name) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const configureCloudinary = () => {
  cloudinary.config({
    cloud_name: requiredEnv("CLOUDINARY_CLOUD_NAME"),
    api_key: requiredEnv("CLOUDINARY_API_KEY"),
    api_secret: requiredEnv("CLOUDINARY_API_SECRET"),
    secure: true,
  });
};

const uploadApplicationPhoto = async ({ buffer, mimeType, filename, applicationId }) => {
  configureCloudinary();

  const folder = (process.env.CLOUDINARY_FOLDER || "nova-shore/applications").replace(/\/+$/, "");
  const baseName = filename.replace(/\.[^./]+$/, "");
  const publicId = `${baseName}-${String(applicationId).slice(0, 8)}`;

  const result = await cloudinary.uploader.upload(
    `data:${mimeType};base64,${buffer.toString("base64")}`,
    {
      folder,
      public_id: publicId,
      overwrite: false,
      resource_type: "image",
    }
  );

  return {
    fileId: result.public_id,
    fileName: filename,
    photoUrl: result.secure_url,
  };
};

module.exports = {
  buildPhotoFilename,
  uploadApplicationPhoto,
};
