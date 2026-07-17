(() => {
  // ---- Tunables (from the Codrops 3D carousel) --------------------------
  const MAX_ROTATION = 30;   // deg, page-flip strength
  const MAX_DEPTH = 150;     // px, translateZ toward camera at center
  const MIN_SCALE = 0.78;    // size of side cards
  const SCALE_RANGE = 0.24;  // focus boost at center
  const GAP = 40;            // px spacing between cards
  const FRICTION = 0.9;      // velocity decay (lower = more friction)
  const WHEEL_SENS = 0.55;
  const DRAG_SENS = 1.15;
  const SNAP_STOP_V = 18;    // px/s below which we snap to nearest card
  const REACTIVE_BG = false;  // flip to true to enable the canvas gradient

  const FALLBACK_PALETTE = { r1: 244, g1: 205, b1: 92, r2: 214, g2: 210, b2: 196 };

  const votingPhotoWidth = () => {
    const cardW = Math.min(window.innerWidth * 0.92, 560);
    const dpr = Math.min(3, window.devicePixelRatio || 2);
    return Math.min(2000, Math.ceil(cardW * dpr));
  };

  const votingPhotoUrl = (url, width = votingPhotoWidth()) => {
    const raw = String(url || "").trim();
    if (!raw || !raw.includes("res.cloudinary.com/")) {
      return raw;
    }
    if (raw.includes("/upload/")) {
      return raw.replace(
        "/upload/",
        `/upload/q_auto:best,w_${width},c_limit,f_auto/`,
      );
    }
    return raw;
  };

  const votingPhotoSrcSet = (url) => {
    const raw = String(url || "").trim();
    if (!raw || !raw.includes("res.cloudinary.com/")) {
      return "";
    }
    const widths = [640, 960, 1280, 1600].filter((w) => w <= 2000);
    return widths
      .map((w) => `${votingPhotoUrl(raw, w)} ${w}w`)
      .join(", ");
  };

  const statusEl = document.querySelector("[data-voting-status]");
  const progressEl = document.querySelector("[data-voting-progress]");
  const progressTextEl = document.querySelector("[data-voting-progress-text]");
  const progressFillEl = document.querySelector("[data-voting-progress-fill]");
  const categoriesEl = document.querySelector("[data-voting-categories]");
  const closedEl = document.querySelector("[data-voting-closed]");
  const successEl = document.querySelector("[data-voting-success]");
  const submitBar = document.querySelector("[data-voting-submit-bar]");
  const submitButton = document.querySelector("[data-voting-submit]");
  const modal = document.querySelector("[data-voting-modal]");
  const verifyForm = document.querySelector("[data-voting-verify-form]");
  const phoneInput = document.querySelector("[data-voting-phone]");
  const codeWrap = document.querySelector("[data-voting-code-wrap]");
  const codeInput = document.querySelector("[data-voting-code]");
  const sendCodeButton = document.querySelector("[data-voting-send-code]");
  const confirmButton = document.querySelector("[data-voting-confirm]");
  const modalStatus = document.querySelector("[data-voting-modal-status]");

  if (!categoriesEl || !submitButton) {
    return;
  }

  let categories = [];
  let cars = [];
  const selections = {};
  const carousels = {};
  const paletteCache = {};
  let rafId = null;
  let lastFrame = 0;

  // ---- Small helpers ----------------------------------------------------
  const mod = (n, m) => ((n % m) + m) % m;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  const ringDelta = (target, current, track) => {
    let d = mod(target - current, track);
    if (d > track / 2) {
      d -= track;
    }
    return d;
  };

  const shuffle = (list) => {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const debounce = (fn, wait) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  };

  const carTitle = (car) => {
    const bits = [];
    if (car.carNumber) {
      bits.push(`#${car.carNumber}`);
    }
    bits.push(car.vehicleLabel || "Show car");
    return bits.join(" · ");
  };

  const setStatus = (message, type = "") => {
    if (!statusEl) {
      return;
    }
    statusEl.textContent = message || "";
    statusEl.classList.toggle("is-error", type === "error");
    statusEl.hidden = !message;
  };

  const setModalStatus = (message, type = "") => {
    if (!modalStatus) {
      return;
    }
    modalStatus.textContent = message || "";
    modalStatus.classList.toggle("is-error", type === "error");
    modalStatus.classList.toggle("is-success", type === "success");
  };

  const selectedCount = () => categories.filter((category) => selections[category.id]).length;

  const syncProgress = () => {
    const count = selectedCount();
    const total = categories.length || 3;

    if (progressEl) {
      progressEl.hidden = categories.length === 0;
    }
    if (progressTextEl) {
      progressTextEl.textContent = `${count} of ${total} selected`;
    }
    if (progressFillEl) {
      progressFillEl.style.width = `${(count / total) * 100}%`;
    }
    if (submitBar) {
      submitBar.hidden = categories.length === 0;
    }

    submitButton.disabled = count < total;
    submitButton.textContent = count < total
      ? `Select ${total - count} more`
      : "Submit votes";
  };

  // ---- Color extraction -------------------------------------------------
  const extractColors = (img) => {
    if (!img || !img.naturalWidth) {
      return { ...FALLBACK_PALETTE };
    }

    const MAX = 48;
    const ratio = img.naturalWidth / img.naturalHeight;
    const tw = ratio >= 1 ? MAX : Math.max(16, Math.round(MAX * ratio));
    const th = ratio >= 1 ? Math.max(16, Math.round(MAX / ratio)) : MAX;

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    let data;
    try {
      ctx.drawImage(img, 0, 0, tw, th);
      data = ctx.getImageData(0, 0, tw, th).data;
    } catch (error) {
      return { ...FALLBACK_PALETTE };
    }

    let rA = 0;
    let gA = 0;
    let bA = 0;
    let n = 0;
    let rS = 0;
    let gS = 0;
    let bS = 0;
    let wS = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 125) {
        continue;
      }

      rA += r;
      gA += g;
      bA += b;
      n += 1;

      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const weight = sat + 6;
      rS += r * weight;
      gS += g * weight;
      bS += b * weight;
      wS += weight;
    }

    if (!n) {
      return { ...FALLBACK_PALETTE };
    }

    const soften = (r, g, b, amt) => ({
      r: r + (255 - r) * amt,
      g: g + (255 - g) * amt,
      b: b + (255 - b) * amt,
    });

    const vivid = soften(rS / wS, gS / wS, bS / wS, 0.14);
    const avg = soften(rA / n, gA / n, bA / n, 0.32);

    return {
      r1: vivid.r,
      g1: vivid.g,
      b1: vivid.b,
      r2: avg.r,
      g2: avg.g,
      b2: avg.b,
    };
  };

  const buildPalette = () => {
    cars.forEach((car) => {
      if (paletteCache[car.applicationId]) {
        return;
      }
      const state = Object.values(carousels).find((s) => s.byId[car.applicationId]);
      const img = state?.byId[car.applicationId]?.img;
      if (img && img.complete && img.naturalWidth) {
        paletteCache[car.applicationId] = extractColors(img);
      }
    });
  };

  const paletteFor = (applicationId) => paletteCache[applicationId] || { ...FALLBACK_PALETTE };

  // ---- Canvas background ------------------------------------------------
  const resizeBG = (state) => {
    if (!state.bg || !state.ctx) {
      return;
    }
    const cw = state.bg.clientWidth;
    const ch = state.bg.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    state.bg.width = Math.max(1, Math.round(cw * dpr));
    state.bg.height = Math.max(1, Math.round(ch * dpr));
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.bgW = cw;
    state.bgH = ch;
  };

  const paintBG = (state, time) => {
    const { ctx } = state;
    if (!ctx) {
      return;
    }
    const w = state.bgW;
    const h = state.bgH;
    const p = state.palette;
    const t = time * 0.00013;

    ctx.fillStyle = "#f4f2ec";
    ctx.fillRect(0, 0, w, h);

    const blob = (cx, cy, radius, r, g, b, alpha) => {
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grd.addColorStop(0, `rgba(${r | 0},${g | 0},${b | 0},${alpha})`);
      grd.addColorStop(1, `rgba(${r | 0},${g | 0},${b | 0},0)`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);
    };

    const maxDim = Math.max(w, h);
    blob(
      w * (0.5 + 0.28 * Math.sin(t * 1.1)),
      h * (0.42 + 0.22 * Math.cos(t * 0.9)),
      maxDim * 0.58,
      p.r1, p.g1, p.b1, 0.72,
    );
    blob(
      w * (0.5 + 0.3 * Math.cos(t * 0.8 + 1.4)),
      h * (0.56 + 0.24 * Math.sin(t * 1.3 + 0.5)),
      maxDim * 0.5,
      p.r2, p.g2, p.b2, 0.66,
    );
  };

  const lerpPalette = (state, dt) => {
    const p = state.palette;
    const target = state.targetPalette;
    const k = Math.min(1, dt * 3.4);
    let settled = true;
    Object.keys(target).forEach((key) => {
      const diff = target[key] - p[key];
      if (Math.abs(diff) > 0.6) {
        settled = false;
      }
      p[key] += diff * k;
    });
    return settled;
  };

  // ---- Carousel maths ---------------------------------------------------
  const transformForScreenX = (screenX, vwHalf) => {
    const norm = clamp(screenX / vwHalf, -1, 1);
    const absN = Math.abs(norm);
    const inv = 1 - absN;
    const ry = -norm * MAX_ROTATION;
    const tz = inv * MAX_DEPTH;
    const scale = MIN_SCALE + inv * SCALE_RANGE;
    return {
      transform: `translate3d(${screenX.toFixed(2)}px,-50%,${tz.toFixed(2)}px) rotateY(${ry.toFixed(2)}deg) scale(${scale.toFixed(3)})`,
      z: tz,
    };
  };

  const measure = (state) => {
    const first = state.cards[0];
    if (!first) {
      return;
    }
    const cardW = first.el.offsetWidth || 260;
    state.step = cardW + GAP;
    state.track = state.step * state.cards.length;
    state.vwHalf = (state.stage.clientWidth || window.innerWidth) / 2;
    state.cards.forEach((card, index) => {
      card.x = index * state.step;
    });
  };

  const applyTransforms = (state) => {
    const half = state.track / 2;
    state.cards.forEach((card) => {
      const pos = mod(card.x - state.scrollX + half, state.track) - half;
      const t = transformForScreenX(pos, state.vwHalf);
      card.el.style.transform = t.transform;
      card.el.style.zIndex = String(200 + Math.round(t.z));
    });
  };

  const nearestScrollX = (state) => mod(Math.round(state.scrollX / state.step) * state.step, state.track);

  const activeIndexFor = (state) => {
    const half = state.track / 2;
    let best = 0;
    let bestDist = Infinity;
    state.cards.forEach((card, index) => {
      const pos = mod(card.x - state.scrollX + half, state.track) - half;
      const dist = Math.abs(pos);
      if (dist < bestDist) {
        bestDist = dist;
        best = index;
      }
    });
    return best;
  };

  const refreshPick = (state) => {
    const car = state.order[state.activeIndex];
    if (!car) {
      return;
    }
    if (state.pickLabel) {
      state.pickLabel.textContent = carTitle(car);
    }
    if (state.pickButton) {
      const picked = selections[state.categoryId] === car.applicationId;
      state.pickButton.classList.toggle("is-picked", picked);
      state.pickButton.textContent = picked ? "Picked" : "Pick this car";
    }
  };

  const updateActive = (state) => {
    const index = activeIndexFor(state);
    if (index === state.activeIndex) {
      return;
    }
    state.activeIndex = index;

    state.cards.forEach((card, i) => {
      card.el.classList.toggle("is-active", i === index);
    });

    const car = state.order[index];
    if (car) {
      state.targetPalette = { ...paletteFor(car.applicationId) };
    }
    refreshPick(state);
  };

  const updateCarousel = (state, dt, time) => {
    if (state.dragging) {
      state.needsMotionPaint = true;
    } else if (state.snapTarget != null) {
      const diff = ringDelta(state.snapTarget, state.scrollX, state.track);
      state.scrollX = mod(state.scrollX + diff * Math.min(1, dt * 12), state.track);
      if (Math.abs(diff) < 0.5) {
        state.scrollX = state.snapTarget;
        state.snapTarget = null;
      }
    } else if (state.vX !== 0) {
      state.scrollX = mod(state.scrollX + state.vX * dt, state.track);
      state.vX *= Math.pow(FRICTION, dt * 60);
      if (Math.abs(state.vX) < SNAP_STOP_V) {
        state.vX = 0;
        state.snapTarget = nearestScrollX(state);
      }
    }

    applyTransforms(state);
    updateActive(state);

    if (REACTIVE_BG && state.ctx) {
      const settled = lerpPalette(state, dt);
      const moving = state.dragging || state.vX !== 0 || state.snapTarget != null || !settled;
      if (moving || time - state.lastPaint > 60) {
        paintBG(state, time);
        state.lastPaint = time;
      }
    }
  };

  // ---- Global loop + visibility ----------------------------------------
  const tick = (time) => {
    const dt = lastFrame ? Math.min(0.05, (time - lastFrame) / 1000) : 0;
    lastFrame = time;

    categories.forEach((category) => {
      const state = carousels[category.id];
      if (state && state.visible) {
        updateCarousel(state, dt, time);
      }
    });

    rafId = requestAnimationFrame(tick);
  };

  const startLoop = () => {
    if (rafId == null) {
      lastFrame = 0;
      rafId = requestAnimationFrame(tick);
    }
  };

  // ---- Picking ----------------------------------------------------------
  const pickActive = (categoryId) => {
    const state = carousels[categoryId];
    if (!state) {
      return;
    }
    const car = state.order[state.activeIndex];
    if (!car) {
      return;
    }

    selections[categoryId] = car.applicationId;
    state.cards.forEach((card) => {
      const chosen = card.car.applicationId === car.applicationId;
      card.el.classList.toggle("is-chosen", chosen);
      card.el.setAttribute("aria-pressed", chosen ? "true" : "false");
    });

    refreshPick(state);
    syncProgress();
  };

  const goTo = (state, index) => {
    state.vX = 0;
    state.snapTarget = mod(index * state.step, state.track);
  };

  // ---- Build DOM --------------------------------------------------------
  const createCard = (state, car, index) => {
    const el = document.createElement("article");
    el.className = "voting-card";
    el.dataset.card = "";
    el.dataset.categoryId = state.categoryId;
    el.dataset.index = String(index);
    el.setAttribute("role", "button");
    el.setAttribute("aria-pressed", "false");

    const frame = document.createElement("div");
    frame.className = "voting-card__frame";

    const img = new Image();
    img.className = "voting-card__img";
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.loading = "eager";
    img.fetchPriority = "high";
    img.draggable = false;
    img.alt = car.vehicleLabel || "Show car";
    img.addEventListener("error", () => {
      el.classList.add("has-error");
    });
    const photoW = votingPhotoWidth();
    img.sizes = "(max-width: 720px) 92vw, 560px";
    const srcSet = votingPhotoSrcSet(car.photoUrl);
    if (srcSet) {
      img.srcset = srcSet;
    }
    img.src = votingPhotoUrl(car.photoUrl, photoW);

    const fallback = document.createElement("div");
    fallback.className = "voting-card__fallback";
    fallback.textContent = carTitle(car);

    const badge = document.createElement("span");
    badge.className = "voting-card__badge";
    badge.textContent = "Picked";

    const meta = document.createElement("div");
    meta.className = "voting-card__meta";
    const title = document.createElement("strong");
    title.textContent = carTitle(car);
    meta.appendChild(title);
    if (car.instagram) {
      const ig = document.createElement("span");
      ig.className = "voting-card__ig";
      ig.textContent = `@${String(car.instagram).replace(/^@/, "")}`;
      meta.appendChild(ig);
    }

    frame.append(img, fallback, badge, meta);
    el.appendChild(frame);

    return { el, img, car, x: index * state.step };
  };

  const buildCategory = (category) => {
    const order = shuffle(cars);

    const section = document.createElement("section");
    section.className = "voting-category";
    section.dataset.categorySection = category.id;

    const heading = document.createElement("div");
    heading.className = "voting-category-heading";
    heading.innerHTML = `
      <p class="eyebrow dark">Category</p>
      <h2></h2>
      <p class="voting-category-hint">Drag or use the arrows, then pick the centered car.</p>
    `;
    heading.querySelector("h2").textContent = category.label;

    const stage = document.createElement("div");
    stage.className = "voting-stage";

    const cardsRoot = document.createElement("div");
    cardsRoot.className = "voting-cards";

    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "voting-arrow voting-arrow--prev";
    prev.dataset.arrow = "prev";
    prev.setAttribute("aria-label", "Previous car");
    prev.innerHTML = "<span aria-hidden=\"true\">&#8249;</span>";

    const next = document.createElement("button");
    next.type = "button";
    next.className = "voting-arrow voting-arrow--next";
    next.dataset.arrow = "next";
    next.setAttribute("aria-label", "Next car");
    next.innerHTML = "<span aria-hidden=\"true\">&#8250;</span>";

    let bg = null;
    let ctx = null;
    if (REACTIVE_BG) {
      bg = document.createElement("canvas");
      bg.className = "voting-bg";
      bg.setAttribute("aria-hidden", "true");
      ctx = bg.getContext("2d");
      stage.appendChild(bg);
    }

    stage.append(cardsRoot, prev, next);

    const pickRow = document.createElement("div");
    pickRow.className = "voting-pick-row";
    const pickLabel = document.createElement("p");
    pickLabel.className = "voting-pick-label";
    const pickButton = document.createElement("button");
    pickButton.type = "button";
    pickButton.className = "voting-pick-button";
    pickButton.dataset.pick = category.id;
    pickButton.textContent = "Pick this car";
    pickRow.append(pickLabel, pickButton);

    section.append(heading, stage, pickRow);
    categoriesEl.appendChild(section);

    const state = {
      categoryId: category.id,
      order,
      cards: [],
      byId: {},
      scrollX: 0,
      vX: 0,
      step: 1,
      track: 1,
      vwHalf: window.innerWidth / 2,
      activeIndex: -1,
      snapTarget: null,
      dragging: false,
      visible: true,
      stage,
      cardsRoot,
      bg,
      ctx,
      bgW: 0,
      bgH: 0,
      lastPaint: 0,
      palette: { ...FALLBACK_PALETTE },
      targetPalette: { ...FALLBACK_PALETTE },
      pickLabel,
      pickButton,
    };

    const fragment = document.createDocumentFragment();
    order.forEach((car, index) => {
      const card = createCard(state, car, index);
      state.cards.push(card);
      state.byId[car.applicationId] = card;
      fragment.appendChild(card.el);
    });
    cardsRoot.appendChild(fragment);

    carousels[category.id] = state;
    attachStageInput(state);
    return state;
  };

  // ---- Input ------------------------------------------------------------
  const attachStageInput = (state) => {
    const { stage } = state;
    let startX = 0;
    let startScroll = 0;
    let lastX = 0;
    let lastMoveT = 0;
    let moved = 0;
    let downCard = null;

    stage.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".voting-arrow")) {
        return;
      }
      state.dragging = true;
      state.snapTarget = null;
      state.vX = 0;
      startX = event.clientX;
      lastX = event.clientX;
      startScroll = state.scrollX;
      lastMoveT = performance.now();
      moved = 0;
      downCard = event.target.closest("[data-card]");
      stage.classList.add("is-dragging");
      stage.setPointerCapture?.(event.pointerId);
    });

    stage.addEventListener("pointermove", (event) => {
      if (!state.dragging) {
        return;
      }
      const dx = event.clientX - lastX;
      moved += Math.abs(dx);
      lastX = event.clientX;

      state.scrollX = mod(startScroll - (event.clientX - startX) * DRAG_SENS, state.track);

      const now = performance.now();
      const dtMove = Math.max(1, now - lastMoveT) / 1000;
      state.vX = (-dx * DRAG_SENS) / dtMove;
      lastMoveT = now;
    });

    const endDrag = (event) => {
      if (!state.dragging) {
        return;
      }
      state.dragging = false;
      stage.classList.remove("is-dragging");

      if (moved < 6) {
        // Treat as a tap.
        state.vX = 0;
        if (downCard) {
          const index = Number(downCard.dataset.index);
          if (index === state.activeIndex) {
            pickActive(state.categoryId);
          } else {
            goTo(state, index);
          }
        } else {
          state.snapTarget = nearestScrollX(state);
        }
      }
      downCard = null;
    };

    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    stage.addEventListener("lostpointercapture", endDrag);

    stage.addEventListener("wheel", (event) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
        return; // let the page scroll vertically
      }
      event.preventDefault();
      state.snapTarget = null;
      state.vX += event.deltaX * WHEEL_SENS * 18;
    }, { passive: false });
  };

  categoriesEl.addEventListener("click", (event) => {
    const arrow = event.target.closest("[data-arrow]");
    if (arrow) {
      const section = arrow.closest("[data-category-section]");
      const state = carousels[section?.dataset.categorySection];
      if (state) {
        goTo(state, state.activeIndex + (arrow.dataset.arrow === "next" ? 1 : -1));
      }
      return;
    }

    const pick = event.target.closest("[data-pick]");
    if (pick) {
      pickActive(pick.dataset.pick);
    }
  });

  // ---- Startup ----------------------------------------------------------
  const waitForImages = () => {
    const imgs = [];
    Object.values(carousels).forEach((state) => {
      state.cards.forEach((card) => imgs.push(card.img));
    });
    return Promise.all(imgs.map((img) => {
      if (img.complete) {
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    }));
  };

  const decodeAllImages = () => {
    const tasks = [];
    Object.values(carousels).forEach((state) => {
      state.cards.forEach((card) => {
        if (typeof card.img.decode === "function") {
          tasks.push(card.img.decode().catch(() => {}));
        }
      });
    });
    return Promise.allSettled(tasks);
  };

  const measureAll = () => {
    Object.values(carousels).forEach((state) => {
      measure(state);
      state.scrollX = mod(Math.floor(state.cards.length / 2) * state.step, state.track);
      resizeBG(state);
      applyTransforms(state);
      state.activeIndex = -1;
      updateActive(state);
      if (REACTIVE_BG && state.ctx) {
        state.palette = { ...state.targetPalette };
        paintBG(state, performance.now());
      }
    });
  };

  const observeVisibility = () => {
    if (!("IntersectionObserver" in window)) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const state = carousels[entry.target.dataset.categorySection];
        if (state) {
          state.visible = entry.isIntersecting;
        }
      });
    }, { rootMargin: "120px 0px" });

    categoriesEl.querySelectorAll("[data-category-section]").forEach((section) => observer.observe(section));
  };

  const buildAll = async () => {
    categoriesEl.innerHTML = "";
    Object.keys(carousels).forEach((key) => delete carousels[key]);

    categories.forEach((category) => buildCategory(category));

    // First measure so cards have positions before images resolve.
    measureAll();

    await waitForImages();
    await decodeAllImages();

    // Force a paint pass so textures are ready.
    Object.values(carousels).forEach((state) => {
      state.cards.forEach((card) => {
        void card.el.offsetHeight;
      });
    });

    if (REACTIVE_BG) {
      buildPalette();
    }
    measureAll();

    Object.values(carousels).forEach((state) => {
      state.stage.classList.add("is-ready");
    });

    observeVisibility();
    startLoop();
  };

  const loadCars = async () => {
    setStatus("Loading show cars…");

    try {
      const response = await fetch("/.netlify/functions/get-voting-cars");
      const result = await response.json().catch(() => null);

      if (!response.ok || !result) {
        throw new Error(result?.error || "Unable to load show cars.");
      }

      if (!result.open) {
        setStatus("");
        if (closedEl) {
          closedEl.hidden = false;
        }
        if (categoriesEl) {
          categoriesEl.hidden = true;
        }
        if (submitBar) {
          submitBar.hidden = true;
        }
        return;
      }

      categories = Array.isArray(result.categories) ? result.categories : [];
      cars = Array.isArray(result.cars) ? result.cars : [];

      if (!cars.length) {
        setStatus("No approved show cars are ready for voting yet.", "error");
        return;
      }

      setStatus("");
      await buildAll();
      syncProgress();
    } catch (error) {
      setStatus(error.message || "Unable to load show cars.", "error");
    }
  };

  window.addEventListener("resize", debounce(() => {
    Object.values(carousels).forEach((state) => {
      measure(state);
      resizeBG(state);
      applyTransforms(state);
      if (REACTIVE_BG && state.ctx) {
        paintBG(state, performance.now());
      }
    });
  }, 140));

  // ---- Modal + verification (unchanged flow) ----------------------------
  const openModal = () => {
    if (!modal) {
      return;
    }
    modal.hidden = false;
    document.body.classList.add("voting-modal-open");
    setModalStatus("");
    phoneInput?.focus();
  };

  const closeModal = () => {
    if (!modal) {
      return;
    }
    modal.hidden = true;
    document.body.classList.remove("voting-modal-open");
  };

  const showSuccess = () => {
    closeModal();
    if (categoriesEl) {
      categoriesEl.hidden = true;
    }
    if (submitBar) {
      submitBar.hidden = true;
    }
    if (progressEl) {
      progressEl.hidden = true;
    }
    if (statusEl) {
      statusEl.hidden = true;
    }
    if (successEl) {
      successEl.hidden = false;
    }
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  submitButton.addEventListener("click", () => {
    if (selectedCount() < categories.length) {
      return;
    }
    openModal();
  });

  document.querySelectorAll("[data-voting-modal-close]").forEach((element) => {
    element.addEventListener("click", closeModal);
  });

  sendCodeButton?.addEventListener("click", async () => {
    const phone = phoneInput?.value || "";
    setModalStatus("");
    sendCodeButton.disabled = true;
    sendCodeButton.textContent = "Sending…";

    try {
      const response = await fetch("/.netlify/functions/send-vote-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        if (result?.alreadyVoted) {
          throw new Error("This phone number has already voted.");
        }
        throw new Error(result?.error || "Unable to send code.");
      }

      if (codeWrap) {
        codeWrap.hidden = false;
      }
      if (confirmButton) {
        confirmButton.disabled = false;
      }
      codeInput?.focus();
      setModalStatus(`Code sent to ${result.phoneMasked}.`, "success");
    } catch (error) {
      setModalStatus(error.message, "error");
    } finally {
      sendCodeButton.disabled = false;
      sendCodeButton.textContent = "Send code";
    }
  });

  verifyForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const phone = phoneInput?.value || "";
    const code = codeInput?.value || "";

    if (confirmButton) {
      confirmButton.disabled = true;
      confirmButton.textContent = "Submitting…";
    }
    setModalStatus("");

    try {
      const response = await fetch("/.netlify/functions/submit-votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, selections }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        if (result?.alreadyVoted) {
          throw new Error("This phone number has already voted.");
        }
        throw new Error(result?.error || "Unable to submit votes.");
      }

      showSuccess();
    } catch (error) {
      setModalStatus(error.message, "error");
      if (confirmButton) {
        confirmButton.disabled = false;
        confirmButton.textContent = "Confirm votes";
      }
    }
  });

  loadCars();
})();
