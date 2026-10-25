import { fs, HOME, TRASH, fmtBytes } from './fs.js';
import {
  settings, saveSettings, applySettings, onSettings, WALLPAPERS, ACCENTS,
} from './settings.js';
import { system } from './system.js';
import { APPS, DOCK_APPS } from './apps/index.js';
import {
  openApp, configureWindowManager, onWindows, getActiveWindow, closeActiveWindow,
  minimizeActiveWindow, cycleWindows, focusWindow, minimizeWindow, restoreWindow,
  toggleMaximize,
} from './wm.js';
import { icon, hydrateIcons, fileIcon } from './icons.js';
import {
  toast, lockScreen, unlockScreen, updateLockClock, sleepScreen, promptDialog,
  confirmDialog, contextMenu, lightbox, closeContextMenu, escapeHtml,
} from './ui.js';

const $ = (sel) => document.querySelector(sel);

const ISSUE_URL = 'https://github.com/zeroisnothingreal579-lang/PlayGround/issues';

function isImageNode(node) {
  return (node.mime || '').startsWith('image/') || /\.svg$/i.test(node.name);
}

function imageSrc(node) {
  const content = node.content || '';
  if (content.startsWith('data:')) return content;
  if (/\.svg$/i.test(node.name)) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
  return null;
}

function openPath(path) {
  const node = fs.get(path);
  if (!node) {
    toast({ title: 'Not found', message: path, iconName: 'x', tone: 'danger' });
    return;
  }
  if (node.type === 'dir') {
    openApp('files', { path });
    return;
  }
  if (isImageNode(node)) {
    const src = imageSrc(node);
    if (src) {
      lightbox({ src, name: node.name, caption: `${fmtBytes(fs.bytes(node))} · cloud drive` });
      return;
    }
  }
  if ((node.content || '').startsWith('data:')) {
    toast({ title: 'Binary file', message: 'Preview is not available for this type.', iconName: 'file', tone: 'danger' });
    return;
  }
  openApp('editor', { path });
}

configureWindowManager({ openPath });

/* ---------------------------------------------------------------- dock */

function buildDock() {
  const dock = $('#dock');
  dock.innerHTML = `
    <button class="dock-item dock-launcher" data-launcher title="All apps" aria-label="All apps">
      <span class="dock-tile launcher-tile">${icon('grid', 22)}</span>
      <span class="dock-tooltip">All apps</span>
    </button>
    <span class="dock-sep"></span>
    ${DOCK_APPS.map((id) => {
      const app = APPS[id];
      return `<button class="dock-item" data-app="${id}" title="${app.name}" aria-label="${app.name}">
        <span class="dock-tile tone-${app.tone}">${icon(app.icon, 24)}</span>
        <span class="dock-dot"></span>
        <span class="dock-tooltip">${app.name}</span>
      </button>`;
    }).join('')}`;

  dock.querySelector('[data-launcher]').addEventListener('click', openPalette);
  dock.querySelectorAll('[data-app]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const appId = btn.dataset.app;
      const wins = allAppWindows(appId);
      const active = getActiveWindow();
      if (!wins.length) {
        openApp(appId);
        return;
      }
      if (active && active.appId === appId) {
        minimizeWindow(active);
        return;
      }
      const minimized = wins.filter((win) => win.minimized);
      if (minimized.length) restoreWindow(minimized[minimized.length - 1]);
      else focusWindow(wins[wins.length - 1]);
    });
  });
}

let lastWindows = [];
function allAppWindows(appId) {
  return lastWindows.filter((win) => win.appId === appId);
}

function updateDock(windows, active) {
  lastWindows = windows;
  document.querySelectorAll('.dock-item[data-app]').forEach((btn) => {
    const appId = btn.dataset.app;
    const wins = windows.filter((win) => win.appId === appId);
    btn.classList.toggle('running', wins.length > 0);
    btn.classList.toggle('active', Boolean(active && active.appId === appId && !active.minimized));
    btn.classList.toggle('all-minimized', wins.length > 0 && wins.every((win) => win.minimized));
  });
}

/* ------------------------------------------------------------ menu bar */

const MENUS = [
  {
    label: 'File',
    items: [
      { label: 'New Finder Window', iconName: 'folder', action: () => openApp('files') },
      { label: 'New Document', iconName: 'editor', action: () => openApp('editor') },
      { label: 'Open Terminal', iconName: 'terminal', shortcut: '⌃⌥T', action: () => openApp('terminal') },
      { separator: true },
      { label: 'Close Window', iconName: 'x', shortcut: '⌘W', action: closeActiveWindow },
    ],
  },
  {
    label: 'View',
    items: [
      {
        label: 'Toggle Dark Mode',
        iconName: settings.theme === 'dark' ? 'sun' : 'moon',
        action: () => saveSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' }),
      },
      { label: 'Next Wallpaper', iconName: 'image', action: nextWallpaper },
      {
        label: 'Toggle Focus',
        iconName: 'moon',
        action: () => saveSettings({ focus: !settings.focus }),
      },
      { separator: true },
      { label: 'Enter Full Screen', iconName: 'maximize', action: enterFullscreen },
    ],
  },
  {
    label: 'Window',
    items: [
      { label: 'Minimize', iconName: 'minus', shortcut: '⌘M', action: minimizeActiveWindow },
      {
        label: 'Zoom',
        iconName: 'maximize',
        action: () => { const win = getActiveWindow(); if (win) toggleMaximize(win); },
      },
      { label: 'Cycle Windows', iconName: 'layers', action: cycleWindows },
      { separator: true },
      { label: 'Close Window', iconName: 'x', shortcut: '⌘W', action: closeActiveWindow },
    ],
  },
  {
    label: 'Help',
    items: [
      { label: 'CloudBook Help', iconName: 'doc', action: () => openApp('browser', { url: 'cloudbook://docs' }) },
      { label: 'Hardware Specs', iconName: 'cpu', action: () => openApp('browser', { url: 'cloudbook://specs' }) },
      { label: 'Keyboard Shortcuts', iconName: 'command', action: () => openApp('browser', { url: 'cloudbook://docs' }) },
      { separator: true },
      { label: 'Report an Issue', iconName: 'external', action: () => window.open(ISSUE_URL, '_blank', 'noopener') },
    ],
  },
];

function buildMenuBar() {
  const container = $('#menubar-menus');
  container.innerHTML = MENUS.map((menu, i) => `<button class="menubar-menu" data-menu="${i}">${menu.label}</button>`).join('');
  container.querySelectorAll('[data-menu]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const menu = MENUS[Number(btn.dataset.menu)];
      const rect = btn.getBoundingClientRect();
      contextMenu(menu.items, rect.left, rect.bottom + 5);
    });
  });

  $('#brand-menu').addEventListener('click', (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    contextMenu([
      { label: 'About This CloudBook', iconName: 'cloud', action: () => openApp('about') },
      { label: 'System Settings…', iconName: 'settings', action: () => openApp('settings') },
      { separator: true },
      { label: 'Command Palette', iconName: 'search', shortcut: '⌘K', action: openPalette },
      { label: 'Lock Screen', iconName: 'lock', action: lockScreen },
      { label: 'Sleep', iconName: 'moon', action: sleepScreen },
      { separator: true },
      {
        label: 'Restart CloudBook…',
        iconName: 'refresh',
        action: async () => {
          const ok = await confirmDialog({
            title: 'Restart CloudBook?',
            message: 'Your files are saved. The session will reload and reconnect to the edge.',
            confirmText: 'Restart',
            iconName: 'refresh',
          });
          if (ok) location.reload();
        },
      },
    ], rect.left, rect.bottom + 5);
  });
}

function nextWallpaper() {
  const keys = Object.keys(WALLPAPERS);
  const index = keys.indexOf(settings.wallpaper);
  saveSettings({ wallpaper: keys[(index + 1) % keys.length] });
  toast({ title: 'Wallpaper changed', message: WALLPAPERS[settings.wallpaper].name, iconName: 'image' });
}

function enterFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {
      toast({ title: 'Full screen unavailable', message: 'Your browser blocked the request.', iconName: 'x', tone: 'danger' });
    });
  } else {
    document.exitFullscreen?.();
  }
}

/* -------------------------------------------------------------- desktop */

const DESKTOP_ITEMS = [
  { label: 'Cloud Drive', path: HOME, icon: 'cloud', tone: 'violet', kind: 'folder' },
  { label: 'Documents', path: `${HOME}/Documents`, icon: 'doc', tone: 'blue', kind: 'folder' },
  { label: 'Projects', path: `${HOME}/Projects`, icon: 'editor', tone: 'amber', kind: 'folder' },
  { label: 'Welcome.md', path: `${HOME}/Documents/Welcome.md`, icon: 'doc', tone: 'blue', kind: 'file' },
  { label: 'Trash', path: TRASH, icon: 'trash', tone: 'slate', kind: 'trash' },
];

function buildDesktop() {
  const container = $('#desktop-icons');
  container.innerHTML = DESKTOP_ITEMS.map((item) => `
    <button class="desktop-icon" data-path="${item.path}" data-kind="${item.kind}">
      <span class="desktop-icon-visual tone-${item.tone}">${icon(item.icon, 28)}</span>
      <span class="desktop-icon-label">${item.label}</span>
    </button>`).join('');

  let selected = null;
  container.querySelectorAll('.desktop-icon').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      container.querySelectorAll('.desktop-icon').forEach((el) => el.classList.remove('selected'));
      btn.classList.add('selected');
      selected = btn;
    });
    btn.addEventListener('dblclick', () => openPath(btn.dataset.path));
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      container.querySelectorAll('.desktop-icon').forEach((el) => el.classList.remove('selected'));
      btn.classList.add('selected');
      const items = [
        { label: 'Open', iconName: 'folder', action: () => openPath(btn.dataset.path) },
      ];
      if (btn.dataset.kind === 'file') {
        items.push({ label: 'Open in Editor', iconName: 'editor', action: () => openApp('editor', { path: btn.dataset.path }) });
      }
      if (btn.dataset.kind === 'trash') {
        items.push({ separator: true });
        items.push({
          label: 'Empty Trash',
          iconName: 'trash',
          danger: true,
          action: () => {
            const count = fs.emptyTrash();
            toast({ title: 'Trash emptied', message: `${count} item${count === 1 ? '' : 's'} removed.`, iconName: 'trash' });
          },
        });
      }
      items.push({ separator: true });
      items.push({ label: 'Get Info', iconName: 'file', action: () => toast({ title: btn.textContent.trim(), message: btn.dataset.path, iconName: 'file' }) });
      contextMenu(items, e.clientX, e.clientY);
    });
  });

  $('#desktop').addEventListener('click', () => {
    container.querySelectorAll('.desktop-icon').forEach((el) => el.classList.remove('selected'));
    selected = null;
  });

  $('#desktop').addEventListener('contextmenu', (e) => {
    if (e.target.closest('.desktop-icon')) return;
    e.preventDefault();
    const desktopPath = `${HOME}/Desktop`;
    contextMenu([
      {
        label: 'New Folder',
        iconName: 'folder-plus',
        action: async () => {
          const name = await promptDialog({ title: 'New Folder', label: 'Folder name', value: 'Untitled folder', confirmText: 'Create', iconName: 'folder-plus' });
          if (!name) return;
          if (!fs.mkdir(`${desktopPath}/${name}`)) {
            toast({ title: 'Could not create folder', message: 'That name is already taken.', iconName: 'x', tone: 'danger' });
          }
        },
      },
      {
        label: 'New Document',
        iconName: 'file-plus',
        action: async () => {
          const name = await promptDialog({ title: 'New Document', label: 'File name', value: 'untitled.md', confirmText: 'Create', iconName: 'file-plus' });
          if (!name) return;
          const path = `${desktopPath}/${name}`;
          if (fs.exists(path)) {
            toast({ title: 'Already exists', message: name, iconName: 'x', tone: 'danger' });
            return;
          }
          fs.write(path, '');
          openApp('editor', { path });
        },
      },
      { separator: true },
      { label: 'Open Terminal', iconName: 'terminal', action: () => openApp('terminal', { cwd: HOME }) },
      { label: 'Personalize…', iconName: 'settings', action: () => openApp('settings') },
      { label: 'Next Wallpaper', iconName: 'image', action: nextWallpaper },
      { separator: true },
      { label: 'About This CloudBook', iconName: 'cloud', action: () => openApp('about') },
    ], e.clientX, e.clientY);
  });
}

/* --------------------------------------------------------- control center */

function setupControlCenter() {
  const panel = $('#control-center');
  const toggle = $('#control-toggle');
  toggle.innerHTML = icon('control', 18);
  $('#wifi-icon').innerHTML = icon('wifi', 17);
  $('#battery-icon').innerHTML = icon('battery', 17);

  const syncChip = $('#sync-chip');
  const open = () => {
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('show'));
    syncControlLabels();
    setTimeout(() => document.addEventListener('pointerdown', onOutside), 0);
  };
  const close = () => {
    panel.classList.remove('show');
    setTimeout(() => { panel.hidden = true; }, 160);
    document.removeEventListener('pointerdown', onOutside);
  };
  const onOutside = (e) => {
    if (!panel.contains(e.target) && !toggle.contains(e.target)) close();
  };

  toggle.addEventListener('click', () => {
    if (panel.hidden) open();
    else close();
  });

  panel.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.toggle;
      if (key === 'theme') saveSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
      else if (key === 'wifi') {
        saveSettings({ wifi: !settings.wifi });
        toast({
          title: settings.wifi ? 'Wi-Fi enabled' : 'Wi-Fi disabled',
          message: settings.wifi ? 'Connected to CloudNet 6E.' : 'Using the wired cloud link.',
          iconName: 'wifi',
        });
      } else if (key === 'sync') {
        saveSettings({ sync: !settings.sync });
        toast({
          title: settings.sync ? 'Cloud sync enabled' : 'Cloud sync paused',
          message: settings.sync ? 'Changes will sync automatically.' : 'Files stay on this device.',
          iconName: 'sync',
        });
      } else if (key === 'focus') {
        saveSettings({ focus: !settings.focus });
      }
      syncControlLabels();
    });
  });

  $('#brightness-slider').addEventListener('input', (e) => {
    saveSettings({ brightness: Number(e.target.value) });
  });
  $('#volume-slider').addEventListener('input', (e) => {
    saveSettings({ volume: Number(e.target.value) });
  });
  $('#cc-settings').addEventListener('click', () => {
    close();
    openApp('settings');
  });

  syncChip.addEventListener('click', () => {
    saveSettings({ sync: !settings.sync });
    toast({
      title: settings.sync ? 'Cloud sync enabled' : 'Cloud sync paused',
      message: settings.sync ? 'Changes sync automatically.' : 'Files stay on this device.',
      iconName: 'sync',
    });
  });

  function syncControlLabels() {
    panel.querySelectorAll('.cc-toggle').forEach((btn) => {
      const key = btn.dataset.toggle;
      const small = btn.querySelector('small');
      if (!small) return;
      if (key === 'wifi') small.textContent = settings.wifi ? 'CloudNet 6E' : 'Off';
      if (key === 'sync') small.textContent = settings.sync ? 'Live · 12 ms' : 'Paused';
      if (key === 'focus') small.textContent = settings.focus ? 'On' : 'Off';
      if (key === 'theme') small.textContent = settings.theme === 'dark' ? 'Dark' : 'Light';
    });
    const vol = $('#volume-slider');
    const bright = $('#brightness-slider');
    if (vol) vol.value = String(settings.volume);
    if (bright) bright.value = String(settings.brightness);
  }
  syncControlLabels();
}

/* ---------------------------------------------------------------- clock */

function setupClock() {
  const dateEl = $('#clock-date');
  const timeEl = $('#clock-time');
  const tick = () => {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    timeEl.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    updateLockClock();
  };
  tick();
  setInterval(tick, 1000);
  $('#clock').addEventListener('click', toggleCalendar);
}

let calendarEl = null;
let calendarMonth = new Date();
calendarMonth.setDate(1);

function toggleCalendar() {
  if (calendarEl) { closeCalendar(); return; }
  calendarEl = document.createElement('div');
  calendarEl.className = 'panel calendar-panel';
  document.body.appendChild(calendarEl);
  renderCalendar();
  requestAnimationFrame(() => calendarEl.classList.add('show'));
  setTimeout(() => document.addEventListener('pointerdown', calendarOutside), 0);
}

function calendarOutside(e) {
  if (calendarEl && !calendarEl.contains(e.target) && !e.target.closest('#clock')) closeCalendar();
}

function closeCalendar() {
  if (!calendarEl) return;
  const el = calendarEl;
  calendarEl = null;
  el.classList.remove('show');
  setTimeout(() => el.remove(), 160);
  document.removeEventListener('pointerdown', calendarOutside);
}

function renderCalendar() {
  if (!calendarEl) return;
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const cells = [];
  for (let i = 0; i < startDay; i += 1) cells.push('<span class="calendar-day muted"></span>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
    cells.push(`<span class="calendar-day ${isToday ? 'today' : ''}">${day}</span>`);
  }
  calendarEl.innerHTML = `
    <div class="calendar-head">
      <div><strong>${first.toLocaleDateString([], { month: 'long' })}</strong><small>${year}</small></div>
      <div class="calendar-nav">
        <button class="icon-btn tiny" data-cal="-1" aria-label="Previous month">${icon('chevron-left', 13)}</button>
        <button class="icon-btn tiny" data-cal="1" aria-label="Next month">${icon('chevron-right', 13)}</button>
      </div>
    </div>
    <div class="calendar-grid calendar-week">
      ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<span>${d}</span>`).join('')}
    </div>
    <div class="calendar-grid">${cells.join('')}</div>
    <div class="calendar-foot">
      <span>${system.uptimeSeconds ? 'Cloud session live' : ''}</span>
      <button class="btn btn-ghost btn-sm" id="calendar-today">Today</button>
    </div>`;
  calendarEl.querySelectorAll('[data-cal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      calendarMonth.setMonth(calendarMonth.getMonth() + Number(btn.dataset.cal));
      renderCalendar();
    });
  });
  calendarEl.querySelector('#calendar-today').addEventListener('click', () => {
    calendarMonth = new Date();
    calendarMonth.setDate(1);
    renderCalendar();
  });
}

/* -------------------------------------------------------------- palette */

let paletteItems = [];
let paletteIndex = 0;

function walk(node, path, out = []) {
  if (!node) return out;
  if (node.type === 'dir') {
    for (const child of Object.values(node.children)) {
      walk(child, path === '/' ? `/${child.name}` : `${path}/${child.name}`, out);
    }
  } else {
    out.push({ path, node });
  }
  return out;
}

function paletteActions() {
  return [
    { label: 'Open Terminal', sub: 'Application', icon: 'terminal', tone: 'slate', action: () => openApp('terminal') },
    { label: 'Open Files', sub: 'Application', icon: 'folder', tone: 'blue', action: () => openApp('files') },
    { label: 'Open Settings', sub: 'Application', icon: 'settings', tone: 'slate', action: () => openApp('settings') },
    { label: 'Open CloudBook Docs', sub: 'Nimbus', icon: 'doc', tone: 'violet', action: () => openApp('browser', { url: 'cloudbook://docs' }) },
    { label: 'Toggle Theme', sub: 'Appearance', icon: 'sun', tone: 'amber', action: () => saveSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' }) },
    { label: 'Next Wallpaper', sub: 'Appearance', icon: 'image', tone: 'rose', action: nextWallpaper },
    { label: 'Lock Screen', sub: 'Session', icon: 'lock', tone: 'slate', action: lockScreen },
    { label: 'Empty Trash', sub: 'Storage', icon: 'trash', tone: 'slate', action: () => {
      const count = fs.emptyTrash();
      toast({ title: 'Trash emptied', message: `${count} item${count === 1 ? '' : 's'} removed.`, iconName: 'trash' });
    } },
  ];
}

function buildPaletteItems(query) {
  const q = query.trim().toLowerCase();
  const apps = Object.entries(APPS).map(([id, app]) => ({
    label: app.name,
    sub: 'Application',
    icon: app.icon,
    tone: app.tone,
    action: () => openApp(id),
  }));
  const actions = paletteActions();
  let items = [...apps, ...actions];
  if (q) {
    items = items.filter((item) => item.label.toLowerCase().includes(q) || item.sub.toLowerCase().includes(q));
    const files = walk(fs.get('/'), '/', [])
      .filter(({ path, node }) => !path.startsWith(`${HOME}/.Trash`))
      .filter(({ node }) => node.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map(({ path, node }) => {
        const info = fileIcon(node.name);
        return {
          label: node.name,
          sub: path,
          icon: info.icon,
          tone: info.tone,
          action: () => openPath(path),
        };
      });
    items = [...items, ...files];
  }
  return items;
}

function renderPalette(query = '') {
  paletteItems = buildPaletteItems(query);
  paletteIndex = 0;
  const results = $('#palette-results');
  if (!paletteItems.length) {
    results.innerHTML = '<div class="palette-empty">No apps, files or actions match.</div>';
    return;
  }
  results.innerHTML = paletteItems.map((item, i) => `
    <button class="palette-item ${i === 0 ? 'selected' : ''}" data-i="${i}">
      <span class="palette-icon tone-${item.tone}">${icon(item.icon, 16)}</span>
      <span class="palette-copy"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.sub)}</small></span>
      ${i === 0 ? '<kbd>↵</kbd>' : ''}
    </button>`).join('');
  results.querySelectorAll('.palette-item').forEach((btn) => {
    btn.addEventListener('click', () => runPalette(Number(btn.dataset.i)));
    btn.addEventListener('mouseenter', () => setPaletteIndex(Number(btn.dataset.i)));
  });
}

function setPaletteIndex(index) {
  if (!paletteItems.length) return;
  paletteIndex = (index + paletteItems.length) % paletteItems.length;
  const buttons = [...document.querySelectorAll('.palette-item')];
  buttons.forEach((btn, i) => {
    btn.classList.toggle('selected', i === paletteIndex);
    const kbd = btn.querySelector('kbd');
    if (i === paletteIndex && !kbd) btn.insertAdjacentHTML('beforeend', '<kbd>↵</kbd>');
    else if (i !== paletteIndex && kbd) kbd.remove();
  });
  buttons[paletteIndex]?.scrollIntoView({ block: 'nearest' });
}

function runPalette(index) {
  const item = paletteItems[index];
  closePalette();
  if (item) setTimeout(() => item.action(), 60);
}

function openPalette() {
  const overlay = $('#palette');
  if (!overlay.hidden) {
    closePalette();
    return;
  }
  overlay.hidden = false;
  const input = $('#palette-input');
  input.value = '';
  renderPalette('');
  requestAnimationFrame(() => {
    overlay.classList.add('show');
    input.focus();
  });
}

function closePalette() {
  const overlay = $('#palette');
  if (!overlay || overlay.hidden) return;
  overlay.classList.remove('show');
  setTimeout(() => { overlay.hidden = true; }, 160);
}

function setupPalette() {
  const overlay = $('#palette');
  const input = $('#palette-input');
  input.addEventListener('input', () => renderPalette(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setPaletteIndex(paletteIndex + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setPaletteIndex(paletteIndex - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); runPalette(paletteIndex); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  });
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) closePalette();
  });
}

/* -------------------------------------------------------------- global */

function setupShortcuts() {
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'k') {
      e.preventDefault();
      openPalette();
    } else if (mod && key === 'w') {
      e.preventDefault();
      closeActiveWindow();
    } else if (mod && key === 'm') {
      e.preventDefault();
      minimizeActiveWindow();
    } else if (e.ctrlKey && e.altKey && key === 't') {
      e.preventDefault();
      openApp('terminal');
    } else if (e.key === 'Escape') {
      closeContextMenu();
      closeCalendar();
    }
  });
}

function setupLock() {
  $('#unlock-btn').addEventListener('click', unlockScreen);
  document.addEventListener('keydown', (e) => {
    const lock = $('#lock-screen');
    if (!lock.hidden && (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ')) {
      e.preventDefault();
      unlockScreen();
    }
  });
}

function setupWindows() {
  onWindows((windows, active) => {
    updateDock(windows, active);
    const name = active ? APPS[active.appId]?.name || 'Desktop' : 'Desktop';
    $('#active-app-name').textContent = name;
    document.title = active ? `${name} — CloudBook Pro` : 'CloudBook Pro — Your cloud laptop';
  });
}

function boot() {
  hydrateIcons(document);
  applySettings();
  system.start();
  buildDock();
  buildMenuBar();
  buildDesktop();
  setupControlCenter();
  setupClock();
  setupPalette();
  setupShortcuts();
  setupLock();
  setupWindows();
  onSettings(() => {
    applySettings();
    const panel = $('#control-center');
    if (panel && !panel.hidden) {
      panel.querySelectorAll('.cc-toggle').forEach((btn) => {
        const key = btn.dataset.toggle;
        const small = btn.querySelector('small');
        if (!small) return;
        if (key === 'wifi') small.textContent = settings.wifi ? 'CloudNet 6E' : 'Off';
        if (key === 'sync') small.textContent = settings.sync ? 'Live · 12 ms' : 'Paused';
        if (key === 'focus') small.textContent = settings.focus ? 'On' : 'Off';
        if (key === 'theme') small.textContent = settings.theme === 'dark' ? 'Dark' : 'Light';
      });
    }
  });
  updateDock([], null);
  requestAnimationFrame(() => openApp('about'));
}

boot();
