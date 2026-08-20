const applicationForm = document.querySelector("[data-finale-application-form]");

if (applicationForm) {
  const submitButton = applicationForm.querySelector("[data-show-application-submit]");
  const statusElement = applicationForm.querySelector("[data-show-application-status]");
  const photoInput = applicationForm.querySelector("[data-show-application-photo]");
  const photoStatus = applicationForm.querySelector("[data-show-application-photo-wrap]");
  const photoHint = applicationForm.querySelector("[data-show-application-photo-hint]");
  const photoButton = applicationForm.querySelector(".rsvp-file-button");
  const fieldsWrap = applicationForm.querySelector("[data-finale-fields]");
  const showFields = applicationForm.querySelector("[data-finale-show-fields]");
  const marketplaceFields = applicationForm.querySelector("[data-finale-marketplace-fields]");
  const priceElement = applicationForm.querySelector("[data-finale-price]");
  const typeInputs = [...applicationForm.querySelectorAll('input[name="registrationType"]')];
  const typePicker = applicationForm.querySelector("[data-finale-type-picker]");
  const typeBar = applicationForm.querySelector("[data-finale-type-bar]");
  const typeLabel = applicationForm.querySelector("[data-finale-type-label]");
  const changeTypeButton = applicationForm.querySelector("[data-finale-change-type]");
  const heading = document.querySelector("[data-finale-heading]");
  const defaultPhotoHint = "Required. JPG, PNG, or WebP up to 12 MB. Send a better photo later if approved.";
  const defaultButtonText = submitButton.textContent;
  const MAX_PHOTO_BYTES = 2.5 * 1024 * 1024;
  const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const TYPE_META = {
    showCar: { label: "Featured Show Car", price: "$25" },
    marketplace: { label: "Nova Marketplace", price: "$45" },
    vipParking: { label: "VIP Parking", price: "$10" },
  };
  const APPLY_URL = "finale-submissions.html#apply";
  const requestedType = new URLSearchParams(window.location.search).get("type");

  if (!TYPE_META[requestedType]) {
    window.location.replace(APPLY_URL);
  } else {
    const match = typeInputs.find((input) => input.value === requestedType);
    if (match) {
      match.checked = true;
    }

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

  const selectedType = () => applicationForm.querySelector('input[name="registrationType"]:checked')?.value || "";

  const needsPhoto = () => selectedType() !== "vipParking";

  const setFieldDisabled = (root, disabled) => {
    if (!root) {
      return;
    }

    root.querySelectorAll("input, textarea, select").forEach((field) => {
      if (field.name === "registrationType") {
        return;
      }

      field.disabled = disabled;

      if (field.classList.contains("rsvp-file-input")) {
        field.required = !disabled && needsPhoto();
      }
    });
  };

  const clearPhotoPreview = () => {
    selectedPhotoFile = null;
    if (photoInput) {
      photoInput.value = "";
      photoInput.setCustomValidity("");
    }
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

  const syncFormForType = () => {
    const type = selectedType();
    const hasType = Boolean(type);
    const meta = TYPE_META[type];

    fieldsWrap.hidden = !hasType;
    if (typePicker) {
      typePicker.hidden = hasType;
    }
    if (typeBar) {
      typeBar.hidden = !hasType;
    }
    if (heading) {
      heading.textContent = hasType ? "Your application" : "Choose registration type";
    }
    if (hasType && typeLabel && meta) {
      typeLabel.textContent = `${meta.label} · ${meta.price}`;
    }

    if (!hasType) {
      setFieldDisabled(fieldsWrap, true);
      return;
    }

    setFieldDisabled(fieldsWrap, false);

    const isVip = type === "vipParking";
    const isMarketplace = type === "marketplace";

    showFields.hidden = isVip;
    setFieldDisabled(showFields, isVip);

    marketplaceFields.hidden = !isMarketplace;
    setFieldDisabled(marketplaceFields, !isMarketplace);

    if (photoInput) {
      photoInput.required = !isVip;
      if (isVip) {
        photoInput.setCustomValidity("");
      }
    }

    if (isVip) {
      clearPhotoPreview();
    }

    priceElement.textContent = `Price: ${meta.price}`;
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
    const maxWidth = 1800;
    const scale = image.width > maxWidth ? maxWidth / image.width : 1;
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, width, height);

    const outputMimeType = "image/jpeg";
    const qualities = [0.86, 0.76, 0.66, 0.56, 0.46];

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
    const type = selectedType();
    const payload = {
      registrationType: type,
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      phone: String(formData.get("phone") || ""),
      vehicleYear: String(formData.get("vehicleYear") || ""),
      vehicleMake: String(formData.get("vehicleMake") || ""),
      vehicleModel: String(formData.get("vehicleModel") || ""),
      licensePlate: String(formData.get("licensePlate") || ""),
      description: String(formData.get("description") || ""),
    };

    if (type === "marketplace") {
      payload.askingPrice = String(formData.get("askingPrice") || "");
      payload.mileage = String(formData.get("mileage") || "");
      payload.transmission = String(formData.get("transmission") || "");
      payload.drivetrain = String(formData.get("drivetrain") || "");
      payload.majorModifications = String(formData.get("majorModifications") || "");
      payload.listingDescription = String(formData.get("listingDescription") || "");
    }

    if (selectedPhotoFile) {
      const compressedBlob = await compressPhoto(selectedPhotoFile);
      payload.photo = {
        mimeType: compressedBlob.type,
        base64: await blobToBase64(compressedBlob),
      };
    }

    return payload;
  };

  typeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      setStatus("");
      syncFormForType();
    });
  });

  if (changeTypeButton) {
    changeTypeButton.addEventListener("click", () => {
      window.location.assign(APPLY_URL);
    });
  }

  if (photoInput) {
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
        photoInput.setCustomValidity("");
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
  }

  applicationForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!selectedType()) {
      setStatus("Choose a registration type.", "error");
      return;
    }

    if (!applicationForm.reportValidity()) {
      return;
    }

    if (needsPhoto() && !selectedPhotoFile) {
      photoInput.setCustomValidity("Upload a car photo before submitting.");
      applicationForm.reportValidity();
      setStatus("Upload a car photo before submitting.", "error");
      return;
    }

    if (photoInput) {
      photoInput.setCustomValidity("");
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

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        const fieldErrors = result?.fields ? Object.values(result.fields).join(" ") : "";
        const fallbackError = response.status === 413
          ? "The photo upload is too large. Choose a smaller photo and try again."
          : "Your application could not be submitted. Please try again.";
        throw new Error(result?.error || fieldErrors || fallbackError);
      }

      window.location.assign("/application-submitted.html");
    } catch (error) {
      setStatus(error.message, "error");
      setLoading(false);
    }
  });

  syncFormForType();
  }
}
