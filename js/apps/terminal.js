import { fs, HOME, TRASH, QUOTA_BYTES, fmtBytes } from '../fs.js';
import { system, fmtUptime } from '../system.js';
import { settings, saveSettings, ACCENTS, REGIONS } from '../settings.js';
import { escapeHtml, toast } from '../ui.js';

const COMMANDS = [
  'help', 'clear', 'ls', 'cd', 'pwd', 'cat', 'mkdir', 'touch', 'rm', 'cp', 'mv',
  'echo', 'df', 'free', 'neofetch', 'uname', 'uptime', 'date', 'whoami', 'hostname',
  'top', 'ps', 'open', 'apps', 'theme', 'sync', 'history', 'weather', 'code', 'exit',
];

const APP_ALIASES = {
  files: 'files', finder: 'files', terminal: 'terminal', editor: 'editor', code: 'editor',
  monitor: 'monitor', 'system-monitor': 'monitor', browser: 'browser', nimbus: 'browser',
  calculator: 'calculator', calc: 'calculator', settings: 'settings', about: 'about',
};

const ASCII = String.raw`        .-~~~-.
     .- ~ ~-(     )_ _
    /                    ~ -.
   |   C L O U D B O O K    |
    \                       '.
      ~- ._ _ _ _ _ _ _ _ _ _ _-~`;

function tokenize(line) {
  const tokens = [];
  let cur = '';
  let quote = null;
  let had = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\' && i + 1 < line.length) { cur += line[i + 1]; i += 1; }
      else if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      had = true;
    } else if (ch === '>') {
      if (cur || had) { tokens.push(cur); cur = ''; had = false; }
      if (line[i + 1] === '>') { tokens.push('>>'); i += 1; } else tokens.push('>');
    } else if (/\s/.test(ch)) {
      if (cur || had) { tokens.push(cur); cur = ''; had = false; }
    } else {
      cur += ch;
      had = true;
    }
  }
  if (cur || had) tokens.push(cur);
  return tokens;
}

function pad(value, width) {
  const str = String(value);
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

export function mount(body, ctx) {
  let cwd = fs.isDir(ctx.options.cwd) ? fs.normalize(ctx.options.cwd) : HOME;
  let prevCwd = cwd;
  const history = [];
  let histIndex = 0;
  let statusTimer = null;

  body.innerHTML = `
    <div class="terminal-app">
      <div class="terminal-bar">
        <div class="terminal-tab"><span class="term-tab-dot"></span> cloud@cloudbook — zsh</div>
        <div class="terminal-bar-actions">
          <button class="icon-btn" id="term-clear" title="Clear">${'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>'}</button>
        </div>
      </div>
      <div class="terminal-scroll" id="term-scroll">
        <div class="term-output" id="term-output"></div>
        <div class="term-input-row">
          <span class="term-prompt" id="term-prompt"></span>
          <input id="term-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Terminal command">
        </div>
      </div>
      <div class="terminal-status">
        <span id="term-status-path"></span>
        <span class="terminal-status-right"><span>zsh 5.9</span><span>UTF-8</span><span id="term-status-sync">cloud sync · live</span></span>
      </div>
    </div>`;

  const output = body.querySelector('#term-output');
  const input = body.querySelector('#term-input');
  const promptEl = body.querySelector('#term-prompt');
  const scrollEl = body.querySelector('#term-scroll');
  const statusPath = body.querySelector('#term-status-path');

  const scrollBottom = () => {
    scrollEl.scrollTop = scrollEl.scrollHeight;
  };

  function print(html, cls = '') {
    const line = document.createElement('div');
    line.className = `term-line ${cls}`.trim();
    line.innerHTML = html;
    output.appendChild(line);
    scrollBottom();
    return line;
  }

  function printPre(text, cls = '') {
    return print(`<pre class="term-pre">${escapeHtml(text)}</pre>`, cls);
  }

  function promptText() {
    let p = cwd;
    if (cwd === HOME) p = '~';
    else if (cwd.startsWith(`${HOME}/`)) p = `~${cwd.slice(HOME.length)}`;
    return `cloud@cloudbook:${p}$`;
  }

  function updatePrompt() {
    promptEl.textContent = promptText();
    statusPath.textContent = cwd;
    ctx.setTitle(`cloud@cloudbook: ${cwd === HOME ? '~' : cwd}`);
  }

  function error(message) {
    print(`<span class="term-error">${escapeHtml(message)}</span>`);
  }

  function resolve(arg) {
    return fs.normalize(arg, cwd);
  }

  function showHelp() {
    print('<span class="term-accent">CloudBook shell commands</span>');
    const rows = [
      ['help', 'show this list'],
      ['ls [-l] [path]', 'list directory contents'],
      ['cd [path]', 'change directory'],
      ['pwd', 'print working directory'],
      ['cat <file>', 'print a file'],
      ['mkdir [-p] <dir>', 'create a folder'],
      ['touch <file>', 'create an empty file'],
      ['rm [-r] <path>', 'remove a file or folder'],
      ['cp <src> <dest>', 'copy a file or folder'],
      ['mv <src> <dest>', 'move or rename'],
      ['echo <text> [> file]', 'print or write text'],
      ['df -h', 'disk usage'],
      ['free -h', 'memory usage'],
      ['neofetch', 'system information'],
      ['top / ps', 'processes'],
      ['open <app>', 'launch an app'],
      ['code <file>', 'open a file in the editor'],
      ['theme <name>', 'change accent color'],
      ['sync', 'sync your cloud drive'],
      ['weather', 'current region weather'],
      ['clear', 'clear the terminal'],
      ['exit', 'close the terminal'],
    ];
    printPre(rows.map(([cmd, desc]) => `${pad(cmd, 24)}${desc}`).join('\n'), 'term-help');
  }

  function cmdLs(args) {
    const flags = args.filter((a) => a.startsWith('-'));
    const targets = args.filter((a) => !a.startsWith('-'));
    const long = flags.some((f) => f.includes('l'));
    const all = flags.some((f) => f.includes('a'));
    const target = targets[0] ? resolve(targets[0]) : cwd;
    const node = fs.get(target);
    if (!node) { error(`ls: ${targets[0] || target}: No such file or directory`); return; }
    if (node.type === 'file') { print(escapeHtml(node.name)); return; }
    let entries = fs.list(target);
    if (!all) entries = entries.filter((n) => !n.name.startsWith('.'));
    if (!entries.length) return;
    if (long) {
      const lines = entries.map((n) => {
        const isDir = n.type === 'dir';
        const perm = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
        const size = isDir ? '4.0K' : fmtBytes(fs.bytes(n), 1);
        const date = new Date(n.modified).toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
        return `${perm}  cloud  staff  ${pad(size, 7)} ${date}  ${n.name}`;
      });
      printPre(lines.join('\n'));
    } else {
      const html = entries.map((n) => {
        const name = escapeHtml(n.name);
        return n.type === 'dir' ? `<span class="term-dir">${name}/</span>` : name;
      }).join('   ');
      print(`<pre class="term-pre">${html}</pre>`);
    }
  }

  function cmdCd(args) {
    if (!args.length) {
      prevCwd = cwd;
      cwd = HOME;
      updatePrompt();
      return;
    }
    if (args[0] === '-') {
      const next = prevCwd;
      prevCwd = cwd;
      cwd = next;
      updatePrompt();
      print(escapeHtml(cwd));
      return;
    }
    const target = resolve(args[0]);
    if (!fs.exists(target)) { error(`cd: no such file or directory: ${args[0]}`); return; }
    if (!fs.isDir(target)) { error(`cd: not a directory: ${args[0]}`); return; }
    prevCwd = cwd;
    cwd = target;
    updatePrompt();
  }

  function cmdCat(args) {
    if (!args.length) { error('usage: cat <file>'); return; }
    let failed = false;
    for (const arg of args) {
      const target = resolve(arg);
      const node = fs.get(target);
      if (!node) { error(`cat: ${arg}: No such file or directory`); failed = true; continue; }
      if (node.type === 'dir') { error(`cat: ${arg}: Is a directory`); failed = true; continue; }
      print(`<pre class="term-pre term-file">${escapeHtml(node.content || '')}</pre>`);
    }
    if (failed) return;
  }

  function cmdMkdir(args) {
    const parents = args.includes('-p');
    const paths = args.filter((a) => !a.startsWith('-'));
    if (!paths.length) { error('usage: mkdir [-p] <directory>'); return; }
    for (const p of paths) {
      const target = resolve(p);
      if (parents) {
        if (fs.exists(target)) continue;
        if (!fs.ensureDir(target)) error(`mkdir: cannot create directory '${p}'`);
        else fs.emit();
      } else if (!fs.mkdir(target)) {
        error(`mkdir: cannot create directory '${p}': File exists or parent missing`);
      }
    }
  }

  function cmdTouch(args) {
    if (!args.length) { error('usage: touch <file>'); return; }
    for (const p of args) {
      const target = resolve(p);
      const node = fs.get(target);
      if (node) {
        node.modified = Date.now();
        fs.emit();
      } else {
        const created = fs.write(target, '');
        if (!created) error(`touch: cannot touch '${p}'`);
      }
    }
  }

  function cmdRm(args) {
    const flags = args.filter((a) => a.startsWith('-'));
    const paths = args.filter((a) => !a.startsWith('-'));
    const recursive = flags.some((f) => f.includes('r') || f.includes('R'));
    if (!paths.length) { error('usage: rm [-r] <path>'); return; }
    for (const p of paths) {
      const target = resolve(p);
      if (['/', HOME, TRASH].includes(target)) {
        error(`rm: ${p}: operation not permitted on a protected cloud volume`);
        continue;
      }
      const node = fs.get(target);
      if (!node) { error(`rm: ${p}: No such file or directory`); continue; }
      if (node.type === 'dir' && !recursive) { error(`rm: ${p}: is a directory (use -r)`); continue; }
      fs.remove(target, { trash: false });
    }
  }

  function cmdCp(args) {
    if (args.length < 2) { error('usage: cp <source> <destination>'); return; }
    const src = resolve(args[0]);
    const dest = resolve(args[1]);
    if (!fs.exists(src)) { error(`cp: ${args[0]}: No such file or directory`); return; }
    if (!fs.copyTo(src, dest)) error(`cp: cannot copy to '${args[1]}'`);
  }

  function cmdMv(args) {
    if (args.length < 2) { error('usage: mv <source> <destination>'); return; }
    const src = resolve(args[0]);
    const dest = resolve(args[1]);
    if (!fs.exists(src)) { error(`mv: ${args[0]}: No such file or directory`); return; }
    if (!fs.move(src, dest)) error(`mv: cannot move '${args[0]}' to '${args[1]}'`);
  }

  function cmdDf() {
    const used = fs.usedBytes();
    const avail = QUOTA_BYTES - used;
    const pct = Math.round((used / QUOTA_BYTES) * 100);
    const lines = [
      'Filesystem      Size  Used Avail Capacity  Mounted on',
      `/dev/nvme0n1p1  1.0T  ${fmtBytes(used, 0).padStart(4)}  ${fmtBytes(avail, 0).padStart(4)}     ${String(pct).padStart(2)}%  /`,
      'cloud://drive   1.0T  ' + fmtBytes(fs.userBytes(), 0).padStart(4) + '     -      -  /home/cloud',
      'tmpfs            20G     0   20G     0%  /dev/shm',
    ];
    printPre(lines.join('\n'));
  }

  function cmdFree() {
    const used = system.mem;
    const cache = 2.4;
    const free = Math.max(0, 20 - used - cache);
    const lines = [
      '              total        used        free      shared  buff/cache   available',
      `Mem:          20Gi        ${used.toFixed(1)}Gi        ${free.toFixed(1)}Gi       0.4Gi       ${cache.toFixed(1)}Gi        ${(20 - used).toFixed(1)}Gi`,
      'Swap:           0B          0B          0B',
    ];
    printPre(lines.join('\n'));
  }

  function cmdNeofetch() {
    const used = fs.usedBytes();
    const info = [
      '<span class="term-accent">cloud</span>@<span class="term-accent">cloudbook</span>',
      '<span class="term-muted">---------------------</span>',
      `<span class="term-key">OS</span>: CloudBook OS 4.2 aarch64`,
      `<span class="term-key">Host</span>: CloudBook Pro (cloud)`,
      `<span class="term-key">Kernel</span>: 6.9.4-cloud`,
      `<span class="term-key">Uptime</span>: ${fmtUptime(system.uptimeSeconds())}`,
      `<span class="term-key">Shell</span>: zsh 5.9`,
      `<span class="term-key">Resolution</span>: 2560x1600 @ 120Hz`,
      `<span class="term-key">WM</span>: CloudWM 4.2`,
      `<span class="term-key">CPU</span>: Cloud vCPU (8) @ 3.8GHz`,
      `<span class="term-key">GPU</span>: CloudGPU 16-core`,
      `<span class="term-key">Memory</span>: ${system.mem.toFixed(1)}GiB / 20GiB`,
      `<span class="term-key">Disk</span>: ${fmtBytes(used)} / 1TB`,
      `<span class="term-key">Region</span>: ${REGIONS[settings.region] || settings.region}`,
    ];
    const html = `
      <div class="neofetch">
        <pre class="neofetch-art">${escapeHtml(ASCII)}</pre>
        <div class="neofetch-info">${info.map((line) => `<div>${line}</div>`).join('')}</div>
      </div>`;
    print(html);
  }

  function cmdTop() {
    const procs = [...system.processes].sort((a, b) => b.cpu - a.cpu).slice(0, 9);
    const lines = [
      `Processes: ${system.processes.length} total, 2 running, 1 sleeping`,
      `Load Avg: ${(system.cpu / 100 * 1.4 + 0.12).toFixed(2)}, ${(system.cpu / 100 * 1.2 + 0.08).toFixed(2)}, ${(system.cpu / 100 + 0.05).toFixed(2)}  CPU usage: ${system.cpu.toFixed(1)}% user`,
      `PhysMem: ${system.mem.toFixed(1)}G used (20G total)`,
      '',
      'PID    COMMAND              %CPU   MEM     USER',
      ...procs.map((p) => `${pad(p.pid, 6)} ${pad(p.name, 20)} ${pad(p.cpu.toFixed(1), 5)} ${pad(p.mem.toFixed(2) + 'G', 7)} ${p.user}`),
    ];
    printPre(lines.join('\n'));
  }

  function cmdPs() {
    const lines = [
      'PID    TTY      TIME     CMD',
      ...system.processes.map((p) => `${pad(p.pid, 6)} ttys000  ${pad('0:00.12', 8)} ${p.name}`),
    ];
    printPre(lines.join('\n'));
  }

  function cmdOpen(args) {
    if (!args.length) { error('usage: open <app>  (apps: ' + Object.keys(APP_ALIASES).join(', ') + ')'); return; }
    const appId = APP_ALIASES[args[0].toLowerCase()];
    if (!appId) { error(`open: unknown app '${args[0]}'`); return; }
    ctx.openApp(appId);
    print(`Opening <span class="term-accent">${escapeHtml(appId)}</span>…`);
  }

  function cmdApps() {
    const rows = [
      ['files', 'Browse your cloud drive'],
      ['terminal', 'This shell'],
      ['editor', 'Write and save text files'],
      ['browser', 'Nimbus browser'],
      ['monitor', 'Live system telemetry'],
      ['calculator', 'Numbers, handled'],
      ['settings', 'Themes, storage, regions'],
      ['about', 'CloudBook session details'],
    ];
    printPre(rows.map(([name, desc]) => `${pad(name, 14)}${desc}`).join('\n'));
  }

  function cmdTheme(args) {
    if (!args.length) {
      print(`Current accent: <span class="term-accent">${settings.accent}</span>`);
      print(`Available: ${Object.keys(ACCENTS).join(', ')}`);
      return;
    }
    const name = args[0].toLowerCase();
    if (!ACCENTS[name]) { error(`theme: unknown accent '${args[0]}'`); return; }
    saveSettings({ accent: name });
    print(`Accent set to <span class="term-accent">${name}</span>.`);
  }

  function cmdSync() {
    print('<span class="term-muted">Syncing cloud drive…</span>');
    setTimeout(() => {
      print('<span class="term-success">✓ Sync complete</span> · 12 objects · 8 ms · us-west-2');
      toast({ title: 'Cloud sync complete', message: '12 objects · 8 ms', iconName: 'sync' });
    }, 650);
  }

  function cmdHistory() {
    if (!history.length) { print('<span class="term-muted">No commands yet.</span>'); return; }
    printPre(history.map((h, i) => `${pad(i + 1, 4)}${h}`).join('\n'));
  }

  function cmdWeather() {
    const region = REGIONS[settings.region] || settings.region;
    printPre([
      `${region} — CloudBook edge`,
      '  18°C   Partly cloudy',
      '  Feels like 17°C · Wind 7 km/h · Humidity 62%',
      '  Today: 21° / 12° · 10% chance of rain',
    ].join('\n'));
  }

  function cmdCode(args) {
    if (!args.length) { ctx.openApp('editor'); return; }
    const target = resolve(args[0]);
    const node = fs.get(target);
    if (!node) { error(`code: ${args[0]}: No such file or directory`); return; }
    if (node.type === 'dir') { error(`code: ${args[0]}: Is a directory`); return; }
    ctx.openPath(target);
  }

  function execute(raw) {
    const line = raw.trim();
    if (!line) return;
    const tokens = tokenize(line);
    let redirect = null;
    const redirIndex = tokens.findIndex((t) => t === '>' || t === '>>');
    if (redirIndex !== -1) {
      redirect = { mode: tokens[redirIndex], file: tokens[redirIndex + 1] };
      tokens.splice(redirIndex, 2);
    }
    const [cmd, ...args] = tokens;
    if (!cmd) return;

    if (redirect && cmd !== 'echo') {
      error('redirection is only supported for echo in this demo shell');
      return;
    }

    switch (cmd) {
      case 'help': showHelp(); break;
      case 'clear': output.innerHTML = ''; break;
      case 'pwd': print(escapeHtml(cwd)); break;
      case 'ls': cmdLs(args); break;
      case 'cd': cmdCd(args); break;
      case 'cat': cmdCat(args); break;
      case 'mkdir': cmdMkdir(args); break;
      case 'touch': cmdTouch(args); break;
      case 'rm': cmdRm(args); break;
      case 'cp': cmdCp(args); break;
      case 'mv': cmdMv(args); break;
      case 'echo': {
        const text = args.join(' ');
        if (redirect) {
          if (!redirect.file) { error('echo: missing redirection target'); break; }
          const target = resolve(redirect.file);
          const existing = fs.read(target) ?? '';
          const content = redirect.mode === '>>' ? existing + text + '\n' : `${text}\n`;
          if (!fs.write(target, content)) error(`echo: cannot write '${redirect.file}'`);
        } else {
          print(escapeHtml(text));
        }
        break;
      }
      case 'df': cmdDf(); break;
      case 'free': cmdFree(); break;
      case 'neofetch': cmdNeofetch(); break;
      case 'uname':
        print(args.includes('-a')
          ? 'CloudBook 6.9.4-cloud #1 SMP PREEMPT_DYNAMIC Sun Oct 25 09:14:22 UTC 2026 aarch64 CloudBookOS'
          : 'CloudBook');
        break;
      case 'uptime': {
        const up = fmtUptime(system.uptimeSeconds());
        print(`${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}  up ${up}, 1 user, load averages: 0.42 0.38 0.31`);
        break;
      }
      case 'date': print(new Date().toString()); break;
      case 'whoami': print('cloud'); break;
      case 'hostname': print('cloudbook'); break;
      case 'top': cmdTop(); break;
      case 'ps': cmdPs(); break;
      case 'open': cmdOpen(args); break;
      case 'apps': cmdApps(); break;
      case 'theme': cmdTheme(args); break;
      case 'sync': cmdSync(); break;
      case 'history': cmdHistory(); break;
      case 'weather': cmdWeather(); break;
      case 'code': cmdCode(args); break;
      case 'sudo': print('<span class="term-muted">cloud is already omnipotent on this machine.</span>'); break;
      case 'exit': ctx.close(); break;
      default:
        if (cmd === 'rm' && args.includes('-rf') && args.includes('/')) {
          print('<span class="term-muted">Nice try — your cloud drive is protected.</span>');
        } else {
          error(`zsh: command not found: ${cmd}`);
        }
    }
  }

  function submit() {
    const raw = input.value;
    print(`<span class="term-user">cloud@cloudbook</span><span class="term-path">:${escapeHtml(cwd === HOME ? '~' : cwd.replace(HOME, '~'))}</span><span class="term-dollar">$</span> ${escapeHtml(raw)}`, 'term-cmd');
    input.value = '';
    if (raw.trim()) {
      history.push(raw.trim());
      histIndex = history.length;
      execute(raw);
    }
    scrollBottom();
  }

  function tabComplete() {
    const value = input.value;
    const parts = value.split(/\s+/);
    const last = parts[parts.length - 1];
    if (parts.length === 1) {
      const matches = COMMANDS.filter((c) => c.startsWith(last));
      if (matches.length === 1) input.value = `${matches[0]} `;
      else if (matches.length > 1) {
        print(`<span class="term-muted">${matches.join('   ')}</span>`);
        input.value = commonPrefix(matches);
      }
      return;
    }
    const slash = last.lastIndexOf('/');
    const dirPart = slash === -1 ? '' : last.slice(0, slash + 1);
    const prefix = slash === -1 ? last : last.slice(slash + 1);
    const dir = resolve(dirPart || '.');
    const entries = fs.list(dir).filter((n) => n.name.startsWith(prefix));
    if (!entries.length) return;
    if (entries.length === 1) {
      const entry = entries[0];
      const suffix = entry.type === 'dir' ? '/' : '';
      input.value = `${parts.slice(0, -1).join(' ')} ${dirPart}${entry.name}${suffix}`.trimStart();
    } else {
      print(`<span class="term-muted">${entries.map((e) => e.name + (e.type === 'dir' ? '/' : '')).join('   ')}</span>`);
    }
  }

  function commonPrefix(values) {
    let prefix = values[0];
    for (const value of values) {
      while (!value.startsWith(prefix)) prefix = prefix.slice(0, -1);
    }
    return prefix;
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!history.length) return;
      histIndex = Math.max(0, histIndex - 1);
      input.value = history[histIndex] || '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      histIndex = Math.min(history.length, histIndex + 1);
      input.value = history[histIndex] || '';
    } else if (e.key === 'Tab') {
      e.preventDefault();
      tabComplete();
    } else if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      output.innerHTML = '';
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      print(`<span class="term-muted">^C</span>`);
      input.value = '';
    }
  });

  body.querySelector('#term-clear').addEventListener('click', () => { output.innerHTML = ''; input.focus(); });
  body.addEventListener('click', () => {
    if (!window.getSelection()?.toString()) input.focus();
  });

  const offFs = fs.onChange(() => {
    const status = body.querySelector('#term-status-sync');
    if (status) status.textContent = 'cloud sync · saved';
  });

  print('<span class="term-accent">CloudBook Terminal</span> <span class="term-muted">— zsh 5.9 · CloudBook OS 4.2</span>');
  print(`<span class="term-muted">Last login: ${new Date().toLocaleString()} on ttys000</span>`);
  print(`<span class="term-muted">Type <span class="term-accent">help</span> for commands, <span class="term-accent">neofetch</span> for system info.</span>`);
  print('');
  updatePrompt();
  setTimeout(() => input.focus(), 60);

  statusTimer = setInterval(() => {
    const status = body.querySelector('#term-status-sync');
    if (status && settings.sync) status.textContent = 'cloud sync · live';
  }, 4000);

  return () => {
    offFs();
    clearInterval(statusTimer);
  };
}
