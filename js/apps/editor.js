import { fs, HOME } from '../fs.js';
import { icon, fileIcon } from '../icons.js';
import { toast, escapeHtml } from '../ui.js';

function mimeFor(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    md: 'text/markdown', txt: 'text/plain', csv: 'text/csv', js: 'text/javascript',
    mjs: 'text/javascript', json: 'application/json', html: 'text/html', css: 'text/css',
    svg: 'image/svg+xml', sh: 'text/x-shellscript', py: 'text/x-python',
  };
  return map[ext] || 'text/plain';
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function renderMarkdown(src) {
  const lines = src.split('\n');
  const out = [];
  let inCode = false;
  let code = [];
  let list = null;
  let para = [];
  const flushPara = () => {
    if (para.length) { out.push(`<p>${para.map(inlineMarkdown).join(' ')}</p>`); para = []; }
  };
  const flushList = () => {
    if (list) {
      out.push(`<${list.tag}>${list.items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</${list.tag}>`);
      list = null;
    }
  };
  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
        code = [];
        inCode = false;
      } else {
        flushPara();
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) { code.push(line); continue; }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushPara();
      flushList();
      out.push('<hr>');
      continue;
    }
    if (line.startsWith('> ')) {
      flushPara();
      flushList();
      out.push(`<blockquote>${inlineMarkdown(line.slice(2))}</blockquote>`);
      continue;
    }
    const ul = line.match(/^[-*]\s+(.*)$/);
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const tag = ul ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push((ul || ol)[1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  if (inCode) out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
  flushPara();
  flushList();
  return out.join('\n');
}

export function mount(body, ctx) {
  const state = {
    path: null,
    name: 'Untitled.md',
    content: '',
    dirty: false,
    preview: false,
  };

  body.innerHTML = `
    <div class="editor-app">
      <div class="editor-toolbar">
        <div class="editor-file">
          <span class="editor-file-icon">${icon('editor', 16)}</span>
          <span id="editor-name">Untitled.md</span>
          <span class="dirty-dot" id="editor-dirty" hidden></span>
        </div>
        <div class="editor-actions">
          <button class="btn btn-ghost btn-sm" id="editor-new">${icon('file-plus', 14)} New</button>
          <button class="btn btn-ghost btn-sm" id="editor-open">${icon('folder', 14)} Open</button>
          <button class="btn btn-soft btn-sm" id="editor-save">${icon('download', 14)} Save</button>
          <button class="btn btn-ghost btn-sm" id="editor-save-as">Save As</button>
          <button class="btn btn-ghost btn-sm" id="editor-preview-btn">${icon('eye', 14)} Preview</button>
        </div>
      </div>
      <div class="editor-body">
        <div class="editor-gutter" id="editor-gutter"></div>
        <textarea id="editor-text" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="Text editor"></textarea>
        <div class="editor-preview markdown-body" id="editor-preview" hidden></div>
      </div>
      <div class="editor-status">
        <span id="editor-path">Scratchpad</span>
        <span id="editor-counts"></span>
        <span id="editor-cursor"></span>
        <span>UTF-8 · LF</span>
      </div>
    </div>`;

  const textarea = body.querySelector('#editor-text');
  const gutter = body.querySelector('#editor-gutter');
  const preview = body.querySelector('#editor-preview');
  const previewBtn = body.querySelector('#editor-preview-btn');
  const nameEl = body.querySelector('#editor-name');
  const dirtyEl = body.querySelector('#editor-dirty');
  const pathEl = body.querySelector('#editor-path');
  const countsEl = body.querySelector('#editor-counts');
  const cursorEl = body.querySelector('#editor-cursor');

  function updateTitle() {
    nameEl.textContent = state.name;
    dirtyEl.hidden = !state.dirty;
    ctx.setTitle(`${state.dirty ? '• ' : ''}${state.name} — Editor`);
    pathEl.textContent = state.path || 'Scratchpad';
    const words = state.content.trim() ? state.content.trim().split(/\s+/).length : 0;
    const lines = state.content.split('\n').length;
    countsEl.textContent = `${words} words · ${lines} lines`;
    const iconInfo = fileIcon(state.name);
    body.querySelector('.editor-file-icon').innerHTML = icon(iconInfo.icon, 16);
  }

  function renderGutter() {
    const count = state.content.split('\n').length;
    gutter.innerHTML = Array.from({ length: count }, (_, i) => `<span>${i + 1}</span>`).join('');
    gutter.scrollTop = textarea.scrollTop;
  }

  function updateCursor() {
    const upto = state.content.slice(0, textarea.selectionStart);
    const line = upto.split('\n').length;
    const col = upto.length - upto.lastIndexOf('\n');
    cursorEl.textContent = `Ln ${line}, Col ${col}`;
  }

  function setContent(content, { path = null, name = null, dirty = false } = {}) {
    state.content = content;
    state.path = path;
    state.name = name || (path ? fs.base(path) : 'Untitled.md');
    state.dirty = dirty;
    textarea.value = content;
    renderGutter();
    updateTitle();
    updateCursor();
    if (state.preview) preview.innerHTML = renderMarkdown(content);
  }

  function setDirty(value) {
    state.dirty = value;
    updateTitle();
  }

  async function saveAs() {
    const suggested = state.path || `${HOME}/Documents/${state.name || 'untitled.md'}`;
    let target = await ctx.promptDialog({
      title: 'Save As', label: 'Full path', value: suggested, confirmText: 'Save', iconName: 'download',
    });
    if (!target) return false;
    if (!target.startsWith('/')) target = `${HOME}/${target}`;
    target = fs.normalize(target);
    if (fs.isDir(target)) {
      toast({ title: 'That is a folder', message: 'Choose a file name.', iconName: 'x', tone: 'danger' });
      return false;
    }
    if (!target.split('/').pop().includes('.')) target += '.md';
    if (fs.exists(target) && target !== state.path) {
      const ok = await ctx.confirmDialog({
        title: 'Replace file?', message: `${fs.base(target)} already exists. Replace it?`, confirmText: 'Replace', danger: true, iconName: 'download',
      });
      if (!ok) return false;
    }
    if (!fs.write(target, state.content, { mime: mimeFor(target) })) {
      toast({ title: 'Could not save', message: 'Check the folder path.', iconName: 'x', tone: 'danger' });
      return false;
    }
    state.path = target;
    state.name = fs.base(target);
    state.dirty = false;
    updateTitle();
    toast({ title: 'Saved', message: target, iconName: 'check' });
    return true;
  }

  async function save() {
    if (!state.path) return saveAs();
    if (!fs.write(state.path, state.content, { mime: mimeFor(state.path) })) {
      toast({ title: 'Could not save', message: state.path, iconName: 'x', tone: 'danger' });
      return false;
    }
    state.dirty = false;
    updateTitle();
    toast({ title: 'Saved', message: state.path, iconName: 'check' });
    return true;
  }

  async function confirmDiscard() {
    if (!state.dirty) return true;
    return ctx.confirmDialog({
      title: 'Discard changes?',
      message: `“${state.name}” has unsaved changes. Discard them?`,
      confirmText: 'Discard',
      danger: true,
      iconName: 'editor',
    });
  }

  async function openFile() {
    if (!(await confirmDiscard())) return;
    const value = await ctx.promptDialog({
      title: 'Open File', label: 'Path', value: state.path || `${HOME}/Documents/Welcome.md`, confirmText: 'Open', iconName: 'folder',
    });
    if (!value) return;
    const target = fs.normalize(value);
    const node = fs.get(target);
    if (!node) { toast({ title: 'File not found', message: target, iconName: 'x', tone: 'danger' }); return; }
    if (node.type === 'dir') { toast({ title: 'That is a folder', message: 'Choose a file.', iconName: 'x', tone: 'danger' }); return; }
    if ((node.content || '').startsWith('data:')) {
      toast({ title: 'Binary file', message: 'The editor only opens text files.', iconName: 'x', tone: 'danger' });
      return;
    }
    setContent(node.content || '', { path: target });
    toast({ title: 'Opened', message: target, iconName: 'check' });
  }

  async function newFile() {
    if (!(await confirmDiscard())) return;
    setContent('', { path: null, name: 'Untitled.md' });
    textarea.focus();
  }

  function togglePreview() {
    state.preview = !state.preview;
    if (state.preview) {
      preview.innerHTML = renderMarkdown(state.content);
      preview.hidden = false;
      textarea.hidden = true;
      gutter.hidden = true;
      previewBtn.classList.add('active');
    } else {
      preview.hidden = true;
      textarea.hidden = false;
      gutter.hidden = false;
      previewBtn.classList.remove('active');
      textarea.focus();
    }
  }

  textarea.addEventListener('input', () => {
    state.content = textarea.value;
    state.dirty = true;
    renderGutter();
    updateTitle();
    updateCursor();
  });
  textarea.addEventListener('scroll', () => { gutter.scrollTop = textarea.scrollTop; });
  textarea.addEventListener('keyup', updateCursor);
  textarea.addEventListener('click', updateCursor);
  textarea.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = `${textarea.value.slice(0, start)}  ${textarea.value.slice(end)}`;
      textarea.selectionStart = start + 2;
      textarea.selectionEnd = start + 2;
      state.content = textarea.value;
      state.dirty = true;
      renderGutter();
      updateTitle();
      updateCursor();
    }
  });

  body.querySelector('#editor-save').addEventListener('click', save);
  body.querySelector('#editor-save-as').addEventListener('click', saveAs);
  body.querySelector('#editor-open').addEventListener('click', openFile);
  body.querySelector('#editor-new').addEventListener('click', newFile);
  previewBtn.addEventListener('click', togglePreview);

  if (ctx.options.path) {
    const node = fs.get(ctx.options.path);
    if (node && node.type === 'file') {
      if ((node.content || '').startsWith('data:')) {
        setContent('', { path: null, name: 'Untitled.md' });
        toast({ title: 'Binary file', message: 'The editor only opens text files.', iconName: 'x', tone: 'danger' });
      } else {
        setContent(node.content || '', { path: ctx.options.path });
      }
    }
  } else {
    setContent('', { path: null, name: 'Untitled.md' });
  }
  textarea.focus();
  updateCursor();

  return () => {};
}
