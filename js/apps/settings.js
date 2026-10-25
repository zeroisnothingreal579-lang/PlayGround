import { fs, HOME, TRASH, QUOTA_BYTES, fmtBytes } from '../fs.js';
import { system, fmtUptime } from '../system.js';
import {
  settings, saveSettings, resetSettings, onSettings,
  ACCENTS, WALLPAPERS, REGIONS,
} from '../settings.js';
import { icon } from '../icons.js';
import { toast, confirmDialog, escapeHtml } from '../ui.js';

const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: 'sun' },
  { id: 'desktop', label: 'Desktop & Dock', icon: 'desktop' },
  { id: 'cloud', label: 'Cloud', icon: 'cloud' },
  { id: 'storage', label: 'Storage', icon: 'disk' },
  { id: 'about', label: 'About', icon: 'cpu' },
];

function sessionId() {
  let id = sessionStorage.getItem('cloudbook.session');
  if (!id) {
    id = `cbx-${Math.random().toString(16).slice(2, 10)}`;
    sessionStorage.setItem('cloudbook.session', id);
  }
  return id;
}

function toggle(key, on) {
  return `<button class="switch ${on ? 'on' : ''}" data-toggle="${key}" role="switch" aria-checked="${on}" aria-label="${key}"><span></span></button>`;
}

export function mount(body, ctx) {
  let section = 'appearance';
  const timeouts = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => { timeouts.delete(id); fn(); }, ms);
    timeouts.add(id);
    return id;
  };

  body.innerHTML = `
    <div class="settings-app">
      <aside class="settings-sidebar">
        <div class="settings-profile">
          <div class="settings-avatar">C</div>
          <div><strong>Cloud User</strong><small>cloud@cloudbook</small></div>
        </div>
        <nav class="settings-nav" id="settings-nav">
          ${SECTIONS.map((item) => `
            <button class="settings-nav-item ${item.id === section ? 'active' : ''}" data-section="${item.id}">
              ${icon(item.icon, 16)}<span>${item.label}</span>
            </button>`).join('')}
        </nav>
        <div class="settings-plan-mini">
          <span class="live-dot"></span>
          <div><strong>CloudBook Pro</strong><small>20 GB · 1 TB</small></div>
        </div>
      </aside>
      <div class="settings-main" id="settings-main"></div>
    </div>`;

  const main = body.querySelector('#settings-main');

  function appearanceSection() {
    return `
      <div class="settings-section">
        <div class="settings-head">
          <h2>Appearance</h2>
          <p>Make this cloud laptop feel like yours.</p>
        </div>
        <article class="settings-card">
          <div class="settings-card-head"><h3>Theme</h3><p>Switch between a deep space desktop and a bright workspace.</p></div>
          <div class="segmented" role="group" aria-label="Theme">
            <button data-theme-set="dark" class="${settings.theme === 'dark' ? 'active' : ''}">${icon('moon', 14)} Dark</button>
            <button data-theme-set="light" class="${settings.theme === 'light' ? 'active' : ''}">${icon('sun', 14)} Light</button>
          </div>
        </article>

        <article class="settings-card">
          <div class="settings-card-head"><h3>Accent color</h3><p>Used for highlights, buttons and the dock glow.</p></div>
          <div class="accent-row">
            ${Object.entries(ACCENTS).map(([key, value]) => `
              <button class="accent-swatch ${settings.accent === key ? 'active' : ''}" data-accent="${key}"
                style="--swatch:${value.accent};--swatch2:${value.accent2}" title="${value.name}" aria-label="${value.name}">
                ${settings.accent === key ? icon('check', 14) : ''}
              </button>`).join('')}
          </div>
        </article>

        <article class="settings-card">
          <div class="settings-card-head"><h3>Wallpaper</h3><p>Animated gradients rendered on the GPU.</p></div>
          <div class="wallpaper-grid">
            ${Object.entries(WALLPAPERS).map(([key, value]) => `
              <button class="wallpaper-option ${settings.wallpaper === key ? 'active' : ''}" data-wallpaper="${key}">
                <span class="wallpaper-preview preview-${key}"></span>
                <span class="wallpaper-copy"><strong>${value.name}</strong><small>${value.blurb}</small></span>
              </button>`).join('')}
          </div>
        </article>
      </div>`;
  }

  function desktopSection() {
    return `
      <div class="settings-section">
        <div class="settings-head">
          <h2>Desktop &amp; Dock</h2>
          <p>Fine-tune the way your cloud desktop behaves.</p>
        </div>
        <article class="settings-card">
          <div class="settings-card-head"><h3>Dock size</h3><p>Drag to resize the dock icons.</p></div>
          <div class="range-row">
            <span class="range-icon">${icon('panel-left', 16)}</span>
            <input type="range" min="44" max="72" step="2" value="${settings.dockSize}" id="dock-size-range" aria-label="Dock size">
            <output id="dock-size-value">${settings.dockSize}px</output>
          </div>
        </article>
        <article class="settings-card row-card">
          <div class="settings-card-head"><h3>Reduce motion</h3><p>Disable wallpaper drift and window animations.</p></div>
          ${toggle('reduceMotion', settings.reduceMotion)}
        </article>
        <article class="settings-card row-card">
          <div class="settings-card-head"><h3>Cloud sync</h3><p>Keep your files in sync with the edge.</p></div>
          ${toggle('sync', settings.sync)}
        </article>
        <article class="settings-card">
          <div class="settings-card-head"><h3>Reset desktop</h3><p>Restore the default dock size and motion settings.</p></div>
          <button class="btn btn-ghost" id="reset-desktop">${icon('refresh', 14)} Reset desktop</button>
        </article>
      </div>`;
  }

  function cloudSection() {
    const region = REGIONS[settings.region] || settings.region;
    return `
      <div class="settings-section">
        <div class="settings-head">
          <h2>Cloud</h2>
          <p>Your machine, provisioned at the edge.</p>
        </div>
        <article class="plan-card">
          <div class="plan-glow"></div>
          <div class="plan-top">
            <div>
              <span class="plan-eyebrow">ACTIVE PLAN</span>
              <h3>CloudBook Pro</h3>
              <p>20 GB unified memory · 1 TB NVMe · 8 vCPU</p>
            </div>
            <span class="panel-badge ok">${icon('shield', 13)} Active</span>
          </div>
          <div class="plan-chips">
            <span>${icon('memory', 13)} 20 GB</span>
            <span>${icon('disk', 13)} 1 TB</span>
            <span>${icon('cpu', 13)} 8 cores</span>
            <span>${icon('network', 13)} 2.5 Gbps</span>
          </div>
          <div class="plan-foot">
            <span><strong>$24</strong> / month · renews Nov 25</span>
            <button class="btn btn-ghost btn-sm" data-open="about">Session details</button>
          </div>
        </article>

        <article class="settings-card">
          <div class="settings-card-head"><h3>Region</h3><p>Lower latency means a snappier desktop.</p></div>
          <select class="select" id="region-select">
            ${Object.entries(REGIONS).map(([key, label]) => `
              <option value="${key}" ${settings.region === key ? 'selected' : ''}>${label} · ${key}</option>`).join('')}
          </select>
          <p class="settings-hint">${icon('globe', 13)} Current edge: ${region} · 12 ms round trip</p>
        </article>

        <article class="settings-card row-card">
          <div class="settings-card-head"><h3>Cloud Sync</h3><p>${settings.sync ? 'Files sync automatically.' : 'Sync is paused. Changes stay on this device.'}</p></div>
          ${toggle('sync', settings.sync)}
        </article>

        <article class="settings-card">
          <div class="settings-card-head"><h3>Sync now</h3><p>Push local changes to your cloud drive immediately.</p></div>
          <div class="sync-row">
            <button class="btn btn-primary" id="sync-now">${icon('sync', 14)} Sync now</button>
            <span class="settings-hint" id="sync-result">Last sync: just now · 12 objects</span>
          </div>
        </article>

        <article class="settings-card session-card-settings">
          <div class="settings-card-head"><h3>Session</h3></div>
          <dl class="settings-list">
            <div><dt>Session ID</dt><dd>${sessionId()}</dd></div>
            <div><dt>Uptime</dt><dd>${fmtUptime(system.uptimeSeconds())}</dd></div>
            <div><dt>Encryption</dt><dd>AES-256 at rest</dd></div>
            <div><dt>Endpoint</dt><dd>cloudbook.local</dd></div>
          </dl>
        </article>
      </div>`;
  }

  function storageSection() {
    const used = fs.usedBytes();
    const free = QUOTA_BYTES - used;
    const pct = Math.min(100, (used / QUOTA_BYTES) * 100);
    const breakdown = fs.breakdown();
    const trash = fs.list(TRASH).length;
    return `
      <div class="settings-section">
        <div class="settings-head">
          <h2>Storage</h2>
          <p>1 TB of encrypted NVMe, shared by every app.</p>
        </div>
        <article class="settings-card">
          <div class="storage-hero">
            <div class="storage-ring" style="--pct:${pct}">
              <div><strong>${pct.toFixed(0)}%</strong><small>used</small></div>
            </div>
            <div class="storage-copy">
              <h3>${fmtBytes(used)} of 1 TB</h3>
              <p>${fmtBytes(free)} available · NVMe SSD</p>
              <div class="meter"><span class="meter-fill" style="width:${Math.max(1.4, pct)}%"></span></div>
            </div>
          </div>
          <div class="storage-stack">
            ${breakdown.map((item) => `<span class="stack-seg dot-${item.tone}" style="flex:${Math.max(item.bytes, 1)}"></span>`).join('')}
          </div>
          <div class="breakdown-list">
            ${breakdown.map((item) => `
              <div class="breakdown-row">
                <span class="legend-dot dot-${item.tone}"></span>
                <span class="breakdown-label">${escapeHtml(item.label)}</span>
                <span class="breakdown-value">${fmtBytes(item.bytes)}</span>
              </div>`).join('')}
            <div class="breakdown-row">
              <span class="legend-dot dot-free"></span>
              <span class="breakdown-label">Free space</span>
              <span class="breakdown-value">${fmtBytes(free)}</span>
            </div>
          </div>
        </article>

        <article class="settings-card row-card">
          <div class="settings-card-head"><h3>Trash</h3><p>${trash ? `${trash} item${trash === 1 ? '' : 's'} waiting to be removed.` : 'Trash is empty.'}</p></div>
          <button class="btn btn-ghost btn-sm" id="empty-trash" ${trash ? '' : 'disabled'}>${icon('trash', 14)} Empty Trash</button>
        </article>

        <article class="settings-card row-card danger-card">
          <div class="settings-card-head"><h3>Reset cloud drive</h3><p>Delete every file you created and restore the demo files.</p></div>
          <button class="btn btn-danger btn-sm" id="reset-drive">${icon('refresh', 14)} Reset drive</button>
        </article>
      </div>`;
  }

  function aboutSection() {
    const used = fs.usedBytes();
    return `
      <div class="settings-section">
        <div class="settings-head">
          <h2>About</h2>
          <p>CloudBook Pro · CloudBook OS 4.2</p>
        </div>
        <article class="settings-card about-machine">
          <div class="settings-machine-mark">${icon('cloud', 30)}</div>
          <div>
            <h3>CloudBook Pro (2026)</h3>
            <p>8-core cloud CPU · 20 GB unified memory · 1 TB NVMe</p>
            <p class="settings-hint">Region ${REGIONS[settings.region] || settings.region} · uptime ${fmtUptime(system.uptimeSeconds())} · ${fmtBytes(used)} used</p>
          </div>
        </article>
        <article class="settings-card">
          <dl class="settings-list">
            <div><dt>OS</dt><dd>CloudBook OS 4.2 (build 2026.10.25)</dd></div>
            <div><dt>Kernel</dt><dd>6.9.4-cloud</dd></div>
            <div><dt>Window manager</dt><dd>CloudWM 4.2</dd></div>
            <div><dt>Browser engine</dt><dd>Nimbus 126</dd></div>
            <div><dt>Storage engine</dt><dd>Local persistent volume</dd></div>
            <div><dt>Accent</dt><dd>${ACCENTS[settings.accent]?.name || settings.accent}</dd></div>
          </dl>
        </article>
        <article class="settings-card">
          <div class="settings-card-head"><h3>Shortcuts</h3></div>
          <dl class="settings-list">
            <div><dt>Command palette</dt><dd><kbd>⌘K</kbd> / <kbd>Ctrl K</kbd></dd></div>
            <div><dt>Terminal</dt><dd><kbd>Ctrl Alt T</kbd></dd></div>
            <div><dt>Close window</dt><dd><kbd>⌘W</kbd></dd></div>
            <div><dt>Minimize</dt><dd><kbd>⌘M</kbd></dd></div>
          </dl>
        </article>
        <article class="settings-card row-card">
          <div class="settings-card-head"><h3>Reset settings</h3><p>Restore the default theme, accent, wallpaper and dock.</p></div>
          <button class="btn btn-ghost btn-sm" id="reset-settings">${icon('refresh', 14)} Reset settings</button>
        </article>
        <p class="settings-footnote">CloudBook Pro runs entirely in this browser tab. Files are stored locally;
        the hardware profile and live telemetry are simulated for the demo.</p>
      </div>`;
  }

  function currentHtml() {
    if (section === 'desktop') return desktopSection();
    if (section === 'cloud') return cloudSection();
    if (section === 'storage') return storageSection();
    if (section === 'about') return aboutSection();
    return appearanceSection();
  }

  function render() {
    body.querySelectorAll('.settings-nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.section === section);
    });
    main.innerHTML = currentHtml();
    bind();
  }

  function bind() {
    main.querySelectorAll('[data-theme-set]').forEach((btn) => {
      btn.addEventListener('click', () => saveSettings({ theme: btn.dataset.themeSet }));
    });
    main.querySelectorAll('[data-accent]').forEach((btn) => {
      btn.addEventListener('click', () => saveSettings({ accent: btn.dataset.accent }));
    });
    main.querySelectorAll('[data-wallpaper]').forEach((btn) => {
      btn.addEventListener('click', () => saveSettings({ wallpaper: btn.dataset.wallpaper }));
    });
    main.querySelectorAll('[data-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.toggle;
        const value = !settings[key];
        saveSettings({ [key]: value });
        if (key === 'sync') {
          toast({
            title: value ? 'Cloud sync enabled' : 'Cloud sync paused',
            message: value ? 'Changes will sync automatically.' : 'Your files stay on this device.',
            iconName: value ? 'sync' : 'moon',
          });
        }
      });
    });
    const dockRange = main.querySelector('#dock-size-range');
    if (dockRange) {
      const output = main.querySelector('#dock-size-value');
      dockRange.addEventListener('input', () => {
        document.documentElement.style.setProperty('--dock-size', `${dockRange.value}px`);
        output.textContent = `${dockRange.value}px`;
      });
      dockRange.addEventListener('change', () => {
        saveSettings({ dockSize: Number(dockRange.value) });
      });
    }
    main.querySelector('#reset-desktop')?.addEventListener('click', () => {
      saveSettings({ dockSize: 56, reduceMotion: false });
      toast({ title: 'Desktop reset', message: 'Dock size and motion restored.', iconName: 'check' });
    });
    main.querySelector('#region-select')?.addEventListener('change', (e) => {
      saveSettings({ region: e.target.value });
      toast({ title: 'Region updated', message: REGIONS[e.target.value], iconName: 'globe' });
    });
    main.querySelector('#sync-now')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const result = main.querySelector('#sync-result');
      btn.disabled = true;
      btn.innerHTML = `${icon('sync', 14)} Syncing…`;
      if (result) result.textContent = 'Contacting us-west-2 edge…';
      later(() => {
        if (!document.body.contains(btn)) return;
        btn.disabled = false;
        btn.innerHTML = `${icon('sync', 14)} Sync now`;
        if (result) result.textContent = 'Last sync: just now · 12 objects';
        toast({ title: 'Cloud sync complete', message: '12 objects · 8 ms · us-west-2', iconName: 'sync' });
      }, 1100);
    });
    main.querySelector('#empty-trash')?.addEventListener('click', async () => {
      const count = fs.emptyTrash();
      toast({ title: 'Trash emptied', message: `${count} item${count === 1 ? '' : 's'} removed.`, iconName: 'trash' });
    });
    main.querySelector('#reset-drive')?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Reset cloud drive?',
        message: 'Every file you created will be deleted and the demo files restored. This cannot be undone.',
        confirmText: 'Reset drive',
        danger: true,
        iconName: 'refresh',
      });
      if (!ok) return;
      fs.reset();
      toast({ title: 'Cloud drive reset', message: 'Demo files restored.', iconName: 'check' });
      render();
    });
    main.querySelector('#reset-settings')?.addEventListener('click', () => {
      resetSettings();
      toast({ title: 'Settings reset', message: 'Defaults restored.', iconName: 'check' });
    });
    main.querySelector('[data-open="about"]')?.addEventListener('click', () => ctx.openApp('about'));
  }

  body.querySelector('#settings-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-section]');
    if (!btn) return;
    section = btn.dataset.section;
    render();
  });

  const offSettings = onSettings(() => render());
  const offFs = fs.onChange(() => {
    if (section === 'storage' || section === 'about') render();
  });

  render();

  return () => {
    offSettings();
    offFs();
    timeouts.forEach((id) => clearTimeout(id));
  };
}
