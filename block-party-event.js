const applicationForm = document.querySelector("[data-show-application-form]");

if (applicationForm) {
  const submitButton = applicationForm.querySelector("[data-show-application-submit]");
  const statusElement = applicationForm.querySelector("[data-show-application-status]");
  const photoInput = applicationForm.querySelector("[data-show-application-photo]");
  const photoStatus = applicationForm.querySelector("[data-show-application-photo-wrap]");
  const photoHint = applicationForm.querySelector("[data-show-application-photo-hint]");
  const photoButton = applicationForm.querySelector(".rsvp-file-button");
  const defaultPhotoHint = "Optional. JPG, PNG, or WebP up to 4 MB. Send a better photo later if approved.";
  const defaultButtonText = submitButton.textContent;
  const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
  const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

  let selectedPhotoFile = null;

  const setStatus = (message, type = "") => {
    statusElement.textContent = message;
    statusElement.classList.toggle("is-error", type === "error");
    statusElement.classList.toggle("is-success", type === "success");
  };

  const setLoading = (isLoading) => {
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? "Submitting Application..." : defaultButtonText;
  };

  const clearPhotoPreview = () => {
    selectedPhotoFile = null;
    photoInput.value = "";
    if (photoStatus) {
      photoStatus.hidden = true;
    }
    if (photoButton) {
      photoButton.textContent = "Choose Photo";
    }
    if (photoHint) {
      photoHint.textContent = defaultPhotoHint;
    }
  };

  const loadImageFromFile = (file) => new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The selected photo could not be read."));
    };

    image.src = objectUrl;
  });

  const canvasToBlob = (canvas, mimeType, quality) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("The selected photo could not be processed."));
        return;
      }

      resolve(blob);
    }, mimeType, quality);
  });

  const compressPhoto = async (file) => {
    const image = await loadImageFromFile(file);
    const maxWidth = 2000;
    const scale = image.width > maxWidth ? maxWidth / image.width : 1;
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);

    const outputMimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const qualities = outputMimeType === "image/jpeg" ? [0.88, 0.78, 0.68, 0.58] : [1];

    let bestBlob = null;

    for (const quality of qualities) {
      const blob = await canvasToBlob(canvas, outputMimeType, quality);
      bestBlob = blob;

      if (blob.size <= MAX_PHOTO_BYTES) {
        return blob;
      }
    }

    if (bestBlob && bestBlob.size <= MAX_PHOTO_BYTES) {
      return bestBlob;
    }

    throw new Error("Photo is too large. Choose a smaller image or crop it before uploading.");
  };

  const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };

    reader.onerror = () => reject(new Error("The selected photo could not be read."));
    reader.readAsDataURL(blob);
  });

  const getFormPayload = async () => {
    const formData = new FormData(applicationForm);
    const payload = {
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      phone: String(formData.get("phone") || ""),
      vehicleYear: String(formData.get("vehicleYear") || ""),
      vehicleMake: String(formData.get("vehicleMake") || ""),
      vehicleModel: String(formData.get("vehicleModel") || ""),
      licensePlate: String(formData.get("licensePlate") || ""),
      instagram: String(formData.get("instagram") || ""),
      description: String(formData.get("description") || ""),
    };

    if (selectedPhotoFile) {
      const compressedBlob = await compressPhoto(selectedPhotoFile);
      payload.photo = {
        mimeType: compressedBlob.type,
        base64: await blobToBase64(compressedBlob),
      };
    }

    return payload;
  };

  photoInput.addEventListener("change", async () => {
    const file = photoInput.files?.[0];

    if (!file) {
      clearPhotoPreview();
      return;
    }

    if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
      clearPhotoPreview();
      setStatus("Upload a JPG, PNG, or WebP photo.", "error");
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      clearPhotoPreview();
      setStatus("Choose a photo smaller than 12 MB before compression.", "error");
      return;
    }

    try {
      await compressPhoto(file);
      selectedPhotoFile = file;
      if (photoStatus) {
        photoStatus.hidden = false;
      }
      if (photoButton) {
        photoButton.textContent = "Change Photo";
      }
      if (photoHint) {
        photoHint.textContent = defaultPhotoHint;
      }

      setStatus("");
    } catch (error) {
      clearPhotoPreview();
      setStatus(error.message, "error");
    }
  });

  applicationForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!applicationForm.reportValidity()) {
      return;
    }

    setStatus("");
    setLoading(true);

    try {
      const response = await fetch("/.netlify/functions/submit-application", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(await getFormPayload()),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok) {
        const fieldErrors = result.fields ? Object.values(result.fields).join(" ") : "";
        throw new Error(result.error || fieldErrors || "Your application could not be submitted. Please try again.");
      }

      window.location.assign("/application-submitted.html");
    } catch (error) {
      setStatus(error.message, "error");
      setLoading(false);
    }
  });
}
