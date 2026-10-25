import { fs, QUOTA_BYTES, fmtBytes } from '../fs.js';
import { system } from '../system.js';
import { icon } from '../icons.js';
import { toast, escapeHtml } from '../ui.js';

function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const context = canvas.getContext('2d');
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { context, width: rect.width, height: rect.height };
}

function drawChart(canvas, data, { max, color }) {
  const fit = fitCanvas(canvas);
  if (!fit) return;
  const { context, width, height } = fit;
  context.clearRect(0, 0, width, height);
  context.strokeStyle = 'rgba(255,255,255,0.07)';
  context.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = (height / 4) * i;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  if (!data.length) return;
  const step = width / Math.max(1, data.length - 1);
  const points = data.map((value, i) => ({
    x: i * step,
    y: height - (Math.min(max, Math.max(0, value)) / max) * (height - 6) - 3,
  }));
  context.beginPath();
  context.moveTo(0, height);
  points.forEach((p) => context.lineTo(p.x, p.y));
  context.lineTo(width, height);
  context.closePath();
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, `${color}66`);
  gradient.addColorStop(1, `${color}00`);
  context.fillStyle = gradient;
  context.fill();

  context.beginPath();
  points.forEach((p, i) => {
    if (i === 0) context.moveTo(p.x, p.y);
    else context.lineTo(p.x, p.y);
  });
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.stroke();

  const last = points[points.length - 1];
  context.beginPath();
  context.arc(last.x - 1, last.y, 3, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
}

export function mount(body, ctx) {
  body.innerHTML = `
    <div class="monitor-app">
      <div class="monitor-head">
        <div>
          <h2>System Monitor</h2>
          <p>CloudBook Pro · 8 vCPU · 20 GB unified memory</p>
        </div>
        <div class="monitor-actions">
          <span class="live-pill"><span class="live-dot"></span> Live</span>
          <button class="btn btn-soft btn-sm" id="monitor-stress">${icon('rocket', 14)} Stress test</button>
        </div>
      </div>

      <div class="stat-grid">
        <article class="stat-card">
          <div class="stat-head"><span>${icon('cpu', 15)} CPU</span><strong id="stat-cpu">—</strong></div>
          <div class="mini-meter"><span id="bar-cpu"></span></div>
          <small>8 cores · 3.8 GHz boost</small>
        </article>
        <article class="stat-card">
          <div class="stat-head"><span>${icon('memory', 15)} Memory</span><strong id="stat-mem">—</strong></div>
          <div class="mini-meter"><span id="bar-mem"></span></div>
          <small>of 20 GB unified</small>
        </article>
        <article class="stat-card">
          <div class="stat-head"><span>${icon('disk', 15)} Disk</span><strong id="stat-disk">—</strong></div>
          <div class="mini-meter"><span id="bar-disk"></span></div>
          <small>of 1 TB NVMe</small>
        </article>
        <article class="stat-card">
          <div class="stat-head"><span>${icon('network', 15)} Network</span><strong id="stat-net">—</strong></div>
          <div class="mini-meter"><span id="bar-net"></span></div>
          <small id="stat-net-note">—</small>
        </article>
      </div>

      <div class="monitor-charts">
        <article class="chart-card">
          <header>
            <h3>CPU history</h3>
            <span id="chart-cpu-val">—</span>
          </header>
          <canvas id="chart-cpu" aria-label="CPU usage history"></canvas>
          <div class="core-bars" id="core-bars"></div>
        </article>
        <article class="chart-card">
          <header>
            <h3>Memory history</h3>
            <span id="chart-mem-val">—</span>
          </header>
          <canvas id="chart-mem" aria-label="Memory usage history"></canvas>
          <div class="chart-note">
            <span><i class="swatch violet"></i> Used</span>
            <span id="mem-note">—</span>
          </div>
        </article>
      </div>

      <article class="process-card">
        <header>
          <h3>Processes</h3>
          <span id="process-count">—</span>
        </header>
        <div class="process-table">
          <div class="process-row process-head">
            <span>Process</span><span>PID</span><span>User</span><span>CPU</span><span>Memory</span><span></span>
          </div>
          <div id="process-rows"></div>
        </div>
      </article>
    </div>`;

  const cpuCanvas = body.querySelector('#chart-cpu');
  const memCanvas = body.querySelector('#chart-mem');
  const coreBars = body.querySelector('#core-bars');
  const processRows = body.querySelector('#process-rows');
  const stressBtn = body.querySelector('#monitor-stress');
  let stressTimer = null;

  function renderProcesses() {
    const procs = [...system.processes].sort((a, b) => b.cpu - a.cpu);
    body.querySelector('#process-count').textContent = `${procs.length} running`;
    processRows.innerHTML = procs.map((p) => `
      <div class="process-row">
        <span class="process-name"><span class="process-dot ${p.kind}"></span>${escapeHtml(p.name)}</span>
        <span class="process-mono">${p.pid}</span>
        <span class="process-mono">${p.user}</span>
        <span class="process-cpu">${p.cpu.toFixed(1)}%</span>
        <span class="process-mem">${p.mem.toFixed(2)} GB</span>
        <button class="icon-btn tiny" data-kill="${p.pid}" title="End process" aria-label="End ${escapeHtml(p.name)}">${icon('x', 12)}</button>
      </div>`).join('');
  }

  function update() {
    const used = fs.usedBytes();
    body.querySelector('#stat-cpu').textContent = `${system.cpu.toFixed(0)}%`;
    body.querySelector('#stat-mem').textContent = `${system.mem.toFixed(1)} GB`;
    body.querySelector('#stat-disk').textContent = fmtBytes(used, 0);
    body.querySelector('#stat-net').textContent = `${system.netDown.toFixed(1)} MB/s`;
    body.querySelector('#bar-cpu').style.width = `${system.cpu}%`;
    body.querySelector('#bar-mem').style.width = `${(system.mem / 20) * 100}%`;
    body.querySelector('#bar-disk').style.width = `${Math.max(1.4, (used / QUOTA_BYTES) * 100)}%`;
    body.querySelector('#bar-net').style.width = `${Math.min(100, (system.netDown / 30) * 100)}%`;
    body.querySelector('#stat-net-note').textContent = `↑ ${system.netUp.toFixed(1)} MB/s · 12 ms edge`;

    body.querySelector('#chart-cpu-val').textContent = `${system.cpu.toFixed(1)}%`;
    body.querySelector('#chart-mem-val').textContent = `${system.mem.toFixed(1)} / 20 GB`;
    body.querySelector('#mem-note').textContent = `${((system.mem / 20) * 100).toFixed(0)}% in use`;

    coreBars.innerHTML = system.cores.map((value, i) => `
      <div class="core-bar" title="Core ${i + 1}: ${value.toFixed(0)}%">
        <span style="height:${Math.max(4, value)}%"></span>
        <small>${i + 1}</small>
      </div>`).join('');

    drawChart(cpuCanvas, system.cpuHistory, { max: 100, color: '#8b5cf6' });
    drawChart(memCanvas, system.memHistory, { max: 20, color: '#22d3ee' });
    renderProcesses();
  }

  const off = system.subscribe(update);
  const observer = new ResizeObserver(() => {
    drawChart(cpuCanvas, system.cpuHistory, { max: 100, color: '#8b5cf6' });
    drawChart(memCanvas, system.memHistory, { max: 20, color: '#22d3ee' });
  });
  observer.observe(cpuCanvas);
  observer.observe(memCanvas);

  processRows.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-kill]');
    if (!btn) return;
    const pid = Number(btn.dataset.kill);
    if (system.kill(pid)) {
      toast({ title: 'Process ended', message: `PID ${pid} terminated.`, iconName: 'x', tone: 'danger' });
      renderProcesses();
    } else {
      toast({ title: 'Protected process', message: 'This system process cannot be terminated.', iconName: 'shield', tone: 'danger' });
    }
  });

  stressBtn.addEventListener('click', () => {
    system.stress(8);
    stressBtn.classList.add('active');
    stressBtn.innerHTML = `${icon('rocket', 14)} Stressing…`;
    toast({ title: 'Stress test started', message: 'Pushing 8 vCPU and memory for 8 seconds.', iconName: 'rocket', tone: 'accent' });
    clearTimeout(stressTimer);
    stressTimer = setTimeout(() => {
      stressBtn.classList.remove('active');
      stressBtn.innerHTML = `${icon('rocket', 14)} Stress test`;
      toast({ title: 'Stress test complete', message: 'All cores returned to idle.', iconName: 'check' });
    }, 8200);
  });

  update();

  return () => {
    off();
    observer.disconnect();
    clearTimeout(stressTimer);
  };
}
