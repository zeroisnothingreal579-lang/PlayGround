import { mount as mountAbout } from './about.js';
import { mount as mountFiles } from './files.js';
import { mount as mountTerminal } from './terminal.js';
import { mount as mountEditor } from './editor.js';
import { mount as mountMonitor } from './monitor.js';
import { mount as mountBrowser } from './browser.js';
import { mount as mountSettings } from './settings.js';
import { mount as mountCalculator } from './calculator.js';

export const APPS = {
  files: {
    name: 'Files',
    icon: 'folder',
    tone: 'blue',
    width: 940,
    height: 610,
    mount: mountFiles,
  },
  terminal: {
    name: 'Terminal',
    icon: 'terminal',
    tone: 'slate',
    width: 780,
    height: 520,
    mount: mountTerminal,
  },
  browser: {
    name: 'Nimbus',
    icon: 'browser',
    tone: 'teal',
    width: 960,
    height: 640,
    mount: mountBrowser,
  },
  editor: {
    name: 'Editor',
    icon: 'editor',
    tone: 'amber',
    width: 800,
    height: 580,
    mount: mountEditor,
  },
  monitor: {
    name: 'System Monitor',
    icon: 'monitor',
    tone: 'mint',
    width: 900,
    height: 640,
    mount: mountMonitor,
  },
  calculator: {
    name: 'Calculator',
    icon: 'calculator',
    tone: 'rose',
    width: 360,
    height: 560,
    mount: mountCalculator,
  },
  settings: {
    name: 'Settings',
    icon: 'settings',
    tone: 'slate',
    width: 900,
    height: 620,
    mount: mountSettings,
  },
  about: {
    name: 'About This CloudBook',
    icon: 'cloud',
    tone: 'violet',
    width: 800,
    height: 640,
    mount: mountAbout,
  },
};

export const DOCK_APPS = ['files', 'terminal', 'browser', 'editor', 'monitor', 'calculator', 'settings'];
