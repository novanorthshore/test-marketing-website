const paymentButton = document.querySelector("[data-show-payment-button]");
const statusElement = document.querySelector("[data-show-payment-status]");

const setStatus = (message, type = "") => {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = message;
  statusElement.classList.toggle("is-error", type === "error");
  statusElement.classList.toggle("is-success", type === "success");
};

const getToken = () => new URLSearchParams(window.location.search).get("token") || "";

if (paymentButton) {
  const token = getToken();

  if (!token) {
    setStatus("This payment link is missing its token. Please use the button in your acceptance email.", "error");
    paymentButton.disabled = true;
  }

  paymentButton.addEventListener("click", async () => {
    if (!token) {
      return;
    }

    setStatus("");
    paymentButton.disabled = true;
    paymentButton.textContent = "Opening Secure Checkout...";

    try {
      const response = await fetch("/.netlify/functions/create-show-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.url) {
        throw new Error(result.error || "Checkout could not be started. Please try again.");
      }

      setStatus("Redirecting to secure checkout...", "success");
      window.location.assign(result.url);
    } catch (error) {
      setStatus(error.message, "error");
      paymentButton.disabled = false;
      paymentButton.textContent = "Pay Registration Fee";
    }
  });
}
