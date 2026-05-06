const header = document.querySelector("[data-header]");
const menuToggle = document.querySelector("[data-menu-toggle]");
const mobileNav = document.querySelector("[data-mobile-nav]");
const signupForm = document.querySelector("[data-signup-form]");
const formNote = document.querySelector("[data-form-note]");
const lightbox = document.querySelector("[data-lightbox]");
const lightboxImage = document.querySelector("[data-lightbox-image]");
const lightboxClose = document.querySelector("[data-lightbox-close]");

const syncHeader = () => {
  header.classList.toggle("is-scrolled", window.scrollY > 18);
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

if (signupForm) {
  signupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    formNote.textContent =
      "Thanks. This static form is ready to connect to Netlify Forms; for now, send your message to Info@novanorthshore.com.";
    signupForm.reset();
  });
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
