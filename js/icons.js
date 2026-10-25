const P = {
  cloud: '<path d="M6.6 18.5h10.9a4.1 4.1 0 0 0 .6-8.16A6.1 6.1 0 0 0 6.7 9.3 4.7 4.7 0 0 0 6.6 18.5Z"/>',
  folder: '<path d="M3.5 7.4A2.4 2.4 0 0 1 5.9 5h3.2l2 2.5h7A2.4 2.4 0 0 1 20.5 9.9v7.2a2.4 2.4 0 0 1-2.4 2.4H5.9a2.4 2.4 0 0 1-2.4-2.4V7.4Z"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="m7 9 3 3-3 3M13.5 15.5H17"/>',
  editor: '<path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M14 3.5V8h4M8.5 12h7M8.5 15.5h5"/>',
  monitor: '<rect x="3" y="4" width="18" height="13" rx="2.4"/><path d="M7 10.5h2l1.6-3 2.4 6 1.5-3H17M9 21h6M12 17v4"/>',
  browser: '<circle cx="12" cy="12" r="8.7"/><path d="M3.5 12h17M12 3.3c2.9 3.5 2.9 13.9 0 17.4M12 3.3c-2.9 3.5-2.9 13.9 0 17.4"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z"/>',
  calculator: '<rect x="5" y="3" width="14" height="18" rx="2.2"/><path d="M8 7h8"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18h.01M12 18h.01M15.5 18h.01" stroke-width="2.4"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.6"/><path d="m16 16 4.2 4.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  'chevron-left': '<path d="m14.5 6-6 6 6 6"/>',
  'chevron-right': '<path d="m9.5 6 6 6-6 6"/>',
  'chevron-up': '<path d="m6 14.5 6-6 6 6"/>',
  'chevron-down': '<path d="m6 9.5 6 6 6-6"/>',
  'arrow-up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
  'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="2.2"/>',
  trash: '<path d="M4 7h16M9 7V5.4A1.4 1.4 0 0 1 10.4 4h3.2A1.4 1.4 0 0 1 15 5.4V7M6.3 7l.8 12.1A1.9 1.9 0 0 0 9 21h6a1.9 1.9 0 0 0 1.9-1.9L17.7 7M10 11v6M14 11v6"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M4.5 19.5h15"/>',
  upload: '<path d="M12 16V5M7 9.5l5-5 5 5M4.5 19.5h15"/>',
  file: '<path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M14 3.5V8h4"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><circle cx="8.6" cy="9.6" r="1.7"/><path d="m4 17 5.2-5.2 3.6 3.6 2.4-2.4L20 17.5"/>',
  home: '<path d="m4 10.5 8-6.5 8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z"/>',
  desktop: '<rect x="3" y="4" width="18" height="12.5" rx="2"/><path d="M8 21h8M12 16.5V21"/>',
  doc: '<path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M14 3.5V8h4M8.5 12h7M8.5 15.5h7M8.5 19h4"/>',
  music: '<path d="M9 18V6.5l10-2v11"/><circle cx="6.6" cy="18" r="2.4"/><circle cx="16.6" cy="15.5" r="2.4"/>',
  'folder-plus': '<path d="M3.5 7.4A2.4 2.4 0 0 1 5.9 5h3.2l2 2.5h7A2.4 2.4 0 0 1 20.5 9.9v7.2a2.4 2.4 0 0 1-2.4 2.4H5.9a2.4 2.4 0 0 1-2.4-2.4V7.4Z"/><path d="M12 11.5v5M9.5 14h5"/>',
  'file-plus': '<path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M14 3.5V8h4M12 11.5v5M9.5 14h5"/>',
  more: '<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>',
  refresh: '<path d="M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5M4 12.5a8 8 0 0 0 13.7 5.2L20 15.5"/><path d="M4 4v4.5h4.5M20 20v-4.5h-4.5"/>',
  globe: '<circle cx="12" cy="12" r="8.7"/><path d="M3.5 12h17M12 3.3c2.9 3.5 2.9 13.9 0 17.4M12 3.3c-2.9 3.5-2.9 13.9 0 17.4"/>',
  cpu: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>',
  memory: '<rect x="3" y="7" width="18" height="10" rx="1.8"/><path d="M7 10v4M11 10v4M15 10v4M19 10v4M6 17v2.5M10 17v2.5M14 17v2.5M18 17v2.5"/>',
  disk: '<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><path d="M6.5 17h.01"/>',
  network: '<circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="19" r="2.2"/><circle cx="19" cy="19" r="2.2"/><path d="M10.4 6.8 6.6 17M13.6 6.8 17.4 17M7.2 19h9.6"/>',
  rocket: '<path d="M12 3.5c3.2 1.4 5 4.7 5 8.2 0 2.3-1 4.3-2.3 5.6l-2.7 2-2.7-2C8 16 7 14 7 11.7c0-3.5 1.8-6.8 5-8.2Z"/><circle cx="12" cy="10.5" r="1.8"/><path d="m8.6 16.5-2.1 2M15.4 16.5l2.1 2M12 19.5V22"/>',
  sparkles: '<path d="M12 3.5 13.4 8l4.5 1.4-4.5 1.4L12 15.3l-1.4-4.5L6.1 9.4 10.6 8 12 3.5ZM18.5 15l.7 2.2 2.2.7-2.2.7-.7 2.2-.7-2.2-2.2-.7 2.2-.7.7-2.2ZM5 15.5l.6 1.8 1.8.6-1.8.6L5 20.3l-.6-1.8-1.8-.6 1.8-.6.6-1.8Z"/>',
  wifi: '<path d="M2.5 9.5a14 14 0 0 1 19 0M5.8 13a9.2 9.2 0 0 1 12.4 0M9 16.4a4.5 4.5 0 0 1 6 0"/><circle cx="12" cy="19.6" r="1.1" fill="currentColor" stroke="none"/>',
  battery: '<rect x="2.5" y="8" width="17" height="8" rx="2"/><path d="M22 11v2" stroke-width="2.4"/><rect x="4.5" y="10" width="11" height="4" rx="1" fill="currentColor" stroke="none"/>',
  control: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/>',
  brightness: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/>',
  volume: '<path d="M4 9.5h3L12 5.5v13L7 14.5H4v-5Z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/>',
  moon: '<path d="M20 14.4A8.3 8.3 0 0 1 9.6 4 8.6 8.6 0 1 0 20 14.4Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2"/>',
  power: '<path d="M12 3.5v8M6.8 6.8a7.4 7.4 0 1 0 10.4 0"/>',
  sync: '<path d="M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5M4 12.5a8 8 0 0 0 13.7 5.2L20 15.5"/><path d="M4 4v4.5h4.5M20 20v-4.5h-4.5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  'panel-left': '<rect x="3" y="4" width="18" height="16" rx="2.2"/><path d="M9 4v16"/>',
  command: '<path d="M9 6.5A2.5 2.5 0 1 0 6.5 9H17.5A2.5 2.5 0 1 0 15 6.5v11A2.5 2.5 0 1 0 17.5 15H6.5A2.5 2.5 0 1 0 9 17.5v-11Z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8.7"/><path d="M12 7v5.2l3.4 2"/>',
  pin: '<path d="m9 4 6 6M7 10l7 7M4 20l5.5-5.5M15.5 4.5l4 4-3 3-1.5 4.5-2.5-2.5-4 4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  'arrow-down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
  minus_circle: '<circle cx="12" cy="12" r="8.7"/><path d="M8 12h8"/>',
  maximize: '<path d="M4 9V4h5M20 15v5h-5M20 9V4h-5M4 15v5h5"/>',
  restore: '<rect x="4" y="8" width="12" height="12" rx="1.6"/><path d="M8 8V5.6A1.6 1.6 0 0 1 9.6 4h9A1.6 1.6 0 0 1 20.2 5.6v9a1.6 1.6 0 0 1-1.6 1.6H16"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  camera: '<path d="M4 8.5h3l1.5-2h7l1.5 2h3a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.5" r="3.2"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 5.4a3 3 0 0 1 0 5.2M17.5 14.5A5.5 5.5 0 0 1 20.5 20"/>',
  shield: '<path d="M12 3 19 6v5.5c0 4.4-2.8 7.7-7 9.5-4.2-1.8-7-5.1-7-9.5V6l7-3Z"/><path d="m9 12 2 2 4-4"/>'
};

export function icon(name, size = 20, extra = '') {
  const body = P[name] || P.file;
  return `<svg class="icon ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const name = el.getAttribute('data-icon');
    const size = Number(el.getAttribute('data-icon-size')) || 18;
    el.innerHTML = icon(name, size);
  });
}

export function fileIcon(name = '') {
  const ext = name.split('.').pop().toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return { icon: 'image', tone: 'rose' };
  if (['md', 'txt', 'rtf', 'log'].includes(ext)) return { icon: 'doc', tone: 'blue' };
  if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'sh', 'py', 'mjs'].includes(ext)) return { icon: 'editor', tone: 'violet' };
  if (['mp3', 'wav', 'm4a', 'flac'].includes(ext)) return { icon: 'music', tone: 'amber' };
  if (['csv', 'xls', 'xlsx'].includes(ext)) return { icon: 'list', tone: 'teal' };
  if (['zip', 'tar', 'gz'].includes(ext)) return { icon: 'layers', tone: 'slate' };
  return { icon: 'file', tone: 'slate' };
}
