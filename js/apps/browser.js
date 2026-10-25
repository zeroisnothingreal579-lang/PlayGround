import { fs, HOME, QUOTA_BYTES, fmtBytes } from '../fs.js';
import { system, fmtUptime } from '../system.js';
import { settings, REGIONS } from '../settings.js';
import { icon, fileIcon } from '../icons.js';
import { toast, escapeHtml } from '../ui.js';

function walkFiles(node, path, out) {
  if (!node) return out;
  if (node.type === 'dir') {
    for (const child of Object.values(node.children)) {
      walkFiles(child, path === '/' ? `/${child.name}` : `${path}/${child.name}`, out);
    }
  } else {
    out.push({ path, node });
  }
  return out;
}

function recentFiles(limit = 10) {
  return walkFiles(fs.get('/'), '/', [])
    .filter((item) => !item.path.startsWith('/home/cloud/.Trash'))
    .sort((a, b) => b.node.modified - a.node.modified)
    .slice(0, limit);
}

function tile(iconName, tone, title, subtitle, attrs) {
  return `<button class="web-tile" ${attrs}>
    <span class="web-tile-icon tone-${tone}">${icon(iconName, 20)}</span>
    <span class="web-tile-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(subtitle)}</small></span>
  </button>`;
}

export function mount(body, ctx) {
  const state = {
    history: [],
    index: -1,
    url: ctx.options.url || 'cloudbook://home',
  };

  body.innerHTML = `
    <div class="browser-app">
      <div class="browser-chrome">
        <div class="browser-nav">
          <button class="icon-btn" id="browser-back" title="Back" aria-label="Back">${icon('chevron-left', 17)}</button>
          <button class="icon-btn" id="browser-forward" title="Forward" aria-label="Forward">${icon('chevron-right', 17)}</button>
          <button class="icon-btn" id="browser-reload" title="Reload" aria-label="Reload">${icon('refresh', 15)}</button>
          <button class="icon-btn" id="browser-home" title="Home" aria-label="Home">${icon('home', 15)}</button>
        </div>
        <form class="address-bar" id="browser-form">
          <span class="address-lock" id="address-lock">${icon('shield', 13)}</span>
          <input id="browser-address" type="text" value="cloudbook://home" autocomplete="off" spellcheck="false" aria-label="Address">
        </form>
        <div class="browser-actions">
          <button class="icon-btn" id="browser-external" title="Open in a new tab" aria-label="Open in a new tab">${icon('external', 15)}</button>
        </div>
      </div>
      <div class="browser-bookmarks" id="browser-bookmarks">
        <button data-url="cloudbook://home">${icon('home', 12)} Home</button>
        <button data-url="cloudbook://docs">${icon('doc', 12)} Docs</button>
        <button data-url="cloudbook://specs">${icon('cpu', 12)} Specs</button>
        <button data-url="cloudbook://files">${icon('folder', 12)} Recent files</button>
        <button data-url="https://example.com">${icon('globe', 12)} example.com</button>
      </div>
      <div class="browser-content" id="browser-content"></div>
      <div class="browser-status">
        <span id="browser-status-text">Ready</span>
        <span class="browser-status-right"><span class="sync-dot"></span> CloudNet 6E · 2.5 Gbps · 12 ms</span>
      </div>
    </div>`;

  const content = body.querySelector('#browser-content');
  const address = body.querySelector('#browser-address');
  const statusText = body.querySelector('#browser-status-text');
  const backBtn = body.querySelector('#browser-back');
  const forwardBtn = body.querySelector('#browser-forward');
  const lock = body.querySelector('#address-lock');

  function setStatus(text) {
    statusText.textContent = text;
  }

  function setAddress(url) {
    address.value = url;
    const external = /^https?:\/\//.test(url);
    lock.innerHTML = icon(external ? 'globe' : 'shield', 13);
    lock.classList.toggle('external', external);
  }

  function syncHistoryButtons() {
    backBtn.disabled = state.index <= 0;
    forwardBtn.disabled = state.index >= state.history.length - 1;
  }

  function homePage() {
    const used = fs.usedBytes();
    return `
      <div class="web-page">
        <section class="web-hero">
          <span class="web-kicker">NIMBUS · CLOUD BROWSER</span>
          <h1>Where do you want to go?</h1>
          <p>Search your cloud, jump into the docs, or open the wider web.</p>
          <form class="web-search" id="home-search">
            ${icon('search', 17)}
            <input type="text" placeholder="Search files, apps, or the web…" autocomplete="off" spellcheck="false">
            <button class="btn btn-primary" type="submit">Search</button>
          </form>
          <div class="web-chips">
            <button data-url="cloudbook://docs">Documentation</button>
            <button data-url="cloudbook://specs">System specs</button>
            <button data-url="cloudbook://files">Recent files</button>
            <button data-external="https://example.com">Open example.com</button>
          </div>
        </section>

        <section class="web-section">
          <h2>Bookmarks</h2>
          <div class="web-tiles">
            ${tile('doc', 'violet', 'CloudBook Docs', 'Terminal, apps and shortcuts', 'data-url="cloudbook://docs"')}
            ${tile('cpu', 'blue', 'Hardware Specs', '20 GB · 1 TB · 8 cores', 'data-url="cloudbook://specs"')}
            ${tile('folder', 'amber', 'Recent Files', 'Your latest cloud documents', 'data-url="cloudbook://files"')}
            ${tile('globe', 'teal', 'example.com', 'Open the wider web', 'data-external="https://example.com"')}
            ${tile('globe', 'mint', 'MDN Web Docs', 'developer.mozilla.org', 'data-external="https://developer.mozilla.org"')}
            ${tile('globe', 'rose', 'Hacker News', 'news.ycombinator.com', 'data-external="https://news.ycombinator.com"')}
          </div>
        </section>

        <section class="web-columns">
          <article class="web-card">
            <h3>${icon('cloud', 15)} Session</h3>
            <dl class="web-list">
              <div><dt>Region</dt><dd>${REGIONS[settings.region] || settings.region}</dd></div>
              <div><dt>Uptime</dt><dd>${fmtUptime(system.uptimeSeconds())}</dd></div>
              <div><dt>Memory</dt><dd>${system.mem.toFixed(1)} GB / 20 GB</dd></div>
              <div><dt>Cloud drive</dt><dd>${fmtBytes(used)} / 1 TB</dd></div>
            </dl>
          </article>
          <article class="web-card">
            <h3>${icon('sparkles', 15)} Quick tips</h3>
            <ul class="web-tips">
              <li>Press <kbd>⌘K</kbd> to search apps and files anywhere.</li>
              <li>Type <code>neofetch</code> in Terminal for system details.</li>
              <li>Drag files from your computer into <strong>Files</strong>.</li>
              <li>Everything is saved automatically in this browser.</li>
            </ul>
          </article>
        </section>
      </div>`;
  }

  function docsPage() {
    return `
      <div class="web-page docs-page">
        <div class="web-doc-head">
          <span class="web-kicker">CLOUDBOOK DOCS</span>
          <h1>Everything you can do</h1>
          <p>A quick tour of CloudBook Pro, its apps and its shell.</p>
        </div>
        <div class="web-doc-grid">
          <article class="web-card">
            <h3>Terminal cheat sheet</h3>
            <table class="web-table">
              <tbody>
                <tr><td><code>help</code></td><td>List every command</td></tr>
                <tr><td><code>neofetch</code></td><td>System information</td></tr>
                <tr><td><code>df -h</code></td><td>Disk usage</td></tr>
                <tr><td><code>free -h</code></td><td>Memory usage</td></tr>
                <tr><td><code>ls -l</code></td><td>Detailed directory listing</td></tr>
                <tr><td><code>open files</code></td><td>Launch an app</td></tr>
                <tr><td><code>theme ocean</code></td><td>Change the accent</td></tr>
              </tbody>
            </table>
          </article>
          <article class="web-card">
            <h3>Keyboard shortcuts</h3>
            <table class="web-table">
              <tbody>
                <tr><td><kbd>⌘K</kbd> / <kbd>Ctrl K</kbd></td><td>Command palette</td></tr>
                <tr><td><kbd>Ctrl Alt T</kbd></td><td>Open Terminal</td></tr>
                <tr><td><kbd>⌘W</kbd></td><td>Close window</td></tr>
                <tr><td><kbd>⌘M</kbd></td><td>Minimize window</td></tr>
                <tr><td><kbd>Ctrl S</kbd></td><td>Save in Editor</td></tr>
                <tr><td><kbd>Esc</kbd></td><td>Dismiss overlays</td></tr>
              </tbody>
            </table>
          </article>
        </div>
        <article class="web-card">
          <h3>How storage works</h3>
          <p>CloudBook Pro gives every app the same 1 TB virtual drive. Files are stored in your browser's
          local storage, so they survive refreshes and restarts on this device. Use <strong>Files → Upload</strong>
          to add real documents, or write new ones in the Editor.</p>
          <p class="web-muted">The hardware profile (20 GB RAM, 1 TB NVMe, 8 vCPU) is provisioned for the demo session.
          Telemetry in System Monitor is simulated.</p>
        </article>
      </div>`;
  }

  function specsPage() {
    const used = fs.usedBytes();
    const rows = [
      ['Machine', 'CloudBook Pro (2026)'],
      ['OS', 'CloudBook OS 4.2 · build 2026.10.25'],
      ['Kernel', '6.9.4-cloud'],
      ['CPU', '8-core Cloud vCPU · 3.8 GHz boost'],
      ['GPU', 'CloudGPU 16-core · Metal-compatible'],
      ['Memory', '20 GB unified LPDDR5X · 6400 MT/s'],
      ['Storage', '1 TB NVMe SSD · encrypted'],
      ['Network', '2.5 Gbps · Wi-Fi 6E · 12 ms edge'],
      ['Display', '2560 × 1600 · 120 Hz · P3'],
      ['Region', REGIONS[settings.region] || settings.region],
      ['Drive usage', `${fmtBytes(used)} of ${fmtBytes(QUOTA_BYTES, 0)}`],
      ['Uptime', fmtUptime(system.uptimeSeconds())],
    ];
    return `
      <div class="web-page">
        <div class="web-doc-head">
          <span class="web-kicker">HARDWARE</span>
          <h1>This CloudBook</h1>
          <p>A live snapshot of the machine hosting this session.</p>
        </div>
        <article class="web-card spec-table-card">
          <table class="web-table spec-table">
            <tbody>${rows.map(([key, value]) => `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}</tbody>
          </table>
        </article>
        <div class="web-chips">
          <button data-open-app="monitor">Open System Monitor</button>
          <button data-open-app="settings">Open Settings</button>
          <button data-url="cloudbook://docs">Read the docs</button>
        </div>
      </div>`;
  }

  function filesPage() {
    const files = recentFiles(12);
    return `
      <div class="web-page">
        <div class="web-doc-head">
          <span class="web-kicker">CLOUD DRIVE</span>
          <h1>Recent files</h1>
          <p>Jump straight back into something you were working on.</p>
        </div>
        <div class="web-file-list">
          ${files.map(({ path, node }) => {
            const info = fileIcon(node.name);
            return `<button class="web-file" data-open-path="${escapeHtml(path)}">
              <span class="web-file-icon tone-${info.tone}">${icon(info.icon, 17)}</span>
              <span class="web-file-copy"><strong>${escapeHtml(node.name)}</strong><small>${escapeHtml(path)}</small></span>
              <span class="web-file-meta">${fmtBytes(fs.bytes(node))}</span>
            </button>`;
          }).join('') || '<p class="web-muted">No files yet.</p>'}
        </div>
        <div class="web-chips">
          <button data-open-app="files">Open Files</button>
          <button data-open-app="editor">New document</button>
        </div>
      </div>`;
  }

  function searchPage(query) {
    const q = query.toLowerCase();
    const apps = [
      ['files', 'Files', 'Browse the cloud drive', 'folder'],
      ['terminal', 'Terminal', 'Command line', 'terminal'],
      ['editor', 'Editor', 'Write and save text', 'editor'],
      ['browser', 'Nimbus', 'Cloud browser', 'browser'],
      ['monitor', 'System Monitor', 'Live telemetry', 'monitor'],
      ['calculator', 'Calculator', 'Numbers', 'calculator'],
      ['settings', 'Settings', 'Themes and storage', 'settings'],
      ['about', 'About CloudBook', 'Session details', 'cloud'],
    ].filter(([, name, desc]) => name.toLowerCase().includes(q) || desc.toLowerCase().includes(q));
    const files = walkFiles(fs.get('/'), '/', [])
      .filter(({ path, node }) => {
        if (path.startsWith('/home/cloud/.Trash')) return false;
        if (node.name.toLowerCase().includes(q)) return true;
        if ((node.mime || '').startsWith('text/') && (node.content || '').toLowerCase().includes(q)) return true;
        return false;
      })
      .slice(0, 12);
    return `
      <div class="web-page">
        <div class="web-doc-head">
          <span class="web-kicker">CLOUD SEARCH</span>
          <h1>Results for “${escapeHtml(query)}”</h1>
          <p>${apps.length + files.length} matches across apps and your drive.</p>
        </div>
        ${apps.length ? `<article class="web-card"><h3>Apps</h3><div class="web-file-list">
          ${apps.map(([id, name, desc, ic]) => `<button class="web-file" data-open-app="${id}">
            <span class="web-file-icon tone-violet">${icon(ic, 17)}</span>
            <span class="web-file-copy"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(desc)}</small></span>
            <span class="web-file-meta">${icon('chevron-right', 14)}</span>
          </button>`).join('')}
        </div></article>` : ''}
        ${files.length ? `<article class="web-card"><h3>Files</h3><div class="web-file-list">
          ${files.map(({ path, node }) => {
            const info = fileIcon(node.name);
            return `<button class="web-file" data-open-path="${escapeHtml(path)}">
              <span class="web-file-icon tone-${info.tone}">${icon(info.icon, 17)}</span>
              <span class="web-file-copy"><strong>${escapeHtml(node.name)}</strong><small>${escapeHtml(path)}</small></span>
              <span class="web-file-meta">${icon('chevron-right', 14)}</span>
            </button>`;
          }).join('')}
        </div></article>` : ''}
        ${!apps.length && !files.length ? `<article class="web-card"><h3>No cloud matches</h3><p class="web-muted">Try another word, or search the open web.</p></article>` : ''}
        <div class="web-chips">
          <button data-external="https://duckduckgo.com/?q=${encodeURIComponent(query)}">Search the web for “${escapeHtml(query)}”</button>
          <button data-url="cloudbook://home">Back home</button>
        </div>
      </div>`;
  }

  function externalPage(url) {
    return `
      <div class="external-wrap">
        <div class="external-note">
          <span>${icon('shield', 13)} Sandboxed external page</span>
          <span class="external-url">${escapeHtml(url)}</span>
          <button class="btn btn-ghost btn-sm" data-external="${escapeHtml(url)}">Open in new tab</button>
        </div>
        <iframe src="${escapeHtml(url)}" title="External page" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
      </div>`;
  }

  function pageFor(url) {
    if (url === 'cloudbook://home') return { title: 'Nimbus', html: homePage() };
    if (url === 'cloudbook://docs') return { title: 'Docs', html: docsPage() };
    if (url === 'cloudbook://specs') return { title: 'Specs', html: specsPage() };
    if (url === 'cloudbook://files') return { title: 'Recent files', html: filesPage() };
    if (url.startsWith('cloudbook://search')) {
      const query = decodeURIComponent(url.split('q=')[1] || '');
      return { title: `Search: ${query}`, html: searchPage(query) };
    }
    if (/^https?:\/\//.test(url)) return { title: url.replace(/^https?:\/\//, ''), html: externalPage(url) };
    return { title: 'Not found', html: `<div class="web-page"><div class="web-doc-head"><h1>Page not found</h1><p>${escapeHtml(url)}</p></div></div>` };
  }

  function render({ push = true } = {}) {
    const page = pageFor(state.url);
    content.innerHTML = page.html;
    setAddress(state.url);
    setStatus(`Loaded ${state.url} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    ctx.setTitle(`Nimbus — ${page.title}`);
    if (push) {
      state.history = state.history.slice(0, state.index + 1);
      state.history.push(state.url);
      state.index = state.history.length - 1;
    }
    syncHistoryButtons();
    bindPage();
    content.scrollTop = 0;
  }

  function bindPage() {
    content.querySelectorAll('[data-url]').forEach((btn) => {
      btn.addEventListener('click', () => navigate(btn.dataset.url));
    });
    content.querySelectorAll('[data-external]').forEach((btn) => {
      btn.addEventListener('click', () => window.open(btn.dataset.external, '_blank', 'noopener'));
    });
    content.querySelectorAll('[data-open-app]').forEach((btn) => {
      btn.addEventListener('click', () => ctx.openApp(btn.dataset.openApp));
    });
    content.querySelectorAll('[data-open-path]').forEach((btn) => {
      btn.addEventListener('click', () => ctx.openPath(btn.dataset.openPath));
    });
    content.querySelector('#home-search')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = e.target.querySelector('input').value.trim();
      if (value) navigate(`cloudbook://search?q=${encodeURIComponent(value)}`);
    });
  }

  function navigate(raw, { push = true } = {}) {
    let url = String(raw || '').trim();
    if (!url) return;
    if (/^cloudbook:\/\//.test(url)) {
      url = url.replace(/\/$/, '');
    } else if (/^https?:\/\//.test(url)) {
      // keep as is
    } else if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(url)) {
      url = `https://${url}`;
    } else {
      url = `cloudbook://search?q=${encodeURIComponent(url)}`;
    }
    state.url = url;
    render({ push });
  }

  body.querySelector('#browser-form').addEventListener('submit', (e) => {
    e.preventDefault();
    navigate(address.value);
    address.blur();
  });
  backBtn.addEventListener('click', () => {
    if (state.index <= 0) return;
    state.index -= 1;
    state.url = state.history[state.index];
    render({ push: false });
  });
  forwardBtn.addEventListener('click', () => {
    if (state.index >= state.history.length - 1) return;
    state.index += 1;
    state.url = state.history[state.index];
    render({ push: false });
  });
  body.querySelector('#browser-reload').addEventListener('click', () => {
    render({ push: false });
    toast({ title: 'Reloaded', message: state.url, iconName: 'refresh' });
  });
  body.querySelector('#browser-home').addEventListener('click', () => navigate('cloudbook://home'));
  body.querySelector('#browser-external').addEventListener('click', () => {
    if (/^https?:\/\//.test(state.url)) window.open(state.url, '_blank', 'noopener');
    else toast({ title: 'Internal page', message: 'This page only exists inside Nimbus.', iconName: 'shield' });
  });
  body.querySelectorAll('#browser-bookmarks [data-url]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.url));
  });

  render({ push: true });

  return () => {};
}
