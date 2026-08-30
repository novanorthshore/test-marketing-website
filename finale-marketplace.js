const marketplaceGrid = document.querySelector("[data-marketplace-grid]");

if (marketplaceGrid) {
  const searchInput = document.querySelector("[data-marketplace-search]");
  const sortInput = document.querySelector("[data-marketplace-sort]");
  const statusElement = document.querySelector("[data-marketplace-status]");
  const modal = document.querySelector("[data-marketplace-modal]");
  const dialog = document.querySelector("[data-marketplace-dialog]");
  const modalContent = document.querySelector("[data-marketplace-modal-content]");
  let listings = [];
  let lastFocusedElement = null;
  let activeListing = null;

  const escapeHtml = (value) => String(value || "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  const vehicleName = (listing) => [listing.vehicle.year, listing.vehicle.make, listing.vehicle.model].filter(Boolean).join(" ");
  const priceNumber = (listing) => Number(String(listing.askingPrice || "").replace(/[^0-9]/g, "")) || 0;
  const formatPrice = (value) => `$${Number(value || 0).toLocaleString("en-CA")} CAD`;
  const formatMileage = (value) => `${Number(value || 0).toLocaleString("en-CA")} km`;

  const render = () => {
    const query = searchInput.value.trim().toLowerCase();
    const filtered = listings.filter((listing) => vehicleName(listing).toLowerCase().includes(query));
    const sorted = [...filtered].sort((a, b) => {
      if (sortInput.value === "price-low") return priceNumber(a) - priceNumber(b);
      if (sortInput.value === "price-high") return priceNumber(b) - priceNumber(a);
      return new Date(b.submittedAt) - new Date(a.submittedAt);
    });

    if (!sorted.length) {
      marketplaceGrid.innerHTML = "";
      statusElement.textContent = query ? "No Marketplace listings match that search." : "No Marketplace vehicles are published right now. Check back soon.";
      return;
    }

    statusElement.textContent = `${sorted.length} vehicle${sorted.length === 1 ? "" : "s"} available`;
    marketplaceGrid.innerHTML = sorted.map((listing) => `
      <article class="marketplace-card reveal is-visible">
        <button type="button" data-marketplace-listing="${escapeHtml(listing.id)}" aria-label="View ${escapeHtml(vehicleName(listing))}">
          <img src="${escapeHtml(listing.photos[0])}" alt="${escapeHtml(vehicleName(listing))}" loading="lazy" />
          <div class="marketplace-card-body"><p>${escapeHtml(vehicleName(listing))}</p><strong>${formatPrice(listing.askingPrice)}</strong><span>${formatMileage(listing.mileage)} · ${escapeHtml(listing.transmission)} · ${escapeHtml(listing.drivetrain)}</span><em>View listing</em></div>
        </button>
      </article>`).join("");
  };

  const contactLinks = (contact) => [
    contact.phone && `<a href="tel:${escapeHtml(contact.phone)}">Call ${escapeHtml(contact.phone)}</a>`,
    contact.email && `<a href="mailto:${escapeHtml(contact.email)}">Email seller</a>`,
    contact.instagram && `<a href="https://instagram.com/${escapeHtml(contact.instagram.replace(/^@/, ""))}" target="_blank" rel="noreferrer">${escapeHtml(contact.instagram)}</a>`,
  ].filter(Boolean).join("");

  const openListing = (listing) => {
    if (!listing) return;
    lastFocusedElement = document.activeElement;
    activeListing = listing;
    const photoButtons = listing.photos.map((photo, index) => `<button type="button" data-marketplace-thumbnail="${index}" aria-label="Show photo ${index + 1}"><img src="${escapeHtml(photo)}" alt="" /></button>`).join("");
    modalContent.innerHTML = `
      <div class="marketplace-listing-gallery"><img src="${escapeHtml(listing.photos[0])}" alt="${escapeHtml(vehicleName(listing))}" data-marketplace-main-photo /><div>${photoButtons}</div></div>
      <div class="marketplace-listing-copy"><p class="finale-kicker">Available through NOVA Marketplace</p><h2 id="marketplace-modal-title">${escapeHtml(vehicleName(listing))}</h2><p class="marketplace-listing-price">${formatPrice(listing.askingPrice)}</p>
      <dl class="marketplace-specs"><div><dt>Mileage</dt><dd>${formatMileage(listing.mileage)}</dd></div><div><dt>Transmission</dt><dd>${escapeHtml(listing.transmission)}</dd></div><div><dt>Drivetrain</dt><dd>${escapeHtml(listing.drivetrain)}</dd></div></dl>
      ${listing.modifications ? `<section><h3>Modifications</h3><p>${escapeHtml(listing.modifications)}</p></section>` : ""}
      <section><h3>Known issues</h3><p>${escapeHtml(listing.knownIssues)}</p></section><section><h3>Story / additional information</h3><p>${escapeHtml(listing.story)}</p></section>
      <section class="marketplace-contact"><h3>Contact ${escapeHtml(listing.seller.name)}</h3><div>${contactLinks(listing.seller.contact)}</div></section></div>`;
    modal.hidden = false;
    document.body.classList.add("marketplace-modal-open");
    dialog.focus();
  };

  const closeModal = () => {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("marketplace-modal-open");
    lastFocusedElement?.focus();
  };

  marketplaceGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-marketplace-listing]");
    if (button) openListing(listings.find((listing) => listing.id === button.dataset.marketplaceListing));
  });
  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-marketplace-close]")) closeModal();
    const thumbnail = event.target.closest("[data-marketplace-thumbnail]");
    if (thumbnail && activeListing) {
      const mainPhoto = modalContent.querySelector("[data-marketplace-main-photo]");
      mainPhoto.classList.add("is-changing");
      window.setTimeout(() => {
        mainPhoto.src = activeListing.photos[Number(thumbnail.dataset.marketplaceThumbnail)];
        mainPhoto.classList.remove("is-changing");
      }, 140);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
    if (event.key === "Tab" && !modal.hidden) {
      const focusable = [...dialog.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  searchInput.addEventListener("input", render);
  sortInput.addEventListener("change", render);

  fetch("/.netlify/functions/get-marketplace-listings").then((response) => response.json()).then((result) => {
    if (!result.ok) throw new Error(result.error);
    listings = result.listings || [];
    render();
  }).catch(() => { render(); });
}
