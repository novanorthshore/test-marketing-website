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
  const marketplacePhotoInputs = [...applicationForm.querySelectorAll("[data-marketplace-photo]")];
  const marketplacePhotoPreviews = applicationForm.querySelector("[data-marketplace-photo-previews]");
  const heading = document.querySelector("[data-finale-heading]");
  const defaultPhotoHint = "Required. JPG, PNG, or WebP up to 12 MB. Send a better photo later if approved.";
  const defaultButtonText = submitButton.textContent;
  const MAX_PHOTO_BYTES = 2.5 * 1024 * 1024;
  const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const TYPE_META = {
    showCar: { label: "Featured Show Car", price: "$15" },
    marketplace: { label: "Nova Marketplace", price: "$40" },
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
  const marketplacePhotoFiles = new Array(4).fill(null);

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

  const clearMarketplacePhotos = () => {
    marketplacePhotoFiles.fill(null);
    marketplacePhotoInputs.forEach((input) => {
      input.value = "";
      const status = applicationForm.querySelector(`[data-marketplace-photo-status="${input.dataset.marketplacePhoto}"]`);
      if (status) {
        status.hidden = true;
        status.textContent = "";
      }
    });
    renderMarketplacePreviews();
  };

  const marketplaceFiles = () => [selectedPhotoFile, ...marketplacePhotoFiles];

  const renderMarketplacePreviews = () => {
    if (!marketplacePhotoPreviews || selectedType() !== "marketplace") return;
    marketplacePhotoPreviews.innerHTML = marketplaceFiles().map((file, index) => {
      if (!file) return "";
      const label = index === 0 ? "Cover photo" : `Gallery photo ${index + 1}`;
      return `<figure><img src="${URL.createObjectURL(file)}" alt="${label}" /><figcaption>${label}<span><button type="button" data-marketplace-make-cover="${index}" ${index === 0 ? "disabled" : ""}>Make cover</button><button type="button" data-marketplace-remove-photo="${index}">Remove</button></span></figcaption></figure>`;
    }).join("");
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

    if (!isMarketplace) {
      clearMarketplacePhotos();
    }

    if (photoInput) {
      photoInput.required = !isVip;
      if (isVip) {
        photoInput.setCustomValidity("");
      }
    }

    if (isVip) {
      clearPhotoPreview();
    }

    if (isMarketplace) {
      renderMarketplacePreviews();
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

  const getFormPayload = async (marketplacePhotos = []) => {
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
      instagram: String(formData.get("instagram") || ""),
    };

    if (type === "marketplace") {
      payload.askingPrice = String(formData.get("askingPrice") || "");
      payload.mileage = String(formData.get("mileage") || "");
      payload.transmission = String(formData.get("transmission") || "");
      payload.drivetrain = String(formData.get("drivetrain") || "");
      payload.majorModifications = String(formData.get("majorModifications") || "");
      payload.listingDescription = String(formData.get("listingDescription") || "");
      payload.knownIssues = String(formData.get("knownIssues") || "");
      payload.marketplaceDisplayName = String(formData.get("marketplaceDisplayName") || "");
      payload.publicContactMethods = formData.getAll("publicContactMethods").map(String);
      payload.marketplacePhotos = marketplacePhotos;
    }

    if (selectedPhotoFile && type !== "marketplace") {
      const compressedBlob = await compressPhoto(selectedPhotoFile);
      payload.photo = {
        mimeType: compressedBlob.type,
        base64: await blobToBase64(compressedBlob),
      };
    }

    return payload;
  };

  const uploadMarketplacePhoto = async (file, slot) => {
    const compressedBlob = await compressPhoto(file);
    const signatureResponse = await fetch("/.netlify/functions/create-marketplace-upload-signature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot }),
    });
    const signature = await signatureResponse.json().catch(() => null);

    if (!signatureResponse.ok || !signature?.ok) {
      throw new Error(signature?.error || "Unable to prepare a Marketplace photo upload.");
    }

    const uploadData = new FormData();
    uploadData.append("file", compressedBlob, `marketplace-${slot + 1}.jpg`);
    uploadData.append("api_key", signature.apiKey);
    uploadData.append("timestamp", String(signature.timestamp));
    uploadData.append("signature", signature.signature);
    uploadData.append("folder", signature.folder);
    uploadData.append("public_id", signature.publicId);

    const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloudName)}/image/upload`, {
      method: "POST",
      body: uploadData,
    });
    const uploaded = await uploadResponse.json().catch(() => null);

    if (!uploadResponse.ok || !uploaded?.secure_url || !uploaded?.public_id) {
      throw new Error(uploaded?.error?.message || "Unable to upload a Marketplace photo.");
    }

    return { photoUrl: uploaded.secure_url, fileId: uploaded.public_id };
  };

  const uploadMarketplacePhotos = async () => {
    const files = [selectedPhotoFile, ...marketplacePhotoFiles].filter(Boolean);
    if (!files.length) {
      throw new Error("Upload a cover photo before submitting.");
    }

    const uploads = [];
    for (let index = 0; index < files.length; index += 1) {
      setStatus(`Uploading Marketplace photo ${index + 1} of ${files.length}...`);
      uploads.push(await uploadMarketplacePhoto(files[index], index));
    }

    return uploads;
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
        renderMarketplacePreviews();
      } catch (error) {
        clearPhotoPreview();
        setStatus(error.message, "error");
      }
    });
  }

  marketplacePhotoInputs.forEach((input) => {
    input.addEventListener("change", async () => {
      const slot = Number(input.dataset.marketplacePhoto);
      const file = input.files?.[0];
      const status = applicationForm.querySelector(`[data-marketplace-photo-status="${slot}"]`);

      marketplacePhotoFiles[slot - 1] = null;
      if (!file) {
        if (status) status.hidden = true;
        return;
      }

      if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
        input.value = "";
        setStatus("Upload a JPG, PNG, or WebP photo.", "error");
        return;
      }

      if (file.size > 12 * 1024 * 1024) {
        input.value = "";
        setStatus("Choose a photo smaller than 12 MB before compression.", "error");
        return;
      }

      try {
        await compressPhoto(file);
        marketplacePhotoFiles[slot - 1] = file;
        if (status) {
          status.textContent = `${file.name} ready to upload`;
          status.hidden = false;
        }
        setStatus("");
        renderMarketplacePreviews();
      } catch (error) {
        input.value = "";
        setStatus(error.message, "error");
      }
    });
  });

  if (marketplacePhotoPreviews) {
    marketplacePhotoPreviews.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-marketplace-remove-photo]");
      const coverButton = event.target.closest("[data-marketplace-make-cover]");

      if (coverButton) {
        const index = Number(coverButton.dataset.marketplaceMakeCover);
        const nextCover = marketplacePhotoFiles[index - 1];
        marketplacePhotoFiles[index - 1] = selectedPhotoFile;
        selectedPhotoFile = nextCover;
        renderMarketplacePreviews();
      }

      if (removeButton) {
        const index = Number(removeButton.dataset.marketplaceRemovePhoto);
        if (index === 0) {
          clearPhotoPreview();
        } else {
          marketplacePhotoFiles[index - 1] = null;
          const input = marketplacePhotoInputs.find((item) => Number(item.dataset.marketplacePhoto) === index);
          if (input) input.value = "";
        }
        renderMarketplacePreviews();
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

    if (selectedType() === "marketplace") {
      const marketplaceData = new FormData(applicationForm);
      const contactMethods = marketplaceData.getAll("publicContactMethods");
      if (!contactMethods.length) {
        setStatus("Choose at least one public contact method for your Marketplace listing.", "error");
        return;
      }
      if (contactMethods.includes("instagram") && !String(marketplaceData.get("instagram") || "").trim()) {
        setStatus("Add an Instagram username or choose another public contact method.", "error");
        return;
      }
    }

    if (photoInput) {
      photoInput.setCustomValidity("");
    }

    setStatus("");
    setLoading(true);

    try {
      const marketplacePhotos = selectedType() === "marketplace" ? await uploadMarketplacePhotos() : [];
      const response = await fetch("/.netlify/functions/submit-application", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(await getFormPayload(marketplacePhotos)),
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
