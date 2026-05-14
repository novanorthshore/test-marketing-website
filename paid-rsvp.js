const paidRsvpForm = document.querySelector("[data-paid-rsvp-form]");

if (paidRsvpForm) {
  const submitButton = paidRsvpForm.querySelector("[data-paid-rsvp-submit]");
  const statusElement = paidRsvpForm.querySelector("[data-paid-rsvp-status]");
  const availabilityElement = document.querySelector("[data-rsvp-availability]");
  const bookedElement = document.querySelector("[data-rsvp-booked]");
  const capacityElement = document.querySelector("[data-rsvp-capacity]");
  const remainingElement = document.querySelector("[data-rsvp-remaining]");
  const soldOutElement = document.querySelector("[data-rsvp-sold-out]");
  const formControls = Array.from(paidRsvpForm.querySelectorAll("input"));
  const defaultButtonText = submitButton.textContent;
  const availabilityCacheKey = "nova-cypress-rsvp-availability";
  let isSoldOut = false;

  const setStatus = (message, type = "") => {
    statusElement.textContent = message;
    statusElement.classList.toggle("is-error", type === "error");
    statusElement.classList.toggle("is-success", type === "success");
  };

  const setSoldOut = (soldOut) => {
    isSoldOut = soldOut;
    formControls.forEach((control) => {
      control.disabled = soldOut;
    });
    submitButton.disabled = soldOut;
    paidRsvpForm.hidden = soldOut;
    if (soldOutElement) {
      soldOutElement.hidden = !soldOut;
    }
    availabilityElement?.classList.toggle("is-sold-out", soldOut);
    if (soldOut) {
      submitButton.textContent = "Fully Booked";
    } else if (submitButton.textContent === "Fully Booked") {
      submitButton.textContent = defaultButtonText;
    }
  };

  const setLoading = (isLoading) => {
    if (isSoldOut) {
      submitButton.disabled = true;
      submitButton.textContent = "Fully Booked";
      return;
    }

    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? "Opening Secure Checkout..." : defaultButtonText;
  };

  const renderAvailability = (availability) => {
    if (!availability) {
      return;
    }

    if (bookedElement) {
      bookedElement.textContent = String(availability.bookedCount);
    }

    if (capacityElement) {
      capacityElement.textContent = String(availability.maxCapacity);
    }

    if (remainingElement) {
      remainingElement.textContent = availability.soldOut
        ? "Fully booked"
        : `${availability.remainingCount} spot${availability.remainingCount === 1 ? "" : "s"} remaining`;
    }

    setSoldOut(Boolean(availability.soldOut));
    if (availability.soldOut) {
      setStatus("This event is sold out. No new paid RSVPs are being accepted.", "error");
    }
  };

  const loadCachedAvailability = () => {
    try {
      const cachedAvailability = JSON.parse(localStorage.getItem(availabilityCacheKey) || "null");
      renderAvailability(cachedAvailability);
    } catch (error) {
      localStorage.removeItem(availabilityCacheKey);
    }
  };

  const cacheAvailability = (availability) => {
    try {
      localStorage.setItem(availabilityCacheKey, JSON.stringify(availability));
    } catch (error) {
      return;
    }
  };

  const updateAvailability = async () => {
    try {
      const response = await fetch("/.netlify/functions/get-rsvp-availability", {
        headers: {
          Accept: "application/json",
        },
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Availability could not be loaded.");
      }

      renderAvailability(result);
      cacheAvailability(result);

      return result;
    } catch (error) {
      if (remainingElement) {
        remainingElement.textContent = "Availability could not be loaded";
      }

      setStatus(error.message, "error");
      return null;
    }
  };

  const getFormPayload = () => {
    const formData = new FormData(paidRsvpForm);

    return {
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      vehicleYear: String(formData.get("vehicleYear") || ""),
      vehicleMake: String(formData.get("vehicleMake") || ""),
      vehicleModel: String(formData.get("vehicleModel") || ""),
      licensePlate: String(formData.get("licensePlate") || ""),
      instagram: String(formData.get("instagram") || ""),
      rsvpType: String(formData.get("rsvpType") || ""),
      noRefundAccepted: formData.get("noRefundAccepted") === "true",
    };
  };

  paidRsvpForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isSoldOut) {
      setStatus("This event is sold out. No new paid RSVPs are being accepted.", "error");
      return;
    }

    if (!paidRsvpForm.reportValidity()) {
      return;
    }

    setStatus("");
    setLoading(true);

    try {
      const availability = await updateAvailability();
      if (availability?.soldOut) {
        throw new Error("This event is sold out. No new paid RSVPs are being accepted.");
      }

      const response = await fetch("/.netlify/functions/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(getFormPayload()),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.url) {
        if (result.soldOut) {
          setSoldOut(true);
          if (bookedElement) {
            bookedElement.textContent = String(result.bookedCount);
          }
          if (capacityElement) {
            capacityElement.textContent = String(result.maxCapacity);
          }
        if (remainingElement) {
            remainingElement.textContent = "Fully booked";
          }
        }

        throw new Error(result.error || "Checkout could not be started. Please try again.");
      }

      setStatus("Redirecting to Stripe Checkout...", "success");
      window.location.assign(result.url);
    } catch (error) {
      setStatus(error.message, "error");
      setLoading(false);
    }
  });

  loadCachedAvailability();
  updateAvailability();
}
