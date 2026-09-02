const vipParkingButton = document.querySelector("[data-vip-parking-checkout]");
const vipParkingStatus = document.querySelector("[data-vip-parking-status]");

if (vipParkingButton) {
  const originalText = vipParkingButton.innerHTML;

  vipParkingButton.addEventListener("click", async () => {
    vipParkingButton.disabled = true;
    vipParkingButton.textContent = "Opening secure checkout...";
    if (vipParkingStatus) vipParkingStatus.textContent = "";

    try {
      const response = await fetch("/.netlify/functions/create-vip-parking-checkout", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.url) {
        throw new Error(result.error || "VIP Parking checkout could not be started.");
      }
      window.location.assign(result.url);
    } catch (error) {
      if (vipParkingStatus) vipParkingStatus.textContent = error.message;
      vipParkingButton.disabled = false;
      vipParkingButton.innerHTML = originalText;
    }
  });
}
