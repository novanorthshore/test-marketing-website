const paidRsvpForm = document.querySelector("[data-paid-rsvp-form]");

if (paidRsvpForm) {
  const submitButton = paidRsvpForm.querySelector("[data-paid-rsvp-submit]");
  const statusElement = paidRsvpForm.querySelector("[data-paid-rsvp-status]");
  const defaultButtonText = submitButton.textContent;

  const setStatus = (message, type = "") => {
    statusElement.textContent = message;
    statusElement.classList.toggle("is-error", type === "error");
    statusElement.classList.toggle("is-success", type === "success");
  };

  const setLoading = (isLoading) => {
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? "Opening Secure Checkout..." : defaultButtonText;
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

    if (!paidRsvpForm.reportValidity()) {
      return;
    }

    setStatus("");
    setLoading(true);

    try {
      const response = await fetch("/.netlify/functions/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(getFormPayload()),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.url) {
        throw new Error(result.error || "Checkout could not be started. Please try again.");
      }

      setStatus("Redirecting to Stripe Checkout...", "success");
      window.location.assign(result.url);
    } catch (error) {
      setStatus(error.message, "error");
      setLoading(false);
    }
  });
}
