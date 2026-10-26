"use strict";

function mountChrome(win) {
  const NEW_TAB = "aether://newtab";
  const makeTab = (url = NEW_TAB) => ({ id: cb.uid(), url, title: "New Tab", history: [url], historyIndex: 0 });
  let tabs = [makeTab(win.opts.url || NEW_TAB)];
  let activeIndex = 0;
  let menuOpen = false;
  const bookmarks = [
    { title: "Mail", app: "mail" },
    { title: "Calendar", app: "calendar" },
    { title: "App Store", app: "store" },
    { title: "Cloud status", url: "aether://status" },
    { title: "Docs", url: "aether://docs" },
    { title: "News", url: "aether://news" }
  ];
  const activeTab = () => tabs[activeIndex];
  const normalizeUrl = (value) => {
    const url = String(value || "").trim();
    if (!url) return NEW_TAB;
    if (url === "chrome://newtab" || url === "chrome://new-tab-page" || url === "aether://start") return NEW_TAB;
    if (url.startsWith("aether://") || /^https?:\/\//i.test(url)) return url;
    return `https://${url}`;
  };
  const resolveInput = (value) => {
    const input = String(value || "").trim();
    if (!input) return NEW_TAB;
    if (input.startsWith("aether://") || /^https?:\/\//i.test(input)) return normalizeUrl(input);
    if (/^[\w-]+(\.[\w-]+)+([/:?#].*)?$/.test(input)) return normalizeUrl(input);
    return `aether://search?q=${encodeURIComponent(input)}`;
  };
  const titleFor = (url) => {
    if (url === NEW_TAB) return "New Tab";
    if (url.startsWith("aether://search")) {
      const query = new URLSearchParams(url.split("?")[1] || "").get("q") || "";
      return `Search · ${query}`;
    }
    if (url === "aether://status") return "Cloud status";
    if (url === "aether://docs") return "Aether Docs";
    if (url === "aether://news") return "CloudBook News";
    if (url === "aether://about") return "About Chrome";
    if (url === "aether://history") return "History";
    if (url === "aether://downloads") return "Downloads";
    if (url.startsWith("aether://app/")) return "Aether app";
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (error) {
      return url;
    }
  };
  const faviconFor = (url) => {
    if (url === NEW_TAB) return cb.icon("chrome");
    if (url.startsWith("aether://")) return cb.icon("cloud");
    return cb.icon("globe");
  };
  const displayAddress = (url) => (url === NEW_TAB ? "" : url);
  win.body.innerHTML = `
    <div class="chrome-app">
      <div class="chrome-tabstrip">
        <div class="chrome-tabs" data-tabs></div>
        <button class="chrome-newtab-btn" data-newtab title="New tab" aria-label="New tab">${cb.icon("plus")}</button>
        <div class="chrome-tab-tools">
          <button class="chrome-tool-btn" data-chrome-menu title="Customise and control Chrome" aria-label="Chrome menu">${cb.icon("more")}</button>
        </div>
      </div>
      <div class="chrome-toolbar">
        <div class="chrome-nav">
          <button data-back title="Back" aria-label="Back">${cb.icon("chevron-left")}</button>
          <button data-forward title="Forward" aria-label="Forward">${cb.icon("chevron-right")}</button>
          <button data-reload title="Reload" aria-label="Reload">${cb.icon("refresh")}</button>
          <button data-home title="Home" aria-label="Home">${cb.icon("home")}</button>
        </div>
        <div class="chrome-omnibox">
          <span class="chrome-security" data-security>${cb.icon("lock")}</span>
          <input data-address spellcheck="false" autocomplete="off" placeholder="Search Google or type a URL" aria-label="Address and search bar">
          <span class="chrome-omni-tip">${cb.icon("search")}</span>
        </div>
        <button class="chrome-tool-btn" data-star title="Bookmark this page" aria-label="Bookmark this page">${cb.icon("star")}</button>
        <button class="chrome-tool-btn" data-live title="Open live site" aria-label="Open live site">${cb.icon("external")}</button>
      </div>
      <div class="chrome-bookmarks" data-bookmarks></div>
      <div class="chrome-progress" data-progress></div>
      <div class="chrome-view" data-view></div>
      <div class="chrome-menu" data-menu hidden>
        <button data-menu-action="newtab">${cb.icon("plus")} New tab</button>
        <button data-menu-action="history">${cb.icon("clock")} History</button>
        <button data-menu-action="downloads">${cb.icon("download")} Downloads</button>
        <button data-menu-action="bookmarks">${cb.icon("star")} Bookmarks</button>
        <span class="chrome-menu-sep"></span>
        <button data-menu-action="live">${cb.icon("external")} Open live site</button>
        <button data-menu-action="settings">${cb.icon("settings")} Chrome settings</button>
      </div>
    </div>`;
  const tabsEl = cb.$("[data-tabs]", win.body);
  const view = cb.$("[data-view]", win.body);
  const address = cb.$("[data-address]", win.body);
  const bookmarksEl = cb.$("[data-bookmarks]", win.body);
  const security = cb.$("[data-security]", win.body);
  const progress = cb.$("[data-progress]", win.body);
  const menu = cb.$("[data-menu]", win.body);
  const closeMenu = () => {
    menuOpen = false;
    menu.hidden = true;
  };
  const renderTabs = () => {
    tabsEl.innerHTML = tabs.map((tab, index) => `
      <div class="chrome-tab ${index === activeIndex ? "active" : ""}" data-tab="${index}" role="tab" aria-selected="${index === activeIndex}">
        <span class="chrome-favicon">${faviconFor(tab.url)}</span>
        <span class="chrome-tab-label">${cb.esc(tab.title)}</span>
        <button class="chrome-tab-close" data-close-tab="${index}" aria-label="Close tab">${cb.icon("x")}</button>
      </div>`).join("");
    cb.$$("[data-tab]", tabsEl).forEach((tabEl) => {
      tabEl.addEventListener("click", () => {
        activeIndex = Number(tabEl.dataset.tab);
        renderTabs();
        renderBookmarks();
        syncToolbar();
        renderView();
      });
      tabEl.addEventListener("auxclick", (event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        closeTab(Number(tabEl.dataset.tab));
      });
    });
    cb.$$("[data-close-tab]", tabsEl).forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        closeTab(Number(button.dataset.closeTab));
      });
    });
  };
  const renderBookmarks = () => {
    bookmarksEl.innerHTML = bookmarks.map((bookmark, index) => `
      <button class="chrome-bookmark" data-bookmark="${index}">
        <span>${bookmark.app ? cb.icon(cb.APPS[bookmark.app]?.icon || "launch") : faviconFor(bookmark.url)}</span>
        ${cb.esc(bookmark.title)}
      </button>`).join("");
    cb.$$("[data-bookmark]", bookmarksEl).forEach((button) => {
      button.addEventListener("click", () => {
        const bookmark = bookmarks[Number(button.dataset.bookmark)];
        if (bookmark.app) cb.openApp(bookmark.app);
        else navigate(bookmark.url);
      });
    });
  };
  const syncToolbar = () => {
    const tab = activeTab();
    address.value = displayAddress(tab.url);
    const secure = tab.url.startsWith("aether://") || tab.url.startsWith("https://");
    security.innerHTML = secure ? cb.icon("lock") : cb.icon("globe");
    security.classList.toggle("insecure", !secure);
    const isBookmarked = bookmarks.some((bookmark) => bookmark.url === tab.url);
    const star = cb.$("[data-star]", win.body);
    star.classList.toggle("active", isBookmarked);
    star.innerHTML = cb.icon("star");
    cb.$("[data-back]", win.body).disabled = tab.historyIndex <= 0;
    cb.$("[data-forward]", win.body).disabled = tab.historyIndex >= tab.history.length - 1;
  };
  const navigate = (raw, push = true) => {
    const tab = activeTab();
    let url = normalizeUrl(raw);
    if (url.startsWith("aether://app/")) {
      const appId = url.split("/").pop();
      if (cb.APPS[appId]) {
        cb.openApp(appId);
        return;
      }
    }
    tab.url = url;
    tab.title = titleFor(url);
    if (push) {
      tab.history = tab.history.slice(0, tab.historyIndex + 1);
      tab.history.push(url);
      tab.historyIndex = tab.history.length - 1;
    }
    progress.classList.remove("run");
    void progress.offsetWidth;
    progress.classList.add("run");
    setTimeout(() => progress.classList.remove("run"), 700);
    closeMenu();
    renderTabs();
    renderBookmarks();
    syncToolbar();
    renderView();
  };
  const goBack = () => {
    const tab = activeTab();
    if (tab.historyIndex <= 0) return;
    tab.historyIndex -= 1;
    tab.url = tab.history[tab.historyIndex];
    tab.title = titleFor(tab.url);
    renderTabs();
    renderBookmarks();
    syncToolbar();
    renderView();
  };
  const goForward = () => {
    const tab = activeTab();
    if (tab.historyIndex >= tab.history.length - 1) return;
    tab.historyIndex += 1;
    tab.url = tab.history[tab.historyIndex];
    tab.title = titleFor(tab.url);
    renderTabs();
    renderBookmarks();
    syncToolbar();
    renderView();
  };
  const addTab = (url = NEW_TAB) => {
    tabs.push(makeTab(normalizeUrl(url)));
    activeIndex = tabs.length - 1;
    renderTabs();
    renderBookmarks();
    syncToolbar();
    renderView();
    address.focus();
  };
  const closeTab = (index) => {
    if (tabs.length === 1) {
      tabs = [makeTab(NEW_TAB)];
      activeIndex = 0;
    } else {
      tabs.splice(index, 1);
      if (index < activeIndex) activeIndex -= 1;
      if (activeIndex >= tabs.length) activeIndex = tabs.length - 1;
    }
    renderTabs();
    renderBookmarks();
    syncToolbar();
    renderView();
  };
  const submitAddress = () => {
    navigate(resolveInput(address.value));
    address.blur();
  };
  const openLive = (url = activeTab().url) => {
    if (!/^https?:\/\//i.test(url)) {
      cb.toast("No live site open", "Open a website first, then launch it in Chrome.", "info");
      return;
    }
    window.open(url, "_blank", "noopener");
    cb.toast("Opened in Chrome", "The live site is now open in a real browser tab.", "success");
  };
  const toggleBookmark = () => {
    const tab = activeTab();
    if (tab.url === NEW_TAB) {
      cb.toast("Nothing to bookmark", "Open a page first.", "info");
      return;
    }
    const index = bookmarks.findIndex((bookmark) => bookmark.url === tab.url);
    if (index >= 0) {
      bookmarks.splice(index, 1);
      cb.toast("Bookmark removed", tab.title, "info");
    } else {
      bookmarks.push({ title: tab.title, url: tab.url });
      cb.toast("Bookmark added", tab.title, "success");
    }
    renderBookmarks();
    syncToolbar();
  };
  const bindPage = () => {
    cb.$$("[data-url]", view).forEach((button) => {
      button.addEventListener("click", () => navigate(button.dataset.url));
    });
    cb.$$("[data-app-shortcut]", view).forEach((button) => {
      button.addEventListener("click", () => cb.openApp(button.dataset.appShortcut));
    });
    cb.$$("[data-external]", view).forEach((button) => {
      button.addEventListener("click", () => openLive(button.dataset.external));
    });
    cb.$$("[data-google-search]", view).forEach((button) => {
      button.addEventListener("click", () => {
        const query = button.dataset.googleSearch;
        window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, "_blank", "noopener");
        cb.toast("Opened Google", "Search results are open in a real Chrome tab.", "success");
      });
    });
    cb.$$("[data-search-form]", view).forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const input = cb.$("input", form);
        if (input?.value.trim()) navigate(resolveInput(input.value));
      });
    });
    cb.$$("[data-open-file]", view).forEach((button) => {
      button.addEventListener("click", () => cb.openFile(button.dataset.openFile.split("/")));
    });
  };
  const newTabMarkup = () => `
    <div class="chrome-newtab">
      <div class="chrome-logo"><span>${cb.icon("chrome")}</span><strong>Chrome</strong></div>
      <form class="chrome-search" data-search-form>
        ${cb.icon("search")}
        <input placeholder="Search Google or type a URL" aria-label="Search Google or type a URL">
        <kbd>↵</kbd>
      </form>
      <div class="chrome-shortcuts">
        <button data-app-shortcut="mail"><span style="--si:#38bdf8">${cb.icon("mail")}</span>Mail</button>
        <button data-app-shortcut="calendar"><span style="--si:#f43f5e">${cb.icon("calendar")}</span>Calendar</button>
        <button data-app-shortcut="store"><span style="--si:#6366f1">${cb.icon("store")}</span>App Store</button>
        <button data-url="aether://status"><span style="--si:#34d399">${cb.icon("shield")}</span>Status</button>
        <button data-url="aether://docs"><span style="--si:#fbbf24">${cb.icon("file")}</span>Docs</button>
        <button data-url="aether://news"><span style="--si:#fb7185">${cb.icon("activity")}</span>News</button>
        <button data-app-shortcut="weather"><span style="--si:#38bdf8">${cb.icon("weather")}</span>Weather</button>
        <button data-app-shortcut="photos"><span style="--si:#fb923c">${cb.icon("image")}</span>Photos</button>
      </div>
      <div class="chrome-newtab-note">${cb.icon("cloud-check")} Aether CloudBook · ${S.settings.region} · ${cb.latency()} ms</div>
    </div>`;
  const resultsMarkup = (query) => {
    const safe = cb.esc(query);
    return `
      <div class="chrome-page chrome-results">
        <form class="chrome-search compact" data-search-form>
          ${cb.icon("search")}
          <input value="${safe}" aria-label="Search">
        </form>
        <p class="chrome-results-meta">About 4 results · private CloudBook index</p>
        <article class="chrome-result">
          <span class="res-url">aether://docs/${encodeURIComponent(query.toLowerCase().replace(/\s+/g, "-"))}</span>
          <h3><button data-url="aether://docs">${safe} — Aether CloudBook documentation</button></h3>
          <p>Everything you need to know about your cloud laptop, from storage and sync to sessions and shortcuts.</p>
        </article>
        <article class="chrome-result">
          <span class="res-url">aether://status</span>
          <h3><button data-url="aether://status">Live status · ${S.settings.region}</button></h3>
          <p>All systems operational. Current latency is ${cb.latency()} ms with three-zone replication.</p>
        </article>
        <article class="chrome-result">
          <span class="res-url">aether://news</span>
          <h3><button data-url="aether://news">CloudBook 2.4 is here</button></h3>
          <p>The 20 GB memory tier, 1 TB NVMe storage, and the new control centre are rolling out now.</p>
        </article>
        <article class="chrome-result">
          <span class="res-url">google.com</span>
          <h3><button data-google-search="${safe}">Search “${safe}” on Google</button></h3>
          <p>Continue to Google in a real Chrome tab for results from across the web.</p>
        </article>
        <button class="btn sm ghost chrome-google-btn" data-google-search="${safe}">${cb.icon("external")} Search Google</button>
      </div>`;
  };
  const statusMarkup = () => `
    <div class="chrome-page">
      <span class="page-kicker">All systems operational</span>
      <h1>Cloud status</h1>
      <p>Live health for every Aether CloudBook region. Last updated just now.</p>
      <h2>Your machine</h2>
      <p><strong>CloudBook Pro</strong> — ${S.settings.region} · ${cb.latency()} ms · 8 vCPU · 20 GB RAM · 1 TB NVMe · NVIDIA T4.</p>
      <h2>Regions</h2>
      <p>${Object.entries(cb.REGIONS).map(([name, ms]) => `<strong>${name}</strong> — operational · ${ms} ms`).join("<br>")}</p>
      <h2>Storage</h2>
      <p>312 GB of 1 TB used. 688 GB free. Encrypted with AES-256 and replicated across three zones.</p>
      <button class="btn sm ghost" data-url="aether://newtab">Back to new tab</button>
    </div>`;
  const docsMarkup = () => `
    <div class="chrome-page">
      <span class="page-kicker">Documentation</span>
      <h1>Meet your cloud laptop</h1>
      <p>CloudBook is a complete computer that runs in Aether's cloud. You stream the desktop; the hardware never leaves the data centre.</p>
      <h2>20 GB of instant memory</h2>
      <p>Enough room for dozens of Chrome tabs, a full design suite, and a local development environment at the same time.</p>
      <h2>1 TB of NVMe storage</h2>
      <p>Every file lives on enterprise NVMe and is encrypted at rest. Your work syncs to all signed-in devices instantly.</p>
      <h2>Google Chrome is built in</h2>
      <p>Use tabs, bookmarks, history, and the omnibox without leaving your desktop. Open any live site in Chrome with one click.</p>
      <button class="btn sm ghost" data-url="aether://newtab">Back to new tab</button>
    </div>`;
  const newsMarkup = () => `
    <div class="chrome-page">
      <span class="page-kicker">Product news</span>
      <h1>CloudBook 2.4 is here</h1>
      <p>Today we are shipping the biggest CloudBook update of the year.</p>
      <h2>A 20 GB memory tier</h2>
      <p>More headroom for editors, Chrome tabs, and builds. Memory is dedicated and always available.</p>
      <h2>1 TB NVMe standard</h2>
      <p>Every CloudBook now includes a full terabyte of encrypted NVMe storage. No add-ons, no egress fees.</p>
      <h2>Chrome, Calendar, and Mail</h2>
      <p>New everyday apps make CloudBook feel like a real laptop from the first boot.</p>
      <button class="btn sm ghost" data-url="aether://newtab">Back to new tab</button>
    </div>`;
  const aboutMarkup = () => `
    <div class="chrome-page">
      <span class="page-kicker">About</span>
      <h1>Google Chrome</h1>
      <p>A fast, private browser inside your cloud laptop. CloudBook pages stay in AetherOS; live websites open in a real Chrome tab.</p>
      <h2>Privacy</h2>
      <p>No third-party trackers in cloud pages, no telemetry from this session, and all history stays on your CloudBook.</p>
      <h2>Version</h2>
      <p>Chrome 153 · Chromium engine · bundled with AetherOS 2.4 LTS.</p>
      <button class="btn sm ghost" data-url="aether://newtab">Back to new tab</button>
    </div>`;
  const historyMarkup = () => {
    const entries = tabs.flatMap((tab) => tab.history).filter((url, index, list) => list.indexOf(url) === index).reverse();
    return `
      <div class="chrome-page">
        <span class="page-kicker">Chrome history</span>
        <h1>History</h1>
        <p>Pages visited during this CloudBook session.</p>
        <div class="chrome-history-list">
          ${entries.map((url) => `<button data-url="${cb.esc(url)}"><span>${faviconFor(url)}</span><div><strong>${cb.esc(titleFor(url))}</strong><em>${cb.esc(url === NEW_TAB ? "chrome://newtab" : url)}</em></div></button>`).join("")}
        </div>
        <button class="btn sm ghost" data-url="aether://newtab">Back to new tab</button>
      </div>`;
  };
  const downloadsMarkup = () => `
    <div class="chrome-page">
      <span class="page-kicker">Downloads</span>
      <h1>Downloads</h1>
      <p>Files downloaded to your CloudBook.</p>
      <div class="chrome-download-list">
        <button data-open-file="home/alex/Downloads/cloud-notes.txt"><span>${cb.icon("file")}</span><div><strong>cloud-notes.txt</strong><em>CloudBook 2.4 release notes · 4 KB</em></div>${cb.icon("download")}</button>
        <button data-open-file="home/alex/Pictures/aurora.svg"><span>${cb.icon("image")}</span><div><strong>aurora.svg</strong><em>Aurora wallpaper · 6 KB</em></div>${cb.icon("download")}</button>
      </div>
      <button class="btn sm ghost" data-url="aether://newtab">Back to new tab</button>
    </div>`;
  const bookmarksMarkup = () => `
    <div class="chrome-page">
      <span class="page-kicker">Bookmarks</span>
      <h1>Bookmarks bar</h1>
      <p>Your favourite places across CloudBook and the web.</p>
      <div class="chrome-bookmark-grid">
        ${bookmarks.map((bookmark) => `<button ${bookmark.app ? `data-app-shortcut="${bookmark.app}"` : `data-url="${cb.esc(bookmark.url)}"`}><span>${bookmark.app ? cb.icon(cb.APPS[bookmark.app]?.icon || "launch") : faviconFor(bookmark.url)}</span><strong>${cb.esc(bookmark.title)}</strong><em>${cb.esc(bookmark.app ? "Aether app" : bookmark.url)}</em></button>`).join("")}
      </div>
      <button class="btn sm ghost" data-url="aether://newtab">Back to new tab</button>
    </div>`;
  const externalMarkup = (url) => `
    <div class="chrome-live">
      <div class="chrome-live-bar">
        <span>${cb.icon("shield")} Live website · ${cb.esc(url)}</span>
        <button class="btn sm ghost" data-external="${cb.esc(url)}">${cb.icon("external")} Open in Chrome</button>
      </div>
      <iframe class="chrome-frame" src="${cb.esc(url)}" title="${cb.esc(url)}" loading="lazy" referrerpolicy="no-referrer"></iframe>
    </div>`;
  function renderView() {
    const url = activeTab().url;
    if (url === NEW_TAB) view.innerHTML = newTabMarkup();
    else if (url.startsWith("aether://search")) {
      const query = new URLSearchParams(url.split("?")[1] || "").get("q") || "";
      view.innerHTML = resultsMarkup(query);
    } else if (url === "aether://status") view.innerHTML = statusMarkup();
    else if (url === "aether://docs") view.innerHTML = docsMarkup();
    else if (url === "aether://news") view.innerHTML = newsMarkup();
    else if (url === "aether://about") view.innerHTML = aboutMarkup();
    else if (url === "aether://history") view.innerHTML = historyMarkup();
    else if (url === "aether://downloads") view.innerHTML = downloadsMarkup();
    else if (url === "aether://bookmarks") view.innerHTML = bookmarksMarkup();
    else view.innerHTML = externalMarkup(url);
    bindPage();
    activeTab().title = titleFor(url);
    address.value = displayAddress(url);
    syncToolbar();
    renderTabs();
  }
  cb.$("[data-newtab]", win.body).addEventListener("click", () => addTab());
  cb.$("[data-back]", win.body).addEventListener("click", goBack);
  cb.$("[data-forward]", win.body).addEventListener("click", goForward);
  cb.$("[data-reload]", win.body).addEventListener("click", () => navigate(activeTab().url, false));
  cb.$("[data-home]", win.body).addEventListener("click", () => navigate(NEW_TAB));
  cb.$("[data-star]", win.body).addEventListener("click", toggleBookmark);
  cb.$("[data-live]", win.body).addEventListener("click", () => openLive());
  cb.$("[data-address]", win.body).addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitAddress();
    if (event.key === "Escape") {
      address.value = displayAddress(activeTab().url);
      address.blur();
    }
  });
  address.addEventListener("focus", () => address.select());
  const toggleMenu = (event) => {
    event?.stopPropagation();
    menuOpen = !menuOpen;
    menu.hidden = !menuOpen;
  };
  cb.$("[data-chrome-menu]", win.body).addEventListener("click", toggleMenu);
  cb.$$("[data-menu-action]", win.body).forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.menuAction;
      closeMenu();
      if (action === "newtab") addTab();
      if (action === "history") navigate("aether://history");
      if (action === "downloads") navigate("aether://downloads");
      if (action === "bookmarks") navigate("aether://bookmarks");
      if (action === "live") openLive();
      if (action === "settings") cb.openApp("settings");
    });
  });
  const onKey = (event) => {
    if (!win.el.classList.contains("focused")) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "t") {
      event.preventDefault();
      addTab();
    }
    if (mod && event.key.toLowerCase() === "l") {
      event.preventDefault();
      address.focus();
    }
    if (event.key === "Escape" && menuOpen) closeMenu();
  };
  const onOutside = (event) => {
    if (menuOpen && !menu.contains(event.target) && !event.target.closest("[data-chrome-menu]")) closeMenu();
  };
  document.addEventListener("keydown", onKey);
  document.addEventListener("pointerdown", onOutside);
  win.cleanups.push(() => {
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("pointerdown", onOutside);
  });
  win.chromeGo = (url) => {
    if (!url) return;
    navigate(url);
  };
  renderTabs();
  renderBookmarks();
  syncToolbar();
  renderView();
}

cb.registerApp("chrome", {
  name: "Google Chrome",
  icon: "chrome",
  w: 1000,
  h: 680,
  mount: mountChrome,
  onReopen: (win, opts) => {
    if (opts.url) win.chromeGo(opts.url);
  },
  category: "Internet",
  description: "Google Chrome built into your cloud laptop, with tabs, bookmarks, history, downloads, and live websites.",
  rating: "4.9"
});
