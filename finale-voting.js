(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const status = $('[data-voting-status]');
  const categoriesRoot = $('[data-voting-categories]');
  const jump = $('[data-voting-jump]');
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

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', isError);
    status.hidden = !message;
  };

  const selectedCount = () => categories.filter(({ id }) => selections[id]).length;
  const updateBallot = () => {
    const count = selectedCount();
    $('[data-voting-progress-text]').textContent = `${count} of ${categories.length} selected`;
    $('[data-voting-progress-fill]').style.width = `${count / categories.length * 100}%`;
    reviewButton.disabled = count !== categories.length;
    for (const [id, state] of states) {
      state.section.classList.toggle('has-selection', Boolean(selections[id]));
      state.section.querySelectorAll('.fv-card').forEach((card) => {
        const picked = card.dataset.carId === selections[id];
        card.classList.toggle('is-selected', picked);
        const button = $('.fv-pick', card);
        button.textContent = picked ? 'Selected ✓' : 'Pick this car';
        button.setAttribute('aria-pressed', String(picked));
      });
    }
  };

  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  };

  const centerCard = (state, index, behavior = 'smooth') => {
    const card = state.track.children[index];
    if (!card) return;
    const left = card.offsetLeft - (state.track.clientWidth - card.clientWidth) / 2;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : behavior;
    state.track.scrollTo({ left, behavior: motion });
    updateCenter(state, index);
  };

  const updateCenter = (state, index) => {
    const total = state.track.children.length;
    state.index = Math.max(0, Math.min(index, total - 1));
    state.counter.textContent = total ? `${state.index + 1} / ${total}` : '0 / 0';
    [...state.track.children].forEach((card, cardIndex) => {
      card.classList.toggle('is-centered', cardIndex === state.index);
    });
    state.prev.disabled = state.index === 0;
    state.next.disabled = state.index >= total - 1;
  };

  const nearestCenter = (state) => {
    const midpoint = state.track.scrollLeft + state.track.clientWidth / 2;
    let best = 0;
    let distance = Infinity;
    [...state.track.children].forEach((card, index) => {
      const current = Math.abs(card.offsetLeft + card.clientWidth / 2 - midpoint);
      if (current < distance) { distance = current; best = index; }
    });
    updateCenter(state, best);
  };

  const buildCard = (car, state) => {
    const card = make('article', 'fv-card');
    card.dataset.carId = car.applicationId;
    const photo = make('div', 'fv-card-photo');
    const img = make('img');
    img.src = photoUrl(car.photoUrl, 760);
    img.srcset = [420, 760, 1100].map((width) => `${photoUrl(car.photoUrl, width)} ${width}w`).join(', ');
    img.sizes = '(max-width: 640px) 82vw, 470px';
    img.alt = car.vehicleLabel;
    img.loading = 'lazy';
    img.decoding = 'async';
    const fallback = make('span', 'fv-photo-fallback', 'Photo unavailable');
    fallback.hidden = true;
    img.addEventListener('error', () => { img.hidden = true; fallback.hidden = false; });
    photo.append(img, fallback);
    const info = make('div', 'fv-card-info');
    info.append(make('h3', '', car.vehicleLabel));
    const handle = String(car.instagram || '').trim();
    if (handle) info.append(make('p', 'fv-handle', handle));
    const pick = make('button', 'fv-pick', 'Pick this car');
    pick.type = 'button';
    pick.setAttribute('aria-label', `Pick ${car.vehicleLabel} for ${state.category.label}`);
    pick.setAttribute('aria-pressed', 'false');
    pick.addEventListener('click', () => {
      selections[state.category.id] = car.applicationId;
      updateBallot();
      state.status.textContent = `${car.vehicleLabel} selected for ${state.category.label}.`;
    });
    info.append(pick);
    card.append(photo, info);
    return card;
  };

  const renderCards = (state, query = '') => {
    const matching = state.cars.filter((car) => car.vehicleLabel.toLowerCase().includes(query.toLowerCase().trim()));
    state.track.replaceChildren(...matching.map((car) => buildCard(car, state)));
    state.empty.hidden = matching.length > 0;
    state.track.hidden = matching.length === 0;
    const pickedIndex = matching.findIndex((car) => car.applicationId === selections[state.category.id]);
    updateCenter(state, pickedIndex >= 0 ? pickedIndex : 0);
    requestAnimationFrame(() => centerCard(state, pickedIndex >= 0 ? pickedIndex : 0, 'auto'));
    updateBallot();
  };

  const buildCategory = (category, number) => {
    const section = make('section', 'fv-category');
    section.id = `vote-${category.id}`;
    section.setAttribute('aria-labelledby', `title-${category.id}`);
    const top = make('div', 'fv-category-top');
    const heading = make('div');
    heading.append(make('p', 'fv-kicker', `Category 0${number + 1}`));
    const title = make('h2', '', category.label);
    title.id = `title-${category.id}`;
    heading.append(title);
    const count = make('p', 'fv-category-count', `${cars.filter((car) => car.eligibleCategoryIds.includes(category.id)).length} cars`);
    top.append(heading, count);
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
    const controls = make('div', 'fv-controls');
    const prev = make('button', 'fv-arrow', '←');
    const next = make('button', 'fv-arrow', '→');
    prev.type = next.type = 'button';
    prev.setAttribute('aria-label', `Previous ${category.label} car`);
    next.setAttribute('aria-label', `Next ${category.label} car`);
    const counter = make('span', 'fv-counter');
    controls.append(prev, counter, next);
    const note = make('p', 'fv-live');
    note.setAttribute('aria-live', 'polite');
    section.append(top, search, track, empty, controls, note);
    categoriesRoot.append(section);
    const state = { category, section, cars: cars.filter((car) => car.eligibleCategoryIds.includes(category.id)), track, empty, prev, next, counter, status: note, index: 0 };
    states.set(category.id, state);
    search.addEventListener('input', () => renderCards(state, search.value));
    prev.addEventListener('click', () => centerCard(state, state.index - 1));
    next.addEventListener('click', () => centerCard(state, state.index + 1));
    track.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        centerCard(state, state.index + (event.key === 'ArrowRight' ? 1 : -1));
      }
    });
    let scrollTimer;
    track.addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => nearestCenter(state), 60);
    }, { passive: true });
    renderCards(state);
    const link = make('a', '', category.label);
    link.href = `#${section.id}`;
    jump.append(link);
  };

  const showDialog = (dialog, focusTarget) => {
    previousFocus = document.activeElement;
    dialog.hidden = false;
    document.body.classList.add('fv-dialog-open');
    (focusTarget || $('button', dialog))?.focus();
  };
  const closeDialog = (dialog) => {
    dialog.hidden = true;
    document.body.classList.remove('fv-dialog-open');
    previousFocus?.focus();
  };
  const review = () => {
    if (selectedCount() !== categories.length) return;
    reviewList.replaceChildren(...categories.map((category) => {
      const car = cars.find(({ applicationId }) => applicationId === selections[category.id]);
      const row = make('div', 'fv-review-row');
      const detail = make('div');
      detail.append(make('span', 'fv-review-label', category.label), make('strong', '', car?.vehicleLabel || ''));
      const edit = make('button', 'fv-edit', 'Edit');
      edit.type = 'button';
      edit.setAttribute('aria-label', `Edit ${category.label} pick`);
      edit.addEventListener('click', () => {
        closeDialog(reviewDialog);
        const section = states.get(category.id).section;
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        $('.fv-search', section).focus({ preventScroll: true });
      });
      row.append(detail, edit);
      return row;
    }));
    showDialog(reviewDialog);
  };

  reviewButton.addEventListener('click', review);
  document.querySelectorAll('[data-voting-review-close]').forEach((button) => button.addEventListener('click', () => closeDialog(reviewDialog)));
  document.querySelectorAll('[data-voting-verify-close]').forEach((button) => button.addEventListener('click', () => closeDialog(verifyDialog)));
  $('[data-voting-verify-open]').addEventListener('click', () => {
    closeDialog(reviewDialog);
    showDialog(verifyDialog, phoneInput);
  });
  document.addEventListener('keydown', (event) => {
    const dialog = !verifyDialog.hidden ? verifyDialog : !reviewDialog.hidden ? reviewDialog : null;
    if (!dialog) return;
    if (event.key === 'Escape') { closeDialog(dialog); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden])')]
      .filter((element) => element.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  const post = async (endpoint, payload) => {
    const response = await fetch(`/.netlify/functions/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
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
    } catch (error) { formStatus.textContent = error.message; }
    finally { sendButton.disabled = false; sendButton.textContent = 'Send code'; }
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
      ballotBar.hidden = false;
      setStatus('');
      updateBallot();
    } catch (error) {
      setStatus(error.message || 'Unable to load voting. Please try again.', true);
    }
  };
  load();
})();
