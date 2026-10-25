import { icon } from './icons.js';

const $ = (sel, root = document) => root.querySelector(sel);

export function toast({ title, message = '', iconName = 'check', tone = 'accent', duration = 3600 } = {}) {
  const stack = $('#toasts');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast tone-${tone}`;
  el.innerHTML = `
    <span class="toast-icon">${icon(iconName, 18)}</span>
    <div class="toast-copy"><strong>${escapeHtml(title)}</strong>${message ? `<p>${escapeHtml(message)}</p>` : ''}</div>
    <button class="toast-close" aria-label="Dismiss">${icon('x', 14)}</button>`;
  stack.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  let timer = setTimeout(dismiss, duration);
  function dismiss() {
    clearTimeout(timer);
    el.classList.remove('show');
    setTimeout(() => el.remove(), 260);
  }
  el.querySelector('.toast-close').addEventListener('click', dismiss);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 1400); });
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function closeOverlay(overlay) {
  overlay.classList.remove('show');
  setTimeout(() => overlay.remove(), 180);
}

export function promptDialog({
  title = 'New item',
  label = 'Name',
  value = '',
  placeholder = '',
  confirmText = 'Create',
  iconName = 'file-plus',
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="modal-head">
          <span class="modal-icon">${icon(iconName, 20)}</span>
          <h3>${escapeHtml(title)}</h3>
        </div>
        <label class="modal-label">${escapeHtml(label)}
          <input class="input" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" spellcheck="false">
        </label>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-cancel>Cancel</button>
          <button class="btn btn-primary" data-confirm>${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    const input = $('input', overlay);
    input.focus();
    input.select();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      closeOverlay(overlay);
      resolve(result);
    };
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) finish(null);
    });
    $('[data-cancel]', overlay).addEventListener('click', () => finish(null));
    $('[data-confirm]', overlay).addEventListener('click', () => finish(input.value.trim() || null));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(input.value.trim() || null); }
      if (e.key === 'Escape') { e.preventDefault(); finish(null); }
    });
  });
}

export function confirmDialog({
  title = 'Are you sure?',
  message = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
  iconName = 'trash',
} = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="modal-head">
          <span class="modal-icon ${danger ? 'danger' : ''}">${icon(iconName, 20)}</span>
          <h3>${escapeHtml(title)}</h3>
        </div>
        <p class="modal-message">${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-cancel>${escapeHtml(cancelText)}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      closeOverlay(overlay);
      resolve(result);
    };
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) finish(false);
    });
    $('[data-cancel]', overlay).addEventListener('click', () => finish(false));
    $('[data-confirm]', overlay).addEventListener('click', () => finish(true));
    document.addEventListener('keydown', function onKey(e) {
      if (!document.body.contains(overlay)) {
        document.removeEventListener('keydown', onKey);
        return;
      }
      if (e.key === 'Escape') finish(false);
      if (e.key === 'Enter') finish(true);
    });
    $('[data-confirm]', overlay).focus();
  });
}

let openMenu = null;

export function contextMenu(items, x, y) {
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.innerHTML = items.map((item, i) => {
    if (item.separator) return '<div class="context-sep"></div>';
    return `<button class="context-item ${item.danger ? 'danger' : ''}" data-i="${i}">
      <span class="context-icon">${item.iconName ? icon(item.iconName, 15) : ''}</span>
      <span>${escapeHtml(item.label)}</span>
      ${item.shortcut ? `<kbd>${escapeHtml(item.shortcut)}</kbd>` : ''}
    </button>`;
  }).join('');
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 10);
  const top = Math.min(y, window.innerHeight - rect.height - 10);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
  requestAnimationFrame(() => menu.classList.add('show'));
  menu.querySelectorAll('.context-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = items[Number(btn.dataset.i)];
      closeContextMenu();
      item.action?.();
    });
  });
  openMenu = menu;
  setTimeout(() => {
    document.addEventListener('pointerdown', onOutside, { capture: true });
    document.addEventListener('keydown', onEsc);
  }, 0);
}

function onOutside(e) {
  if (openMenu && !openMenu.contains(e.target)) closeContextMenu();
}

function onEsc(e) {
  if (e.key === 'Escape') closeContextMenu();
}

export function closeContextMenu() {
  if (openMenu) {
    openMenu.remove();
    openMenu = null;
  }
  document.removeEventListener('pointerdown', onOutside, { capture: true });
  document.removeEventListener('keydown', onEsc);
}

export function lightbox({ src, name = 'Image', caption = '' }) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay lightbox';
  overlay.innerHTML = `
    <div class="lightbox-card">
      <div class="lightbox-head">
        <strong>${escapeHtml(name)}</strong>
        <button class="icon-btn" data-close aria-label="Close">${icon('x', 18)}</button>
      </div>
      <img src="${src}" alt="${escapeHtml(name)}">
      ${caption ? `<p class="lightbox-caption">${escapeHtml(caption)}</p>` : ''}
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-close]')) closeOverlay(overlay);
  });
  document.addEventListener('keydown', function onKey(e) {
    if (!document.body.contains(overlay)) {
      document.removeEventListener('keydown', onKey);
      return;
    }
    if (e.key === 'Escape') closeOverlay(overlay);
  });
}

export function lockScreen() {
  const el = $('#lock-screen');
  if (!el) return;
  updateLockClock();
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  $('#unlock-btn')?.focus();
}

export function updateLockClock() {
  const now = new Date();
  const time = $('#lock-clock');
  const date = $('#lock-date');
  if (time) time.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (date) date.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

export function unlockScreen() {
  const el = $('#lock-screen');
  if (!el || el.hidden) return;
  el.classList.remove('show');
  setTimeout(() => { el.hidden = true; }, 220);
}

export function sleepScreen() {
  const el = $('#sleep-screen');
  if (!el) return;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  const wake = () => {
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 260);
    el.removeEventListener('click', wake);
    document.removeEventListener('keydown', wake);
  };
  setTimeout(() => {
    el.addEventListener('click', wake);
    document.addEventListener('keydown', wake);
  }, 300);
}
