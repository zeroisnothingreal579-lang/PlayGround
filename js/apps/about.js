import { fs, QUOTA_BYTES, fmtBytes } from '../fs.js';
import { system, fmtUptime } from '../system.js';
import { settings, REGIONS } from '../settings.js';
import { icon } from '../icons.js';

function sessionId() {
  let id = sessionStorage.getItem('cloudbook.session');
  if (!id) {
    const rand = Math.random().toString(16).slice(2, 10);
    id = `cbx-${rand}`;
    sessionStorage.setItem('cloudbook.session', id);
  }
  return id;
}

const SPECS = [
  { icon: 'memory', label: 'Unified memory', value: '20 GB', note: 'LPDDR5X · 6400 MT/s', tone: 'violet' },
  { icon: 'disk', label: 'Storage', value: '1 TB', note: 'NVMe SSD · encrypted', tone: 'blue' },
  { icon: 'cpu', label: 'Cloud CPU', value: '8 cores', note: '3.8 GHz boost', tone: 'teal' },
  { icon: 'network', label: 'Network', value: '2.5 Gbps', note: '12 ms to edge', tone: 'mint' },
  { icon: 'sparkles', label: 'GPU', value: '16 cores', note: 'Metal-compatible', tone: 'rose' },
  { icon: 'globe', label: 'Region', value: 'Oregon', note: 'us-west-2 · HA', tone: 'amber' },
];

export function mount(body, ctx) {
  const sid = sessionId();
  body.innerHTML = `
    <div class="about-app">
      <section class="about-hero">
        <div class="about-orb"></div>
        <div class="about-mark">${icon('cloud', 42)}</div>
        <div class="about-heading">
          <div class="eyebrow"><span class="live-dot"></span> Cloud session live</div>
          <h1>CloudBook Pro</h1>
          <p>A full laptop — desktop, files, terminal and apps — streamed from the cloud into this browser.</p>
        </div>
        <div class="about-chip">20 GB · 1 TB</div>
      </section>

      <section class="spec-grid">
        ${SPECS.map((spec) => `
          <article class="spec-card">
            <span class="spec-icon tone-${spec.tone}">${icon(spec.icon, 18)}</span>
            <div class="spec-copy">
              <span class="spec-label">${spec.label}</span>
              <strong>${spec.value}</strong>
              <small>${spec.note}</small>
            </div>
          </article>`).join('')}
      </section>

      <section class="about-lower">
        <article class="about-panel storage-panel">
          <div class="panel-head">
            <div>
              <span class="panel-eyebrow">Cloud drive</span>
              <h3>1 TB NVMe</h3>
            </div>
            <span class="panel-badge" id="about-free"></span>
          </div>
          <div class="meter"><span class="meter-fill" id="about-meter"></span></div>
          <div class="meter-labels"><span id="about-used"></span><span>${fmtBytes(QUOTA_BYTES, 0)} capacity</span></div>
          <button class="btn btn-soft" data-open="files">${icon('folder', 15)} Open Files</button>
        </article>

        <article class="about-panel session-panel">
          <div class="panel-head">
            <div>
              <span class="panel-eyebrow">This session</span>
              <h3>Encrypted &amp; synced</h3>
            </div>
            <span class="panel-badge ok">${icon('shield', 13)} Secure</span>
          </div>
          <dl class="session-list">
            <div><dt>Session</dt><dd>${sid}</dd></div>
            <div><dt>Uptime</dt><dd id="about-uptime">—</dd></div>
            <div><dt>Region</dt><dd>${REGIONS[settings.region] || settings.region}</dd></div>
            <div><dt>Sync</dt><dd class="ok-text"><span class="sync-dot"></span> Live</dd></div>
          </dl>
        </article>
      </section>

      <section class="about-actions">
        <button class="btn btn-primary" data-open="terminal">${icon('terminal', 16)} Open Terminal</button>
        <button class="btn btn-ghost" data-open="files">${icon('folder', 16)} Browse Files</button>
        <button class="btn btn-ghost" data-open="monitor">${icon('monitor', 16)} System Monitor</button>
        <button class="btn btn-ghost" data-open="settings">${icon('settings', 16)} Settings</button>
      </section>

      <p class="about-note">CloudBook Pro runs entirely in your browser. The 20 GB / 1 TB profile is provisioned for this
      session, and every file you create is persisted locally on this device.</p>
    </div>`;

  const meter = body.querySelector('#about-meter');
  const used = body.querySelector('#about-used');
  const free = body.querySelector('#about-free');
  const uptime = body.querySelector('#about-uptime');

  const renderStorage = () => {
    const usedBytes = fs.usedBytes();
    const pct = Math.min(100, (usedBytes / QUOTA_BYTES) * 100);
    meter.style.width = `${Math.max(1.4, pct)}%`;
    used.textContent = `${fmtBytes(usedBytes)} used`;
    free.textContent = `${fmtBytes(QUOTA_BYTES - usedBytes)} free`;
  };
  renderStorage();
  const offFs = fs.onChange(renderStorage);

  const tick = () => {
    if (uptime) uptime.textContent = fmtUptime(system.uptimeSeconds());
  };
  tick();
  const timer = setInterval(tick, 1000);

  body.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => ctx.openApp(btn.dataset.open));
  });

  return () => {
    offFs();
    clearInterval(timer);
  };
}
