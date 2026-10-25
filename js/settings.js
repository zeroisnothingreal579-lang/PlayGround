const KEY = 'cloudbook.settings.v1';

export const ACCENTS = {
  violet: { name: 'Violet', accent: '#8b5cf6', accent2: '#22d3ee', rgb: '139, 92, 246', rgb2: '34, 211, 238' },
  ocean: { name: 'Ocean', accent: '#3b82f6', accent2: '#06b6d4', rgb: '59, 130, 246', rgb2: '6, 182, 212' },
  mint: { name: 'Mint', accent: '#10b981', accent2: '#5eead4', rgb: '16, 185, 129', rgb2: '94, 234, 212' },
  rose: { name: 'Rose', accent: '#f43f5e', accent2: '#fb923c', rgb: '244, 63, 94', rgb2: '251, 146, 60' },
  amber: { name: 'Amber', accent: '#f59e0b', accent2: '#fde047', rgb: '245, 158, 11', rgb2: '253, 224, 71' },
};

export const WALLPAPERS = {
  aurora: { name: 'Aurora', blurb: 'Northern light' },
  lagoon: { name: 'Lagoon', blurb: 'Warm horizon' },
  dusk: { name: 'Dusk', blurb: 'Deep magenta' },
  mesh: { name: 'Mesh', blurb: 'Soft spectrum' },
  graphite: { name: 'Graphite', blurb: 'Quiet focus' },
};

export const REGIONS = {
  'us-west-2': 'Oregon, US',
  'us-east-1': 'Virginia, US',
  'eu-central-1': 'Frankfurt, DE',
  'ap-southeast-1': 'Singapore, SG',
  'sa-east-1': 'São Paulo, BR',
};

export const DEFAULTS = {
  theme: 'dark',
  accent: 'violet',
  wallpaper: 'aurora',
  dockSize: 56,
  sync: true,
  wifi: true,
  focus: false,
  volume: 70,
  brightness: 100,
  region: 'us-west-2',
  reduceMotion: false,
};

const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = load();

export function saveSettings(patch = {}) {
  Object.assign(settings, patch);
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  applySettings();
  listeners.forEach((fn) => {
    try { fn(settings); } catch { /* ignore */ }
  });
}

export function onSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function applySettings() {
  const root = document.documentElement;
  const accent = ACCENTS[settings.accent] || ACCENTS.violet;
  root.dataset.theme = settings.theme;
  root.style.setProperty('--accent', accent.accent);
  root.style.setProperty('--accent-2', accent.accent2);
  root.style.setProperty('--accent-rgb', accent.rgb);
  root.style.setProperty('--accent-2-rgb', accent.rgb2);
  root.style.setProperty('--dock-size', `${settings.dockSize}px`);
  root.classList.toggle('reduce-motion', Boolean(settings.reduceMotion));
  document.body.dataset.wallpaper = settings.wallpaper;
  document.body.classList.toggle('focus-mode', Boolean(settings.focus));
  const veil = document.getElementById('brightness-veil');
  if (veil) veil.style.opacity = String(Math.max(0, (100 - settings.brightness) / 160));
  const syncChip = document.getElementById('sync-chip');
  if (syncChip) syncChip.classList.toggle('is-off', !settings.sync);
  const statusLabel = syncChip?.querySelector('.status-label');
  if (statusLabel) statusLabel.textContent = settings.sync ? 'Synced' : 'Paused';
  document.querySelectorAll('.cc-toggle').forEach((btn) => {
    const key = btn.dataset.toggle;
    if (key === 'theme') btn.classList.toggle('on', settings.theme === 'light');
    else if (key === 'sync') btn.classList.toggle('on', settings.sync);
    else if (key === 'wifi') btn.classList.toggle('on', settings.wifi);
    else if (key === 'focus') btn.classList.toggle('on', settings.focus);
  });
  const vol = document.getElementById('volume-slider');
  if (vol) vol.value = String(settings.volume);
  const bright = document.getElementById('brightness-slider');
  if (bright) bright.value = String(settings.brightness);
}

export function resetSettings() {
  saveSettings({ ...DEFAULTS });
}
