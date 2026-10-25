const KEY = 'cloudbook.fs.v1';
export const HOME = '/home/cloud';
export const TRASH = '/home/cloud/.Trash';
export const QUOTA_BYTES = 1e12;
export const SYSTEM_BASE_BYTES = 149_600_000_000;

const now = () => Date.now();

const AURORA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#050817"/><stop offset="1" stop-color="#131b3a"/></linearGradient>
  <radialGradient id="a" cx="50%" cy="50%"><stop stop-color="#38f5d0" stop-opacity=".95"/><stop offset="1" stop-color="#38f5d0" stop-opacity="0"/></radialGradient>
  <radialGradient id="b" cx="50%" cy="50%"><stop stop-color="#8b5cf6" stop-opacity=".9"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/></radialGradient>
  <radialGradient id="c" cx="50%" cy="50%"><stop stop-color="#22d3ee" stop-opacity=".75"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>
</defs>
<rect width="800" height="500" fill="url(#sky)"/>
<g fill="#fff"><circle cx="80" cy="70" r="1.6"/><circle cx="180" cy="40" r="1.2"/><circle cx="290" cy="90" r="1.4"/><circle cx="410" cy="50" r="1"/><circle cx="520" cy="95" r="1.5"/><circle cx="640" cy="45" r="1.2"/><circle cx="710" cy="110" r="1.7"/><circle cx="120" cy="150" r="1"/><circle cx="360" cy="150" r="1.1"/><circle cx="590" cy="160" r="1"/></g>
<ellipse cx="260" cy="280" rx="300" ry="170" fill="url(#a)" opacity=".5"/>
<ellipse cx="560" cy="230" rx="330" ry="150" fill="url(#b)" opacity=".55"/>
<ellipse cx="420" cy="380" rx="380" ry="130" fill="url(#c)" opacity=".45"/>
<path d="M0 420c90-30 170-10 250 18s150 30 240 4 190-44 310-12v70H0Z" fill="#070b1c"/>
<path d="M0 455c120-20 200 8 300 20s190 10 280-10 150-22 220-6v41H0Z" fill="#03050f"/>
</svg>`;

const LAGOON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
<defs>
  <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#2b1055"/><stop offset=".55" stop-color="#f97316"/><stop offset="1" stop-color="#fbbf24"/></linearGradient>
  <linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#0e7490"/><stop offset="1" stop-color="#042f2e"/></linearGradient>
</defs>
<rect width="800" height="330" fill="url(#s)"/>
<circle cx="570" cy="250" r="58" fill="#ffe6a3" opacity=".95"/>
<path d="M0 300c110-40 180 20 280 8s160-56 260-30 180 44 260 18v64H0Z" fill="#1c0f3a" opacity=".85"/>
<rect y="330" width="800" height="170" fill="url(#w)"/>
<g fill="#fbbf24" opacity=".6"><rect x="548" y="352" width="44" height="4" rx="2"/><rect x="558" y="374" width="28" height="3" rx="1.5"/><rect x="530" y="396" width="60" height="3" rx="1.5"/><rect x="556" y="420" width="34" height="2.4" rx="1.2"/></g>
<path d="M0 500c90-50 170-60 260-40s180 50 280 30 170-40 260-20v30H0Z" fill="#021c1b"/>
</svg>`;

const PEAKS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
<defs><linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#0f172a"/><stop offset=".6" stop-color="#4c1d95"/><stop offset="1" stop-color="#f472b6"/></linearGradient></defs>
<rect width="800" height="500" fill="url(#p)"/>
<circle cx="640" cy="120" r="46" fill="#fdf2f8" opacity=".9"/>
<path d="M0 380 180 150l120 160 90-90 140 180 110-120 160 170v50H0Z" fill="#1e1b4b"/>
<path d="M0 430 200 250l130 130 100-70 120 120 110-70 140 90v50H0Z" fill="#0b1020"/>
<path d="M180 150l40 54-38 18-30-30Zm240 70 44 58-40 20-32-34Z" fill="#e9d5ff" opacity=".85"/>
</svg>`;

function file(name, content, mime = 'text/plain') {
  return { type: 'file', name, content, mime, created: now(), modified: now() };
}
function dir(name, children = {}) {
  return { type: 'dir', name, children, created: now(), modified: now() };
}

function seed() {
  const welcome = `# Welcome to CloudBook Pro

Your cloud laptop is online. This machine is provisioned with **20 GB of unified
memory**, **1 TB of NVMe storage**, and an 8-core cloud CPU — and it runs right
here in your browser.

## What's inside

- **Files** — a real, persistent filesystem. Everything you create is saved.
- **Terminal** — try \`neofetch\`, \`df -h\`, \`free -h\`, or \`help\`.
- **Editor** — write Markdown, code, or notes and save them to your drive.
- **System Monitor** — live CPU, memory, disk and network telemetry.
- **Nimbus** — a browser for the cloud, with built-in docs.
- **Settings** — themes, wallpapers, accents, regions and storage.

## Quick tips

1. Press **⌘K** (or **Ctrl+K**) anywhere to open the command palette.
2. Drag windows by their title bar; double-click a title bar to zoom.
3. Right-click the desktop for quick actions.
4. Your files survive a refresh. They live in this browser's local storage.

> CloudBook Pro · session encrypted · region us-west-2
`;
  const roadmap = `# Product Roadmap

## Now
- [x] Persistent virtual filesystem
- [x] Window manager with drag + resize
- [x] Terminal, editor and browser
- [x] Live system telemetry

## Next
- [ ] Shared cloud folders
- [ ] Multiplayer cursors
- [ ] GPU passthrough for WebGPU apps
- [ ] Snapshot and restore

## Later
- [ ] Custom app SDK
- [ ] Bring-your-own object storage
`;
  const expenses = `date,category,description,amount
2026-10-02,cloud,CloudBook Pro monthly,24.00
2026-10-04,storage,Snapshot archive,3.20
2026-10-09,network,Egress overage,1.45
2026-10-14,apps,Design suite seat,12.00
2026-10-21,cloud,Extra region,6.00
`;
  const setup = `# CloudBook setup notes

1. Open the **Settings** app and pick a region close to you.
2. Cloud Sync is enabled by default; the sync chip lives in the menu bar.
3. The 1 TB drive is shared across all apps.
4. Use **Files → Upload** to add real files from your computer.

Session endpoint: https://cloudbook.local
Support: help@cloudbook.local
`;
  const hello = `// A tiny CloudBook demo
const cloud = {
  ram: '20 GB',
  storage: '1 TB',
  region: 'us-west-2',
  online: true,
};

function describe(machine) {
  return \`CloudBook \${machine.online ? 'online' : 'offline'} — \` +
    \`\${machine.ram} RAM · \${machine.storage} · \${machine.region}\`;
}

console.log(describe(cloud));
`;
  const miniPage = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Hello from CloudBook</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #0b0d16; color: #e8ecff;
             display: grid; place-items: center; height: 100vh; margin: 0; }
      h1 { background: linear-gradient(90deg, #8b5cf6, #22d3ee);
           -webkit-background-clip: text; color: transparent; }
    </style>
  </head>
  <body>
    <h1>Hello from CloudBook</h1>
  </body>
</html>
`;
  const miniCss = `:root { color-scheme: dark; }
body { margin: 0; background: #0b0d16; color: #e8ecff; font-family: system-ui; }
h1 { letter-spacing: -0.04em; }
`;
  const musicReadme = `# Music

Drop audio files into this folder from the Files app. Playback support is on
the roadmap — for now this is a great place to keep your cloud mixtapes.
`;

  return dir('/', {
    home: dir('home', {
      cloud: dir('cloud', {
        Desktop: dir('Desktop'),
        Documents: dir('Documents', {
          'Welcome.md': file('Welcome.md', welcome, 'text/markdown'),
          'Roadmap.md': file('Roadmap.md', roadmap, 'text/markdown'),
          'Expenses.csv': file('Expenses.csv', expenses, 'text/csv'),
        }),
        Downloads: dir('Downloads', {
          'setup-notes.md': file('setup-notes.md', setup, 'text/markdown'),
        }),
        Pictures: dir('Pictures', {
          'aurora.svg': file('aurora.svg', AURORA_SVG, 'image/svg+xml'),
          'lagoon.svg': file('lagoon.svg', LAGOON_SVG, 'image/svg+xml'),
          'peaks.svg': file('peaks.svg', PEAKS_SVG, 'image/svg+xml'),
        }),
        Music: dir('Music', {
          'README.md': file('README.md', musicReadme, 'text/markdown'),
        }),
        Projects: dir('Projects', {
          'hello.js': file('hello.js', hello, 'text/javascript'),
          'index.html': file('index.html', miniPage, 'text/html'),
          'style.css': file('style.css', miniCss, 'text/css'),
        }),
        '.Trash': dir('.Trash'),
        'README.md': file('README.md', welcome, 'text/markdown'),
      }),
    }),
    System: dir('System', {
      'version.txt': file('version.txt', 'CloudBook OS 4.2 (build 2026.10.25)\nKernel 6.9.4-cloud\n', 'text/plain'),
    }),
    Volumes: dir('Volumes', {
      CloudDrive: dir('CloudDrive'),
    }),
    tmp: dir('tmp'),
  });
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

class VFS {
  constructor() {
    this.root = this.load();
    this.listeners = new Set();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.type === 'dir') return parsed;
      }
    } catch { /* corrupted or unavailable */ }
    return seed();
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.root));
      return true;
    } catch {
      return false;
    }
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.save();
    this.listeners.forEach((fn) => {
      try { fn(this); } catch { /* ignore */ }
    });
  }

  normalize(path, cwd = HOME) {
    if (!path) return cwd;
    let p = String(path).trim();
    if (p === '~') p = HOME;
    else if (p.startsWith('~/')) p = HOME + p.slice(1);
    if (!p.startsWith('/')) p = `${cwd}/${p}`;
    const parts = [];
    for (const part of p.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') parts.pop();
      else parts.push(part);
    }
    return '/' + parts.join('/');
  }

  get(path, cwd = HOME) {
    const full = this.normalize(path, cwd);
    if (full === '/') return this.root;
    let node = this.root;
    for (const part of full.split('/').filter(Boolean)) {
      if (!node || node.type !== 'dir' || !node.children[part]) return null;
      node = node.children[part];
    }
    return node;
  }

  parent(path) {
    const full = this.normalize(path);
    if (full === '/') return null;
    const idx = full.lastIndexOf('/');
    return idx === 0 ? '/' : full.slice(0, idx);
  }

  base(path) {
    const full = this.normalize(path);
    return full === '/' ? '/' : full.slice(full.lastIndexOf('/') + 1);
  }

  ensureDir(path) {
    const full = this.normalize(path);
    let node = this.root;
    for (const part of full.split('/').filter(Boolean)) {
      if (!node.children[part]) {
        node.children[part] = dir(part);
      }
      node = node.children[part];
      if (node.type !== 'dir') return null;
    }
    node.modified = now();
    return node;
  }

  list(path, cwd = HOME) {
    const node = this.get(path, cwd);
    if (!node || node.type !== 'dir') return [];
    return Object.values(node.children).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
  }

  read(path, cwd = HOME) {
    const node = this.get(path, cwd);
    if (!node || node.type !== 'file') return null;
    return node.content ?? '';
  }

  exists(path, cwd = HOME) {
    return Boolean(this.get(path, cwd));
  }

  isDir(path, cwd = HOME) {
    return this.get(path, cwd)?.type === 'dir';
  }

  write(path, content, opts = {}) {
    const full = this.normalize(path, opts.cwd || HOME);
    const parentPath = this.parent(full);
    if (parentPath === null) return null;
    const parent = this.ensureDir(parentPath);
    if (!parent) return null;
    const name = this.base(full);
    const existing = parent.children[name];
    if (existing && existing.type === 'dir') return null;
    if (existing) {
      existing.content = content;
      existing.mime = opts.mime || existing.mime || 'text/plain';
      existing.modified = now();
    } else {
      parent.children[name] = {
        type: 'file',
        name,
        content,
        mime: opts.mime || 'text/plain',
        created: now(),
        modified: now(),
      };
    }
    parent.modified = now();
    this.emit();
    return parent.children[name];
  }

  mkdir(path, cwd = HOME) {
    const full = this.normalize(path, cwd);
    if (this.exists(full)) return false;
    const parentPath = this.parent(full);
    if (parentPath === null) return false;
    const parent = this.ensureDir(parentPath);
    if (!parent) return false;
    const name = this.base(full);
    parent.children[name] = dir(name);
    parent.modified = now();
    this.emit();
    return true;
  }

  remove(path, { trash = true } = {}) {
    const full = this.normalize(path);
    if (full === '/' || full === HOME || full === TRASH) return false;
    const node = this.get(full);
    if (!node) return false;
    if (trash && !full.startsWith(TRASH + '/')) {
      const trashNode = this.ensureDir(TRASH);
      if (!trashNode) return false;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const name = `${stamp}__${node.name}`;
      const copy = clone(node);
      copy.name = name;
      copy.originalPath = full;
      trashNode.children[name] = copy;
      trashNode.modified = now();
    }
    const parentPath = this.parent(full);
    const parent = this.get(parentPath);
    if (parent && parent.children[this.base(full)]) {
      delete parent.children[this.base(full)];
      parent.modified = now();
    }
    this.emit();
    return true;
  }

  restore(path) {
    const full = this.normalize(path);
    const node = this.get(full);
    if (!node || !node.originalPath) return false;
    let dest = node.originalPath;
    if (this.exists(dest)) {
      const parent = this.parent(dest);
      const base = this.base(dest);
      const dot = base.lastIndexOf('.');
      const stem = dot > 0 ? base.slice(0, dot) : base;
      const ext = dot > 0 ? base.slice(dot) : '';
      let i = 1;
      while (this.exists(`${parent}/${stem} ${i}${ext}`)) i += 1;
      dest = `${parent}/${stem} ${i}${ext}`;
    }
    const restored = clone(node);
    restored.name = this.base(dest);
    delete restored.originalPath;
    const parent = this.ensureDir(this.parent(dest));
    if (!parent) return false;
    parent.children[restored.name] = restored;
    this.remove(full, { trash: false });
    this.emit();
    return true;
  }

  emptyTrash() {
    const trashNode = this.get(TRASH);
    if (!trashNode || !Object.keys(trashNode.children).length) return 0;
    const count = Object.keys(trashNode.children).length;
    trashNode.children = {};
    this.emit();
    return count;
  }

  rename(path, newName) {
    const full = this.normalize(path);
    const node = this.get(full);
    if (!node) return false;
    const clean = String(newName).trim().replace(/\//g, '-');
    if (!clean) return false;
    const parent = this.get(this.parent(full));
    if (!parent) return false;
    if (clean !== node.name && parent.children[clean]) return false;
    delete parent.children[node.name];
    node.name = clean;
    node.modified = now();
    parent.children[clean] = node;
    this.emit();
    return true;
  }

  copy(src, destDir, cwd = HOME) {
    const source = this.get(src, cwd);
    const targetDir = this.get(destDir, cwd);
    if (!source || !targetDir || targetDir.type !== 'dir') return false;
    let name = source.name;
    if (targetDir.children[name]) {
      const dot = name.lastIndexOf('.');
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      let i = 1;
      while (targetDir.children[`${stem} copy${i > 1 ? ' ' + i : ''}${ext}`]) i += 1;
      name = `${stem} copy${i > 1 ? ' ' + i : ''}${ext}`;
    }
    const copy = clone(source);
    copy.name = name;
    copy.created = now();
    copy.modified = now();
    targetDir.children[name] = copy;
    this.emit();
    return true;
  }

  move(src, dest, cwd = HOME) {
    const full = this.normalize(src, cwd);
    if (['/', HOME, TRASH, '/System', '/Volumes'].includes(full)) return false;
    const source = this.get(full);
    if (!source) return false;
    const destFull = this.normalize(dest, cwd);
    const destNode = this.get(destFull);
    const targetPath = destNode && destNode.type === 'dir'
      ? (destFull === '/' ? `/${source.name}` : `${destFull}/${source.name}`)
      : destFull;
    if (targetPath === full) return true;
    if (targetPath.startsWith(`${full}/`)) return false;
    if (this.exists(targetPath)) return false;
    const parent = this.ensureDir(this.parent(targetPath));
    const oldParent = this.get(this.parent(full));
    if (!parent || !oldParent) return false;
    delete oldParent.children[source.name];
    source.name = this.base(targetPath);
    source.modified = now();
    parent.children[source.name] = source;
    this.emit();
    return true;
  }

  copyTo(src, dest, cwd = HOME) {
    const source = this.get(src, cwd);
    if (!source) return false;
    const destFull = this.normalize(dest, cwd);
    const destNode = this.get(destFull);
    const targetPath = destNode && destNode.type === 'dir'
      ? (destFull === '/' ? `/${source.name}` : `${destFull}/${source.name}`)
      : destFull;
    if (this.exists(targetPath)) return false;
    const parent = this.ensureDir(this.parent(targetPath));
    if (!parent) return false;
    const copy = clone(source);
    copy.name = this.base(targetPath);
    copy.created = now();
    copy.modified = now();
    parent.children[copy.name] = copy;
    this.emit();
    return true;
  }

  bytes(node) {
    if (!node) return 0;
    if (node.type === 'dir') {
      return Object.values(node.children).reduce((sum, child) => sum + this.bytes(child), 0);
    }
    const content = node.content || '';
    if (content.startsWith('data:') && content.includes(';base64,')) {
      return Math.floor((content.length - content.indexOf(';base64,') - 8) * 0.75);
    }
    return new TextEncoder().encode(content).length;
  }

  usedBytes() {
    return SYSTEM_BASE_BYTES + this.bytes(this.root);
  }

  userBytes() {
    return this.bytes(this.root);
  }

  breakdown() {
    const system = [
      { label: 'CloudBook OS', bytes: 38_400_000_000, tone: 'violet' },
      { label: 'Applications', bytes: 61_200_000_000, tone: 'blue' },
      { label: 'Photos & media', bytes: 24_800_000_000, tone: 'rose' },
      { label: 'Snapshots', bytes: 25_200_000_000, tone: 'teal' },
    ];
    const home = this.get(HOME);
    const user = home && home.type === 'dir'
      ? Object.values(home.children)
        .filter((n) => n.name !== '.Trash')
        .map((n) => ({ label: n.name, bytes: this.bytes(n), tone: 'amber' }))
        .filter((n) => n.bytes > 0)
      : [];
    return [...system, ...user];
  }

  reset() {
    this.root = seed();
    this.emit();
  }

  downloadNode(path) {
    const node = this.get(path);
    if (!node || node.type !== 'file') return null;
    return { name: node.name, content: node.content ?? '', mime: node.mime || 'text/plain' };
  }
}

export const fs = new VFS();
export const fmtBytes = (bytes, digits = 1) => {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1000)));
  return `${(bytes / 1000 ** i).toFixed(i === 0 ? 0 : digits)} ${units[i]}`;
};
