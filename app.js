(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const STORAGE_KEY = 'clicklab.simulation.v1';
  const MAX_QUEUE = 8;
  const MAX_LOG = 80;

  const defaultLinks = [
    { id: 'demo-1', url: 'https://adf.ly/demo/launch-notes' },
    { id: 'demo-2', url: 'https://adf.ly/demo/field-guide' },
    { id: 'demo-3', url: 'https://adf.ly/demo/weekly-drop' }
  ];

  const els = {
    form: $('#campaignForm'),
    linkInput: $('#linkInput'),
    addLink: $('#addLink'),
    linkHint: $('#linkHint'),
    targetInput: $('#targetInput'),
    payoutInput: $('#payoutInput'),
    relayInput: $('#relayInput'),
    relayValue: $('#relayValue'),
    speedInput: $('#speedInput'),
    speedValue: $('#speedValue'),
    startBtn: $('#startBtn'),
    startLabel: $('#startLabel'),
    resetBtn: $('#resetBtn'),
    modeTag: $('#modeTag'),
    queueList: $('#queueList'),
    queueCount: $('#queueCount'),
    queueEmpty: $('#queueEmpty'),
    statClicks: $('#statClicks'),
    statTarget: $('#statTarget'),
    viewsMeter: $('#viewsMeter'),
    viewsSub: $('#viewsSub'),
    statEarnings: $('#statEarnings'),
    earningsSub: $('#earningsSub'),
    statSuccess: $('#statSuccess'),
    statBlocked: $('#statBlocked'),
    statRelays: $('#statRelays'),
    statTime: $('#statTime'),
    mesh: $('#mesh'),
    meshStatus: $('#meshStatus'),
    meshEmpty: $('#meshEmpty'),
    chart: $('#chart'),
    chartMeta: $('#chartMeta'),
    logList: $('#logList'),
    logCount: $('#logCount'),
    logEmpty: $('#logEmpty'),
    clearLog: $('#clearLog'),
    toasts: $('#toasts'),
    scanDialog: $('#scanDialog'),
    openScan: $('#openScan'),
    openScanBanner: $('#openScanBanner'),
    closeScan: $('#closeScan'),
    scanDone: $('#scanDone'),
    copyHashes: $('#copyHashes')
  };

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    running: false,
    paused: false,
    complete: false,
    delivered: 0,
    credited: 0,
    blocked: 0,
    earnings: 0,
    target: 240,
    payout: 4,
    relays: 8,
    speed: 2,
    elapsed: 0,
    acc: 0,
    logAcc: 0,
    linkCursor: 0,
    lastHistoryAt: 0,
    history: []
  };

  /** @type {{id:string,url:string,clicks:number,quota:number}[]} */
  let queue = [];
  const queueRefs = new Map();

  // ---------- settings ----------

  function readSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function persistSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        target: state.target,
        payout: state.payout,
        relays: state.relays,
        speed: state.speed,
        queue: queue.map((item) => ({ id: item.id, url: item.url }))
      }));
    } catch {
      /* storage can be unavailable; the simulation still works */
    }
  }

  let saveTimer = 0;
  function saveSettings() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persistSettings, 240);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function isHttpUrl(value) {
    try {
      const url = new URL(value);
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.');
    } catch {
      return false;
    }
  }

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function loadSettings() {
    const saved = readSettings();
    if (!saved) {
      queue = defaultLinks.map((item) => ({ ...item, clicks: 0, quota: 0 }));
      return;
    }

    state.target = clamp(Number(saved.target) || 240, 10, 10000);
    state.payout = clamp(Number(saved.payout) || 4, 0.1, 50);
    state.relays = clamp(Number(saved.relays) || 8, 2, 24);
    state.speed = clamp(Number(saved.speed) || 2, 0.5, 8);

    if (Array.isArray(saved.queue) && saved.queue.length) {
      queue = saved.queue
        .filter((item) => item && typeof item.url === 'string' && isHttpUrl(item.url))
        .slice(0, MAX_QUEUE)
        .map((item, index) => ({
          id: typeof item.id === 'string' ? item.id : `saved-${index}`,
          url: item.url,
          clicks: 0,
          quota: 0
        }));
    }
    if (!queue.length) {
      queue = defaultLinks.map((item) => ({ ...item, clicks: 0, quota: 0 }));
    }
  }

  // ---------- display helpers ----------

  function formatClock(totalSeconds) {
    const total = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function formatMoney(value) {
    const safe = Number.isFinite(value) ? value : 0;
    return safe >= 1000 ? `$${safe.toFixed(2)}` : `$${safe.toFixed(3)}`;
  }

  function formatPayout(value) {
    return `$${Number(value).toFixed(2)}`;
  }

  function estimatePerClick() {
    return state.payout / 1000;
  }

  // ---------- queue ----------

  function updateRemoveState() {
    $$('.queue-remove', els.queueList).forEach((button) => {
      button.disabled = state.running;
    });
  }

  function renderQueue() {
    els.queueList.replaceChildren();
    queueRefs.clear();

    queue.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'queue-item';
      li.dataset.id = item.id;

      const indexEl = document.createElement('span');
      indexEl.className = 'queue-index';
      indexEl.textContent = String(index + 1).padStart(2, '0');

      const body = document.createElement('div');
      body.className = 'queue-body';

      const urlEl = document.createElement('span');
      urlEl.className = 'queue-url';
      urlEl.title = item.url;

      try {
        const parsed = new URL(item.url);
        const host = document.createElement('b');
        host.textContent = parsed.host;
        urlEl.append(host, `${parsed.pathname}${parsed.search}`);
      } catch {
        urlEl.textContent = item.url;
      }

      const meta = document.createElement('div');
      meta.className = 'queue-meta';
      const rate = document.createElement('span');
      rate.className = 'rate';
      rate.textContent = `${formatPayout(state.payout)} / 1k`;
      const clicks = document.createElement('span');
      clicks.className = 'queue-clicks';
      clicks.textContent = '0 clicks';
      meta.append(rate, clicks);

      const progress = document.createElement('div');
      progress.className = 'queue-progress';
      const bar = document.createElement('span');

      progress.append(bar);
      body.append(urlEl, meta, progress);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'queue-remove';
      remove.dataset.remove = item.id;
      remove.setAttribute('aria-label', `Remove link ${index + 1}`);
      remove.title = state.running ? 'Stop the campaign to edit targets' : 'Remove link';
      remove.disabled = state.running;
      remove.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

      li.append(indexEl, body, remove);
      els.queueList.append(li);

      queueRefs.set(item.id, { li, bar, clicks });
    });

    const count = queue.length;
    els.queueCount.textContent = `${count} link${count === 1 ? '' : 's'}`;
    els.queueEmpty.hidden = count > 0;
    els.linkInput.disabled = state.running;
    els.addLink.disabled = state.running || count >= MAX_QUEUE;
    updateQueueProgress();
  }

  function updateQueueProgress() {
    for (const item of queue) {
      const refs = queueRefs.get(item.id);
      if (!refs) continue;

      const pct = item.quota > 0 ? clamp((item.clicks / item.quota) * 100, 0, 100) : 0;
      refs.bar.style.width = `${pct}%`;
      refs.clicks.textContent = item.quota > 0 ? `${item.clicks} / ${item.quota}` : `${item.clicks} click${item.clicks === 1 ? '' : 's'}`;
      refs.li.classList.toggle(
        'is-active',
        state.running && !state.paused && !state.complete && item.clicks < item.quota
      );
    }
    updateRemoveState();
  }

  function addLink() {
    if (state.running) {
      toast('Stop the campaign before editing targets.', 'warn');
      return;
    }
    if (queue.length >= MAX_QUEUE) {
      toast(`The queue is limited to ${MAX_QUEUE} demo links.`, 'warn');
      return;
    }

    const raw = els.linkInput.value.trim();
    if (!isHttpUrl(raw)) {
      els.linkInput.classList.add('is-invalid');
      els.linkHint.classList.add('is-error');
      els.linkHint.textContent = 'Enter a valid http(s) link with a domain.';
      els.linkInput.focus();
      return;
    }

    const normalized = new URL(raw).href;
    if (queue.some((item) => item.url === normalized)) {
      els.linkHint.classList.remove('is-error');
      els.linkHint.textContent = 'That link is already in the queue.';
      toast('That link is already queued.', 'warn');
      return;
    }

    queue.push({ id: uid(), url: normalized, clicks: 0, quota: 0 });
    els.linkInput.classList.remove('is-invalid');
    els.linkHint.classList.remove('is-error');
    els.linkHint.textContent = 'Demo links stay in this browser. Nothing is requested.';
    renderQueue();
    saveSettings();
    toast('Target added to the queue.');
    els.linkInput.value = '';
    els.linkInput.focus();
  }

  function removeLink(id) {
    if (state.running) {
      toast('Stop the campaign before editing targets.', 'warn');
      return;
    }
    const before = queue.length;
    queue = queue.filter((item) => item.id !== id);
    if (queue.length !== before) {
      renderQueue();
      saveSettings();
      toast('Target removed.', 'warn');
    }
  }

  // ---------- stats / button state ----------

  function updateStats() {
    const pct = state.target > 0 ? clamp((state.delivered / state.target) * 100, 0, 100) : 0;

    els.statClicks.textContent = state.delivered.toLocaleString('en-US');
    els.statTarget.textContent = `/ ${state.target.toLocaleString('en-US')}`;
    els.viewsMeter.style.width = `${pct}%`;

    if (state.complete) {
      els.viewsSub.textContent = `Target reached · ${state.credited.toLocaleString('en-US')} credited`;
    } else if (state.running && state.paused) {
      els.viewsSub.textContent = `Paused at ${pct.toFixed(0)}% of target`;
    } else if (state.running) {
      els.viewsSub.textContent = `${pct.toFixed(0)}% of target · ${Math.max(0, state.target - state.delivered).toLocaleString('en-US')} to go`;
    } else if (state.delivered > 0) {
      els.viewsSub.textContent = `Stopped at ${pct.toFixed(0)}% of target`;
    } else {
      els.viewsSub.textContent = 'Campaign has not started';
    }

    els.statEarnings.textContent = formatMoney(state.earnings);
    els.earningsSub.textContent = `${formatPayout(state.payout)} per 1,000 credited views`;

    els.statSuccess.textContent = state.delivered > 0
      ? `${((state.credited / state.delivered) * 100).toFixed(1)}%`
      : '—';
    els.statBlocked.textContent = `${state.blocked.toLocaleString('en-US')} blocked`;

    els.statRelays.textContent = String(state.relays);
    els.statTime.textContent = `Run time ${formatClock(state.elapsed)}`;

    if (state.complete) {
      els.chartMeta.textContent = `final ${formatMoney(state.earnings)} · ${formatClock(state.elapsed)}`;
    } else if (state.running) {
      els.chartMeta.textContent = `${state.credited.toLocaleString('en-US')} credited · ${formatClock(state.elapsed)}`;
    } else if (state.delivered > 0) {
      els.chartMeta.textContent = `${formatMoney(state.earnings)} · stopped`;
    } else {
      els.chartMeta.textContent = 'awaiting data';
    }
  }

  function updateControls() {
    const running = state.running;
    const paused = state.paused;

    els.targetInput.disabled = running;
    els.payoutInput.disabled = running;
    els.linkInput.disabled = running;
    els.addLink.disabled = running || queue.length >= MAX_QUEUE;

    let label = 'Start campaign';
    let icon = '<path d="M5 3.2v9.6L12.5 8 5 3.2Z" fill="currentColor"/>';

    if (running && paused) {
      label = 'Resume campaign';
    } else if (running) {
      label = 'Pause campaign';
      icon = '<path d="M5 3h2.2v10H5zM8.8 3H11v10H8.8z" fill="currentColor"/>';
    } else if (state.complete) {
      label = 'Run again';
      icon = '<path d="M8 2.4a5.6 5.6 0 1 1-5.3 7.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M2.4 5.2 2.7 9l3.5-1.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
    }

    els.startLabel.textContent = label;
    const svg = els.startBtn.querySelector('svg');
    if (svg && svg.dataset.icon !== label) {
      svg.innerHTML = icon;
      svg.dataset.icon = label;
    }

    els.modeTag.className = 'tag';
    let meshText = 'standby';
    let meshClass = 'live-pill';

    if (state.complete) {
      els.modeTag.textContent = 'complete';
      els.modeTag.classList.add('is-done');
      meshText = 'complete';
      meshClass += ' is-done';
    } else if (running && paused) {
      els.modeTag.textContent = 'paused';
      els.modeTag.classList.add('is-paused');
      meshText = 'paused';
      meshClass += ' is-paused';
    } else if (running) {
      els.modeTag.textContent = 'live';
      els.modeTag.classList.add('is-live');
      meshText = 'live';
      meshClass += ' is-live';
    } else if (state.delivered > 0) {
      els.modeTag.textContent = 'stopped';
      meshText = 'standby';
    } else {
      els.modeTag.textContent = 'idle';
    }

    const meshKey = `${meshClass}|${meshText}`;
    if (els.meshStatus.dataset.state !== meshKey) {
      els.meshStatus.className = meshClass;
      els.meshStatus.innerHTML = `<span class="dot"></span>${meshText}`;
      els.meshStatus.dataset.state = meshKey;
    }

    const meshActive = running || state.complete;
    els.meshEmpty.classList.toggle('is-hidden', meshActive);

    updateStats();
  }

  function updateAll() {
    updateControls();
    updateQueueProgress();
  }

  // ---------- simulation ----------

  function nextLink() {
    for (let offset = 0; offset < queue.length; offset += 1) {
      const index = (state.linkCursor + offset) % queue.length;
      const item = queue[index];
      if (item.clicks < item.quota) {
        state.linkCursor = (index + 1) % queue.length;
        return item;
      }
    }
    return null;
  }

  function beginCampaign() {
    if (!queue.length) {
      toast('Add at least one demo link first.', 'error');
      return;
    }

    const target = clamp(Math.round(Number(els.targetInput.value) || 240), 10, 10000);
    const payout = clamp(Number(els.payoutInput.value) || 4, 0.1, 50);

    state.target = target;
    state.payout = payout;
    state.delivered = 0;
    state.credited = 0;
    state.blocked = 0;
    state.earnings = 0;
    state.elapsed = 0;
    state.acc = 0;
    state.logAcc = 0;
    state.linkCursor = 0;
    state.lastHistoryAt = 0;
    state.history = [{ t: 0, e: 0 }];
    state.running = true;
    state.paused = false;
    state.complete = false;

    const base = Math.floor(target / queue.length);
    const remainder = target % queue.length;
    queue.forEach((item, index) => {
      item.clicks = 0;
      item.quota = base + (index < remainder ? 1 : 0);
    });

    els.targetInput.value = String(target);
    els.payoutInput.value = payout.toFixed(2);

    log(`campaign armed · ${target.toLocaleString('en-US')} views across ${queue.length} target${queue.length === 1 ? '' : 's'}`, 'info');
    log(`relay mesh online · ${state.relays} virtual exits · speed ${state.speed.toFixed(1)}×`, 'info');
    toast('Simulation started. No real traffic is generated.');

    updateAll();
    renderQueue();
    saveSettings();
  }

  function pauseCampaign() {
    if (!state.running || state.paused) return;
    state.paused = true;
    log('campaign paused by operator', 'warn');
    updateAll();
  }

  function resumeCampaign() {
    if (!state.running || !state.paused) return;
    state.paused = false;
    log('campaign resumed · circuit mesh active', 'info');
    updateAll();
  }

  function toggleCampaign() {
    if (state.running) {
      if (state.paused) resumeCampaign();
      else pauseCampaign();
      return;
    }
    beginCampaign();
  }

  function finishCampaign() {
    state.running = false;
    state.paused = false;
    state.complete = true;

    const finalT = Math.max(state.elapsed, 0.2);
    state.history.push({ t: finalT, e: state.earnings });
    if (state.history.length > 240) state.history.shift();

    log(
      `campaign complete · ${state.credited.toLocaleString('en-US')} credited · ${state.blocked.toLocaleString('en-US')} blocked · ${formatMoney(state.earnings)}`,
      'info'
    );
    toast(`Simulation complete — ${state.credited.toLocaleString('en-US')} credited views.`);
    updateAll();
  }

  function step(dt) {
    if (!state.running || state.paused) return;

    state.elapsed += dt;
    state.acc += state.relays * 1.15 * state.speed * dt;
    let attempts = Math.floor(state.acc);
    state.acc -= attempts;

    const remaining = state.target - state.delivered;
    attempts = Math.min(attempts, remaining);

    if (attempts > 0) {
      for (let i = 0; i < attempts; i += 1) {
        const item = nextLink();
        if (!item) break;

        item.clicks += 1;
        state.delivered += 1;

        if (Math.random() < 0.925) {
          state.credited += 1;
          state.earnings += state.payout / 1000;
        } else {
          state.blocked += 1;
        }
      }

      state.logAcc += attempts;
      if (state.logAcc >= 6) {
        state.logAcc = 0;
        writeSampleEvent();
      }
    }

    if (state.elapsed - state.lastHistoryAt >= 1) {
      state.lastHistoryAt = state.elapsed;
      state.history.push({ t: state.elapsed, e: state.earnings });
      if (state.history.length > 240) state.history.shift();
    }

    if (state.delivered >= state.target) {
      finishCampaign();
      return;
    }

    updateAll();
  }

  // ---------- logging ----------

  function log(text, kind = 'ok') {
    const item = document.createElement('li');
    item.className = `log-item${kind === 'ok' ? '' : ` is-${kind}`}`;

    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = formatClock(state.elapsed);

    const dot = document.createElement('span');
    dot.className = 'log-dot';
    dot.textContent = kind === 'block' ? '×' : kind === 'warn' ? '▲' : kind === 'info' ? '›' : '●';

    const body = document.createElement('span');
    body.className = 'log-text';
    body.textContent = text;

    item.append(time, dot, body);
    els.logList.prepend(item);

    while (els.logList.children.length > MAX_LOG) {
      els.logList.lastElementChild.remove();
    }

    const count = els.logList.children.length;
    els.logCount.textContent = `${count} event${count === 1 ? '' : 's'}`;
    els.logEmpty.hidden = true;
  }

  function clearLog() {
    els.logList.replaceChildren();
    els.logCount.textContent = '0 events';
    els.logEmpty.hidden = false;
  }

  function sampleLogText() {
    const relay = `R${String(1 + Math.floor(Math.random() * state.relays)).padStart(2, '0')}`;
    const linkIndex = String(1 + Math.floor(Math.random() * Math.max(1, queue.length))).padStart(2, '0');
    const roll = Math.random();

    if (roll < 0.22) {
      return { text: `circuit rotated · ${relay} → target ${linkIndex}`, kind: 'info' };
    }
    if (roll < 0.4) {
      return { text: `view credited · dwell ${(6 + Math.random() * 14).toFixed(1)}s · +$${estimatePerClick().toFixed(4)}`, kind: 'ok' };
    }
    if (roll < 0.56) {
      return { text: `fingerprint accepted · session ${Math.random().toString(16).slice(2, 8)}`, kind: 'ok' };
    }
    if (roll < 0.7) {
      return { text: `challenge solved · simulated latency ${Math.round(40 + Math.random() * 180)}ms`, kind: 'ok' };
    }
    if (roll < 0.82) {
      return { text: `exit ${relay} rotated before target ${linkIndex}`, kind: 'info' };
    }
    if (roll < 0.92) {
      return { text: 'hold: duplicate fingerprint (simulated)', kind: 'warn' };
    }
    return { text: 'blocked: exit flagged by traffic check (simulated)', kind: 'block' };
  }

  function writeSampleEvent() {
    const sample = sampleLogText();
    log(sample.text, sample.kind);
  }

  // ---------- reset ----------

  function resetSimulation(announce = true) {
    state.running = false;
    state.paused = false;
    state.complete = false;
    state.delivered = 0;
    state.credited = 0;
    state.blocked = 0;
    state.earnings = 0;
    state.elapsed = 0;
    state.acc = 0;
    state.logAcc = 0;
    state.linkCursor = 0;
    state.lastHistoryAt = 0;
    state.history = [];
    queue.forEach((item) => {
      item.clicks = 0;
      item.quota = 0;
    });

    renderQueue();
    updateAll();

    if (announce) {
      log('simulation reset · counters cleared', 'info');
      toast('Simulation reset.', 'warn');
    }
  }

  // ---------- canvas utilities ----------

  function fitCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width, height };
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
  }

  // ---------- mesh ----------

  const meshState = {
    packets: [],
    spawnAcc: 0,
    lastFrame: performance.now(),
    rotation: 0
  };

  function spawnPacket() {
    if (meshState.packets.length > 44) return;
    const count = state.relays;
    if (!count) return;

    const index = Math.floor(Math.random() * count);
    meshState.packets.push({
      index,
      t: 0,
      speed: 0.55 + Math.random() * 0.6,
      blocked: Math.random() < 0.075
    });
  }

  function drawMesh(now) {
    const { ctx, width, height } = fitCanvas(els.mesh);
    const dt = Math.min((now - meshState.lastFrame) / 1000, 0.05);
    meshState.lastFrame = now;

    ctx.clearRect(0, 0, width, height);

    const active = state.running && !state.paused;
    const relayCount = state.relays;
    const cx = width / 2;
    const cy = height / 2 + 2;
    const relayRadiusX = Math.max(56, width * 0.21);
    const relayRadiusY = Math.max(48, height * 0.27);
    const targetRadiusX = Math.max(96, width * 0.37);
    const targetRadiusY = Math.max(82, height * 0.41);

    if (active) meshState.rotation += dt * 0.16;

    // ambient rings
    ctx.save();
    ctx.strokeStyle = 'rgba(69, 230, 255, 0.09)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 7]);
    for (let ring = 0; ring < 3; ring += 1) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, relayRadiusX * (0.6 + ring * 0.35), relayRadiusY * (0.6 + ring * 0.35), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // rotating sweep
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(meshState.rotation);
    ctx.strokeStyle = 'rgba(183, 255, 60, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, relayRadiusX, relayRadiusY, 0, -0.5, 0.35);
    ctx.stroke();
    ctx.restore();

    const relays = [];
    const targets = [];

    for (let i = 0; i < relayCount; i += 1) {
      const angle = -Math.PI / 2 + (i / relayCount) * Math.PI * 2 + meshState.rotation * 0.35;
      const rx = cx + Math.cos(angle) * relayRadiusX;
      const ry = cy + Math.sin(angle) * relayRadiusY;
      const tx = cx + Math.cos(angle) * targetRadiusX;
      const ty = cy + Math.sin(angle) * targetRadiusY;
      relays.push({ x: rx, y: ry, angle });
      targets.push({ x: tx, y: ty, angle });
    }

    // spokes
    ctx.save();
    ctx.lineWidth = 1;
    for (let i = 0; i < relayCount; i += 1) {
      const gradient = ctx.createLinearGradient(cx, cy, targets[i].x, targets[i].y);
      gradient.addColorStop(0, 'rgba(183, 255, 60, 0.16)');
      gradient.addColorStop(0.55, 'rgba(69, 230, 255, 0.12)');
      gradient.addColorStop(1, 'rgba(109, 139, 136, 0.10)');
      ctx.strokeStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(relays[i].x, relays[i].y);
      ctx.lineTo(targets[i].x, targets[i].y);
      ctx.stroke();
    }
    ctx.restore();

    // target nodes
    for (const target of targets) {
      ctx.save();
      ctx.translate(target.x, target.y);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = 'rgba(150, 185, 181, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-3, -3, 6, 6);
      ctx.restore();
    }

    // packets
    if (active) {
      meshState.spawnAcc += dt * (4 + state.relays * 0.5) * Math.min(state.speed, 5);
      while (meshState.spawnAcc >= 1) {
        spawnPacket();
        meshState.spawnAcc -= 1;
      }
    }

    for (let i = meshState.packets.length - 1; i >= 0; i -= 1) {
      const packet = meshState.packets[i];
      packet.t += dt * packet.speed;
      if (packet.t >= 1) {
        meshState.packets.splice(i, 1);
        continue;
      }

      const relay = relays[packet.index % relayCount];
      const target = targets[packet.index % relayCount];
      if (!relay || !target) continue;

      let x;
      let y;
      if (packet.t < 0.55) {
        const p = easeInOut(packet.t / 0.55);
        x = cx + (relay.x - cx) * p;
        y = cy + (relay.y - cy) * p;
      } else {
        const p = easeInOut((packet.t - 0.55) / 0.45);
        x = relay.x + (target.x - relay.x) * p;
        y = relay.y + (target.y - relay.y) * p;
      }

      const color = packet.blocked ? '255, 100, 120' : '234, 255, 196';

      ctx.save();
      ctx.fillStyle = `rgba(${color}, 0.22)`;
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(${color}, 0.95)`;
      ctx.shadowColor = `rgba(${color}, 0.9)`;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(x, y, 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // relay nodes
    relays.forEach((relay, index) => {
      const pulse = active ? 0.55 + Math.sin(now / 520 + index * 0.8) * 0.35 : 0.38;
      ctx.save();
      ctx.fillStyle = `rgba(69, 230, 255, ${pulse})`;
      ctx.shadowColor = 'rgba(69, 230, 255, 0.75)';
      ctx.shadowBlur = active ? 9 : 4;
      ctx.beginPath();
      ctx.arc(relay.x, relay.y, 3.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (relayCount <= 12) {
        ctx.save();
        ctx.fillStyle = 'rgba(104, 137, 134, 0.75)';
        ctx.font = '8px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`R${String(index + 1).padStart(2, '0')}`, relay.x, relay.y - 9);
        ctx.restore();
      }
    });

    // hub
    const hubPulse = active ? 1 + Math.sin(now / 420) * 0.06 : 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(hubPulse, hubPulse);

    ctx.strokeStyle = 'rgba(183, 255, 60, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(183, 255, 60, 0.4)';
    ctx.beginPath();
    ctx.arc(0, 0, 19, -Math.PI / 3, Math.PI * 0.8);
    ctx.stroke();

    ctx.fillStyle = active ? 'rgba(183, 255, 60, 0.14)' : 'rgba(183, 255, 60, 0.07)';
    ctx.strokeStyle = 'rgba(183, 255, 60, 0.85)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const x = Math.cos(angle) * 12;
      const y = Math.sin(angle) * 12;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(183, 255, 60, 0.95)';
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // frame marks
    ctx.save();
    ctx.strokeStyle = 'rgba(120, 160, 155, 0.25)';
    ctx.lineWidth = 1;
    const corner = 12;
    const pad = 10;
    const corners = [
      [pad, pad, 1, 1],
      [width - pad, pad, -1, 1],
      [pad, height - pad, 1, -1],
      [width - pad, height - pad, -1, -1]
    ];
    for (const [x, y, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + corner * sx, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + corner * sy);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(104, 137, 134, 0.55)';
    ctx.font = '8px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`EXIT MESH / ${String(state.relays).padStart(2, '0')} NODES`, pad + 4, pad + 13);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(183, 255, 60, 0.55)';
    ctx.fillText('SIMULATED', width - pad - 4, pad + 13);
    ctx.restore();
  }

  // ---------- chart ----------

  function drawChart() {
    const { ctx, width, height } = fitCanvas(els.chart);
    ctx.clearRect(0, 0, width, height);

    const pad = { top: 14, right: 14, bottom: 22, left: 44 };
    const plotW = Math.max(10, width - pad.left - pad.right);
    const plotH = Math.max(10, height - pad.top - pad.bottom);
    const points = state.history;
    const last = points.length ? points[points.length - 1] : { t: 0, e: 0 };
    const maxT = Math.max(10, last.t);
    let maxE = 0.02;
    for (const point of points) if (point.e > maxE) maxE = point.e;
    maxE *= 1.2;

    ctx.save();
    ctx.strokeStyle = 'rgba(120, 160, 155, 0.13)';
    ctx.lineWidth = 1;
    ctx.font = '8px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = 'rgba(104, 137, 134, 0.65)';
    ctx.textAlign = 'right';

    const gridLines = 4;
    for (let i = 0; i <= gridLines; i += 1) {
      const y = pad.top + (plotH / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      const value = maxE * (1 - i / gridLines);
      const digits = maxE < 0.1 ? 3 : maxE < 10 ? 2 : maxE < 100 ? 1 : 0;
      ctx.fillText(`$${value.toFixed(digits)}`, pad.left - 7, y + 3);
    }
    ctx.restore();

    const xOf = (t) => pad.left + (Math.min(t, maxT) / maxT) * plotW;
    const yOf = (e) => pad.top + plotH - (e / maxE) * plotH;

    if (points.length < 2) {
      ctx.save();
      ctx.strokeStyle = 'rgba(183, 255, 60, 0.28)';
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(pad.left, yOf(0));
      ctx.lineTo(width - pad.right, yOf(0));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(104, 137, 134, 0.7)';
      ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('no campaign data yet', pad.left + plotW / 2, pad.top + plotH / 2 - 4);
      ctx.restore();
    } else {
      const area = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
      area.addColorStop(0, 'rgba(183, 255, 60, 0.26)');
      area.addColorStop(0.65, 'rgba(183, 255, 60, 0.06)');
      area.addColorStop(1, 'rgba(183, 255, 60, 0)');

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(xOf(points[0].t), yOf(0));
      for (const point of points) ctx.lineTo(xOf(point.t), yOf(point.e));
      ctx.lineTo(xOf(last.t), yOf(0));
      ctx.closePath();
      ctx.fillStyle = area;
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      points.forEach((point, index) => {
        const x = xOf(point.t);
        const y = yOf(point.e);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = 'rgba(183, 255, 60, 0.92)';
      ctx.lineWidth = 1.8;
      ctx.shadowColor = 'rgba(183, 255, 60, 0.55)';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.restore();

      const lastX = xOf(last.t);
      const lastY = yOf(last.e);
      ctx.save();
      ctx.fillStyle = 'rgba(234, 255, 196, 0.95)';
      ctx.shadowColor = 'rgba(183, 255, 60, 0.9)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = 'rgba(104, 137, 134, 0.6)';
    ctx.font = '8px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('00:00', pad.left, height - 7);
    ctx.textAlign = 'right';
    ctx.fillText(formatClock(maxT), width - pad.right, height - 7);
    ctx.restore();
  }

  // ---------- toast ----------

  function toast(message, kind = 'ok') {
    const node = document.createElement('div');
    node.className = `toast${kind === 'ok' ? '' : ` is-${kind}`}`;
    node.textContent = message;
    els.toasts.append(node);

    while (els.toasts.children.length > 3) els.toasts.firstElementChild.remove();

    window.setTimeout(() => {
      node.classList.add('is-out');
      window.setTimeout(() => node.remove(), 220);
    }, 3400);
  }

  // ---------- scan dialog ----------

  function openScan() {
    if (typeof els.scanDialog.showModal === 'function') {
      if (!els.scanDialog.open) els.scanDialog.showModal();
    } else {
      els.scanDialog.setAttribute('open', '');
    }
  }

  function closeScan() {
    if (typeof els.scanDialog.close === 'function' && els.scanDialog.open) {
      els.scanDialog.close();
    } else {
      els.scanDialog.removeAttribute('open');
    }
  }

  const hashes = [
    '9950788284df125c7359aeb91435ed24d59359fac6a74ed73774ca31561cc7ae  BotOpener.exe',
    '337b3ef77d1169f6fe0186ce899b3d8077c7b56151be8a409581552b47972829  ADFly.sys',
    '83bfa50a528762ec52a011302ac3874636fb7e26628cd7acfbf2bdc9faa8110d  termdd.sys',
    '9875067faf6d81ba115ee4765ec8bbe65e8c038dde14cbe042707a5a9144f2df  objects.list',
    'd4c3713979ea09dd953dd6422b0501caac81b9b287b3a8bb059978b1fe0c97e0  README.md',
    '8c349f80764d0648e645f41ef23772a70c995a0924b5235f735f4a3d09df127c  LICENSE'
  ].join('\n');

  async function copyHashes() {
    try {
      await navigator.clipboard.writeText(hashes);
      toast('SHA-256 list copied to clipboard.');
    } catch {
      toast('Clipboard access was blocked by the browser.', 'error');
    }
  }

  // ---------- range fill ----------

  function paintRange(input) {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const value = Number(input.value) || min;
    const pct = ((value - min) / (max - min)) * 100;
    input.style.setProperty('--fill', `${pct}%`);
  }

  // ---------- wiring ----------

  function wireEvents() {
    els.form.addEventListener('submit', (event) => {
      event.preventDefault();
      toggleCampaign();
    });

    els.addLink.addEventListener('click', addLink);
    els.linkInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addLink();
      }
    });
    els.linkInput.addEventListener('input', () => {
      els.linkInput.classList.remove('is-invalid');
      els.linkHint.classList.remove('is-error');
      els.linkHint.textContent = 'Demo links stay in this browser. Nothing is requested.';
    });

    els.queueList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove]');
      if (button) removeLink(button.dataset.remove);
    });

    els.targetInput.addEventListener('input', () => {
      const value = clamp(Math.round(Number(els.targetInput.value) || 10), 10, 10000);
      if (!state.running && (state.complete || state.delivered > 0)) resetSimulation(false);
      state.target = value;
      updateStats();
      saveSettings();
    });
    els.targetInput.addEventListener('blur', () => {
      els.targetInput.value = String(state.target);
    });

    els.payoutInput.addEventListener('input', () => {
      state.payout = clamp(Number(els.payoutInput.value) || 0.1, 0.1, 50);
      updateStats();
      renderQueue();
      saveSettings();
    });
    els.payoutInput.addEventListener('blur', () => {
      els.payoutInput.value = state.payout.toFixed(2);
      renderQueue();
    });

    els.relayInput.addEventListener('input', () => {
      state.relays = Number(els.relayInput.value);
      els.relayValue.textContent = String(state.relays);
      paintRange(els.relayInput);
      updateStats();
      saveSettings();
    });

    els.speedInput.addEventListener('input', () => {
      state.speed = Number(els.speedInput.value);
      els.speedValue.textContent = `${state.speed.toFixed(1)}×`;
      paintRange(els.speedInput);
      saveSettings();
    });

    els.resetBtn.addEventListener('click', () => resetSimulation(true));
    els.clearLog.addEventListener('click', clearLog);

    els.openScan.addEventListener('click', openScan);
    els.openScanBanner.addEventListener('click', openScan);
    els.closeScan.addEventListener('click', closeScan);
    els.scanDone.addEventListener('click', closeScan);
    els.copyHashes.addEventListener('click', copyHashes);
    els.scanDialog.addEventListener('click', (event) => {
      if (event.target === els.scanDialog) closeScan();
    });

    document.addEventListener('keydown', (event) => {
      const active = document.activeElement;
      const tag = active ? active.tagName : '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A' || active?.isContentEditable;

      if (event.key === 'Escape' && els.scanDialog.open) {
        closeScan();
        return;
      }
      if (typing || els.scanDialog.open) return;
      if (event.code === 'Space') {
        event.preventDefault();
        toggleCampaign();
      } else if (event.key.toLowerCase() === 'r') {
        resetSimulation(true);
      } else if (event.key === '?') {
        openScan();
      }
    });

    window.addEventListener('beforeunload', () => {
      window.clearTimeout(saveTimer);
      persistSettings();
    });
  }

  // ---------- boot ----------

  function boot() {
    loadSettings();

    els.targetInput.value = String(state.target);
    els.payoutInput.value = state.payout.toFixed(2);
    els.relayInput.value = String(state.relays);
    els.relayValue.textContent = String(state.relays);
    els.speedInput.value = String(state.speed);
    els.speedValue.textContent = `${state.speed.toFixed(1)}×`;

    paintRange(els.relayInput);
    paintRange(els.speedInput);

    renderQueue();
    updateAll();
    wireEvents();

    log('safe boot · archive components not executed · outbound traffic disabled', 'info');
    log('click lab ready · simulation engine loaded', 'info');

    let lastStep = performance.now();
    window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min((now - lastStep) / 1000, 0.5);
      lastStep = now;
      step(dt);
    }, 200);

    function frame(now) {
      drawMesh(now);
      drawChart();
      window.requestAnimationFrame(frame);
    }
    window.requestAnimationFrame(frame);
  }

  boot();
})();
