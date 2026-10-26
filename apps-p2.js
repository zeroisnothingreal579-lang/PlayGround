"use strict";

function mountMusic(win) {
  const tracks = [
    { title: "Cloudline", artist: "Aether Sound", mood: "Ambient", duration: 272, scale: [220, 261.63, 329.63, 392, 440], art: "conic-gradient(from 210deg, #4c1d95, #db2777, #f59e0b, #4c1d95)", color: "#8b5cf6" },
    { title: "Night Shift", artist: "Nova Field", mood: "Downtempo", duration: 238, scale: [196, 233.08, 293.66, 349.23, 392], art: "conic-gradient(from 120deg, #0f766e, #0891b2, #312e81, #0f766e)", color: "#22d3ee" },
    { title: "Drift", artist: "Aether Sound", mood: "Focus", duration: 306, scale: [174.61, 220, 261.63, 329.63, 349.23], art: "conic-gradient(from 300deg, #9f1239, #f97316, #7c2d12, #9f1239)", color: "#fb7185" },
    { title: "Deep Field", artist: "Lumen", mood: "Sleep", duration: 348, scale: [164.81, 196, 246.94, 293.66, 329.63], art: "conic-gradient(from 60deg, #1e3a8a, #3730a3, #0f172a, #1e3a8a)", color: "#67e8f9" }
  ];
  let trackIndex = 0;
  let playing = false;
  let elapsed = 0;
  let audio = null;
  let master = null;
  let analyser = null;
  let sequence = null;
  let progressTimer = null;
  let visualTimer = 0;
  let step = 0;
  let frequencyData = null;
  win.body.innerHTML = `
    <div class="music-app">
      <div class="music-head"><div><h2>Aether Sounds</h2><span>Lossless ambient · generated live</span></div><span data-state>Ready</span></div>
      <section class="music-now">
        <div class="album-art" data-art>${cb.icon("music")}</div>
        <div class="music-info">
          <small data-mood>Ambient</small>
          <h3 data-title>Cloudline</h3>
          <p data-artist>Aether Sound</p>
          <div class="music-visualizer" data-vis>${Array.from({ length: 16 }, () => "<i></i>").join("")}</div>
        </div>
      </section>
      <div class="music-controls">
        <button class="music-btn" data-prev title="Previous track">${cb.icon("skip-back")}</button>
        <button class="music-btn play" data-play title="Play">${cb.icon("play")}</button>
        <button class="music-btn" data-next title="Next track">${cb.icon("skip-forward")}</button>
      </div>
      <div class="music-progress"><span data-current>0:00</span><div class="track"><i data-progress></i></div><span data-duration>4:32</span></div>
      <div class="music-list">
        ${tracks.map((track, index) => `
          <button class="music-track ${index === 0 ? "active" : ""}" data-track="${index}">
            <span class="track-num">${index + 1}</span>
            <span class="track-art" style="--ta:${track.art}"></span>
            <div><strong>${cb.esc(track.title)}</strong><span>${cb.esc(track.artist)}</span></div>
            <em>${Math.floor(track.duration / 60)}:${String(track.duration % 60).padStart(2, "0")}</em>
          </button>`).join("")}
      </div>
      <div class="volume-row">${cb.icon("volume")}<input type="range" min="0" max="100" value="${S.settings.volume}" data-volume aria-label="Music volume"><span data-volume-label>${S.settings.volume}%</span></div>
    </div>`;
  const els = {
    title: cb.$("[data-title]", win.body),
    artist: cb.$("[data-artist]", win.body),
    mood: cb.$("[data-mood]", win.body),
    art: cb.$("[data-art]", win.body),
    play: cb.$("[data-play]", win.body),
    current: cb.$("[data-current]", win.body),
    duration: cb.$("[data-duration]", win.body),
    progress: cb.$("[data-progress]", win.body),
    state: cb.$("[data-state]", win.body),
    bars: cb.$$("[data-vis] i", win.body),
    volume: cb.$("[data-volume]", win.body),
    volumeLabel: cb.$("[data-volume-label]", win.body)
  };
  const fmt = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds) % 60).padStart(2, "0")}`;
  const updateTrack = () => {
    const track = tracks[trackIndex];
    els.title.textContent = track.title;
    els.artist.textContent = track.artist;
    els.mood.textContent = track.mood;
    els.duration.textContent = fmt(track.duration);
    els.art.style.background = track.art;
    cb.$$("[data-track]", win.body).forEach((row) => row.classList.toggle("active", Number(row.dataset.track) === trackIndex));
    updateProgress();
  };
  const updateProgress = () => {
    const track = tracks[trackIndex];
    const percent = Math.min(100, (elapsed / track.duration) * 100);
    els.progress.style.width = `${percent}%`;
    els.current.textContent = fmt(elapsed);
  };
  const ensureAudio = () => {
    if (audio) return true;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;
    audio = new AudioCtx();
    master = audio.createGain();
    master.gain.value = (S.settings.volume / 100) * 0.16;
    analyser = audio.createAnalyser();
    analyser.fftSize = 128;
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    const compressor = audio.createDynamicsCompressor();
    master.connect(compressor);
    compressor.connect(analyser);
    analyser.connect(audio.destination);
    window.CloudBookAudio = {
      setVolume: (value) => { if (master) master.gain.value = (value / 100) * 0.16; }
    };
    return true;
  };
  const note = () => {
    if (!playing || !audio) return;
    const track = tracks[trackIndex];
    const time = audio.currentTime;
    const frequency = track.scale[step % track.scale.length] * (step % 8 === 0 ? 0.5 : 1);
    const osc = audio.createOscillator();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    osc.type = step % 3 === 0 ? "triangle" : "sine";
    osc.frequency.value = frequency;
    filter.type = "lowpass";
    filter.frequency.value = 900 + Math.sin(step / 3) * 500;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.16, time + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 3.2);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(time);
    osc.stop(time + 3.4);
    if (step % 4 === 0) {
      const bass = audio.createOscillator();
      const bassGain = audio.createGain();
      bass.type = "sine";
      bass.frequency.value = frequency / 2;
      bassGain.gain.setValueAtTime(0.0001, time);
      bassGain.gain.exponentialRampToValueAtTime(0.12, time + 0.4);
      bassGain.gain.exponentialRampToValueAtTime(0.0001, time + 4);
      bass.connect(bassGain);
      bassGain.connect(master);
      bass.start(time);
      bass.stop(time + 4.2);
    }
    step += 1;
  };
  const drawVisual = () => {
    if (!playing) return;
    if (analyser) {
      analyser.getByteFrequencyData(frequencyData);
      els.bars.forEach((bar, index) => {
        const value = frequencyData[index + 2] || 0;
        bar.style.height = `${Math.max(8, (value / 255) * 100)}%`;
      });
    } else {
      els.bars.forEach((bar) => { bar.style.height = `${12 + Math.random() * 80}%`; });
    }
    visualTimer = requestAnimationFrame(drawVisual);
  };
  const play = () => {
    if (!ensureAudio()) {
      cb.toast("Audio unavailable", "This browser does not expose Web Audio.", "alert");
      return;
    }
    if (audio.state === "suspended") audio.resume();
    playing = true;
    els.play.innerHTML = cb.icon("pause");
    els.play.title = "Pause";
    els.state.textContent = "Playing";
    note();
    clearInterval(sequence);
    sequence = setInterval(note, 760);
    clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      if (!playing) return;
      elapsed += 1;
      if (elapsed >= tracks[trackIndex].duration) {
        elapsed = 0;
        trackIndex = (trackIndex + 1) % tracks.length;
        updateTrack();
      }
      updateProgress();
    }, 1000);
    cancelAnimationFrame(visualTimer);
    drawVisual();
  };
  const pause = () => {
    playing = false;
    clearInterval(sequence);
    clearInterval(progressTimer);
    cancelAnimationFrame(visualTimer);
    els.play.innerHTML = cb.icon("play");
    els.play.title = "Play";
    els.state.textContent = "Paused";
    els.bars.forEach((bar) => { bar.style.height = "12%"; });
  };
  const toggle = () => {
    if (playing) pause();
    else play();
  };
  const selectTrack = (index, autoPlay = true) => {
    trackIndex = (index + tracks.length) % tracks.length;
    elapsed = 0;
    updateTrack();
    if (autoPlay && !playing) play();
  };
  els.play.addEventListener("click", toggle);
  cb.$("[data-prev]", win.body).addEventListener("click", () => selectTrack(trackIndex - 1));
  cb.$("[data-next]", win.body).addEventListener("click", () => selectTrack(trackIndex + 1));
  cb.$$("[data-track]", win.body).forEach((row) => {
    row.addEventListener("click", () => selectTrack(Number(row.dataset.track)));
  });
  els.volume.addEventListener("input", () => {
    S.settings.volume = Number(els.volume.value);
    els.volumeLabel.textContent = `${S.settings.volume}%`;
    if (master) master.gain.value = (S.settings.volume / 100) * 0.16;
    cb.save();
    cb.setVolumeUI();
  });
  updateTrack();
  win.cleanups.push(() => {
    playing = false;
    clearInterval(sequence);
    clearInterval(progressTimer);
    cancelAnimationFrame(visualTimer);
    if (audio) audio.close().catch(() => {});
    delete window.CloudBookAudio;
  });
}

function mountPhotos(win) {
  let lightbox = win.opts.lightbox || null;
  const gallery = () => [...cb.ARTWORKS, ...S.photos];
  const render = () => {
    const items = gallery();
    win.body.innerHTML = `
      <div class="photos-app">
        <div class="photos-head">
          <div><h2>Cloud photos</h2><span>${items.length} images · synced</span></div>
          <span class="spacer"></span>
          <button class="btn sm ghost" data-upload>${cb.icon("upload")} Upload</button>
          <input type="file" accept="image/*" data-file hidden>
        </div>
        <div class="photos-grid">
          ${items.map((item, index) => `<button class="photo-card" data-photo="${index}"><img src="${item.src}" alt="${cb.esc(item.title)}"><span>${cb.esc(item.title)}</span></button>`).join("")}
        </div>
      </div>`;
    cb.$$("[data-photo]", win.body).forEach((button) => {
      button.addEventListener("click", () => {
        lightbox = gallery()[Number(button.dataset.photo)];
        showLightbox();
      });
    });
    cb.$("[data-upload]", win.body)?.addEventListener("click", () => cb.$("[data-file]", win.body)?.click());
    cb.$("[data-file]", win.body)?.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > 1600000) {
        cb.toast("Image is too large", "Choose an image under 1.6 MB for the cloud gallery.", "alert");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        S.photos.push({ title: file.name.replace(/\.[^.]+$/, ""), src: reader.result });
        cb.save();
        render();
        cb.toast("Photo added", "Your image is now in the cloud gallery.", "success");
      };
      reader.readAsDataURL(file);
    });
    if (lightbox) showLightbox();
  };
  const showLightbox = () => {
    cb.$(".photo-lightbox", win.body)?.remove();
    if (!lightbox) return;
    const overlay = document.createElement("div");
    overlay.className = "photo-lightbox";
    overlay.innerHTML = `<button class="icon-btn" data-close>${cb.icon("x")}</button><img src="${lightbox.src}" alt="${cb.esc(lightbox.title)}"><span>${cb.esc(lightbox.title)}</span>`;
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest("[data-close]")) {
        lightbox = null;
        overlay.remove();
      }
    });
    win.body.appendChild(overlay);
  };
  win.photosOpen = (item) => { lightbox = item; showLightbox(); };
  render();
}

function mountSettings(win) {
  const section = (id, title, subtitle, content) => `
    <section class="settings-section" id="settings-${id}">
      <div class="settings-section-head"><strong>${title}</strong><span>${subtitle}</span></div>
      ${content}
    </section>`;
  const render = () => {
    const used = 312;
    const total = 1024;
    win.body.innerHTML = `
      <div class="settings-app">
        <aside class="settings-sidebar">
          <div class="settings-side-title">System</div>
          <button class="settings-nav active" data-section="appearance">${cb.icon("palette")} Appearance</button>
          <button class="settings-nav" data-section="profile">${cb.icon("user")} Profile</button>
          <button class="settings-nav" data-section="cloud">${cb.icon("cloud")} Cloud & sync</button>
          <button class="settings-nav" data-section="storage">${cb.icon("hard-drive")} Storage</button>
          <button class="settings-nav" data-section="about">${cb.icon("info")} About</button>
        </aside>
        <div class="settings-main">
          <h2>System settings</h2>
          <p>Personalise your cloud laptop. Everything saves instantly to your profile.</p>
          ${section("appearance", "Appearance", "Personalise your desktop", `
            <div class="settings-row"><div class="settings-row-copy"><strong>Wallpaper</strong><span>Choose a look for your cloud desktop</span></div><span class="settings-value">${cb.WALLPAPERS.find((item) => item[0] === S.settings.wallpaper)?.[1] || "Aurora"}</span></div>
            <div class="wallpaper-options">
              ${cb.WALLPAPERS.map(([id, label]) => `<button class="wallpaper-swatch ${S.settings.wallpaper === id ? "active" : ""}" data-wallpaper-swatch="${id}" style="background:var(--wp-${id})" title="${label}"><span data-wallpaper-thumb="${id}" style="position:absolute;inset:0"></span></button>`).join("")}
            </div>
            <div class="settings-row"><div class="settings-row-copy"><strong>Accent colour</strong><span>Used across buttons, highlights, and charts</span></div></div>
            <div class="accent-options">
              ${Object.entries(cb.ACCENTS).map(([id, value]) => `<button class="accent-swatch ${S.settings.accent === id ? "active" : ""}" data-accent="${id}" style="background:linear-gradient(145deg,${value[0]},${value[1]})" title="${value[2]}"></button>`).join("")}
            </div>
            <div class="settings-row"><div class="settings-row-copy"><strong>Light theme</strong><span>Switch the entire desktop to daylight</span></div><button class="switch ${S.settings.theme === "light" ? "on" : ""}" data-theme-switch aria-label="Toggle light theme"></button></div>
            <div class="settings-row"><div class="settings-row-copy"><strong>Reduce motion</strong><span>Calm the interface animations</span></div><button class="switch ${S.settings.reduceMotion ? "on" : ""}" data-motion-switch aria-label="Toggle reduce motion"></button></div>`)}
          ${section("profile", "Profile", "Your cloud identity", `
            <div class="settings-row"><div class="settings-row-copy"><strong>Display name</strong><span>Shows on the lock screen and menu bar</span></div><input class="settings-input" data-name value="${cb.esc(S.user.name)}" aria-label="Display name"></div>
            <div class="settings-row"><div class="settings-row-copy"><strong>Email</strong><span>Sign-in address for this CloudBook</span></div><input class="settings-input" data-email value="${cb.esc(S.user.email)}" aria-label="Email"></div>
            <div class="settings-row"><div class="settings-row-copy"><strong>Plan</strong><span>CloudBook Pro · billed monthly</span></div><span class="settings-value"><strong>Pro</strong></span></div>`)}
          ${section("cloud", "Cloud & sync", "Always with you", `
            <div class="settings-row"><div class="settings-row-copy"><strong>Cloud sync</strong><span>Keep files and notes current on every device</span></div><button class="switch ${S.settings.sync ? "on" : ""}" data-sync-switch aria-label="Toggle cloud sync"></button></div>
            <div class="settings-row"><div class="settings-row-copy"><strong>Region</strong><span>Nearest data centre to your devices</span></div><select class="settings-input" data-region aria-label="Cloud region">${Object.keys(cb.REGIONS).map((region) => `<option value="${region}" ${S.settings.region === region ? "selected" : ""}>${region} · ${cb.REGIONS[region]} ms</option>`).join("")}</select></div>
            <div class="settings-row"><div class="settings-row-copy"><strong>Encryption</strong><span>AES-256 at rest, TLS 1.3 in transit</span></div><span class="settings-value" style="color:#6ee7b7">${cb.icon("shield")} Active</span></div>
            <div class="settings-row"><div class="settings-row-copy"><strong>Last sync</strong><span>All devices up to date</span></div><span class="settings-value">Just now</span></div>`)}
          ${section("storage", "Storage", "1 TB cloud volume", `
            <div class="settings-storage">
              <div class="settings-storage-bar"><i style="width:19%;background:linear-gradient(90deg,#8b7cff,#67e8f9)"></i><i style="width:8%;background:#f472b6"></i><i style="width:3%;background:#fbbf24"></i><i style="flex:1;background:rgba(255,255,255,.08)"></i></div>
              <div class="settings-storage-legend"><span><i style="background:#8b7cff"></i>Documents 194 GB</span><span><i style="background:#f472b6"></i>Projects 82 GB</span><span><i style="background:#fbbf24"></i>Media 36 GB</span><span><i style="background:rgba(255,255,255,.3)"></i>${total - used} GB free</span></div>
            </div>`)}
          ${section("about", "About", "CloudBook Pro", `
            <div class="spec-list">
              <div class="spec-row"><span>Machine</span><strong>CloudBook Pro</strong></div>
              <div class="spec-row"><span>Memory</span><strong>20 GB DDR5</strong></div>
              <div class="spec-row"><span>Storage</span><strong>1 TB NVMe</strong></div>
              <div class="spec-row"><span>Processor</span><strong>8 vCPU · AMD EPYC</strong></div>
              <div class="spec-row"><span>Graphics</span><strong>NVIDIA T4 · 16 GB</strong></div>
              <div class="spec-row"><span>System</span><strong>AetherOS 2.4 LTS</strong></div>
              <div class="spec-row"><span>Region</span><strong>${S.settings.region} · ${cb.latency()} ms</strong></div>
            </div>
            <div class="settings-row" style="border-top:1px solid var(--line)">
              <div class="settings-row-copy"><strong>Session tools</strong><span>Lock the desktop or restart the cloud machine</span></div>
              <div style="display:flex;gap:6px"><button class="btn sm ghost" data-lock>${cb.icon("lock")} Lock</button><button class="btn sm ghost" data-restart>${cb.icon("refresh")} Restart</button></div>
            </div>
            <div class="settings-row"><div class="settings-row-copy"><strong>Reset CloudBook</strong><span>Clear local browser data and start fresh</span></div><button class="btn sm danger" data-reset>Reset</button></div>`)}
        </div>
      </div>`;
    bind();
  };
  const bind = () => {
    cb.$$("[data-section]", win.body).forEach((button) => {
      button.addEventListener("click", () => {
        const target = cb.$(`#settings-${button.dataset.section}`, win.body);
        cb.$$("[data-section]", win.body).forEach((item) => item.classList.toggle("active", item === button));
        target?.scrollIntoView({ behavior: S.settings.reduceMotion ? "auto" : "smooth", block: "start" });
      });
    });
    cb.$$("[data-wallpaper-swatch]", win.body).forEach((button) => {
      button.addEventListener("click", () => {
        S.settings.wallpaper = button.dataset.wallpaperSwatch;
        cb.applySettings();
        cb.save();
        cb.$$("[data-wallpaper-swatch]", win.body).forEach((item) => item.classList.toggle("active", item === button));
        cb.toast("Wallpaper updated", "Your desktop has a new look.", "success");
      });
    });
    cb.$$("[data-accent]", win.body).forEach((button) => {
      button.addEventListener("click", () => {
        S.settings.accent = button.dataset.accent;
        cb.applySettings();
        cb.save();
        cb.$$("[data-accent]", win.body).forEach((item) => item.classList.toggle("active", item === button));
        cb.toast("Accent updated", `${cb.ACCENTS[S.settings.accent][2]} is now your accent colour.`, "success");
      });
    });
    cb.$("[data-theme-switch]", win.body)?.addEventListener("click", (event) => {
      S.settings.theme = S.settings.theme === "light" ? "dark" : "light";
      event.currentTarget.classList.toggle("on", S.settings.theme === "light");
      cb.applySettings();
      cb.save();
    });
    cb.$("[data-motion-switch]", win.body)?.addEventListener("click", (event) => {
      S.settings.reduceMotion = !S.settings.reduceMotion;
      event.currentTarget.classList.toggle("on", S.settings.reduceMotion);
      cb.applySettings();
      cb.save();
    });
    cb.$("[data-sync-switch]", win.body)?.addEventListener("click", (event) => {
      S.settings.sync = !S.settings.sync;
      event.currentTarget.classList.toggle("on", S.settings.sync);
      cb.save();
      cb.toast(S.settings.sync ? "Cloud sync on" : "Cloud sync paused", S.settings.sync ? "Files are syncing again." : "Changes stay on this session for now.");
    });
    cb.$("[data-name]", win.body)?.addEventListener("input", (event) => {
      S.user.name = event.target.value || "CloudBook User";
      cb.save();
      cb.applySettings();
    });
    cb.$("[data-email]", win.body)?.addEventListener("input", (event) => {
      S.user.email = event.target.value;
      cb.save();
    });
    cb.$("[data-region]", win.body)?.addEventListener("change", (event) => {
      S.settings.region = event.target.value;
      cb.applySettings();
      cb.save();
      cb.toast("Region updated", `Connected to ${S.settings.region} at ${cb.latency()} ms.`, "success");
    });
    cb.$("[data-lock]", win.body)?.addEventListener("click", cb.lockScreen);
    cb.$("[data-restart]", win.body)?.addEventListener("click", cb.restart);
    cb.$("[data-reset]", win.body)?.addEventListener("click", cb.factoryReset);
  };
  render();
}

function mountStore(win) {
  const optional = ["weather", "focus"];
  const render = () => {
    const all = Object.keys(cb.APPS).filter((id) => cb.APPS[id].store !== false);
    const newApps = all.filter((id) => optional.includes(id));
    const coreApps = all.filter((id) => !optional.includes(id) && id !== "home");
    const card = (id, key) => {
      const app = cb.APPS[id];
      const installed = S.installed.includes(id);
      return `
        <article class="store-card">
          <div class="store-card-top"><span class="app-icon" data-app="${id}">${cb.icon(app.icon)}</span><div><strong>${cb.esc(app.name)}</strong><span>${cb.esc(app.category || "Cloud app")}</span></div></div>
          <p>${cb.esc(app.description || "A beautifully connected app for your cloud laptop.")}</p>
          <div class="store-card-foot">
            <span class="store-rating">${cb.icon("star")} ${app.rating || "4.9"}</span>
            ${installed ? (optional.includes(id) ? `<button class="btn sm ghost" data-open-app="${id}">Open</button><button class="icon-btn" data-remove="${id}" title="Remove">${cb.icon("trash")}</button>` : `<span class="settings-value">Included</span>`) : `<button class="btn sm primary" data-install="${id}" key="${key}">${cb.icon("download")} Install</button>`}
          </div>
        </article>`;
    };
    win.body.innerHTML = `
      <div class="store-app">
        <section class="store-hero">
          <div>
            <p class="eyebrow">${cb.icon("sparkles")} Aether App Store</p>
            <h2>More ways to use your cloud.</h2>
            <p>Hand-picked apps that sync instantly across every device signed in to your CloudBook. Everything installs in under a second.</p>
          </div>
          <div class="store-hero-art">${cb.icon("store")}</div>
        </section>
        <div class="store-section-title"><span>New this week</span><span>${newApps.length} apps</span></div>
        <div class="store-grid">${newApps.map((id, index) => card(id, index)).join("")}</div>
        <div class="store-section-title" style="margin-top:18px"><span>Included with CloudBook</span><span>${coreApps.length} apps</span></div>
        <div class="store-grid">${coreApps.map((id, index) => card(id, index)).join("")}</div>
      </div>`;
    bind();
  };
  const bind = () => {
    cb.$$("[data-install]", win.body).forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.install;
        if (!S.installed.includes(id)) S.installed.push(id);
        cb.save();
        cb.renderDock();
        cb.renderLauncher();
        render();
        cb.toast("App installed", `${cb.APPS[id].name} is now in your dock.`, "success");
        cb.openApp(id);
      });
    });
    cb.$$("[data-remove]", win.body).forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.dataset.remove;
        const yes = await cb.confirmModal("Remove app?", `${cb.APPS[id].name} will be removed from your dock. Your settings stay in the cloud.`, "Remove", true);
        if (!yes) return;
        S.installed = S.installed.filter((item) => item !== id);
        cb.save();
        if (cb.openWindows.has(id)) cb.closeWindow(cb.openWindows.get(id));
        cb.renderDock();
        cb.renderLauncher();
        render();
        cb.toast("App removed", `${cb.APPS[id].name} was removed from this device.`, "success");
      });
    });
    cb.$$("[data-open-app]", win.body).forEach((button) => {
      button.addEventListener("click", () => cb.openApp(button.dataset.openApp));
    });
  };
  render();
}

function mountWeather(win) {
  const region = S.settings.region;
  const base = { "us-west-2": 18, "us-east-1": 21, "eu-west-2": 13, "ap-south-1": 29, "ap-southeast-2": 24 }[region] || 18;
  const city = { "us-west-2": "San Francisco", "us-east-1": "Ashburn", "eu-west-2": "London", "ap-south-1": "Mumbai", "ap-southeast-2": "Sydney" }[region] || "Cloud region";
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const conditions = ["Clear", "Partly cloudy", "Sunny", "Light rain", "Clear"];
  const temps = days.map((day, index) => ({ day, low: base - 5 + index, high: base + 4 + (index % 3), condition: conditions[index] }));
  const render = (offset = 0) => {
    const temp = base + offset;
    const values = [42, 58, 51, 73, 66, 48, 59, 71, 63, 55, 46, 60];
    win.body.innerHTML = `
      <div class="weather-app">
        <section class="weather-hero">
          <div class="weather-top">
            <div class="weather-loc"><strong>${cb.icon("map-pin")} ${city}</strong><span>${region} · Cloud region</span></div>
            <span style="font-size:9px;color:rgba(255,255,255,.72)">Updated just now</span>
          </div>
          <div class="weather-temp">${temp}<sup>°C</sup></div>
          <div class="weather-cond">${cb.icon("weather")} ${conditions[0]} · feels like ${temp + 1}°</div>
          <div class="weather-meta">
            <span>Humidity<strong>62%</strong></span>
            <span>Wind<strong>11 km/h</strong></span>
            <span>UV index<strong>4 · moderate</strong></span>
            <span>Visibility<strong>16 km</strong></span>
          </div>
        </section>
        <div class="weather-forecast">
          ${temps.map((item, index) => `
            <article class="weather-day">
              <span>${item.day}</span>
              ${cb.icon(index === 3 ? "cloud-weather" : "sun")}
              <strong>${item.high}°</strong>
              <em>${item.low}°</em>
            </article>`).join("")}
        </div>
        <section class="weather-panel">
          <strong>Next 12 hours</strong>
          <div class="weather-bars">
            ${values.map((value, index) => `<span><i style="height:${value}%"></i>${index % 2 === 0 ? `${index + 8}:00` : ""}</span>`).join("")}
          </div>
        </section>
        <section class="weather-panel" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
          <div><strong>CloudBook forecast</strong><div style="font-size:8.5px;color:var(--muted);margin-top:2px">Clear skies over ${region}. A perfect day to work from anywhere.</div></div>
          <button class="btn sm ghost" data-refresh>${cb.icon("refresh")} Refresh</button>
        </section>
      </div>`;
    cb.$("[data-refresh]", win.body)?.addEventListener("click", () => {
      render(Math.random() > 0.5 ? 1 : -1);
      cb.toast("Forecast refreshed", `Updated conditions for ${city}.`, "success");
    });
  };
  render();
}

function mountFocus(win) {
  const modes = { focus: { label: "Focus", seconds: 25 * 60 }, break: { label: "Break", seconds: 5 * 60 } };
  let mode = "focus";
  let remaining = modes.focus.seconds;
  let running = false;
  let sessions = 0;
  let interval = null;
  const chime = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const audio = new AudioCtx();
      const gain = audio.createGain();
      gain.gain.value = 0.08;
      gain.connect(audio.destination);
      [523.25, 659.25, 783.99].forEach((frequency, index) => {
        const osc = audio.createOscillator();
        osc.type = "sine";
        osc.frequency.value = frequency;
        const noteGain = audio.createGain();
        noteGain.gain.setValueAtTime(0.0001, audio.currentTime + index * 0.16);
        noteGain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + index * 0.16 + 0.03);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + index * 0.16 + 0.7);
        osc.connect(noteGain);
        noteGain.connect(gain);
        osc.start(audio.currentTime + index * 0.16);
        osc.stop(audio.currentTime + index * 0.16 + 0.8);
      });
      setTimeout(() => audio.close(), 2200);
    } catch (error) {
      return;
    }
  };
  win.body.innerHTML = `
    <div class="focus-app">
      <div class="focus-head"><h2>Focus timer</h2><div class="focus-mode"><button class="active" data-mode="focus">Focus</button><button data-mode="break">Break</button></div></div>
      <div class="focus-ring" data-ring style="--p:0">
        <div class="focus-time"><strong data-time>25:00</strong><span data-label>Focus session</span></div>
      </div>
      <div class="focus-actions">
        <button class="btn primary" data-toggle>${cb.icon("play")} Start</button>
        <button class="btn ghost" data-reset>${cb.icon("refresh")} Reset</button>
      </div>
      <div class="focus-stats">
        <div class="focus-stat"><strong data-sessions>0</strong><span>Sessions today</span></div>
        <div class="focus-stat"><strong data-minutes>0</strong><span>Minutes focused</span></div>
        <div class="focus-stat"><strong>25:00</strong><span>Session length</span></div>
      </div>
      <p style="font-size:8.5px;color:var(--muted);text-align:center;margin:14px 0 0;line-height:1.5">A quiet timer for deep work. Your sessions stay in this CloudBook window.</p>
    </div>`;
  const ring = cb.$("[data-ring]", win.body);
  const time = cb.$("[data-time]", win.body);
  const label = cb.$("[data-label]", win.body);
  const toggle = cb.$("[data-toggle]", win.body);
  const sessionsEl = cb.$("[data-sessions]", win.body);
  const minutesEl = cb.$("[data-minutes]", win.body);
  const update = () => {
    const total = modes[mode].seconds;
    const percent = ((total - remaining) / total) * 100;
    ring.style.setProperty("--p", percent.toFixed(1));
    time.textContent = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
    label.textContent = mode === "focus" ? "Focus session" : "Break time";
    toggle.innerHTML = running ? `${cb.icon("pause")} Pause` : `${cb.icon("play")} Start`;
    sessionsEl.textContent = String(sessions);
    minutesEl.textContent = String(sessions * 25);
  };
  const stop = () => {
    running = false;
    clearInterval(interval);
    update();
  };
  const start = () => {
    if (running) {
      stop();
      return;
    }
    running = true;
    interval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(interval);
        running = false;
        if (mode === "focus") {
          sessions += 1;
          chime();
          cb.toast("Focus session complete", "Take five. You earned it.", "success");
          mode = "break";
          remaining = modes.break.seconds;
        } else {
          chime();
          cb.toast("Break is over", "Ready for another focus session?", "info");
          mode = "focus";
          remaining = modes.focus.seconds;
        }
        cb.$$("[data-mode]", win.body).forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
      }
      update();
    }, 1000);
    update();
  };
  toggle.addEventListener("click", start);
  cb.$("[data-reset]", win.body).addEventListener("click", () => {
    stop();
    remaining = modes[mode].seconds;
    update();
  });
  cb.$$("[data-mode]", win.body).forEach((button) => {
    button.addEventListener("click", () => {
      mode = button.dataset.mode;
      stop();
      remaining = modes[mode].seconds;
      cb.$$("[data-mode]", win.body).forEach((item) => item.classList.toggle("active", item === button));
      update();
    });
  });
  win.cleanups.push(() => clearInterval(interval));
  update();
}

cb.registerApp("home", { name: "CloudBook Home", icon: "home", w: 900, h: 660, mount: mountHome });
cb.registerApp("monitor", { name: "System Monitor", icon: "activity", w: 820, h: 600, mount: mountMonitor, category: "System", description: "Live CPU, memory, storage, network, and process telemetry for your cloud machine.", rating: "5.0" });
cb.registerApp("files", { name: "Files", icon: "folder", w: 840, h: 570, mount: mountFiles, onReopen: (win, opts) => { if (opts.path) win.filesNavigate(opts.path); }, category: "Productivity", description: "Browse, create, and manage everything in your 1 TB encrypted cloud volume.", rating: "4.9" });
cb.registerApp("terminal", { name: "Terminal", icon: "terminal", w: 760, h: 480, mount: mountTerminal, category: "Developer", description: "A real shell for your cloud laptop. Run commands, inspect resources, manage files.", rating: "4.9" });
cb.registerApp("notes", { name: "Notes", icon: "file", w: 800, h: 550, mount: mountNotes, onReopen: (win, opts) => { if (opts.new) win.notesNew(); else if (opts.noteId) win.notesSelect(opts.noteId); }, category: "Productivity", description: "Beautiful notes that sync instantly across every device signed in to CloudBook.", rating: "4.9" });
cb.registerApp("editor", { name: "Code Editor", icon: "code", w: 840, h: 570, mount: mountEditor, onReopen: (win, opts) => { if (opts.path) win.editorLoad(opts.path); }, category: "Developer", description: "A focused text and code editor wired directly into your cloud file system.", rating: "4.8" });
cb.registerApp("calculator", { name: "Calculator", icon: "calculator", w: 330, h: 500, mount: mountCalculator, category: "Utilities", description: "A fast, keyboard-friendly calculator with cloud-grade precision.", rating: "4.7" });
cb.registerApp("music", { name: "Aether Sounds", icon: "music", w: 450, h: 630, mount: mountMusic, category: "Media", description: "Generative ambient music made in the cloud. Four soundscapes for focus and rest.", rating: "4.9" });
cb.registerApp("photos", { name: "Photos", icon: "image", w: 740, h: 550, mount: mountPhotos, category: "Media", description: "Your cloud gallery with generated artwork and instant uploads.", rating: "4.8" });
cb.registerApp("settings", { name: "Settings", icon: "settings", w: 860, h: 620, mount: mountSettings, category: "System", description: "Personalise your cloud desktop, profile, region, storage, and sync.", rating: "5.0" });
cb.registerApp("store", { name: "App Store", icon: "store", w: 840, h: 630, mount: mountStore, category: "System", description: "Discover and install new apps for your cloud laptop in under a second.", rating: "4.9" });
cb.registerApp("weather", { name: "Weather", icon: "cloud-weather", w: 430, h: 640, mount: mountWeather, category: "Lifestyle", description: "Live conditions and a five-day forecast for your cloud region.", rating: "4.7", store: true });
cb.registerApp("focus", { name: "Focus", icon: "timer", w: 400, h: 610, mount: mountFocus, category: "Productivity", description: "A calm Pomodoro timer with session tracking and a gentle chime.", rating: "4.8", store: true });
