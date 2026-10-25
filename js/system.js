const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const rand = (min, max) => min + Math.random() * (max - min);

const PROCESS_SEED = [
  { pid: 1, name: 'launchd', user: 'root', cpu: 0.3, mem: 0.04, kind: 'system' },
  { pid: 84, name: 'kernel_task', user: 'root', cpu: 2.1, mem: 0.62, kind: 'system' },
  { pid: 412, name: 'WindowServer', user: 'cloud', cpu: 4.6, mem: 1.18, kind: 'system' },
  { pid: 688, name: 'cloud-syncd', user: 'cloud', cpu: 1.2, mem: 0.34, kind: 'cloud' },
  { pid: 742, name: 'CloudDrive', user: 'cloud', cpu: 0.8, mem: 0.28, kind: 'cloud' },
  { pid: 916, name: 'Nimbus', user: 'cloud', cpu: 6.4, mem: 1.42, kind: 'app' },
  { pid: 1044, name: 'Files', user: 'cloud', cpu: 1.6, mem: 0.52, kind: 'app' },
  { pid: 1180, name: 'Terminal', user: 'cloud', cpu: 0.4, mem: 0.18, kind: 'app' },
  { pid: 1206, name: 'System Monitor', user: 'cloud', cpu: 2.2, mem: 0.41, kind: 'app' },
  { pid: 1322, name: 'NotificationCenter', user: 'cloud', cpu: 0.2, mem: 0.12, kind: 'system' },
];

class SystemMetrics {
  constructor() {
    this.started = Date.now();
    this.cpu = 12;
    this.mem = 7.3;
    this.netUp = 0.6;
    this.netDown = 3.4;
    this.gpu = 9;
    this.cpuHistory = Array.from({ length: 48 }, () => rand(8, 22));
    this.memHistory = Array.from({ length: 48 }, () => rand(6.8, 8.2));
    this.cores = Array.from({ length: 8 }, () => rand(4, 20));
    this.processes = PROCESS_SEED.map((p) => ({ ...p }));
    this.stressUntil = 0;
    this.timer = null;
    this.listeners = new Set();
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1000);
  }

  tick() {
    const stressed = Date.now() < this.stressUntil;
    const targetCpu = stressed ? rand(86, 99) : rand(7, 26);
    this.cpu = clamp(this.cpu + (targetCpu - this.cpu) * 0.35 + rand(-4, 4), 3, 100);
    const targetMem = stressed ? rand(15.4, 18.2) : rand(6.6, 8.4);
    this.mem = clamp(this.mem + (targetMem - this.mem) * 0.22 + rand(-0.12, 0.12), 3.4, 19.6);
    this.gpu = clamp(this.gpu + rand(-2.2, 2.2) + (stressed ? 12 : 0), 2, 99);
    this.netUp = clamp(this.netUp + rand(-0.35, 0.35), 0.02, stressed ? 9 : 3.4);
    this.netDown = clamp(this.netDown + rand(-1.4, 1.4), 0.2, stressed ? 28 : 18);
    this.cores = this.cores.map(() => clamp(
      this.cpu + rand(-12, 12) + (stressed ? rand(0, 8) : 0), 1, 100,
    ));
    this.cpuHistory.push(this.cpu);
    this.cpuHistory.shift();
    this.memHistory.push(this.mem);
    this.memHistory.shift();
    for (const p of this.processes) {
      if (p.kind === 'system' && p.name === 'kernel_task') {
        p.cpu = clamp(p.cpu + rand(-0.2, 0.2), 0.1, 6);
        continue;
      }
      p.cpu = clamp(p.cpu + rand(-0.9, 0.9) + (stressed && p.kind === 'app' ? rand(0, 4) : 0), 0, 60);
      p.mem = clamp(p.mem + rand(-0.02, 0.02), 0.05, 4.5);
    }
    this.listeners.forEach((fn) => {
      try { fn(this); } catch { /* ignore */ }
    });
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this);
    return () => this.listeners.delete(fn);
  }

  stress(seconds = 8) {
    this.stressUntil = Date.now() + seconds * 1000;
  }

  kill(pid) {
    const idx = this.processes.findIndex((p) => p.pid === pid);
    if (idx === -1) return false;
    if (pid < 500) return false;
    this.processes.splice(idx, 1);
    return true;
  }

  uptimeSeconds() {
    return Math.floor((Date.now() - this.started) / 1000) + 3 * 86400 + 7 * 3600 + 42 * 60;
  }
}

export const system = new SystemMetrics();

export function fmtUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${seconds % 60}s`;
}
