const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const mobileNav = document.querySelector("[data-mobile-nav]");
const signupForm = document.querySelector("[data-signup-form]");
const formNote = document.querySelector("[data-form-note]");
const lightbox = document.querySelector("[data-lightbox]");
const lightboxImage = document.querySelector("[data-lightbox-image]");
const lightboxClose = document.querySelector("[data-lightbox-close]");

const syncHeader = () => {
  header.classList.toggle("is-scrolled", header.hasAttribute("data-solid-header") || window.scrollY > 18);
};

window.addEventListener("scroll", syncHeader, { passive: true });
syncHeader();

menuToggle.addEventListener("click", () => {
  const isOpen = header.classList.toggle("is-open");
  document.body.classList.toggle("menu-open", isOpen);
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
});

mobileNav.addEventListener("click", (event) => {
  if (event.target.matches("a")) {
    header.classList.remove("is-open");
    document.body.classList.remove("menu-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open menu");
  }
});

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.16 }
);

document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

// The form is submitted normally so Netlify can capture it.

const eventCarousel = document.querySelector("[data-event-carousel]");

if (eventCarousel) {
  const cards = [...eventCarousel.querySelectorAll(".event-carousel-card")];
  const previousButton = eventCarousel.querySelector("[data-event-carousel-prev]");
  const nextButton = eventCarousel.querySelector("[data-event-carousel-next]");
  const descriptionTitle = document.querySelector("[data-event-description-title]");
  const descriptionMeta = document.querySelector("[data-event-description-meta]");
  const descriptionCopy = document.querySelector("[data-event-description-copy]");
  const mobileCarousel = window.matchMedia("(max-width: 680px)");
  let activeIndex = 0;
  let touchStartX = 0;
  let touchDistance = 0;
  let touchPointerId = null;
  let ignoreClicksUntil = 0;

  const wrapIndex = (index) => (index + cards.length) % cards.length;

  const renderEventCarousel = () => {
    const spacing = mobileCarousel.matches
      ? Math.min(eventCarousel.clientWidth * 0.38, 145)
      : Math.min(eventCarousel.clientWidth * 0.4, 260);

    cards.forEach((card, index) => {
      let offset = index - activeIndex;
      if (offset > cards.length / 2) offset -= cards.length;
      if (offset < -cards.length / 2) offset += cards.length;

      const distance = Math.abs(offset);
      const action = card.querySelector("a, button");
      const isActive = offset === 0;
      card.classList.toggle("is-active", isActive);
      card.setAttribute("aria-hidden", isActive ? "false" : "true");
      card.title = isActive ? "" : "Click to view this event";
      if (action) action.tabIndex = isActive ? 0 : -1;
      card.style.opacity = distance > 1 ? "0" : "1";
      card.style.pointerEvents = distance > 1 ? "none" : "auto";
      card.style.zIndex = String(5 - distance);
      card.style.transform = [
        "translate(-50%, -50%)",
        `translateX(${offset * spacing}px)`,
        `translateZ(${-distance * 150}px)`,
        `rotateY(${offset * -26}deg)`,
        `scale(${offset === 0 ? 1.08 : 0.8})`,
      ].join(" ");
    });

    const activeCard = cards[activeIndex];
    if (descriptionTitle) descriptionTitle.textContent = activeCard.dataset.eventTitle;
    if (descriptionMeta) descriptionMeta.textContent = activeCard.dataset.eventMeta;
    if (descriptionCopy) descriptionCopy.textContent = activeCard.dataset.eventDescription;
  };

  const goToEvent = (index) => {
    activeIndex = wrapIndex(index);
    renderEventCarousel();
  };

  previousButton?.addEventListener("click", () => goToEvent(activeIndex - 1));
  nextButton?.addEventListener("click", () => goToEvent(activeIndex + 1));

  eventCarousel.addEventListener("click", (event) => {
    if (event.target.closest(".event-carousel-arrow")) return;

    if (performance.now() < ignoreClicksUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const activeCard = cards[activeIndex];
    const clickedCard = event.target.closest(".event-carousel-card");
    const activeBounds = activeCard.getBoundingClientRect();
    let nextIndex = clickedCard && !clickedCard.classList.contains("is-active")
      ? cards.indexOf(clickedCard)
      : null;

    // Transformed carousel cards can visually overlap. Treat clicks in the
    // visible areas beside the active poster as clicks on the adjacent poster.
    if (event.clientX < activeBounds.left) nextIndex = wrapIndex(activeIndex - 1);
    if (event.clientX > activeBounds.right) nextIndex = wrapIndex(activeIndex + 1);

    if (nextIndex !== null) {
      event.preventDefault();
      event.stopImmediatePropagation();
      goToEvent(nextIndex);
    }
  }, true);

  eventCarousel.addEventListener("pointerdown", (event) => {
    if (!mobileCarousel.matches || event.pointerType !== "touch") return;
    if (event.target.closest(".event-carousel-arrow")) return;

    touchStartX = event.clientX;
    touchDistance = 0;
    touchPointerId = event.pointerId;
    eventCarousel.setPointerCapture?.(event.pointerId);
  });

  eventCarousel.addEventListener("pointermove", (event) => {
    if (event.pointerId !== touchPointerId) return;
    touchDistance = event.clientX - touchStartX;
  });

  const finishTouchSwipe = (event) => {
    if (event.pointerId !== touchPointerId) return;

    if (Math.abs(touchDistance) > 45) {
      ignoreClicksUntil = performance.now() + 400;
      goToEvent(activeIndex + (touchDistance < 0 ? 1 : -1));
    }

    touchPointerId = null;
    touchDistance = 0;
  };

  eventCarousel.addEventListener("pointerup", finishTouchSwipe);
  eventCarousel.addEventListener("pointercancel", () => {
    touchPointerId = null;
    touchDistance = 0;
  });

  eventCarousel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") goToEvent(activeIndex - 1);
    if (event.key === "ArrowRight") goToEvent(activeIndex + 1);
  });
  window.addEventListener("resize", renderEventCarousel);
  eventCarousel.classList.add("is-ready");
  renderEventCarousel();
}

if (lightbox && lightboxImage && lightboxClose) {
  const closeLightbox = () => {
    lightbox.classList.remove("is-open");
    lightbox.hidden = true;
    document.body.classList.remove("lightbox-open");
    lightboxImage.removeAttribute("src");
    lightboxImage.alt = "";
  };

  document.querySelectorAll("[data-lightbox-open]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      lightboxImage.src = trigger.dataset.lightboxSrc;
      lightboxImage.alt = trigger.dataset.lightboxAlt;
      lightbox.hidden = false;
      lightbox.classList.add("is-open");
      document.body.classList.add("lightbox-open");
      lightboxClose.focus();
    });
  });

  lightboxClose.addEventListener("click", () => {
    closeLightbox();
  });

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !lightbox.hidden) {
      closeLightbox();
    }
  });
}
