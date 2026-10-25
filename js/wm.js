import { APPS } from './apps/index.js';
import { icon } from './icons.js';
import {
  toast, promptDialog, confirmDialog, contextMenu, escapeHtml,
} from './ui.js';

let zCounter = 20;
let windowCounter = 0;
let activeWin = null;
const windows = new Map();
const listeners = new Set();
const helpers = {};

const $ = (sel, root = document) => root.querySelector(sel);

export function configureWindowManager(extra = {}) {
  Object.assign(helpers, extra);
}

export function onWindows(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => {
    try { fn([...windows.values()], activeWin); } catch { /* ignore */ }
  });
  document.dispatchEvent(new CustomEvent('cloudbook:windows', {
    detail: { windows: [...windows.values()], active: activeWin },
  }));
}

export function openApp(appId, options = {}) {
  const app = APPS[appId];
  if (!app) {
    toast({ title: 'App not found', message: appId, iconName: 'x', tone: 'danger' });
    return null;
  }
  const win = createWindow(appId, app, options);
  windows.set(win.id, win);
  focusWindow(win, false);
  try {
    const cleanup = app.mount(win.body, makeContext(win, options));
    if (typeof cleanup === 'function') win.cleanup = cleanup;
    else if (cleanup && typeof cleanup.destroy === 'function') win.cleanup = cleanup.destroy;
  } catch (error) {
    console.error(`Failed to mount ${appId}`, error);
    win.body.innerHTML = `<div class="app-error"><strong>${escapeHtml(app.name)} failed to open</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
  requestAnimationFrame(() => {
    win.el.classList.remove('opening');
    win.el.classList.add('open');
  });
  emit();
  return win;
}

function makeContext(win, options) {
  return {
    win,
    options,
    app: APPS[win.appId],
    openApp,
    close: () => closeWindow(win),
    setTitle: (title) => setTitle(win, title),
    toast,
    promptDialog,
    confirmDialog,
    contextMenu,
    icon,
    openPath: helpers.openPath || (() => {}),
    openSettings: () => openApp('settings'),
    openFiles: (path) => openApp('files', { path }),
    refresh: () => emit(),
  };
}

function createWindow(appId, app, options) {
  windowCounter += 1;
  const id = `win-${windowCounter}`;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const compact = viewportW < 780;
  const w = compact ? viewportW - 16 : Math.min(app.width || 720, viewportW - 60);
  const h = compact ? viewportH - 150 : Math.min(app.height || 520, viewportH - 150);
  const offset = (windows.size % 5) * 28;
  const x = compact ? 8 : Math.max(24, (viewportW - w) / 2 + offset - 40);
  const y = compact ? 40 : Math.max(46, (viewportH - h) / 2 + offset - 36);

  const el = document.createElement('section');
  el.className = 'window opening';
  el.dataset.app = appId;
  el.dataset.id = id;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.zIndex = String(++zCounter);
  el.innerHTML = `
    <header class="window-bar">
      <div class="traffic" aria-hidden="false">
        <button class="traffic-btn close" data-action="close" aria-label="Close window"><span></span></button>
        <button class="traffic-btn min" data-action="minimize" aria-label="Minimize window"><span></span></button>
        <button class="traffic-btn max" data-action="maximize" aria-label="Zoom window"><span></span></button>
      </div>
      <div class="window-title-wrap">
        <span class="window-app-icon tone-${app.tone || 'violet'}">${icon(app.icon || 'file', 13)}</span>
        <span class="window-title">${escapeHtml(options.title || app.name)}</span>
      </div>
      <div class="window-tools"></div>
    </header>
    <div class="window-body"></div>
    <div class="resize-handle" aria-hidden="true"></div>`;

  const win = {
    id,
    appId,
    app,
    el,
    body: $('.window-body', el),
    titleEl: $('.window-title', el),
    x, y, w, h,
    minimized: false,
    maximized: false,
    prevRect: null,
    z: zCounter,
    cleanup: null,
    options,
  };

  $('#windows').appendChild(el);

  el.addEventListener('pointerdown', () => focusWindow(win), true);
  el.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'close') closeWindow(win);
      else if (action === 'minimize') minimizeWindow(win);
      else if (action === 'maximize') toggleMaximize(win);
    });
  });

  const bar = $('.window-bar', el);
  bar.addEventListener('dblclick', (e) => {
    if (e.target.closest('button')) return;
    toggleMaximize(win);
  });
  bar.addEventListener('pointerdown', (e) => startDrag(e, win));

  const handle = $('.resize-handle', el);
  handle.addEventListener('pointerdown', (e) => startResize(e, win));

  return win;
}

function setTitle(win, title) {
  win.titleEl.textContent = title;
  emit();
}

function startDrag(e, win) {
  if (e.button !== 0) return;
  if (e.target.closest('button')) return;
  if (win.maximized) return;
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const originX = win.el.offsetLeft;
  const originY = win.el.offsetTop;
  const el = win.el;
  el.classList.add('dragging');
  focusWindow(win);

  const move = (ev) => {
    const nx = Math.min(window.innerWidth - 120, Math.max(-win.w + 140, originX + ev.clientX - startX));
    const ny = Math.min(window.innerHeight - 48, Math.max(32, originY + ev.clientY - startY));
    win.x = nx;
    win.y = ny;
    el.style.left = `${nx}px`;
    el.style.top = `${ny}px`;
  };
  const up = () => {
    el.classList.remove('dragging');
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

function startResize(e, win) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const startX = e.clientX;
  const startY = e.clientY;
  const startW = win.el.offsetWidth;
  const startH = win.el.offsetHeight;
  focusWindow(win);
  win.el.classList.add('resizing');

  const move = (ev) => {
    const nw = Math.max(360, Math.min(window.innerWidth - win.el.offsetLeft - 8, startW + ev.clientX - startX));
    const nh = Math.max(240, Math.min(window.innerHeight - win.el.offsetTop - 8, startH + ev.clientY - startY));
    win.w = nw;
    win.h = nh;
    win.el.style.width = `${nw}px`;
    win.el.style.height = `${nh}px`;
  };
  const up = () => {
    win.el.classList.remove('resizing');
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

export function focusWindow(win, notify = true) {
  if (!win || !windows.has(win.id)) return;
  if (win.minimized) restoreWindow(win);
  windows.forEach((other) => other.el.classList.remove('active'));
  win.el.classList.add('active');
  win.el.style.zIndex = String(++zCounter);
  win.z = zCounter;
  const changed = activeWin !== win;
  activeWin = win;
  if (changed && notify) {
    document.dispatchEvent(new CustomEvent('cloudbook:focus', { detail: { win } }));
    emit();
  } else if (notify) {
    emit();
  }
}

export function closeWindow(win) {
  if (!win || !windows.has(win.id)) return;
  try { win.cleanup?.(); } catch { /* ignore */ }
  windows.delete(win.id);
  win.el.classList.add('closing');
  setTimeout(() => win.el.remove(), 180);
  if (activeWin === win) {
    activeWin = null;
    const next = [...windows.values()].sort((a, b) => b.z - a.z)[0];
    if (next) focusWindow(next);
  }
  emit();
}

export function minimizeWindow(win) {
  if (!win || win.minimized) return;
  win.minimized = true;
  win.el.classList.add('minimized');
  if (activeWin === win) {
    activeWin = null;
    const next = [...windows.values()].filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0];
    if (next) focusWindow(next);
  }
  emit();
}

export function restoreWindow(win) {
  if (!win) return;
  win.minimized = false;
  win.el.classList.remove('minimized');
  win.el.style.zIndex = String(++zCounter);
  activeWin = win;
  windows.forEach((other) => other.el.classList.toggle('active', other === win));
  document.dispatchEvent(new CustomEvent('cloudbook:focus', { detail: { win } }));
  emit();
}

export function toggleMaximize(win) {
  if (!win) return;
  if (win.maximized) {
    win.maximized = false;
    win.el.classList.remove('maximized');
    if (win.prevRect) {
      win.el.style.left = `${win.prevRect.x}px`;
      win.el.style.top = `${win.prevRect.y}px`;
      win.el.style.width = `${win.prevRect.w}px`;
      win.el.style.height = `${win.prevRect.h}px`;
      win.x = win.prevRect.x;
      win.y = win.prevRect.y;
      win.w = win.prevRect.w;
      win.h = win.prevRect.h;
    }
  } else {
    win.prevRect = { x: win.el.offsetLeft, y: win.el.offsetTop, w: win.el.offsetWidth, h: win.el.offsetHeight };
    win.maximized = true;
    win.el.classList.add('maximized');
  }
  focusWindow(win);
}

export function getActiveWindow() {
  return activeWin;
}

export function closeActiveWindow() {
  if (activeWin) closeWindow(activeWin);
}

export function minimizeActiveWindow() {
  if (activeWin) minimizeWindow(activeWin);
}

export function cycleWindows() {
  const open = [...windows.values()].filter((w) => !w.minimized).sort((a, b) => a.z - b.z);
  if (open.length < 2) return;
  const next = open.find((w) => w !== activeWin) || open[0];
  focusWindow(next);
}

export function appWindows(appId) {
  return [...windows.values()].filter((w) => w.appId === appId);
}

export function allWindows() {
  return [...windows.values()];
}
