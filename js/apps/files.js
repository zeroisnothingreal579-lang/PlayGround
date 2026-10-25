import { fs, HOME, TRASH, QUOTA_BYTES, fmtBytes } from '../fs.js';
import { icon, fileIcon } from '../icons.js';
import {
  toast, promptDialog, confirmDialog, contextMenu, lightbox, escapeHtml,
} from '../ui.js';

const FAVORITES = [
  { label: 'Home', path: HOME, icon: 'home' },
  { label: 'Desktop', path: `${HOME}/Desktop`, icon: 'desktop' },
  { label: 'Documents', path: `${HOME}/Documents`, icon: 'doc' },
  { label: 'Downloads', path: `${HOME}/Downloads`, icon: 'download' },
  { label: 'Pictures', path: `${HOME}/Pictures`, icon: 'image' },
  { label: 'Projects', path: `${HOME}/Projects`, icon: 'editor' },
  { label: 'Music', path: `${HOME}/Music`, icon: 'music' },
];

const LOCATIONS = [
  { label: 'Cloud Drive', path: HOME, icon: 'cloud' },
  { label: 'System', path: '/System', icon: 'cpu' },
  { label: 'Trash', path: TRASH, icon: 'trash' },
];

const isImage = (node) => (node.mime || '').startsWith('image/') || /\.svg$/i.test(node.name);

function previewSrc(node) {
  if (!isImage(node)) return null;
  const content = node.content || '';
  if (content.startsWith('data:')) return content;
  if (/\.svg$/i.test(node.name)) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
  return null;
}

function kindOf(node) {
  if (node.type === 'dir') return 'Folder';
  const ext = node.name.split('.').pop().toLowerCase();
  const map = {
    md: 'Markdown', txt: 'Text', csv: 'CSV', js: 'JavaScript', mjs: 'JavaScript',
    html: 'HTML', css: 'Stylesheet', json: 'JSON', svg: 'SVG image', png: 'PNG image',
    jpg: 'JPEG image', jpeg: 'JPEG image', mp3: 'Audio', wav: 'Audio',
  };
  return map[ext] || (node.mime ? node.mime.split('/').pop().toUpperCase() : 'File');
}

function dateLabel(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString([], sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}

function joinPath(base, name) {
  return base === '/' ? `/${name}` : `${base}/${name}`;
}

function downloadNode(path) {
  const node = fs.get(path);
  if (!node || node.type !== 'file') return;
  let blob;
  const content = node.content || '';
  if (content.startsWith('data:') && content.includes(';base64,')) {
    const meta = content.slice(5, content.indexOf(';base64,'));
    const b64 = content.slice(content.indexOf(';base64,') + 8);
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      blob = new Blob([bytes], { type: meta || 'application/octet-stream' });
    } catch {
      blob = new Blob([content], { type: 'text/plain' });
    }
  } else {
    blob = new Blob([content], { type: node.mime || 'text/plain' });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = node.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function mount(body, ctx) {
  const state = {
    path: fs.isDir(ctx.options.path) ? ctx.options.path : HOME,
    history: [],
    index: -1,
    view: localStorage.getItem('cloudbook.files.view') || 'grid',
    selected: null,
    query: '',
  };

  body.innerHTML = `
    <div class="files-app">
      <aside class="files-sidebar">
        <div class="sidebar-group">
          <div class="sidebar-title">Favorites</div>
          <div class="sidebar-items" data-group="favorites">
            ${FAVORITES.map((item) => `
              <button class="sidebar-item" data-path="${item.path}" title="${item.label}">
                ${icon(item.icon, 16)}<span>${item.label}</span>
              </button>`).join('')}
          </div>
        </div>
        <div class="sidebar-group">
          <div class="sidebar-title">Locations</div>
          <div class="sidebar-items" data-group="locations">
            ${LOCATIONS.map((item) => `
              <button class="sidebar-item" data-path="${item.path}" title="${item.label}">
                ${icon(item.icon, 16)}<span>${item.label}</span>
              </button>`).join('')}
          </div>
        </div>
        <div class="sidebar-storage">
          <div class="sidebar-storage-head"><span>Cloud Drive</span><span id="files-free"></span></div>
          <div class="meter small"><span class="meter-fill" id="files-meter"></span></div>
          <div class="sidebar-storage-note" id="files-used"></div>
        </div>
      </aside>

      <div class="files-main">
        <div class="files-toolbar">
          <div class="toolbar-nav">
            <button class="icon-btn" id="files-back" title="Back" aria-label="Back">${icon('chevron-left', 17)}</button>
            <button class="icon-btn" id="files-forward" title="Forward" aria-label="Forward">${icon('chevron-right', 17)}</button>
            <button class="icon-btn" id="files-up" title="Enclosing folder" aria-label="Up">${icon('arrow-up', 17)}</button>
          </div>
          <nav class="breadcrumbs" id="files-crumbs" aria-label="Path"></nav>
          <div class="toolbar-spacer"></div>
          <label class="files-search">
            ${icon('search', 15)}
            <input type="search" id="files-search" placeholder="Search" autocomplete="off" spellcheck="false">
          </label>
          <div class="view-toggle" role="group" aria-label="View">
            <button class="icon-btn" data-view="grid" title="Grid view" aria-label="Grid view">${icon('grid', 16)}</button>
            <button class="icon-btn" data-view="list" title="List view" aria-label="List view">${icon('list', 16)}</button>
          </div>
          <div class="toolbar-actions">
            <button class="icon-btn" id="files-new-folder" title="New folder" aria-label="New folder">${icon('folder-plus', 17)}</button>
            <button class="icon-btn" id="files-new-file" title="New file" aria-label="New file">${icon('file-plus', 17)}</button>
            <button class="icon-btn" id="files-upload" title="Upload files" aria-label="Upload files">${icon('upload', 17)}</button>
            <button class="icon-btn" id="files-more" title="More" aria-label="More">${icon('more', 17)}</button>
          </div>
          <input type="file" id="files-file-input" multiple hidden>
        </div>

        <div class="files-content" id="files-content" tabindex="0"></div>

        <div class="files-status">
          <span id="files-count"></span>
          <span id="files-capacity"></span>
        </div>
      </div>
    </div>`;

  const content = body.querySelector('#files-content');
  const crumbs = body.querySelector('#files-crumbs');
  const backBtn = body.querySelector('#files-back');
  const forwardBtn = body.querySelector('#files-forward');
  const upBtn = body.querySelector('#files-up');
  const searchInput = body.querySelector('#files-search');
  const countEl = body.querySelector('#files-count');
  const capacityEl = body.querySelector('#files-capacity');
  const meterEl = body.querySelector('#files-meter');
  const usedEl = body.querySelector('#files-used');
  const freeEl = body.querySelector('#files-free');
  const fileInput = body.querySelector('#files-file-input');

  function navigate(path, { push = true, keepQuery = false } = {}) {
    const full = fs.normalize(path);
    if (!fs.isDir(full)) {
      toast({ title: 'Folder not found', message: path, iconName: 'x', tone: 'danger' });
      return;
    }
    state.path = full;
    state.selected = null;
    if (!keepQuery) {
      state.query = '';
      searchInput.value = '';
    }
    if (push) {
      state.history = state.history.slice(0, state.index + 1);
      state.history.push(full);
      state.index = state.history.length - 1;
    }
    render();
  }

  function pathLabel(path) {
    if (path === HOME) return 'Cloud Drive';
    if (path === TRASH) return 'Trash';
    if (path === '/') return 'CloudBook';
    return fs.base(path);
  }

  function renderCrumbs() {
    const parts = [];
    if (state.path === HOME || state.path.startsWith(`${HOME}/`)) {
      parts.push({ label: 'Cloud Drive', path: HOME });
      const rest = state.path.slice(HOME.length).split('/').filter(Boolean);
      let acc = HOME;
      for (const part of rest) {
        acc += `/${part}`;
        parts.push({ label: part, path: acc });
      }
    } else if (state.path === '/') {
      parts.push({ label: 'CloudBook', path: '/' });
    } else {
      parts.push({ label: 'CloudBook', path: '/' });
      let acc = '';
      for (const part of state.path.split('/').filter(Boolean)) {
        acc += `/${part}`;
        parts.push({ label: part, path: acc });
      }
    }
    crumbs.innerHTML = parts.map((part, i) => `
      <button class="crumb ${i === parts.length - 1 ? 'current' : ''}" data-path="${part.path}">${escapeHtml(part.label)}</button>
      ${i < parts.length - 1 ? `<span class="crumb-sep">${icon('chevron-right', 11)}</span>` : ''}
    `).join('');
    crumbs.querySelectorAll('.crumb').forEach((btn) => {
      btn.addEventListener('click', () => navigate(btn.dataset.path));
    });
  }

  function itemMarkup(node, path) {
    const isDir = node.type === 'dir';
    const meta = isDir ? 'Folder' : kindOf(node);
    const size = isDir ? '—' : fmtBytes(fs.bytes(node));
    const thumb = previewSrc(node);
    const fi = fileIcon(node.name);
    if (state.view === 'list') {
      return `
        <button class="file-row" data-name="${escapeHtml(node.name)}" title="${escapeHtml(node.name)}">
          <span class="file-row-icon tone-${isDir ? 'folder' : fi.tone}">${isDir ? icon('folder', 17) : icon(fi.icon, 17)}</span>
          <span class="file-row-name">${escapeHtml(node.name)}</span>
          <span class="file-row-kind">${meta}</span>
          <span class="file-row-size">${size}</span>
          <span class="file-row-date">${dateLabel(node.modified)}</span>
        </button>`;
    }
    return `
      <button class="file-card" data-name="${escapeHtml(node.name)}" title="${escapeHtml(node.name)}">
        <span class="file-visual tone-${isDir ? 'folder' : fi.tone} ${thumb ? 'has-thumb' : ''}">
          ${thumb ? `<img src="${thumb}" alt="">` : icon(isDir ? 'folder' : fi.icon, isDir ? 40 : 30)}
          ${isDir ? '<span class="folder-count">' + Object.keys(node.children || {}).length + '</span>' : ''}
        </span>
        <span class="file-name">${escapeHtml(node.name)}</span>
        <span class="file-meta">${meta} · ${size}</span>
      </button>`;
  }

  function render() {
    const items = fs.list(state.path);
    const filtered = state.query
      ? items.filter((item) => item.name.toLowerCase().includes(state.query.toLowerCase()))
      : items;
    renderCrumbs();
    body.querySelectorAll('.sidebar-item').forEach((btn) => {
      btn.classList.toggle('active', fs.normalize(btn.dataset.path) === state.path);
    });
    body.querySelectorAll('[data-view]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === state.view);
    });
    backBtn.disabled = state.index <= 0;
    forwardBtn.disabled = state.index >= state.history.length - 1;
    upBtn.disabled = state.path === '/';

    content.className = `files-content view-${state.view}`;
    if (!filtered.length) {
      const emptyTrash = state.path === TRASH;
      content.innerHTML = `
        <div class="files-empty">
          <span class="files-empty-icon">${icon(state.query ? 'search' : emptyTrash ? 'trash' : 'folder', 34)}</span>
          <strong>${state.query ? 'No matches' : emptyTrash ? 'Trash is empty' : 'This folder is empty'}</strong>
          <p>${state.query ? `Nothing here matches “${escapeHtml(state.query)}”.` : emptyTrash ? 'Deleted files will appear here.' : 'Create a folder or drop in a file to get started.'}</p>
          ${!state.query && !emptyTrash ? `<button class="btn btn-soft" id="empty-new-folder">${icon('folder-plus', 15)} New Folder</button>` : ''}
        </div>`;
      content.querySelector('#empty-new-folder')?.addEventListener('click', newFolder);
    } else {
      content.innerHTML = filtered.map((node) => itemMarkup(node, joinPath(state.path, node.name))).join('');
      if (state.selected) {
        const selectedEl = [...content.querySelectorAll('[data-name]')].find((el) => el.dataset.name === state.selected);
        selectedEl?.classList.add('selected');
      }
    }

    const total = items.length;
    countEl.textContent = state.query
      ? `${filtered.length} of ${total} items`
      : `${total} item${total === 1 ? '' : 's'}`;
    const usedBytes = fs.usedBytes();
    capacityEl.textContent = `${fmtBytes(usedBytes)} of 1 TB used`;
    meterEl.style.width = `${Math.max(1.4, (usedBytes / QUOTA_BYTES) * 100)}%`;
    usedEl.textContent = `${fmtBytes(usedBytes)} of 1 TB used`;
    freeEl.textContent = `${fmtBytes(QUOTA_BYTES - usedBytes)} free`;
    ctx.setTitle(`${pathLabel(state.path)} — Files`);
  }

  function select(name) {
    state.selected = name;
    content.querySelectorAll('[data-name]').forEach((el) => {
      el.classList.toggle('selected', el.dataset.name === name);
    });
  }

  function openNode(name) {
    const path = joinPath(state.path, name);
    const node = fs.get(path);
    if (!node) return;
    if (node.type === 'dir') {
      navigate(path);
      return;
    }
    if (isImage(node)) {
      const src = previewSrc(node);
      if (src) {
        lightbox({ src, name: node.name, caption: `${kindOf(node)} · ${fmtBytes(fs.bytes(node))} · ${dateLabel(node.modified)}` });
        return;
      }
    }
    ctx.openPath(path);
  }

  async function newFolder() {
    const name = await promptDialog({
      title: 'New Folder', label: 'Folder name', value: 'Untitled folder', confirmText: 'Create', iconName: 'folder-plus',
    });
    if (!name) return;
    const target = joinPath(state.path, name);
    if (fs.exists(target)) {
      toast({ title: 'Already exists', message: name, iconName: 'x', tone: 'danger' });
      return;
    }
    fs.mkdir(target);
    toast({ title: 'Folder created', message: name, iconName: 'folder-plus' });
    select(name);
  }

  async function newFile() {
    const name = await promptDialog({
      title: 'New File', label: 'File name', value: 'untitled.txt', confirmText: 'Create', iconName: 'file-plus',
    });
    if (!name) return;
    const target = joinPath(state.path, name);
    if (fs.exists(target)) {
      toast({ title: 'Already exists', message: name, iconName: 'x', tone: 'danger' });
      return;
    }
    fs.write(target, '');
    toast({ title: 'File created', message: name, iconName: 'file-plus' });
    ctx.openPath(target);
  }

  async function renameNode(name) {
    const node = fs.get(joinPath(state.path, name));
    if (!node) return;
    const next = await promptDialog({
      title: 'Rename', label: 'New name', value: name, confirmText: 'Rename', iconName: 'editor',
    });
    if (!next || next === name) return;
    if (!fs.rename(joinPath(state.path, name), next)) {
      toast({ title: 'Could not rename', message: 'That name is already taken.', iconName: 'x', tone: 'danger' });
      return;
    }
    state.selected = next;
    toast({ title: 'Renamed', message: next, iconName: 'check' });
    render();
  }

  function deleteNode(name, permanent = false) {
    const path = joinPath(state.path, name);
    if (permanent) {
      confirmDialog({
        title: 'Delete permanently?',
        message: `“${name}” will be removed from this CloudBook. This cannot be undone.`,
        confirmText: 'Delete',
        danger: true,
        iconName: 'trash',
      }).then((ok) => {
        if (!ok) return;
        fs.remove(path, { trash: false });
        state.selected = null;
        toast({ title: 'Deleted', message: name, iconName: 'trash', tone: 'danger' });
      });
      return;
    }
    fs.remove(path);
    state.selected = null;
    toast({ title: 'Moved to Trash', message: name, iconName: 'trash' });
  }

  function openItemMenu(name, x, y) {
    const path = joinPath(state.path, name);
    const node = fs.get(path);
    if (!node) return;
    const inTrash = state.path === TRASH;
    const items = [
      { label: 'Open', iconName: node.type === 'dir' ? 'folder' : 'eye', action: () => openNode(name) },
      { separator: true },
    ];
    if (inTrash) {
      items.push({ label: 'Put Back', iconName: 'refresh', action: () => {
        if (fs.restore(path)) {
          toast({ title: 'Restored', message: name, iconName: 'check' });
          state.selected = null;
        }
      } });
      items.push({ label: 'Delete Permanently', iconName: 'trash', danger: true, action: () => deleteNode(name, true) });
    } else {
      if (node.type === 'file') {
        items.push({ label: 'Open in Editor', iconName: 'editor', action: () => ctx.openPath(path) });
        items.push({ label: 'Download', iconName: 'download', action: () => downloadNode(path) });
      }
      items.push({ label: 'Duplicate', iconName: 'copy', action: () => {
        if (fs.copy(path, state.path)) toast({ title: 'Duplicated', message: name, iconName: 'copy' });
      } });
      items.push({ label: 'Rename', iconName: 'editor', action: () => renameNode(name) });
      items.push({ separator: true });
      items.push({ label: 'Move to Trash', iconName: 'trash', danger: true, action: () => deleteNode(name) });
    }
    contextMenu(items, x, y);
  }

  async function uploadFiles(files) {
    if (!files.length) return;
    let added = 0;
    for (const file of files) {
      if (file.size > 1_500_000) {
        toast({ title: 'File too large', message: `${file.name} exceeds the 1.5 MB demo limit.`, iconName: 'x', tone: 'danger' });
        continue;
      }
      const isText = file.type.startsWith('text/') || /\.(md|txt|csv|json|js|mjs|css|html|svg|sh|py)$/i.test(file.name);
      try {
        const content = isText ? await file.text() : await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const target = joinPath(state.path, file.name.replace(/[/\\]/g, '-'));
        fs.write(target, content, { mime: file.type || 'text/plain' });
        added += 1;
      } catch {
        toast({ title: 'Upload failed', message: file.name, iconName: 'x', tone: 'danger' });
      }
    }
    if (added) toast({ title: `${added} file${added === 1 ? '' : 's'} uploaded`, message: 'Saved to your cloud drive.', iconName: 'upload' });
    fileInput.value = '';
  }

  body.querySelectorAll('.sidebar-item').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.path));
  });
  backBtn.addEventListener('click', () => {
    if (state.index <= 0) return;
    state.index -= 1;
    state.path = state.history[state.index];
    state.selected = null;
    render();
  });
  forwardBtn.addEventListener('click', () => {
    if (state.index >= state.history.length - 1) return;
    state.index += 1;
    state.path = state.history[state.index];
    state.selected = null;
    render();
  });
  upBtn.addEventListener('click', () => {
    const parent = fs.parent(state.path);
    if (parent) navigate(parent);
  });
  searchInput.addEventListener('input', () => {
    state.query = searchInput.value.trim();
    render();
  });
  body.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      localStorage.setItem('cloudbook.files.view', state.view);
      render();
    });
  });
  body.querySelector('#files-new-folder').addEventListener('click', newFolder);
  body.querySelector('#files-new-file').addEventListener('click', newFile);
  body.querySelector('#files-upload').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => uploadFiles([...fileInput.files]));
  body.querySelector('#files-more').addEventListener('click', (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    contextMenu([
      { label: 'New Folder', iconName: 'folder-plus', action: newFolder },
      { label: 'New File', iconName: 'file-plus', action: newFile },
      { label: 'Upload Files…', iconName: 'upload', action: () => fileInput.click() },
      { separator: true },
      { label: 'Open Terminal Here', iconName: 'terminal', action: () => ctx.openApp('terminal', { cwd: state.path }) },
      ...(state.path === TRASH ? [
        { separator: true },
        { label: 'Empty Trash', iconName: 'trash', danger: true, action: async () => {
          const count = fs.emptyTrash();
          toast({ title: 'Trash emptied', message: `${count} item${count === 1 ? '' : 's'} removed.`, iconName: 'trash' });
        } },
      ] : []),
    ], rect.left, rect.bottom + 6);
  });

  content.addEventListener('click', (e) => {
    const item = e.target.closest('[data-name]');
    if (!item) {
      state.selected = null;
      content.querySelectorAll('[data-name]').forEach((el) => el.classList.remove('selected'));
      return;
    }
    select(item.dataset.name);
  });
  content.addEventListener('dblclick', (e) => {
    const item = e.target.closest('[data-name]');
    if (item) openNode(item.dataset.name);
  });
  content.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const item = e.target.closest('[data-name]');
    if (item) {
      select(item.dataset.name);
      openItemMenu(item.dataset.name, e.clientX, e.clientY);
    } else {
      contextMenu([
        { label: 'New Folder', iconName: 'folder-plus', action: newFolder },
        { label: 'New File', iconName: 'file-plus', action: newFile },
        { label: 'Upload Files…', iconName: 'upload', action: () => fileInput.click() },
        { separator: true },
        { label: 'Open Terminal Here', iconName: 'terminal', action: () => ctx.openApp('terminal', { cwd: state.path }) },
      ], e.clientX, e.clientY);
    }
  });
  content.addEventListener('keydown', (e) => {
    if (!state.selected) return;
    if (e.key === 'Enter') openNode(state.selected);
    else if (e.key === 'Backspace') {
      e.preventDefault();
      const parent = fs.parent(state.path);
      if (parent) navigate(parent);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && e.metaKey) {
      deleteNode(state.selected, state.path === TRASH);
    }
  });

  const offFs = fs.onChange(() => render());
  navigate(state.path, { push: true });

  return () => offFs();
}
