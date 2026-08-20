const { randomUUID } = require("crypto");
const { appendApplication } = require("./lib/applications-sheet");
const { buildPhotoFilename, uploadApplicationPhoto } = require("./lib/cloudinary");
const { validateApplication } = require("./lib/validate-application");

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

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

  const validation = validateApplication(payload);
  if (!validation.ok) {
    return jsonResponse(400, {
      error: "Please fix the highlighted application fields.",
      fields: validation.errors,
    });
  }

  const { data } = validation;
  const applicationId = randomUUID();

  try {
    let photo = null;

    if (data.photo) {
      try {
        const filename = buildPhotoFilename({
          name: data.name,
          vehicleYear: data.vehicleYear,
          vehicleMake: data.vehicleMake,
          vehicleModel: data.vehicleModel,
          licensePlate: data.licensePlate,
          extension: data.photo.extension,
        });

        photo = await uploadApplicationPhoto({
          buffer: data.photo.buffer,
          mimeType: data.photo.mimeType,
          filename,
          applicationId,
        });
      } catch (photoError) {
        console.error("Photo upload failed; saving application without photo", {
          message: photoError.message,
          email: data.email,
        });
      }
    }

    await appendApplication({
      applicationId,
      application: {
        registrationType: data.registrationType,
        name: data.name,
        email: data.email,
        phone: data.phone,
        vehicleYear: data.vehicleYear,
        vehicleMake: data.vehicleMake,
        vehicleModel: data.vehicleModel,
        licensePlate: data.licensePlate,
        instagram: data.instagram,
        description: data.description,
        askingPrice: data.askingPrice,
        mileage: data.mileage,
        transmission: data.transmission,
        drivetrain: data.drivetrain,
        majorModifications: data.majorModifications,
        listingDescription: data.listingDescription,
      },
      photo,
      photoUploadFailed: Boolean(data.photo && !photo),
    });

    return jsonResponse(200, {
      ok: true,
      message: "Application submitted successfully.",
      photoFileName: photo?.fileName || null,
      photoUploaded: Boolean(photo),
    });
  } catch (error) {
    console.error("Unable to submit show application", error);
    return jsonResponse(500, {
      error: "Your application could not be submitted. Please try again or contact Nova North Shore.",
    });
  }
};
