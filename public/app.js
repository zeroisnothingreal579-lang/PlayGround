(() => {
  const $ = (id) => document.getElementById(id);
  const screenEl = $('screen');
  const img = $('frame');
  const boot = $('boot');
  const bootTitle = $('bootTitle');
  const bootSub = $('bootSub');
  const bootLog = $('bootLog');
  const livePill = $('livePill');
  const liveText = $('liveText');
  const statusDot = $('statusDot');
  const statusText = $('statusText');
  const frameStat = $('frameStat');
  const modeStat = $('modeStat');
  const rotateBtn = $('rotateBtn');
  const newIpTop = $('newIpTop');
  const mRotate = $('mRotate');
  const urlForm = $('urlForm');
  const urlInput = $('urlInput');
  const exitEls = {
    flag: $('flag'),
    country: $('country'),
    host: $('proxyHost'),
    latency: $('latency'),
    ip: $('ip'),
    protocol: $('protocolBadge'),
    verified: $('verifiedBadge'),
    rotating: $('rotatingBadge'),
    rotations: $('rotations'),
    countries: $('countries'),
    nodes: $('nodes'),
    pool: $('poolPill'),
    poolInline: $('poolInline'),
    historyCount: $('historyCount'),
    history: $('history')
  };
  const mobile = { flag: $('mFlag'), ip: $('mIp'), country: $('mCountry') };
  const autoToggle = $('autoToggle');
  const autoSub = $('autoSub');
  let autoInfo = { enabled: false, seconds: 30, nextAt: 0 };

  const STATUS_LABEL = {
    booting: 'Booting',
    verifying: 'Probing exits',
    connecting: 'Tunnelling',
    live: 'Live',
    retrying: 'Switching',
    error: 'Offline'
  };

  let snapshot = null;
  let frameMeta = { width: 1280, height: 800 };
  let hasFrame = false;
  let lastFrameAt = 0;
  let busy = false;
  let lastLogLines = [];
  let frameUrl = null;
  let pendingFrame = null;
  let frameRaf = 0;
  let frameSocket = null;
  let fallbackStream = null;

  function post(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : '{}'
    }).catch(() => null);
  }

  function rotate() {
    if (busy) return;
    busy = true;
    setBusy(true);
    boot.classList.remove('hidden');
    post('/api/rotate').then((response) => {
      if (!response || !response.ok) {
        busy = false;
        setBusy(false);
      }
    });
    setTimeout(() => {
      if (busy) {
        busy = false;
        setBusy(false);
      }
    }, 45000);
  }

  function setBusy(value) {
    rotateBtn.disabled = value;
    newIpTop.disabled = value;
    mRotate.disabled = value;
    if (value) {
      rotateBtn.querySelector('span').textContent = 'Changing exit…';
    } else {
      rotateBtn.querySelector('span').textContent = 'Change IP';
    }
  }

  function applyStatus(s) {
    if (!s) return;
    snapshot = s;
    const label = STATUS_LABEL[s.status] || s.status;
    liveText.textContent = label;
    livePill.classList.toggle('is-live', s.status === 'live');
    livePill.classList.toggle('is-error', s.status === 'error');
    statusDot.className = 'status-dot' + (s.status === 'live' ? ' live' : s.status === 'error' ? ' error' : '');
    statusText.textContent = s.error ? s.error : s.message || label;

    const proxy = s.proxy;
    if (proxy) {
      exitEls.flag.textContent = proxy.flag || '🌐';
      exitEls.country.textContent = proxy.country || 'Unknown';
      exitEls.host.textContent = `${proxy.host}:${proxy.port}`;
      const latency = proxy.checkMs ?? proxy.latencyMs;
      exitEls.latency.textContent = latency ? `${Math.round(latency)} ms` : '—';
      exitEls.latency.classList.toggle('warn', Number(latency) > 1800);
      exitEls.protocol.textContent = proxy.protocol.toUpperCase();
      exitEls.protocol.classList.toggle('socks', proxy.protocol === 'socks5');
      mobile.flag.textContent = proxy.flag || '🌐';
      mobile.country.textContent = `${proxy.country || 'Unknown'} · ${proxy.protocol.toUpperCase()}`;
    }

    if (s.ip) {
      exitEls.ip.textContent = s.ip;
      exitEls.ip.classList.remove('pending');
      mobile.ip.textContent = s.ip;
    } else {
      exitEls.ip.textContent = '—';
      exitEls.ip.classList.add('pending');
      mobile.ip.textContent = '—';
    }
    exitEls.verified.hidden = !s.ipVerified || s.exitRotating;
    exitEls.rotating.hidden = !s.exitRotating;

    exitEls.rotations.textContent = String(s.rotationCount || 0);
    if (s.pool) {
      exitEls.nodes.textContent = String(s.pool.total || 0);
      exitEls.countries.textContent = String(s.pool.countries || 0);
      exitEls.pool.textContent = String(s.pool.verified || 0);
      exitEls.poolInline.textContent = `${s.pool.total} nodes · ${s.pool.countries} countries · ${s.pool.verified} verified`;
    }

    if (s.browserUrl && document.activeElement !== urlInput) {
      urlInput.value = prettyUrl(s.browserUrl);
    }
    if (Array.isArray(s.history)) renderHistory(s.history);
    if (s.auto) {
      autoInfo = s.auto;
      autoToggle.setAttribute('aria-checked', String(Boolean(s.auto.enabled)));
      renderAuto();
    }

    if (Array.isArray(s.logs) && s.logs.length) {
      lastLogLines = s.logs.slice(-4);
      bootLog.textContent = lastLogLines.join('\n');
    }

    bootTitle.textContent = s.status === 'error' ? 'Tunnel unavailable' : s.status === 'live' ? 'Connection live' : 'Establishing tunnel';
    bootSub.textContent = s.message || label;

    const settled = ['live', 'error'].includes(s.status);
    if (settled && busy) {
      busy = false;
      setBusy(false);
    }
    if (s.status === 'live' && hasFrame) {
      screenEl.classList.add('live', 'playing', 'has-frame');
    } else if (s.status === 'error') {
      screenEl.classList.remove('live', 'playing');
    }
    if (s.frameAt) modeStat.textContent = '1280 × 800';
  }

  function renderAuto() {
    if (!autoInfo.enabled) {
      autoSub.textContent = `Off · every ${autoInfo.seconds || 30}s`;
      return;
    }
    const remaining = autoInfo.nextAt ? Math.max(0, Math.ceil((autoInfo.nextAt - Date.now()) / 1000)) : null;
    autoSub.textContent = remaining === null ? `On · every ${autoInfo.seconds}s` : `On · next in ${remaining}s`;
  }

  setInterval(renderAuto, 1000);

  function prettyUrl(url) {
    if (!url) return 'ip.me';
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  function renderHistory(history) {
    exitEls.historyCount.textContent = String(history.length);
    if (!history.length) {
      exitEls.history.innerHTML = '<li class="empty">Your first rotation is on its way.</li>';
      return;
    }
    exitEls.history.innerHTML = history
      .map((item) => {
        const tag = item.protocol === 'socks5' ? 'socks5' : 'http';
        const latency = item.checkMs || item.latencyMs || 0;
        return `<li>
          <span class="h-flag">${item.flag || '🌐'}</span>
          <span class="h-meta">
            <span class="h-country">${escapeHtml(item.country || 'Unknown')}</span>
            <span class="h-ip">${escapeHtml(item.exitIp || '—')}</span>
          </span>
          <span class="h-tag">${tag}${latency ? ` · ${Math.round(latency)}ms` : ''}</span>
        </li>`;
      })
      .join('');
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function paintFrame(blob) {
    pendingFrame = blob;
    if (frameRaf) return;
    frameRaf = requestAnimationFrame(() => {
      frameRaf = 0;
      const next = pendingFrame;
      pendingFrame = null;
      if (!next) return;
      hasFrame = true;
      lastFrameAt = Date.now();
      const url = URL.createObjectURL(next);
      const previous = frameUrl;
      frameUrl = url;
      img.src = url;
      if (previous) URL.revokeObjectURL(previous);
      screenEl.classList.add('has-frame');
      if (snapshot?.status === 'live') screenEl.classList.add('live', 'playing');
    });
  }

  function applyFrame(frame) {
    if (!frame || !frame.data) return;
    frameMeta = { width: frame.width || 1280, height: frame.height || 800 };
    if (frameUrl) {
      URL.revokeObjectURL(frameUrl);
      frameUrl = null;
    }
    hasFrame = true;
    lastFrameAt = Date.now();
    img.src = `data:image/jpeg;base64,${frame.data}`;
    screenEl.classList.add('has-frame');
    if (snapshot?.status === 'live') screenEl.classList.add('live', 'playing');
  }

  function openFallbackFrames() {
    if (fallbackStream) return;
    fallbackStream = new EventSource('/api/stream?frames=1');
    fallbackStream.addEventListener('frame', (event) => {
      try {
        applyFrame(JSON.parse(event.data));
      } catch {}
    });
  }

  function connectFrames() {
    if (frameSocket) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/api/frames`);
    frameSocket = socket;
    socket.binaryType = 'blob';
    let opened = false;
    socket.onopen = () => {
      opened = true;
      if (fallbackStream) {
        fallbackStream.close();
        fallbackStream = null;
      }
    };
    socket.onmessage = (event) => {
      if (event.data instanceof Blob) paintFrame(event.data);
    };
    socket.onerror = () => {
      try {
        socket.close();
      } catch {}
    };
    socket.onclose = () => {
      if (frameSocket === socket) frameSocket = null;
      if (!opened) openFallbackFrames();
      setTimeout(connectFrames, 2500);
    };
    setTimeout(() => {
      if (!opened && frameSocket === socket) openFallbackFrames();
    }, 2200);
  }

  setInterval(() => {
    if (!hasFrame) return;
    frameStat.textContent = Date.now() - lastFrameAt > 3500 ? 'stream idle' : 'stream live';
  }, 500);

  async function refreshStatus() {
    const response = await fetch('/api/status', { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) return;
    const data = await response.json().catch(() => null);
    if (data) applyStatus(data);
  }

  function connectStream() {
    const source = new EventSource('/api/stream');
    source.addEventListener('status', (event) => {
      try {
        applyStatus(JSON.parse(event.data));
      } catch {}
    });
    source.addEventListener('frame', (event) => {
      try {
        applyFrame(JSON.parse(event.data));
      } catch {}
    });
    source.addEventListener('nav', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.url && document.activeElement !== urlInput) urlInput.value = prettyUrl(data.url);
      } catch {}
    });
    source.addEventListener('log', () => {});
    source.onerror = () => {
      liveText.textContent = 'Reconnecting';
      livePill.classList.remove('is-live');
      statusText.textContent = 'Lost connection to the browser host — retrying…';
      setTimeout(refreshStatus, 1200);
    };
    source.onopen = () => refreshStatus();
  }

  function remotePoint(clientX, clientY) {
    const rect = img.getBoundingClientRect();
    const vw = frameMeta.width || 1280;
    const vh = frameMeta.height || 800;
    const scale = Math.min(rect.width / vw, rect.height / vh) || 1;
    const contentWidth = vw * scale;
    const contentHeight = vh * scale;
    const offsetX = rect.left + (rect.width - contentWidth) / 2;
    const offsetY = rect.top + (rect.height - contentHeight) / 2;
    const x = Math.round((clientX - offsetX) / scale);
    const y = Math.round((clientY - offsetY) / scale);
    return {
      x: Math.max(0, Math.min(vw - 1, x)),
      y: Math.max(0, Math.min(vh - 1, y))
    };
  }

  let lastMove = 0;
  let moveFrame = 0;
  let lastMoveEvent = null;

  function sendMove(event) {
    lastMoveEvent = event;
    if (moveFrame) return;
    moveFrame = requestAnimationFrame(() => {
      moveFrame = 0;
      const now = Date.now();
      if (now - lastMove < 40 || !lastMoveEvent) return;
      lastMove = now;
      const { x, y } = remotePoint(lastMoveEvent.clientX, lastMoveEvent.clientY);
      post('/api/input', { action: 'move', x, y });
    });
  }

  let touchState = null;

  screenEl.addEventListener('pointerdown', (event) => {
    screenEl.focus({ preventScroll: true });
    screenEl.classList.add('touched');
    const point = remotePoint(event.clientX, event.clientY);
    if (event.pointerType === 'touch') {
      touchState = { start: point, lastY: event.clientY, dragged: false, id: event.pointerId };
      screenEl.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    post('/api/input', { action: 'down', x: point.x, y: point.y, button: 'left' });
    screenEl.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  screenEl.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') {
      if (!touchState) return;
      const dy = event.clientY - touchState.lastY;
      if (Math.abs(dy) > 2) {
        touchState.dragged = true;
        touchState.lastY = event.clientY;
        post('/api/input', {
          action: 'wheel',
          x: touchState.start.x,
          y: touchState.start.y,
          deltaX: 0,
          deltaY: Math.round(-dy * 2.2)
        });
      }
      return;
    }
    sendMove(event);
  });

  screenEl.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'touch') {
      if (touchState && !touchState.dragged) {
        post('/api/input', {
          action: 'click',
          x: touchState.start.x,
          y: touchState.start.y,
          button: 'left',
          clickCount: 1
        });
      }
      touchState = null;
      event.preventDefault();
      return;
    }
    const { x, y } = remotePoint(event.clientX, event.clientY);
    post('/api/input', { action: 'up', x, y, button: event.button === 2 ? 'right' : 'left' });
    event.preventDefault();
  });

  screenEl.addEventListener('pointercancel', () => {
    touchState = null;
    post('/api/input', { action: 'up', x: 0, y: 0, button: 'left' });
  });

  screenEl.addEventListener('wheel', (event) => {
    event.preventDefault();
    const { x, y } = remotePoint(event.clientX, event.clientY);
    post('/api/input', {
      action: 'wheel',
      x,
      y,
      deltaX: Math.round(event.deltaX),
      deltaY: Math.round(event.deltaY)
    });
  }, { passive: false });

  screenEl.addEventListener('contextmenu', (event) => event.preventDefault());

  const KEY_MAP = {
    Enter: 'Enter',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Tab: 'Tab',
    Escape: 'Escape',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert'
  };

  function isEditable(el) {
    if (!el) return false;
    return el === urlInput || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el !== screenEl);
  }

  window.addEventListener('keydown', (event) => {
    if (isEditable(event.target)) return;
    if (event.key === 'r' || event.key === 'R') {
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        rotate();
        return;
      }
    }
    if (document.activeElement !== screenEl && !screenEl.contains(document.activeElement)) return;
    handleKey(event, true);
  });

  window.addEventListener('keyup', (event) => {
    if (isEditable(event.target)) return;
    if (document.activeElement !== screenEl && !screenEl.contains(document.activeElement)) return;
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) return;
    event.preventDefault();
  });

  function handleKey(event, isDown) {
    const modifier = event.ctrlKey || event.metaKey || event.altKey;
    if (modifier) {
      if (!isDown) return;
      event.preventDefault();
      const parts = [];
      if (event.ctrlKey) parts.push('Control');
      if (event.metaKey) parts.push('Meta');
      if (event.altKey) parts.push('Alt');
      if (event.shiftKey) parts.push('Shift');
      parts.push(event.key.length === 1 ? event.key.toLowerCase() : event.key);
      post('/api/input', { action: 'press', key: parts.join('+') });
      return;
    }
    if (event.key.length === 1) {
      if (!isDown || event.repeat) return;
      event.preventDefault();
      post('/api/input', { action: 'type', text: event.key });
      return;
    }
    const mapped = KEY_MAP[event.key];
    if (!mapped) return;
    event.preventDefault();
    if (event.key === 'Tab' && event.shiftKey) {
      post('/api/input', { action: 'press', key: 'Shift+Tab' });
      return;
    }
    if (isDown && !event.repeat) post('/api/input', { action: 'press', key: mapped });
  }

  autoToggle.addEventListener('click', () => {
    const enabled = autoToggle.getAttribute('aria-checked') !== 'true';
    autoToggle.setAttribute('aria-checked', String(enabled));
    autoInfo = { ...autoInfo, enabled, nextAt: enabled ? Date.now() + autoInfo.seconds * 1000 : 0 };
    renderAuto();
    post('/api/auto', { enabled, seconds: autoInfo.seconds || 30 });
  });

  rotateBtn.addEventListener('click', rotate);
  newIpTop.addEventListener('click', rotate);
  mRotate.addEventListener('click', rotate);

  urlForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = urlInput.value.trim();
    if (!value) return;
    screenEl.classList.add('touched');
    urlInput.blur();
    post('/api/navigate', { url: value });
  });

  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'back') post('/api/back');
      if (action === 'forward') post('/api/forward');
      if (action === 'reload') post('/api/reload');
    });
  });

  document.querySelectorAll('[data-url]').forEach((button) => {
    button.addEventListener('click', () => {
      urlInput.value = prettyUrl(button.dataset.url);
      post('/api/navigate', { url: button.dataset.url });
      screenEl.classList.add('touched');
    });
  });

  img.addEventListener('load', () => {
    if (!hasFrame) return;
    screenEl.classList.add('has-frame');
  });

  screenEl.addEventListener('focus', () => screenEl.classList.add('touched'));

  connectStream();
  connectFrames();
  refreshStatus();
  setInterval(refreshStatus, 10000);
})();
