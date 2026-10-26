"use strict";

const S = cb.state;

function appTile(id) {
  const app = cb.APPS[id];
  return `<span class="app-icon" data-app="${id}">${cb.icon(app.icon)}</span>`;
}

function bindOpenButtons(root) {
  cb.$$("[data-open]", root).forEach((button) => {
    if (button.dataset.boundOpen) return;
    button.dataset.boundOpen = "1";
    button.addEventListener("click", () => cb.openApp(button.dataset.open));
  });
}

function mountHome(win) {
  const accent = cb.ACCENTS[S.settings.accent] || cb.ACCENTS.violet;
  const recent = [
    ["Welcome.md", "home/alex/Documents/Welcome.md", "file", "2 min ago"],
    ["aurora-site", "home/alex/Projects/aurora-site", "folder", "18 min ago"],
    ["Roadmap.md", "home/alex/Documents/Roadmap.md", "file", "1 hr ago"],
    ["team-notes.md", "cloud/shared/team-notes.md", "file", "3 hr ago"]
  ];
  win.body.innerHTML = `
    <div class="home">
      <section class="home-hero">
        <div class="hero-copy">
          <div class="eyebrow"><span class="live-dot"></span> CloudBook Pro · online</div>
          <h1>${cb.esc(cb.greeting().split(",")[0])}, <em>${cb.esc(cb.firstName())}.</em></h1>
          <p>Your entire laptop lives in the cloud. <strong>20 GB of RAM</strong>, <strong>1 TB of NVMe storage</strong>, and zero local limits — streamed to every device you own.</p>
          <div class="hero-actions">
            <button class="btn primary" data-open="terminal">${cb.icon("terminal")} Open terminal</button>
            <button class="btn ghost" data-open="chrome">${cb.icon("chrome")} Open Chrome</button>
          </div>
          <div class="hero-badges">
            <span>${cb.icon("cpu")} 8 vCPU</span>
            <span>${cb.icon("memory")} 20 GB RAM</span>
            <span>${cb.icon("hard-drive")} 1 TB NVMe</span>
            <span>${cb.icon("wifi")} 10 Gbps</span>
          </div>
        </div>
        <div class="hero-visual">
          <div class="orb">
            <span class="orb-ring r1"></span>
            <span class="orb-ring r2"></span>
            ${cb.icon("cloud")}
            <span class="orb-label">LIVE</span>
          </div>
          <div class="latency-card">
            <span>Latency</span>
            <strong>${cb.latency()} ms</strong>
            <span class="good">Excellent</span>
          </div>
        </div>
      </section>

      <section class="home-grid">
        <article class="metric-card">
          <span class="ring" data-live-ring="cpu" style="--p: 24; --ring-color: ${accent[0]}"><span>24%</span></span>
          <span class="metric-copy"><strong>CPU</strong><span>8 vCPU · AMD EPYC</span><small>2.1 GHz boost</small></span>
        </article>
        <article class="metric-card">
          <span class="ring" data-live-ring="mem" style="--p: 32; --ring-color: ${accent[1]}"><span>32%</span></span>
          <span class="metric-copy"><strong>Memory</strong><span><em data-live-mem>6.4 GB</em> of 20 GB</span><small>DDR5 · instant</small></span>
        </article>
        <article class="metric-card">
          <span class="ring" data-live-ring="disk" style="--p: 30; --ring-color: #f472b6"><span>30%</span></span>
          <span class="metric-copy"><strong>Storage</strong><span>312 GB of 1 TB</span><small>NVMe · 7.2 GB/s</small></span>
        </article>
      </section>

      <section class="home-bottom">
        <article class="panel">
          <div class="panel-head"><h3>CloudBook Pro</h3><span>${S.settings.region} · ${cb.latency()} ms</span></div>
          <div class="spec-list">
            <div class="spec-row"><span>Processor</span><strong>8 vCPU · AMD EPYC Genoa</strong></div>
            <div class="spec-row"><span>Memory</span><strong>20 GB DDR5 <em>· instant</em></strong></div>
            <div class="spec-row"><span>Storage</span><strong>1 TB NVMe <em>· encrypted</em></strong></div>
            <div class="spec-row"><span>Graphics</span><strong>NVIDIA T4 · 16 GB</strong></div>
            <div class="spec-row"><span>Network</span><strong>10 Gbps · 12 ms</strong></div>
            <div class="spec-row"><span>System</span><strong>AetherOS 2.4 LTS</strong></div>
          </div>
        </article>
        <article class="panel">
          <div class="panel-head"><h3>Pick up where you left off</h3><span>Synced</span></div>
          <div class="activity-list">
            ${recent.map(([name, path, kind, time]) => `
              <button class="activity-item" data-file="${path}">
                <span class="mini-icon">${cb.icon(kind === "folder" ? "folder" : "file")}</span>
                <div><strong>${cb.esc(name)}</strong><span>${kind === "folder" ? "Folder" : "Document"}</span></div>
                <em>${time}</em>
              </button>`).join("")}
          </div>
        </article>
      </section>
    </div>`;
  bindOpenButtons(win.body);
  cb.$$("[data-file]", win.body).forEach((button) => {
    button.addEventListener("click", () => {
      const node = cb.getNode(button.dataset.file.split("/"));
      if (node?.type === "folder") cb.openApp("files", { path: button.dataset.file.split("/") });
      else cb.openFile(button.dataset.file.split("/"));
    });
  });
  const update = () => {
    const cpu = 17 + Math.random() * 15;
    const memory = 6.1 + Math.random() * 1.2;
    const cpuRing = cb.$("[data-live-ring='cpu']", win.body);
    const memRing = cb.$("[data-live-ring='mem']", win.body);
    if (cpuRing) {
      cpuRing.style.setProperty("--p", cpu.toFixed(0));
      cb.$("span", cpuRing).textContent = `${Math.round(cpu)}%`;
    }
    if (memRing) {
      const percent = (memory / 20) * 100;
      memRing.style.setProperty("--p", percent.toFixed(0));
      cb.$("span", memRing).textContent = `${Math.round(percent)}%`;
    }
    const mem = cb.$("[data-live-mem]", win.body);
    if (mem) mem.textContent = `${memory.toFixed(1)} GB`;
  };
  update();
  const timer = setInterval(update, 2200);
  win.cleanups.push(() => clearInterval(timer));
}

function mountMonitor(win) {
  win.body.innerHTML = `
    <div class="monitor-app">
      <div class="monitor-head">
        <div><h2>System monitor</h2><p>Live telemetry from your cloud machine · ${S.settings.region}</p></div>
        <span class="monitor-live"><i></i> Streaming</span>
      </div>
      <div class="monitor-stats">
        <article class="monitor-stat"><span>${cb.icon("cpu")} CPU</span><strong data-stat="cpu">23<small>%</small></strong><div class="mini-bar"><i data-bar="cpu" style="width:23%"></i></div></article>
        <article class="monitor-stat"><span>${cb.icon("memory")} Memory</span><strong data-stat="mem">6.4<small> / 20 GB</small></strong><div class="mini-bar"><i data-bar="mem" style="width:32%"></i></div></article>
        <article class="monitor-stat"><span>${cb.icon("hard-drive")} Storage</span><strong data-stat="disk">312<small> / 1024 GB</small></strong><div class="mini-bar"><i data-bar="disk" style="width:30%"></i></div></article>
        <article class="monitor-stat"><span>${cb.icon("network")} Network</span><strong data-stat="net">4.8<small> Gbps</small></strong><div class="mini-bar"><i data-bar="net" style="width:48%"></i></div></article>
      </div>
      <section class="chart-panel">
        <div class="chart-head">
          <strong>Resource history · last 60 seconds</strong>
          <span class="chart-legend"><span><i class="cpu-dot"></i>CPU</span><span><i class="mem-dot"></i>Memory</span><span><i class="net-dot"></i>Network</span></span>
        </div>
        <canvas id="monitorChart"></canvas>
      </section>
      <section class="process-panel">
        <div class="chart-head"><strong>Active processes</strong><span class="chart-legend">${S.settings.region} · 8 vCPU</span></div>
        <div class="process-table" data-processes></div>
      </section>
    </div>`;
  const canvas = cb.$("#monitorChart", win.body);
  const context = canvas.getContext("2d");
  const history = { cpu: [], mem: [], net: [] };
  const processes = [
    ["aether-shell", 1.2], ["compositor", 2.6], ["cloud-sync", 0.8],
    ["chromium", 8.4], ["code-server", 4.1], ["aether-audio", 1.1],
    ["nvme-worker", 0.6], ["windowd", 0.9]
  ];
  const table = cb.$("[data-processes]", win.body);
  const draw = () => {
    const width = canvas.clientWidth || 600;
    const height = canvas.clientHeight || 130;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.strokeStyle = "rgba(255,255,255,.06)";
    context.lineWidth = 1;
    for (let line = 1; line <= 3; line += 1) {
      const y = (height / 4) * line;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    const stroke = (values, color, fill) => {
      if (!values.length) return;
      context.beginPath();
      values.forEach((value, index) => {
        const x = (index / Math.max(1, values.length - 1)) * width;
        const y = height - (value / 100) * (height - 8) - 4;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = color;
      context.lineWidth = 1.8;
      context.lineJoin = "round";
      context.stroke();
      if (fill) {
        context.lineTo(width, height);
        context.lineTo(0, height);
        context.closePath();
        const gradient = context.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, fill);
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = gradient;
        context.fill();
      }
    };
    stroke(history.cpu, accentColor(0), hexAlpha(accentColor(0), 0.16));
    stroke(history.mem, accentColor(1), null);
    stroke(history.net, "#f472b6", null);
  };
  const accentColor = (index) => {
    const accent = cb.ACCENTS[S.settings.accent] || cb.ACCENTS.violet;
    return accent[index];
  };
  const hexAlpha = (hex, alpha) => {
    const value = hex.replace("#", "");
    const num = parseInt(value.length === 3 ? value.split("").map((c) => c + c).join("") : value, 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
  };
  for (let i = 0; i < 48; i += 1) {
    history.cpu.push(18 + Math.random() * 12);
    history.mem.push(30 + Math.random() * 4);
    history.net.push(40 + Math.random() * 20);
  }
  const update = () => {
    const cpu = cb.clamp((history.cpu[history.cpu.length - 1] || 23) + (Math.random() - 0.5) * 14, 8, 74);
    const mem = cb.clamp(31 + (Math.random() - 0.5) * 3, 27, 38);
    const net = cb.clamp((history.net[history.net.length - 1] || 48) + (Math.random() - 0.5) * 24, 12, 88);
    history.cpu.push(cpu);
    history.mem.push(mem);
    history.net.push(net);
    Object.keys(history).forEach((key) => { if (history[key].length > 60) history[key].shift(); });
    const cpuEl = cb.$("[data-stat='cpu']", win.body);
    const memEl = cb.$("[data-stat='mem']", win.body);
    const netEl = cb.$("[data-stat='net']", win.body);
    if (cpuEl) cpuEl.innerHTML = `${Math.round(cpu)}<small>%</small>`;
    if (memEl) memEl.innerHTML = `${(mem / 5).toFixed(1)}<small> / 20 GB</small>`;
    if (netEl) netEl.innerHTML = `${(net / 10).toFixed(1)}<small> Gbps</small>`;
    cb.$$("[data-bar]", win.body).forEach((bar) => {
      const key = bar.dataset.bar;
      if (key === "cpu") bar.style.width = `${cpu}%`;
      if (key === "mem") bar.style.width = `${mem}%`;
      if (key === "net") bar.style.width = `${net}%`;
      if (key === "disk") bar.style.width = "30%";
    });
    table.innerHTML = `<span class="pt-head">Process</span><span class="pt-head">CPU</span><span class="pt-head">Memory</span><span class="pt-head">State</span>` + processes.map(([name, base], index) => {
      const pCpu = (base + Math.random() * 2.4).toFixed(1);
      const pMem = (base * 14 + Math.random() * 40).toFixed(0);
      return `<span class="pt-name"><i style="background:${index % 2 ? accentColor(1) : accentColor(0)}"></i>${cb.esc(name)}</span><span class="pt-val">${pCpu}%</span><span class="pt-val">${pMem} MB</span><span class="pt-val">running</span>`;
    }).join("");
    draw();
  };
  update();
  const timer = setInterval(update, 1300);
  win.cleanups.push(() => clearInterval(timer));
}

function mountTerminal(win) {
  let cwd = ["home", "alex"];
  const history = [];
  let historyIndex = 0;
  win.body.innerHTML = `
    <div class="terminal-app">
      <div class="term-top">
        <div class="term-top-left"><span><strong>alex@cloudbook</strong>: ~</span><span>AetherOS 2.4 LTS</span></div>
        <span>${S.settings.region} · ${cb.latency()} ms</span>
      </div>
      <div class="term-output" data-output></div>
      <div class="term-line-input">
        <span class="term-prompt" data-prompt>alex@cloudbook:<span>~</span>$</span>
        <input data-input autocomplete="off" spellcheck="false" aria-label="Terminal command">
      </div>
      <div class="term-fill"></div>
    </div>`;
  const output = cb.$("[data-output]", win.body);
  const input = cb.$("[data-input]", win.body);
  const prompt = cb.$("[data-prompt]", win.body);
  win.body.addEventListener("click", () => input.focus());
  setTimeout(() => input.focus(), 40);
  const print = (html) => {
    const line = document.createElement("div");
    line.className = "line";
    line.innerHTML = html;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  };
  const printText = (text, cls = "") => print(cls ? `<span class="${cls}">${cb.esc(text)}</span>` : cb.esc(text));
  const promptPath = () => {
    if (cwd.join("/") === "home/alex") return "~";
    if (cwd.length === 0) return "/";
    return `/${cwd.join("/")}`;
  };
  const updatePrompt = () => {
    const short = promptPath();
    prompt.innerHTML = `alex@cloudbook:<span>${cb.esc(short)}</span>$`;
    const top = cb.$(".term-top-left span", win.body);
    if (top) top.innerHTML = `<strong>alex@cloudbook</strong>: ${cb.esc(short)}`;
  };
  const resolvePath = (raw) => {
    if (!raw) return [...cwd];
    let parts = raw.startsWith("/") ? [] : [...cwd];
    raw.split("/").filter(Boolean).forEach((part) => {
      if (part === ".") return;
      if (part === "..") { parts.pop(); return; }
      parts.push(part);
    });
    return parts;
  };
  print(`<span class="accent">AetherOS 2.4 LTS</span> <span class="dim">· cloudbook</span>`);
  print(`<span class="dim">Welcome back, ${cb.esc(cb.firstName())}. Your cloud laptop is online in ${S.settings.region}.</span>`);
  print(`<span class="dim">Type</span> <span class="green">help</span> <span class="dim">to explore, or</span> <span class="green">neofetch</span> <span class="dim">for the good stuff.</span>`);
  print("");
  const neofetch = () => {
    print(`<span class="ascii">       .-~~~~-.
      /  .--.  \\      <span class="accent">alex@cloudbook</span>
     |  (    )  |     <span class="dim">----------------------</span>
      \\  '--'  /      <span class="green">OS:</span> AetherOS 2.4 LTS
       '-....-'       <span class="green">Host:</span> CloudBook Pro
                      <span class="green">CPU:</span> 8 vCPU · AMD EPYC Genoa
                      <span class="green">Memory:</span> 6.4Gi / 20Gi
                      <span class="green">Disk:</span> 312G / 1.0T
                      <span class="green">GPU:</span> NVIDIA T4 · 16GB
                      <span class="green">Network:</span> 10 Gbps · ${cb.latency()} ms
                      <span class="green">Region:</span> ${S.settings.region}
                      <span class="green">Uptime:</span> 43 days, 12 hours</span>`);
  };
  const listDir = (parts, long = false) => {
    const node = cb.getNode(parts);
    if (!node || node.type !== "folder") {
      printText(`ls: cannot access '${parts.join("/")}': No such file or directory`, "red");
      return;
    }
    const entries = Object.entries(node.children);
    if (!entries.length) return;
    const line = entries.sort(([a, av], [b, bv]) => {
      if (av.type !== bv.type) return av.type === "folder" ? -1 : 1;
      return a.localeCompare(b);
    }).map(([name, item]) => {
      const color = item.type === "folder" ? "blue" : cb.fileType(name) === "code" ? "green" : "cmd";
      return `<span class="${color}">${cb.esc(name)}${item.type === "folder" ? "/" : ""}</span>`;
    }).join("   ");
    print(line);
    if (long) print(`<span class="dim">total ${entries.length} items · 1 TB volume · 30% used</span>`);
  };
  const openByAlias = (name) => {
    const aliases = { monitor: "monitor", files: "files", chrome: "chrome", browser: "chrome", mail: "mail", calendar: "calendar", camera: "camera", notes: "notes", editor: "editor", settings: "settings", music: "music", photos: "photos", store: "store", home: "home", terminal: "terminal" };
    const id = aliases[name];
    if (!id) {
      printText(`open: no app named '${name}'`, "red");
      return;
    }
    cb.openApp(id);
    print(`<span class="dim">Opening ${cb.APPS[id].name}…</span>`);
  };
  const run = (raw) => {
    const command = raw.trim();
    if (!command) return;
    history.push(command);
    historyIndex = history.length;
    print(`<span class="green">alex@cloudbook</span>:<span class="accent">${cb.esc(promptPath())}</span>$ <span class="cmd">${cb.esc(command)}</span>`);
    const [name, ...args] = command.split(/\s+/);
    const arg = args.join(" ");
    switch (name) {
      case "help":
        print(`<span class="accent">Available commands</span>`);
        print(`  <span class="green">help</span>              show this list
  <span class="green">neofetch</span>          system information
  <span class="green">ls</span> [path]         list files
  <span class="green">cd</span> [path]         change directory
  <span class="green">pwd</span>               print working directory
  <span class="green">cat</span> &lt;file&gt;        read a file
  <span class="green">free -h</span>           memory usage
  <span class="green">df -h</span>             storage usage
  <span class="green">uptime</span>            cloud uptime
  <span class="green">ping</span> &lt;host&gt;       network check
  <span class="green">curl</span> &lt;url&gt;        fetch cloud status
  <span class="green">open</span> &lt;app&gt;        launch an app
  <span class="green">theme</span> &lt;name&gt;      change accent
  <span class="green">mkdir</span> &lt;name&gt;      create a folder
  <span class="green">touch</span> &lt;name&gt;      create a file
  <span class="green">rm</span> &lt;name&gt;         delete a file
  <span class="green">history</span>           command history
  <span class="green">clear</span>             clear the screen
  <span class="green">lock</span> / <span class="green">reboot</span>     session control`);
        break;
      case "neofetch":
        neofetch();
        break;
      case "ls":
        listDir(resolvePath(args.find((item) => !item.startsWith("-")) || ""), args.includes("-l") || args.includes("-la"));
        break;
      case "cd": {
        const target = resolvePath(arg);
        const node = cb.getNode(target);
        if (!node || node.type !== "folder") printText(`cd: ${arg || "~"}: No such directory`, "red");
        else { cwd = target; updatePrompt(); }
        break;
      }
      case "pwd":
        printText(promptPath() === "/" ? "/" : `/${cwd.join("/")}`);
        break;
      case "cat": {
        if (!arg) { printText("cat: missing file operand", "red"); break; }
        const node = cb.getNode(resolvePath(arg));
        if (!node || node.type !== "file") printText(`cat: ${arg}: No such file`, "red");
        else print(cb.esc(node.content));
        break;
      }
      case "free":
        print(`               total        used        free      shared  buff/cache   available
Mem:            20Gi       6.4Gi       9.8Gi       0.2Gi       3.8Gi        13Gi
Swap:             0B          0B          0B`);
        break;
      case "df":
        print(`Filesystem      Size  Used Avail Use% Mounted on
/dev/nvme0n1    1.0T  312G  688G  31% /
cloud://shared  1.0T  312G  688G  31% /cloud/shared`);
        break;
      case "uname":
        print("Linux cloudbook 6.8.0-aether #1 SMP PREEMPT_DYNAMIC Wed Oct 21 09:12:44 UTC 2026 x86_64 GNU/Linux");
        break;
      case "whoami":
        print("alex");
        break;
      case "date":
        print(new Date().toString());
        break;
      case "uptime":
        print(` 09:41:22 up 43 days, 12:07,  1 user,  load average: 0.42, 0.38, 0.31`);
        break;
      case "ping": {
        const host = arg || "aether.cloud";
        print(`PING ${cb.esc(host)} (10.24.8.1) 56(84) bytes of data.`);
        [12, 11, 12, 13].forEach((ms, index) => print(`64 bytes from ${cb.esc(host)}: icmp_seq=${index + 1} ttl=64 time=${ms}.${Math.floor(Math.random() * 9)} ms`));
        print("");
        print(`--- ${cb.esc(host)} ping statistics ---`);
        print("4 packets transmitted, 4 received, 0% packet loss");
        break;
      }
      case "curl":
        if (String(arg).includes("status")) {
          print(`{"status":"operational","region":"${S.settings.region}","latency_ms":${cb.latency()},"ram_gb":20,"storage_tb":1,"uptime":"99.99%"}`);
        } else {
          printText(`curl: (6) Could not resolve host: ${arg || "(null)"}`, "red");
        }
        break;
      case "echo":
        print(cb.esc(arg));
        break;
      case "clear":
        output.innerHTML = "";
        break;
      case "open":
        openByAlias(args[0] || "");
        break;
      case "theme": {
        const value = (args[0] || "").toLowerCase();
        if (value === "dark" || value === "light") {
          S.settings.theme = value;
          cb.applySettings();
          cb.save();
          print(`<span class="dim">Theme set to ${value}.</span>`);
        } else if (cb.ACCENTS[value]) {
          S.settings.accent = value;
          cb.applySettings();
          cb.save();
          print(`<span class="dim">Accent set to ${value}.</span>`);
        } else {
          printText(`theme: unknown theme '${value}'. Try violet, cyan, emerald, rose, amber, dark, or light.`, "red");
        }
        break;
      }
      case "mkdir":
        if (!arg) printText("mkdir: missing operand", "red");
        else {
          const name = cb.createNode(cwd, arg, "folder");
          if (name) print(`<span class="dim">Created folder ${cb.esc(name)}</span>`);
        }
        break;
      case "touch":
        if (!arg) printText("touch: missing file operand", "red");
        else {
          const name = cb.createNode(cwd, arg, "file", "");
          if (name) print(`<span class="dim">Created ${cb.esc(name)}</span>`);
        }
        break;
      case "rm":
        if (!arg) printText("rm: missing operand", "red");
        else if (cb.deleteNode(cwd, arg)) print(`<span class="dim">Removed ${cb.esc(arg)}</span>`);
        else printText(`rm: cannot remove '${arg}': No such file`, "red");
        break;
      case "storage":
        print("Volume: CloudBook NVMe (1 TB)");
        print("Used:   312 GB (31%)");
        print("Free:   688 GB");
        print("Health: 100% · encrypted at rest");
        break;
      case "history":
        history.slice(0, -1).forEach((item, index) => print(`  ${String(index + 1).padStart(3)}  ${cb.esc(item)}`));
        break;
      case "sudo":
        printText("alex is not in the sudoers file. This incident has been reported to the cloud.", "red");
        break;
      case "lock":
        cb.lockScreen();
        break;
      case "reboot":
      case "restart":
        print(`<span class="dim">Broadcast message from root@cloudbook: warm reboot requested.</span>`);
        print(`<span class="dim">Restarting in 3 seconds…</span>`);
        setTimeout(() => cb.restart(), 900);
        break;
      case "shutdown":
        cb.sleepScreen();
        break;
      case "about":
        print("Aether CloudBook 2.4 · 20 GB RAM · 1 TB NVMe · 8 vCPU · NVIDIA T4");
        print(`Region ${S.settings.region} · ${cb.latency()} ms · 99.99% uptime`);
        break;
      case "cowsay":
        print(`<span class="ascii"> ______________________
< the cloud is your laptop >
 ----------------------
        \\   ^__^
         \\  (oo)\\_______
            (__)\\       )\\/\\
                ||----w |
                ||     ||</span>`);
        break;
      default:
        printText(`${name}: command not found. Type 'help' for the list.`, "red");
    }
    output.scrollTop = output.scrollHeight;
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const value = input.value;
      input.value = "";
      run(value);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (history.length) {
        historyIndex = Math.max(0, historyIndex - 1);
        input.value = history[historyIndex] || "";
      }
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = history[historyIndex] || "";
    } else if (event.key === "l" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      output.innerHTML = "";
    }
  });
  win.body.addEventListener("click", () => input.focus());
  setTimeout(() => input.focus(), 80);
  updatePrompt();
  win.cleanups.push(() => {});
}

function mountFiles(win) {
  let path = Array.isArray(win.opts.path) ? [...win.opts.path] : ["home", "alex"];
  let selected = null;
  const sidebar = [
    ["CloudBook", [], "hard-drive"],
    ["Home", ["home", "alex"], "home"],
    ["Documents", ["home", "alex", "Documents"], "file"],
    ["Projects", ["home", "alex", "Projects"], "code"],
    ["Pictures", ["home", "alex", "Pictures"], "image"],
    ["Downloads", ["home", "alex", "Downloads"], "download"],
    ["Cloud shared", ["cloud", "shared"], "cloud"]
  ];
  const render = () => {
    const node = cb.getNode(path) || cb.state.files;
    if (!node || node.type !== "folder") {
      path = ["home", "alex"];
      return render();
    }
    const entries = Object.entries(node.children).sort(([a, av], [b, bv]) => {
      if (av.type !== bv.type) return av.type === "folder" ? -1 : 1;
      return a.localeCompare(b);
    });
    const crumb = path.map((part, index) => {
      const parts = path.slice(0, index + 1);
      return `<button data-crumb="${index}">${cb.esc(part)}</button>${index < path.length - 1 ? cb.icon("chevron-right") : ""}`;
    }).join("");
    win.body.innerHTML = `
      <div class="files-app">
        <aside class="files-sidebar">
          <div class="fs-side-title">Locations</div>
          ${sidebar.map(([label, parts, iconName]) => `<button class="fs-nav ${path.join("/") === parts.join("/") ? "active" : ""}" data-nav="${parts.join("/")}">${cb.icon(iconName)}<span>${cb.esc(label)}</span></button>`).join("")}
          <div class="fs-storage">
            <span><b>CloudBook NVMe</b><b>312 GB / 1 TB</b></span>
            <div class="mini-bar"><i style="width:31%"></i></div>
            <small>688 GB available · encrypted</small>
          </div>
        </aside>
        <section class="files-main">
          <div class="files-toolbar">
            <button class="icon-btn" data-up title="Go up">${cb.icon("arrow-up")}</button>
            <button class="icon-btn" data-root title="CloudBook">${cb.icon("hard-drive")}</button>
            <div class="files-breadcrumb">${crumb}</div>
            <span class="spacer"></span>
            <button class="icon-btn" data-new-folder title="New folder">${cb.icon("folder-plus")}</button>
            <button class="icon-btn" data-new-file title="New file">${cb.icon("file-plus")}</button>
            <button class="icon-btn" data-delete title="Delete selected">${cb.icon("trash")}</button>
          </div>
          <div class="files-scroll">
            ${entries.length ? `<div class="files-grid">${entries.map(([name, item]) => `
              <button class="file-item ${selected === name ? "selected" : ""}" data-name="${cb.esc(name)}" data-type="${item.type}" ${selected === name ? "" : ""}>
                <span class="file-glyph" data-type="${item.type === "folder" ? "folder" : cb.fileType(name)}">${cb.icon(item.type === "folder" ? "folder" : cb.fileType(name) === "image" ? "image" : cb.fileType(name) === "code" ? "code" : "file")}</span>
                <strong>${cb.esc(name)}</strong>
                <span>${item.type === "folder" ? `${Object.keys(item.children || {}).length} items` : cb.fmtTimeAgo(item.modified)}</span>
              </button>`).join("")}</div>` : `<div class="files-empty">${cb.icon("folder")}<strong>This folder is empty</strong><span>Create a file or folder to get started.</span></div>`}
          </div>
          <div class="files-status"><span>${entries.length} items · ${path.length ? `/${path.join("/")}` : "/"}</span><span>${selected ? `Selected: ${cb.esc(selected)}` : "1 TB cloud volume"}</span></div>
        </section>
      </div>`;
    bind();
  };
  const bind = () => {
    cb.$$("[data-nav]", win.body).forEach((button) => {
      button.addEventListener("click", () => {
        path = button.dataset.nav ? button.dataset.nav.split("/") : [];
        selected = null;
        render();
      });
    });
    cb.$$("[data-crumb]", win.body).forEach((button) => {
      button.addEventListener("click", () => {
        path = path.slice(0, Number(button.dataset.crumb) + 1);
        selected = null;
        render();
      });
    });
    cb.$("[data-up]", win.body)?.addEventListener("click", () => {
      if (path.length) path = path.slice(0, -1);
      selected = null;
      render();
    });
    cb.$("[data-root]", win.body)?.addEventListener("click", () => {
      path = [];
      selected = null;
      render();
    });
    cb.$("[data-new-folder]", win.body)?.addEventListener("click", async () => {
      const name = await cb.promptModal("New folder", "Name this folder. It will live in your 1 TB cloud volume.", "Untitled folder", "Folder name", "Create");
      if (!name) return;
      const made = cb.createNode(path, name, "folder");
      if (made) cb.toast("Folder created", `${made} is ready in the cloud.`, "success");
      render();
    });
    cb.$("[data-new-file]", win.body)?.addEventListener("click", async () => {
      const name = await cb.promptModal("New file", "Create a document in this folder.", "untitled.md", "File name", "Create");
      if (!name) return;
      const made = cb.createNode(path, name, "file", "");
      if (made) cb.toast("File created", `${made} is synced.`, "success");
      render();
    });
    cb.$("[data-delete]", win.body)?.addEventListener("click", async () => {
      if (!selected) {
        cb.toast("Nothing selected", "Choose a file or folder first.");
        return;
      }
      const yes = await cb.confirmModal("Delete item?", `${selected} will be removed from your cloud volume.`, "Delete", true);
      if (!yes) return;
      cb.deleteNode(path, selected);
      selected = null;
      render();
    });
    cb.$$(".file-item", win.body).forEach((button) => {
      const name = button.dataset.name;
      button.addEventListener("click", () => {
        selected = name;
        cb.$$(".file-item", win.body).forEach((item) => item.classList.toggle("selected", item === button));
        const status = cb.$(".files-status span:last-child", win.body);
        if (status) status.textContent = `Selected: ${name}`;
        if (cb.isMobile()) openItem(name);
      });
      button.addEventListener("dblclick", () => openItem(name));
    });
  };
  const openItem = (name) => {
    const target = cb.getNode([...path, name]);
    if (!target) return;
    if (target.type === "folder") {
      path = [...path, name];
      selected = null;
      render();
      return;
    }
    const windowEl = win.el;
    cb.openFile([...path, name]);
    if (windowEl) windowEl.classList.remove("minimized");
  };
  win.filesNavigate = (next) => {
    path = Array.isArray(next) ? [...next] : ["home", "alex"];
    selected = null;
    render();
  };
  render();
}

function mountBrowser(win) {
  let current = win.opts.url || "aether://start";
  const renderChrome = () => {
    win.body.innerHTML = `
      <div class="browser-app">
        <div class="browser-chrome">
          <div class="browser-tabbar">
            <div class="browser-tab active">${cb.icon("globe")}<span data-tab-title>New tab</span></div>
            <button class="browser-newtab" data-start title="New tab">${cb.icon("plus")}</button>
          </div>
          <div class="browser-bar">
            <button class="browser-nav-btn" data-back title="Back">${cb.icon("chevron-left")}</button>
            <button class="browser-nav-btn" data-forward title="Forward">${cb.icon("chevron-right")}</button>
            <button class="browser-nav-btn" data-reload title="Reload">${cb.icon("refresh")}</button>
            <div class="browser-address">${cb.icon("lock")}<input data-address spellcheck="false" aria-label="Address bar"></div>
            <button class="browser-nav-btn" data-go title="Go">${cb.icon("arrow-up")}</button>
          </div>
        </div>
        <div class="browser-view" data-view></div>
      </div>`;
    bindChrome();
    go(current);
  };
  let historyStack = [];
  let historyIndex = -1;
  const go = (url, push = true) => {
    current = url || "aether://start";
    if (push) {
      historyStack = historyStack.slice(0, historyIndex + 1);
      historyStack.push(current);
      historyIndex = historyStack.length - 1;
    }
    const address = cb.$("[data-address]", win.body);
    if (address) address.value = current === "aether://start" ? "" : current;
    const view = cb.$("[data-view]", win.body);
    const tabTitle = cb.$("[data-tab-title]", win.body);
    if (!view) return;
    if (current.startsWith("aether://search")) {
      const query = new URLSearchParams(current.split("?")[1] || "").get("q") || "";
      if (tabTitle) tabTitle.textContent = query || "Search";
      renderResults(view, query);
    } else if (current === "aether://status") {
      if (tabTitle) tabTitle.textContent = "Cloud status";
      renderStatus(view);
    } else if (current === "aether://docs") {
      if (tabTitle) tabTitle.textContent = "Aether Docs";
      renderDocs(view);
    } else if (current === "aether://about") {
      if (tabTitle) tabTitle.textContent = "About CloudNet";
      renderAbout(view);
    } else if (current === "aether://news") {
      if (tabTitle) tabTitle.textContent = "CloudNet News";
      renderNews(view);
    } else if (current.startsWith("aether://")) {
      if (tabTitle) tabTitle.textContent = "CloudNet";
      renderStart(view);
    } else {
      if (tabTitle) tabTitle.textContent = current.replace(/^https?:\/\//, "").slice(0, 28);
      renderExternal(view, current);
    }
  };
  const bindChrome = () => {
    cb.$("[data-start]", win.body)?.addEventListener("click", () => go("aether://start"));
    cb.$("[data-back]", win.body)?.addEventListener("click", () => {
      if (historyIndex > 0) {
        historyIndex -= 1;
        go(historyStack[historyIndex], false);
      }
    });
    cb.$("[data-forward]", win.body)?.addEventListener("click", () => {
      if (historyIndex < historyStack.length - 1) {
        historyIndex += 1;
        go(historyStack[historyIndex], false);
      }
    });
    cb.$("[data-reload]", win.body)?.addEventListener("click", () => go(current, false));
    cb.$("[data-go]", win.body)?.addEventListener("click", submitAddress);
    cb.$("[data-address]", win.body)?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submitAddress();
    });
  };
  const submitAddress = () => {
    const input = cb.$("[data-address]", win.body);
    if (!input) return;
    const value = input.value.trim();
    if (!value) return go("aether://start");
    if (value.startsWith("aether://") || /^https?:\/\//.test(value)) go(value);
    else if (value.includes(".") && !value.includes(" ")) go(`https://${value}`);
    else go(`aether://search?q=${encodeURIComponent(value)}`);
  };
  const bindView = () => {
    cb.$$("[data-url]", win.body).forEach((button) => {
      button.addEventListener("click", () => go(button.dataset.url));
    });
    cb.$$("[data-external]", win.body).forEach((button) => {
      button.addEventListener("click", () => window.open(button.dataset.external, "_blank", "noopener"));
    });
    cb.$("[data-web-search]", win.body)?.addEventListener("click", () => {
      const query = cb.$("[data-web-search]", win.body).dataset.webSearch;
      window.open(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, "_blank", "noopener");
    });
    cb.$$("[data-search-form]", win.body).forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const input = cb.$("input", form);
        const value = input.value.trim();
        if (!value) return;
        if (value.startsWith("aether://") || /^https?:\/\//.test(value)) go(value);
        else if (value.includes(".") && !value.includes(" ")) go(`https://${value}`);
        else go(`aether://search?q=${encodeURIComponent(value)}`);
      });
    });
  };
  const startMarkup = () => `
    <div class="browser-start">
      <div class="browser-logo"><span>${cb.icon("cloud")}</span>CloudNet</div>
      <form class="browser-search" data-search-form>
        ${cb.icon("search")}
        <input placeholder="Search the cloud or type a URL" aria-label="Search the web">
        <kbd>↵</kbd>
      </form>
      <div class="browser-shortcuts">
        <button class="browser-shortcut" data-url="aether://status"><span class="s-icon">${cb.icon("shield")}</span><span>Status</span></button>
        <button class="browser-shortcut" data-url="aether://docs"><span class="s-icon">${cb.icon("file")}</span><span>Docs</span></button>
        <button class="browser-shortcut" data-url="aether://news"><span class="s-icon">${cb.icon("activity")}</span><span>News</span></button>
        <button class="browser-shortcut" data-external="https://duckduckgo.com"><span class="s-icon">${cb.icon("globe")}</span><span>Web</span></button>
        <button class="browser-shortcut" data-url="aether://about"><span class="s-icon">${cb.icon("info")}</span><span>About</span></button>
      </div>
      <div class="browser-cards">
        <article class="browser-card"><strong>${cb.icon("cloud-check")} CloudBook online</strong><p>${S.settings.region} · ${cb.latency()} ms · 99.99% uptime across the last 30 days.</p></article>
        <article class="browser-card"><strong>${cb.icon("hard-drive")} 1 TB available</strong><p>312 GB used. Every file is encrypted and synced across your devices.</p></article>
        <article class="browser-card"><strong>${cb.icon("zap")} 8 vCPU ready</strong><p>Your machine is warm and waiting. Open an app to wake the session.</p></article>
      </div>
      <p style="margin:22px 0 0;font-size:9px;color:#8b93ad">CloudNet is a private browser inside Aether CloudBook. External links open in a new tab.</p>
    </div>`;
  const renderStart = (view) => {
    view.innerHTML = startMarkup();
    bindView();
  };
  const renderResults = (view, query) => {
    const safe = cb.esc(query);
    view.innerHTML = `
      <div class="browser-results">
        <p style="font-size:10px;color:#7b84a3;margin:0 0 10px">Results for “${safe}” · CloudNet index</p>
        <article class="browser-result">
          <span class="res-url">aether://docs/${encodeURIComponent(query.toLowerCase().replace(/\s+/g, "-"))}</span>
          <h3><button data-url="aether://docs">${safe} — Aether CloudBook documentation</button></h3>
          <p>Everything you need to know about your cloud laptop, from storage to sessions, in the official Aether documentation.</p>
        </article>
        <article class="browser-result">
          <span class="res-url">aether://status</span>
          <h3><button data-url="aether://status">Live status · ${S.settings.region}</button></h3>
          <p>Current latency is ${cb.latency()} ms. All systems are operational. Your data is replicated across three availability zones.</p>
        </article>
        <article class="browser-result">
          <span class="res-url">aether://news</span>
          <h3><button data-url="aether://news">Aether CloudBook 2.4 is here</button></h3>
          <p>The 20 GB memory tier, 1 TB NVMe storage, and the new control centre are rolling out to everyone this week.</p>
        </article>
        <article class="browser-result">
          <span class="res-url">duckduckgo.com</span>
          <h3><button data-external="https://duckduckgo.com/?q=${encodeURIComponent(query)}">Search “${safe}” on the real web</button></h3>
          <p>CloudNet keeps the private index local. For the wider internet, continue to DuckDuckGo in a new browser tab.</p>
        </article>
        <div style="display:flex;gap:8px;margin-top:14px">
          <button class="btn sm ghost" data-web-search="${safe}">Open DuckDuckGo</button>
          <button class="btn sm ghost" data-url="aether://start">Back to start</button>
        </div>
      </div>`;
    bindView();
  };
  const renderStatus = (view) => {
    view.innerHTML = `
      <div class="browser-page">
        <span class="page-kicker">All systems operational</span>
        <h1>Cloud status</h1>
        <p>Live health for every Aether CloudBook region. Last updated just now.</p>
        <h2>Your machine</h2>
        <p><strong>CloudBook Pro</strong> — ${S.settings.region} · ${cb.latency()} ms · 8 vCPU · 20 GB RAM · 1 TB NVMe · NVIDIA T4. Running AetherOS 2.4 LTS with 99.99% uptime.</p>
        <h2>Regions</h2>
        <p>${Object.entries(cb.REGIONS).map(([name, ms]) => `<strong>${name}</strong> — operational · ${ms} ms`).join("<br>")}</p>
        <h2>Storage</h2>
        <p>312 GB of 1 TB used. 688 GB free. Encrypted at rest with AES-256 and replicated across three zones.</p>
        <div style="margin-top:18px"><button class="btn sm ghost" data-url="aether://start">Back to CloudNet</button></div>
      </div>`;
    bindView();
  };
  const renderDocs = (view) => {
    view.innerHTML = `
      <div class="browser-page">
        <span class="page-kicker">Documentation</span>
        <h1>Meet your cloud laptop</h1>
        <p>CloudBook is a complete computer that runs in Aether's cloud. You stream the desktop; the hardware never leaves the data centre.</p>
        <h2>20 GB of instant memory</h2>
        <p>Enough room for dozens of tabs, a full design suite, and a local development environment at the same time. Memory is never swapped to disk.</p>
        <h2>1 TB of NVMe storage</h2>
        <p>Every file lives on enterprise NVMe and is encrypted at rest. Your work syncs to all signed-in devices instantly.</p>
        <h2>Always warm</h2>
        <p>Close the lid. Move to your phone. Open a window. The same session is already running, exactly where you left it.</p>
        <h2>Keyboard shortcuts</h2>
        <p>Command + K opens the launcher. Escape closes menus. Command + S saves in the editor.</p>
        <div style="margin-top:18px"><button class="btn sm ghost" data-url="aether://start">Back to CloudNet</button></div>
      </div>`;
    bindView();
  };
  const renderNews = (view) => {
    view.innerHTML = `
      <div class="browser-page">
        <span class="page-kicker">Product news</span>
        <h1>CloudBook 2.4 is here</h1>
        <p>Today we are shipping the biggest CloudBook update of the year.</p>
        <h2>A 20 GB memory tier</h2>
        <p>More headroom for editors, browsers, and builds. Memory is dedicated and always available.</p>
        <h2>1 TB NVMe standard</h2>
        <p>Every CloudBook now includes a full terabyte of encrypted NVMe storage. No add-ons, no egress fees.</p>
        <h2>The new control centre</h2>
        <p>Cloud sync, focus, display, sound, and a calendar — all one click from the menu bar.</p>
        <div style="margin-top:18px"><button class="btn sm ghost" data-url="aether://start">Back to CloudNet</button></div>
      </div>`;
    bindView();
  };
  const renderAbout = (view) => {
    view.innerHTML = `
      <div class="browser-page">
        <span class="page-kicker">About</span>
        <h1>CloudNet</h1>
        <p>A private, fast browser that lives inside your cloud laptop. CloudNet pages are part of AetherOS; external links open in a normal browser tab.</p>
        <h2>Privacy</h2>
        <p>No third-party trackers, no telemetry from cloud pages, and no history leaves this session.</p>
        <h2>Version</h2>
        <p>CloudNet 3.1 · Chromium engine · updated with AetherOS 2.4 LTS.</p>
        <div style="margin-top:18px"><button class="btn sm ghost" data-url="aether://start">Back to CloudNet</button></div>
      </div>`;
    bindView();
  };
  const renderExternal = (view, url) => {
    view.innerHTML = `
      <div class="browser-page">
        <span class="page-kicker">External destination</span>
        <h1>Leaving CloudNet</h1>
        <p>You asked to visit <strong>${cb.esc(url)}</strong>. External sites open in a new browser tab so your CloudBook session stays right where it is.</p>
        <div style="display:flex;gap:8px;margin-top:18px">
          <button class="btn primary" data-external="${cb.esc(url)}">${cb.icon("external")} Open site</button>
          <button class="btn ghost" data-url="aether://start">Back</button>
        </div>
      </div>`;
    bindView();
  };
  win.browserGo = (url) => { if (url) go(url); };
  renderChrome();
}

function mountNotes(win) {
  let selectedId = win.opts.noteId || S.notes[0]?.id || null;
  const ensureSelected = () => {
    if (!S.notes.find((note) => note.id === selectedId)) selectedId = S.notes[0]?.id || null;
  };
  const addNote = () => {
    const note = { id: `note-${cb.uid()}`, title: "Untitled note", body: "", updated: new Date().toISOString() };
    S.notes.unshift(note);
    selectedId = note.id;
    cb.save();
    render();
    setTimeout(() => {
      const input = cb.$(".notes-editor-head input", win.body);
      input?.focus();
      input?.select();
    }, 30);
  };
  const render = () => {
    ensureSelected();
    const note = S.notes.find((item) => item.id === selectedId);
    win.body.innerHTML = `
      <div class="notes-app">
        <aside class="notes-sidebar">
          <div class="notes-side-head">
            <strong>${S.notes.length} note${S.notes.length === 1 ? "" : "s"}</strong>
            <button class="icon-btn" data-add title="New note">${cb.icon("plus")}</button>
          </div>
          <div class="notes-list">
            ${S.notes.map((item) => `
              <button class="note-row ${item.id === selectedId ? "active" : ""}" data-note="${item.id}">
                <strong>${cb.esc(item.title || "Untitled note")}</strong>
                <span>${cb.esc((item.body || "").replace(/\s+/g, " ").slice(0, 44) || "No additional text")}</span>
              </button>`).join("")}
          </div>
        </aside>
        <section class="notes-editor">
          ${note ? `
            <div class="notes-editor-head">
              <input data-title value="${cb.esc(note.title)}" placeholder="Note title" aria-label="Note title">
              <button class="icon-btn" data-delete title="Delete note">${cb.icon("trash")}</button>
            </div>
            <textarea data-body placeholder="Start writing…" spellcheck="true">${cb.esc(note.body)}</textarea>
            <div class="notes-status"><span data-count>${note.body.length} characters</span><span data-updated>Synced · just now</span></div>
          ` : `<div class="files-empty">${cb.icon("file")}<strong>No notes yet</strong><span>Create your first cloud note.</span><button class="btn primary sm" data-add>New note</button></div>`}
        </section>
      </div>`;
    bind(note);
  };
  const bind = (note) => {
    cb.$$("[data-note]", win.body).forEach((button) => {
      button.addEventListener("click", () => {
        selectedId = button.dataset.note;
        render();
      });
    });
    cb.$$("[data-add]", win.body).forEach((button) => button.addEventListener("click", addNote));
    if (!note) return;
    const title = cb.$("[data-title]", win.body);
    const body = cb.$("[data-body]", win.body);
    const count = cb.$("[data-count]", win.body);
    const updated = cb.$("[data-updated]", win.body);
    const commit = () => {
      note.title = title.value.trim() || "Untitled note";
      note.body = body.value;
      note.updated = new Date().toISOString();
      cb.save();
      if (count) count.textContent = `${body.value.length} characters`;
      if (updated) updated.textContent = "Synced · just now";
      const row = cb.$(`[data-note="${note.id}"]`, win.body);
      if (row) {
        cb.$("strong", row).textContent = note.title;
        cb.$("span", row).textContent = note.body.replace(/\s+/g, " ").slice(0, 44) || "No additional text";
      }
    };
    title?.addEventListener("input", commit);
    body?.addEventListener("input", commit);
    cb.$("[data-delete]", win.body)?.addEventListener("click", async () => {
      const yes = await cb.confirmModal("Delete note?", "This note will be removed from your cloud notebook.", "Delete note", true);
      if (!yes) return;
      S.notes = S.notes.filter((item) => item.id !== note.id);
      selectedId = S.notes[0]?.id || null;
      cb.save();
      render();
      cb.toast("Note deleted", "Your change is synced.", "success");
    });
  };
  win.notesNew = () => addNote();
  win.notesSelect = (id) => { if (id) { selectedId = id; render(); } };
  render();
}

function mountEditor(win) {
  let filePath = Array.isArray(win.opts.path) ? [...win.opts.path] : null;
  let dirty = false;
  let content = "";
  const load = () => {
    if (filePath) {
      const node = cb.getNode(filePath);
      if (node && node.type === "file") content = node.content;
    }
    win.body.innerHTML = `
      <div class="editor-app">
        <div class="editor-bar">
          <span class="editor-file">${cb.icon(filePath ? "code" : "file")}<strong data-filename>${cb.esc(filePath ? filePath[filePath.length - 1] : "untitled.md")}</strong><span data-filepath>${cb.esc(filePath ? `/${filePath.join("/")}` : "Not saved yet")}</span></span>
          <span class="spacer"></span>
          <button class="btn sm ghost" data-save>${cb.icon("save")} Save</button>
          <button class="btn sm ghost" data-download>${cb.icon("download")} Download</button>
        </div>
        <div class="editor-main">
          <div class="editor-gutter" data-gutter>1</div>
          <textarea class="editor-text" data-text spellcheck="false">${cb.esc(content)}</textarea>
        </div>
        <div class="editor-status"><span data-stats>${content.split("\n").length} lines · ${content.length} characters</span><span class="saved" data-state>${filePath ? cb.icon("cloud-check") + " Saved to cloud" : cb.icon("info") + " New file"}</span></div>
      </div>`;
    bind();
    updateGutter();
  };
  const updateGutter = () => {
    const text = cb.$("[data-text]", win.body);
    const gutter = cb.$("[data-gutter]", win.body);
    const stats = cb.$("[data-stats]", win.body);
    if (!text || !gutter) return;
    const lines = text.value.split("\n").length;
    gutter.textContent = Array.from({ length: lines }, (_, index) => index + 1).join("\n");
    if (stats) stats.textContent = `${lines} lines · ${text.value.length} characters`;
  };
  const markDirty = () => {
    dirty = true;
    const stateEl = cb.$("[data-state]", win.body);
    if (stateEl) {
      stateEl.innerHTML = `${cb.icon("edit")} Unsaved changes`;
      stateEl.style.color = "#fbbf24";
    }
  };
  const markSaved = () => {
    dirty = false;
    const stateEl = cb.$("[data-state]", win.body);
    if (stateEl) {
      stateEl.innerHTML = `${cb.icon("cloud-check")} Saved to cloud`;
      stateEl.style.color = "";
    }
  };
  const save = async () => {
    const text = cb.$("[data-text]", win.body);
    if (!text) return;
    if (filePath) {
      cb.writeNode(filePath, text.value);
      markSaved();
      cb.toast("Saved", `${filePath[filePath.length - 1]} is synced to the cloud.`, "success");
      return;
    }
    const name = await cb.promptModal("Save file", "Choose a name for this document. It will be saved in Documents.", "untitled.md", "File name", "Save to cloud");
    if (!name) return;
    const made = cb.createNode(["home", "alex", "Documents"], name, "file", text.value);
    if (!made) return;
    filePath = ["home", "alex", "Documents", made];
    const nameEl = cb.$("[data-filename]", win.body);
    const pathEl = cb.$("[data-filepath]", win.body);
    if (nameEl) nameEl.textContent = made;
    if (pathEl) pathEl.textContent = `/${filePath.join("/")}`;
    markSaved();
    cb.toast("Saved to cloud", `${made} is in Documents.`, "success");
  };
  const download = () => {
    const text = cb.$("[data-text]", win.body);
    const name = filePath ? filePath[filePath.length - 1] : "untitled.md";
    const blob = new Blob([text.value], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const bind = () => {
    const text = cb.$("[data-text]", win.body);
    const gutter = cb.$("[data-gutter]", win.body);
    text.addEventListener("input", () => {
      updateGutter();
      markDirty();
    });
    text.addEventListener("scroll", () => {
      gutter.scrollTop = text.scrollTop;
    });
    text.addEventListener("keydown", (event) => {
      if (event.key === "Tab") {
        event.preventDefault();
        const start = text.selectionStart;
        text.value = `${text.value.slice(0, start)}  ${text.value.slice(text.selectionEnd)}`;
        text.selectionStart = text.selectionEnd = start + 2;
        updateGutter();
        markDirty();
      }
      if (event.key === "s" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        save();
      }
    });
    cb.$("[data-save]", win.body)?.addEventListener("click", save);
    cb.$("[data-download]", win.body)?.addEventListener("click", download);
  };
  win.editorLoad = (path) => {
    filePath = Array.isArray(path) ? [...path] : null;
    content = "";
    dirty = false;
    load();
  };
  win.editorSave = save;
  load();
}

function mountCalculator(win) {
  let expression = "";
  let result = "0";
  const keys = [
    ["AC", "fn"], ["±", "fn"], ["%", "fn"], ["÷", "op"],
    ["7", ""], ["8", ""], ["9", ""], ["×", "op"],
    ["4", ""], ["5", ""], ["6", ""], ["−", "op"],
    ["1", ""], ["2", ""], ["3", ""], ["+", "op"],
    ["0", "zero"], [".", ""], ["=", "equals"]
  ];
  const render = () => {
    win.body.innerHTML = `
      <div class="calc-app">
        <div class="calc-display">
          <span class="calc-expr" data-expr>${cb.esc(expression || "")}</span>
          <strong class="calc-result" data-result">${cb.esc(result)}</strong>
        </div>
        <div class="calc-grid">
          ${keys.map(([label, cls]) => `<button class="calc-key ${cls}" data-key="${cb.esc(label)}">${cb.esc(label)}</button>`).join("")}
        </div>
      </div>`;
    cb.$$("[data-key]", win.body).forEach((button) => {
      button.addEventListener("click", () => press(button.dataset.key));
    });
  };
  const evaluate = (value) => {
    const cleaned = value.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/%/g, "/100");
    if (!/^[0-9+\-*/.() ]+$/.test(cleaned)) return "Error";
    try {
      const output = Function(`"use strict";return (${cleaned})`)();
      if (!Number.isFinite(output)) return "Error";
      return String(Math.round(output * 1e10) / 1e10);
    } catch (error) {
      return "Error";
    }
  };
  const press = (key) => {
    if (key === "AC") {
      expression = "";
      result = "0";
    } else if (key === "±") {
      if (expression && /^-?[\d.]+$/.test(expression)) expression = expression.startsWith("-") ? expression.slice(1) : `-${expression}`;
      result = expression || "0";
    } else if (key === "=") {
      result = evaluate(expression || "0");
      expression = result === "Error" ? expression : result;
    } else if (["÷", "×", "−", "+"].includes(key)) {
      if (!expression) expression = "0";
      if (/[+\-×÷−*/]$/.test(expression)) expression = expression.slice(0, -1);
      expression += key;
    } else if (key === "%") {
      result = evaluate(expression || "0");
      if (result !== "Error") {
        expression = String(Number(result) / 100);
        result = expression;
      }
    } else {
      if (/[=]/.test(expression)) expression = "";
      expression += key;
      const preview = evaluate(expression);
      if (preview !== "Error") result = preview;
    }
    cb.$("[data-expr]", win.body).textContent = expression;
    cb.$("[data-result]", win.body).textContent = result;
  };
  const onKey = (event) => {
    if (!win.el.classList.contains("focused")) return;
    if (/^[0-9.]$/.test(event.key)) press(event.key);
    else if (event.key === "+") press("+");
    else if (event.key === "-") press("−");
    else if (event.key === "*") press("×");
    else if (event.key === "/") press("÷");
    else if (event.key === "%") press("%");
    else if (event.key === "Enter" || event.key === "=") press("=");
    else if (event.key === "Escape" || event.key.toLowerCase() === "c") press("AC");
    else if (event.key === "Backspace") {
      expression = expression.slice(0, -1);
      const preview = evaluate(expression || "0");
      if (preview !== "Error") result = preview;
      cb.$("[data-expr]", win.body).textContent = expression;
      cb.$("[data-result]", win.body).textContent = expression ? result : "0";
    } else return;
    event.preventDefault();
  };
  render();
  document.addEventListener("keydown", onKey);
  win.cleanups.push(() => document.removeEventListener("keydown", onKey));
}
