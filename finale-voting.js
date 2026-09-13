(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const status = $('[data-voting-status]');
  const categoriesRoot = $('[data-voting-categories]');
  const jump = $('[data-voting-jump]');
  const progress = $('[data-voting-progress]');
  const progressText = $('[data-voting-progress-text]');
  const progressFill = $('[data-voting-progress-fill]');
  const ballotBar = $('[data-voting-submit-bar]');
  const reviewButton = $('[data-voting-review]');
  const reviewDialog = $('[data-voting-review-dialog]');
  const reviewList = $('[data-voting-review-list]');
  const verifyDialog = $('[data-voting-verify-dialog]');
  const verifyForm = $('[data-voting-verify-form]');
  const phoneInput = $('[data-voting-phone]');
  const codeInput = $('[data-voting-code]');
  const codeWrap = $('[data-voting-code-wrap]');
  const sendButton = $('[data-voting-send-code]');
  const confirmButton = $('[data-voting-confirm]');
  const formStatus = $('[data-voting-modal-status]');
  const selections = {};
  const states = new Map();
  let categories = [];
  let cars = [];
  let previousFocus = null;
  let codeSentTo = '';

  const photoUrl = (url, width) => {
    if (!/^https:\/\/res\.cloudinary\.com\//.test(url || '')) return url || '';
    return url.replace('/image/upload/', `/image/upload/f_auto,q_auto,w_${width},c_limit/`);
  };

  const igHandle = (value) => {
    const handle = String(value || '').replace(/^@/, '').trim();
    return handle ? `@${handle}` : '';
  };

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
    status.hidden = !message;
  };

  const selectedCount = () => categories.filter(({ id }) => selections[id]).length;

  const updateBallot = () => {
    const count = selectedCount();
    const total = categories.length || 3;
    progressText.textContent = `${count} of ${total} selected`;
    progressFill.style.width = `${total ? (count / total) * 100 : 0}%`;
    reviewButton.disabled = count !== total || total === 0;
    for (const [id, state] of states) {
      state.section.classList.toggle('has-selection', Boolean(selections[id]));
      state.section.querySelectorAll('.fv-card').forEach((card) => {
        const picked = card.dataset.carId === selections[id];
        card.classList.toggle('is-selected', picked);
      });
      const car = state.matching[state.index];
      const picked = car?.applicationId === selections[id];
      state.pick.textContent = picked ? 'Selected ✓' : 'Pick this car';
      state.pick.classList.toggle('is-picked', picked);
      state.pick.setAttribute('aria-pressed', String(picked));
    }
  };

  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  };

  const makeFact = (label, key) => {
    const item = make('div', key === 'ig' ? 'fv-pick-fact fv-pick-fact--instagram' : 'fv-pick-fact');
    item.append(make('span', 'fv-pick-fact-label', label), make('span', 'fv-pick-fact-value'));
    item.lastElementChild.dataset.pickFact = key;
    return item;
  };

  // Curved ring geometry and drag sensitivity from the original Block Party carousel.
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mod = (n, m) => ((n % m) + m) % m;
  const ringDelta = (target, current, length) => mod(target - current + length / 2, length) - length / 2;

  const centerCard = (state, index, behavior = 'smooth') => {
    if (!state.matching.length) return;
    const target = mod(index, state.matching.length) * state.step;
    cancelAnimationFrame(state.frame);
    if (reducedMotion.matches || behavior === 'auto') {
      state.scrollX = target;
      layoutCards(state);
      return;
    }
    let last = performance.now();
    const tick = (now) => {
      const delta = ringDelta(target, state.scrollX, state.length);
      state.scrollX = mod(state.scrollX + delta * Math.min(1, (now - last) / 1000 * 12), state.length);
      last = now;
      if (Math.abs(delta) < .5) state.scrollX = target;
      layoutCards(state);
      if (Math.abs(delta) >= .5) state.frame = requestAnimationFrame(tick);
    };
    state.frame = requestAnimationFrame(tick);
  };

  const layoutCards = (state) => {
    if (!state.matching.length) return;
    let closest = 0;
    let distance = Infinity;
    [...state.track.children].forEach((card, index) => {
      const x = ringDelta(index * state.step, state.scrollX, state.length);
      const norm = Math.max(-1, Math.min(1, x / (state.track.clientWidth / 2 || 1)));
      const depth = (1 - Math.abs(norm)) * 150;
      card.style.transform = `translate3d(${x}px,-50%,${depth}px) rotateY(${-norm * 30}deg) scale(${.78 + (1 - Math.abs(norm)) * .24})`;
      card.style.zIndex = String(200 + Math.round(depth));
      card.style.visibility = Math.abs(x) < state.track.clientWidth / 2 + state.step ? 'visible' : 'hidden';
      if (Math.abs(x) < distance) {
        distance = Math.abs(x);
        closest = index;
      }
    });
    updateCenter(state, closest);
  };

  const measure = (state) => {
    const width = window.innerWidth;
    const gap = width < 480 ? Math.round(Math.max(44, Math.min(width * .16, 64))) : width < 720 ? 72 : 90;
    state.step = (state.track.firstElementChild?.offsetWidth || 300) + gap;
    state.length = state.step * state.matching.length;
    centerCard(state, state.index, 'auto');
  };

  const updateCenter = (state, index) => {
    const total = state.track.children.length;
    state.index = Math.max(0, Math.min(index, total - 1));
    if (state.renderedIndex === state.index) return;
    state.renderedIndex = state.index;
    state.counter.textContent = total ? `${state.index + 1} / ${total}` : '0 / 0';
    [...state.track.children].forEach((card, cardIndex) => {
      card.classList.toggle('is-centered', cardIndex === state.index);
    });
    state.prev.disabled = state.next.disabled = total < 2;
    const car = state.matching[state.index];
    state.detail.hidden = !car;
    if (car) {
      state.pickYear.textContent = car.vehicleYear || '—';
      state.pickMake.textContent = car.vehicleMake || '—';
      state.pickModel.textContent = car.vehicleModel || '—';
      state.pickIg.textContent = igHandle(car.instagram) || '—';
      state.pick.setAttribute('aria-label', `Pick ${car.vehicleLabel} for ${state.category.label}`);
    }
    updateBallot();
  };

  const buildCard = (car) => {
    const card = make('article', 'fv-card');
    card.dataset.carId = car.applicationId;
    const photo = make('div', 'fv-card-photo');
    const img = make('img');
    img.src = photoUrl(car.photoUrl, 760);
    img.srcset = [420, 760, 1100].map((width) => `${photoUrl(car.photoUrl, width)} ${width}w`).join(', ');
    img.sizes = '(max-width: 720px) 90vw, 720px';
    img.alt = car.vehicleLabel;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    const fallback = make('span', 'fv-photo-fallback', 'Photo unavailable');
    fallback.hidden = true;
    img.addEventListener('error', () => {
      img.hidden = true;
      fallback.hidden = false;
    });
    if (!car.photoUrl) {
      img.hidden = true;
      fallback.hidden = false;
    }
    const badge = make('span', 'fv-selected-badge', 'Picked');
    const meta = make('div', 'fv-card-meta');
    meta.append(make('strong', '', car.vehicleLabel));
    const handle = igHandle(car.instagram);
    if (handle) meta.append(make('span', 'fv-card-ig', handle));
    photo.append(img, fallback, badge, meta);
    card.append(photo);
    return card;
  };

  const renderCards = (state, query = '') => {
    const needle = query.toLowerCase().trim();
    const matching = state.cars.filter((car) => {
      if (!needle) return true;
      return [car.vehicleLabel, car.vehicleYear, car.vehicleMake, car.vehicleModel]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
    cancelAnimationFrame(state.frame);
    state.matching = matching;
    state.renderedIndex = null;
    state.track.replaceChildren(...matching.map((car) => buildCard(car)));
    state.empty.hidden = matching.length > 0;
    state.track.hidden = matching.length === 0;
    state.stage.classList.toggle('is-empty', matching.length === 0);
    const pickedIndex = matching.findIndex((car) => car.applicationId === selections[state.category.id]);
    updateCenter(state, pickedIndex >= 0 ? pickedIndex : 0);
    requestAnimationFrame(() => measure(state));
    updateBallot();
  };

  const buildCategory = (category, number) => {
    const section = make('section', 'fv-category');
    section.id = `vote-${category.id}`;
    section.setAttribute('aria-labelledby', `title-${category.id}`);

    const top = make('div', 'fv-category-top');
    top.append(make('p', 'fv-kicker', `Category 0${number + 1}`));
    const title = make('h2', '', category.label);
    title.id = `title-${category.id}`;
    top.append(title);
    top.append(make(
      'p',
      'fv-category-count',
      `${cars.filter((car) => car.eligibleCategoryIds.includes(category.id)).length} cars · Swipe or use the arrows, then pick the centered car.`,
    ));

    const search = make('input', 'fv-search');
    search.type = 'search';
    search.placeholder = 'Search by year, make, or model';
    search.setAttribute('aria-label', `Search cars in ${category.label}`);

    const track = make('div', 'fv-track');
    track.tabIndex = 0;
    track.setAttribute('role', 'region');
    track.setAttribute('aria-label', `${category.label} cars. Swipe or use arrow keys to browse.`);

    const empty = make('p', 'fv-empty', 'No cars match that search.');
    empty.hidden = true;

    const prev = make('button', 'fv-arrow fv-arrow--prev', '‹');
    const next = make('button', 'fv-arrow fv-arrow--next', '›');
    prev.type = next.type = 'button';
    prev.setAttribute('aria-label', `Previous ${category.label} car`);
    next.setAttribute('aria-label', `Next ${category.label} car`);

    const stage = make('div', 'fv-stage');
    stage.append(track, prev, next);

    const counter = make('span', 'fv-counter');

    const detail = make('div', 'fv-pick-row');
    const pickCard = make('div', 'fv-pick-card');
    const facts = make('div', 'fv-pick-facts');
    const yearFact = makeFact('Year', 'year');
    const makeFactEl = makeFact('Make', 'make');
    const modelFact = makeFact('Model', 'model');
    const igFact = makeFact('Instagram', 'ig');
    facts.append(yearFact, makeFactEl, modelFact, igFact);
    const pick = make('button', 'fv-pick', 'Pick this car');
    pick.type = 'button';
    pickCard.append(facts, pick);
    detail.append(pickCard);

    const note = make('p', 'fv-live');
    note.setAttribute('aria-live', 'polite');

    section.append(top, search, stage, empty, counter, detail, note);
    categoriesRoot.append(section);

    const state = {
      category,
      section,
      cars: cars.filter((car) => car.eligibleCategoryIds.includes(category.id)),
      matching: [],
      track,
      stage,
      empty,
      prev,
      next,
      counter,
      detail,
      pickYear: yearFact.querySelector('[data-pick-fact="year"]'),
      pickMake: makeFactEl.querySelector('[data-pick-fact="make"]'),
      pickModel: modelFact.querySelector('[data-pick-fact="model"]'),
      pickIg: igFact.querySelector('[data-pick-fact="ig"]'),
      pick,
      status: note,
      index: 0,
      scrollX: 0,
      frame: 0,
      step: 1,
      length: 1,
      renderedIndex: null,
    };
    states.set(category.id, state);

    pick.addEventListener('click', () => {
      const car = state.matching[state.index];
      if (!car) return;
      selections[category.id] = car.applicationId;
      updateBallot();
      note.textContent = `${car.vehicleLabel} selected for ${category.label}.`;
    });
    search.addEventListener('input', () => renderCards(state, search.value));
    prev.addEventListener('click', () => centerCard(state, state.index - 1));
    next.addEventListener('click', () => centerCard(state, state.index + 1));
    track.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        centerCard(state, state.index + (event.key === 'ArrowRight' ? 1 : -1));
      }
    });

    let drag = null;
    track.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !state.matching.length) return;
      cancelAnimationFrame(state.frame);
      drag = {
        id: event.pointerId,
        x: event.clientX,
        scroll: state.scrollX,
        card: event.target.closest('.fv-card'),
        moved: 0,
      };
      stage.classList.add('is-dragging');
      track.setPointerCapture(event.pointerId);
    });
    track.addEventListener('pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const delta = event.clientX - drag.x;
      drag.moved = Math.max(drag.moved, Math.abs(delta));
      state.scrollX = mod(drag.scroll - delta * 1.15, state.length);
      layoutCards(state);
    });
    const endDrag = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const current = drag;
      drag = null;
      stage.classList.remove('is-dragging');
      if (event.type === 'pointerup' && current.moved < 6 && current.card) {
        const index = [...track.children].indexOf(current.card);
        if (index === state.index) pick.click();
        else centerCard(state, index);
      } else {
        centerCard(state, state.index);
      }
    };
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    track.addEventListener('lostpointercapture', endDrag);
    track.addEventListener('dragstart', (event) => event.preventDefault());

    let wheelTime = 0;
    track.addEventListener('wheel', (event) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      if (performance.now() - wheelTime < 250) return;
      wheelTime = performance.now();
      centerCard(state, state.index + Math.sign(event.deltaX));
    }, { passive: false });

    renderCards(state);
    const link = make('a', '', category.label);
    link.href = `#${section.id}`;
    jump.append(link);
  };

  const showDialog = (dialog, focusTarget) => {
    previousFocus = document.activeElement;
    dialog.hidden = false;
    document.body.classList.add('fv-dialog-open');
    (focusTarget || $('.fv-dialog-close', dialog) || $('button', dialog))?.focus();
  };

  const closeDialog = (dialog) => {
    dialog.hidden = true;
    if (reviewDialog.hidden && verifyDialog.hidden) {
      document.body.classList.remove('fv-dialog-open');
    }
    previousFocus?.focus();
  };

  const review = () => {
    if (selectedCount() !== categories.length) return;
    reviewList.replaceChildren(...categories.map((category) => {
      const car = cars.find(({ applicationId }) => applicationId === selections[category.id]);
      const row = make('div', 'fv-review-row');
      const detail = make('div');
      detail.append(
        make('span', 'fv-review-label', category.label),
        make('strong', '', car?.vehicleLabel || ''),
      );
      const edit = make('button', 'fv-edit', 'Edit');
      edit.type = 'button';
      edit.setAttribute('aria-label', `Edit ${category.label} pick`);
      edit.addEventListener('click', () => {
        closeDialog(reviewDialog);
        const section = states.get(category.id).section;
        section.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
        $('.fv-search', section).focus({ preventScroll: true });
      });
      row.append(detail, edit);
      return row;
    }));
    showDialog(reviewDialog);
  };

  reviewButton.addEventListener('click', review);
  document.querySelectorAll('[data-voting-review-close]').forEach((button) => {
    button.addEventListener('click', () => closeDialog(reviewDialog));
  });
  document.querySelectorAll('[data-voting-verify-close]').forEach((button) => {
    button.addEventListener('click', () => closeDialog(verifyDialog));
  });
  $('[data-voting-verify-open]').addEventListener('click', () => {
    closeDialog(reviewDialog);
    showDialog(verifyDialog, phoneInput);
  });

  document.addEventListener('keydown', (event) => {
    const dialog = !verifyDialog.hidden ? verifyDialog : !reviewDialog.hidden ? reviewDialog : null;
    if (!dialog) return;
    if (event.key === 'Escape') {
      closeDialog(dialog);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden])')]
      .filter((element) => element.getClientRects().length && !element.closest('[hidden]'));
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
  });

  const post = async (endpoint, payload) => {
    const response = await fetch(`/.netlify/functions/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
      const error = new Error(body.error || 'Something went wrong. Please try again.');
      error.retryable = Boolean(body.retryable) || response.status === 503;
      throw error;
    }
    return body;
  };

  sendButton.addEventListener('click', async () => {
    if (!phoneInput.reportValidity()) return;
    sendButton.disabled = true;
    sendButton.textContent = 'Sending…';
    formStatus.textContent = '';
    try {
      const result = await post('send-vote-code', { phone: phoneInput.value });
      codeSentTo = phoneInput.value;
      codeWrap.hidden = false;
      codeInput.required = true;
      confirmButton.hidden = false;
      formStatus.textContent = `Code sent to ${result.destinationMasked}.`;
      codeInput.focus();
    } catch (error) {
      formStatus.textContent = error.message;
    } finally {
      sendButton.disabled = false;
      sendButton.textContent = 'Send code';
    }
  });

  phoneInput.addEventListener('input', () => {
    if (phoneInput.value === codeSentTo) return;
    codeWrap.hidden = true;
    codeInput.required = false;
    codeInput.value = '';
    confirmButton.hidden = true;
  });

  verifyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (selectedCount() !== categories.length || phoneInput.value !== codeSentTo) return;
    confirmButton.disabled = true;
    confirmButton.textContent = 'Submitting…';
    formStatus.textContent = '';
    try {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await post('submit-votes', { phone: phoneInput.value, code: codeInput.value, selections });
          verifyDialog.hidden = true;
          document.body.classList.remove('fv-dialog-open');
          categoriesRoot.hidden = true;
          jump.hidden = true;
          progress.hidden = true;
          ballotBar.hidden = true;
          $('[data-voting-success]').hidden = false;
          $('[data-voting-success]').focus();
          return;
        } catch (error) {
          if (!error.retryable || attempt === 3) throw error;
          formStatus.textContent = 'Voting is busy. Retrying…';
          await new Promise((resolve) => setTimeout(resolve, attempt * 800));
        }
      }
    } catch (error) {
      formStatus.textContent = error.message;
      confirmButton.disabled = false;
      confirmButton.textContent = 'Confirm votes';
    }
  });

  const load = async () => {
    try {
      const response = await fetch('/.netlify/functions/get-voting-cars');
      const result = await response.json();
      if (response.status === 403 && result.open === false) {
        setStatus('');
        $('[data-voting-closed]').hidden = false;
        return;
      }
      if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to load voting.');
      categories = result.categories;
      cars = result.cars;
      if (!categories.length || !cars.length) throw new Error('No cars are available for voting right now.');
      categories.forEach(buildCategory);
      categoriesRoot.hidden = false;
      jump.hidden = false;
      progress.hidden = false;
      ballotBar.hidden = false;
      setStatus('');
      updateBallot();
    } catch (error) {
      setStatus(error.message || 'Unable to load voting. Please try again.', true);
    }
  };

  load();
  window.addEventListener('resize', () => states.forEach(measure));
})();
