(() => {
  "use strict";

  const API = "https://openrouter.ai/api/v1";
  const STATE_KEY = "openforge.state.v1";
  const MODELS_KEY = "openforge.models.v3";
  const MODELS_TTL = 6 * 60 * 60 * 1000;
  const KEY_RECHECK = 10 * 60 * 1000;
  const PRIVACY_URL = "https://openrouter.ai/settings/privacy";
  const KEYS_URL = "https://openrouter.ai/keys";

  const AGENTS = {
    codex: {
      label: "Codex",
      avatar: "CX",
      accent: "#f5a524",
      rgb: "245, 165, 36",
      blurb: "Ship-focused coding agent",
      placeholder: "Ask Codex to build, debug, or explain code…",
      system: [
        "You are Codex, a highly capable software engineering assistant running inside OpenForge.",
        "You help users design, write, debug, review, and ship code.",
        "Be direct and practical. Prefer complete, runnable solutions over fragments.",
        "Use fenced code blocks with language tags. When changing an existing codebase, say exactly which files change and show the full changed file or a precise diff.",
        "Call out assumptions, edge cases, security issues, and how to test.",
        "Never invent APIs, packages, or command output. If you are unsure, say so and state what you would check.",
        "Keep prose concise; lead with the answer.",
      ].join(" "),
    },
    claude: {
      label: "Claude Code",
      avatar: "CC",
      accent: "#d97757",
      rgb: "217, 119, 87",
      blurb: "Careful planner and reviewer",
      placeholder: "Ask Claude Code to plan, refactor, or review…",
      system: [
        "You are Claude Code, a terminal-native coding agent running inside OpenForge.",
        "You explore before you change: state what you need to read, plan briefly, then make focused edits.",
        "Prefer minimal, surgical diffs. Explain tradeoffs and keep the user in control.",
        "Show code in fenced blocks with the file path as a heading. Include commands to verify the change.",
        "Be candid about uncertainty. Never fabricate results you did not verify, and never claim a test passed unless it was run.",
        "Keep explanations tight and organized.",
      ].join(" "),
    },
    opencode: {
      label: "OpenCode",
      avatar: "OC",
      accent: "#8b7cff",
      rgb: "139, 124, 255",
      blurb: "Open-source terminal agent",
      placeholder: "Ask OpenCode to explore and edit a codebase…",
      system: [
        "You are OpenCode, an open-source terminal coding agent inside OpenForge.",
        "Work like an engineer in a real repository: inspect context, propose a short plan, then implement.",
        "Prefer small, reversible changes and explain how to run or test them.",
        "Provide full file contents or precise diffs, and name every file you touch.",
        "Do not invent command output or test results. State assumptions plainly.",
      ].join(" "),
    },
    hermes: {
      label: "Hermes Agent",
      avatar: "HA",
      accent: "#4cc9f0",
      rgb: "76, 201, 240",
      blurb: "Full-stack builder and debugger",
      placeholder: "Ask Hermes to build a feature end to end…",
      system: [
        "You are Hermes, a full-stack product engineering agent inside OpenForge.",
        "You move comfortably between frontend, backend, data, and deployment.",
        "Start with the smallest architecture that works, then call out scaling limits.",
        "Give complete commands, configs, and file contents. Include verification steps.",
        "Be explicit about security, privacy, and failure modes. Never fabricate results.",
      ].join(" "),
    },
    auto: {
      label: "Auto",
      avatar: "AI",
      accent: "#38d39f",
      rgb: "56, 211, 159",
      blurb: "Adapts to the task at hand",
      placeholder: "Describe the task and Auto will pick an approach…",
      system: [
        "You are OpenForge Auto, a routing engineering agent inside OpenForge.",
        "Choose the most appropriate style for each request: implementer, reviewer, debugger, or planner.",
        "State which mode you are using in one short line, then do the work.",
        "Prefer complete, runnable solutions with files and commands clearly named.",
        "Call out assumptions, edge cases, and how to verify. Never invent results.",
      ].join(" "),
    },
  };

  const SKILLS = [
    { id: "review", label: "Code Review", tag: "RV", desc: "Find bugs, risky changes, and missing tests before shipping.", prompt: "Always include a focused code review: correctness, edge cases, regressions, and missing tests. Rank findings by severity and give concrete fixes." },
    { id: "tests", label: "Test Writer", tag: "TS", desc: "Add unit and integration tests with clear edge cases.", prompt: "When producing code, also produce tests. Cover the happy path, boundary conditions, and likely regressions. Name the test runner and exact command." },
    { id: "security", label: "Security Audit", tag: "SC", desc: "Check for injection, auth flaws, and secret leaks.", prompt: "Treat security as a first-class requirement. Look for injection, broken authorization, unsafe deserialization, secret leakage, and dependency risk. Explain exploitability and remediation." },
    { id: "debug", label: "Debugger", tag: "DB", desc: "Trace root causes and propose the smallest safe fix.", prompt: "Debug systematically: reproduce, isolate, explain the root cause, then propose the smallest safe fix. Distinguish symptoms from causes and list verification steps." },
    { id: "refactor", label: "Refactorer", tag: "RF", desc: "Simplify code without changing behavior.", prompt: "Prefer small, behavior-preserving refactors. Preserve public interfaces unless asked otherwise. Explain the before/after and how to verify nothing broke." },
    { id: "docs", label: "Docs Writer", tag: "DC", desc: "Write READMEs, API docs, and usage examples.", prompt: "Produce clear documentation: purpose, install, configuration, usage examples, and troubleshooting. Keep it accurate and skimmable, with working commands." },
    { id: "frontend", label: "Frontend Polish", tag: "UI", desc: "Responsive, accessible, production-grade UI detail.", prompt: "For UI work, ensure responsive layout, keyboard access, contrast, focus states, and sensible empty/loading/error states. Prefer semantic HTML and minimal dependencies." },
    { id: "api", label: "API Builder", tag: "AP", desc: "Design REST or GraphQL endpoints with validation.", prompt: "Design APIs with clear resources, status codes, validation, pagination, idempotency where relevant, and structured errors. Show request/response examples." },
    { id: "perf", label: "Performance", tag: "PF", desc: "Reduce work, memory, and payloads on hot paths.", prompt: "Consider performance: hot paths, allocations, queries, payload sizes, caching, and rendering cost. Recommend measurable improvements instead of micro-optimizations." },
    { id: "plan", label: "Planner", tag: "PL", desc: "Break complex work into ordered, testable steps.", prompt: "For complex tasks, start with a short ordered plan with concrete checkpoints and verification. Then execute the plan step by step." },
  ];

  const SKILL_MAP = new Map(SKILLS.map((skill) => [skill.id, skill]));

  const PREFERRED_FREE = [
    "openrouter/free",
    "north-mini-code",
    "qwen3-coder",
    "laguna",
    "deepseek-chat-v3",
    "deepseek-v3",
    "deepseek-r1",
    "inkling",
    "devstral",
    "gpt-oss-120b",
    "nemotron-3-ultra",
    "llama-3.3-70b",
    "gemini",
    "gemma-4-31b",
    "mistral-small",
  ];
  const CODE_HINTS = ["coder", "code", "deepseek", "qwen", "glm", "kimi", "devstral", "laguna", "nemotron", "gpt-oss"];

  const FALLBACK_MODELS = [
    "openrouter/free",
    "cohere/north-mini-code:free",
    "qwen/qwen3-coder:free",
    "deepseek/deepseek-chat-v3-0324:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "mistralai/devstral-small:free",
  ].map((id) => ({ id, name: id.split("/").pop(), context: 0, free: true, description: "", chat: true }));

  const DEFAULT_FILES = {
    "README.md": [
      "# OpenForge OS",
      "",
      "A local-first AI dev workspace powered by your own OpenRouter key.",
      "",
      "## Quick start",
      "",
      "1. Open Settings and paste an OpenRouter API key.",
      "2. In OpenRouter privacy settings, enable **Model Training** and **Logging** for API, and turn **ZDR-only** off.",
      "3. Pick an agent, enable a skill or two, and start building.",
      "",
      "Chats, files, skills, and your key stay in this browser. Requests go straight to openrouter.ai.",
      "",
      "## Terminal",
      "",
      "Type `help` in the Terminal view to see local commands.",
      "",
    ].join("\n"),
    "src/main.js": [
      "// Welcome to your local workspace.",
      "// Edit this file, then click \"Ask agent\" to send it to your agent.",
      "",
      "export function greet(name = \"world\") {",
      "  return `Hello, ${name}!`;",
      "}",
      "",
      "console.log(greet());",
      "",
    ].join("\n"),
  };

  const VIEW_META = {
    dashboard: ["Dashboard", "Your local AI dev workspace"],
    chat: ["Chat", "Agent sessions with free models"],
    skills: ["Skills", "Prompt add-ons for your agents"],
    workspace: ["Workspace", "Files saved in this browser"],
    terminal: ["Terminal", "Local workspace shell"],
  };

  const ICONS = {
    chat: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 15a3 3 0 0 1-3 3H8l-4 3V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m2 0-.7 12a1.5 1.5 0 0 1-1.5 1.4H9.2a1.5 1.5 0 0 1-1.5-1.4L7 7m3 4v6m4-6v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H6a2 2 0 0 0-2 2v7.5A1.5 1.5 0 0 0 5.5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    retry: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 8v5m0 3.5v.5M10.3 4.2 2.8 17.4A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3.1L13.7 4.2a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 11v5M12 7.5v.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  };

  const $ = (selector) => document.querySelector(selector);
  const dom = {
    sidebar: $("#sidebar"),
    sidebarClose: $("#sidebarClose"),
    backdrop: $("#backdrop"),
    menuBtn: $("#menuBtn"),
    newChatBtn: $("#newChatBtn"),
    chatSearch: $("#chatSearch"),
    chatList: $("#chatList"),
    sessionCount: $("#sessionCount"),
    navChatCount: $("#navChatCount"),
    navSkillCount: $("#navSkillCount"),
    keyBtn: $("#keyBtn"),
    statusDot: $("#statusDot"),
    accountTitle: $("#accountTitle"),
    accountSub: $("#accountSub"),
    storageUse: $("#storageUse"),
    storageBar: $("#storageBar"),
    appNav: $("#appNav"),
    viewTitle: $("#viewTitle"),
    viewSub: $("#viewSub"),
    viewStack: $("#viewStack"),
    panels: Array.from(document.querySelectorAll("[data-view-panel]")),
    navItems: Array.from(document.querySelectorAll(".nav-item[data-view]")),
    agentBtn: $("#agentBtn"),
    agentDot: $("#agentDot"),
    agentName: $("#agentName"),
    agentPopover: $("#agentPopover"),
    agentList: $("#agentList"),
    modelBtn: $("#modelBtn"),
    modelName: $("#modelName"),
    settingsBtn: $("#settingsBtn"),
    dashForm: $("#dashForm"),
    dashInput: $("#dashInput"),
    dashSend: $("#dashSend"),
    dashEyebrow: $("#dashEyebrow"),
    dashEyebrowText: $("#dashEyebrowText"),
    statRow: $("#statRow"),
    agentGrid: $("#agentGrid"),
    dashSkills: $("#dashSkills"),
    dashRecent: $("#dashRecent"),
    systemCard: $("#systemCard"),
    chatScroll: $("#chatScroll"),
    welcome: $("#welcome"),
    welcomeAgent: $("#welcomeAgent"),
    connectBtn: $("#connectBtn"),
    connectBtnText: $("#connectBtnText"),
    browseModelsBtn: $("#browseModelsBtn"),
    quickGrid: $("#quickGrid"),
    messages: $("#messages"),
    chatAlert: $("#chatAlert"),
    composer: $("#composer"),
    input: $("#input"),
    sendBtn: $("#sendBtn"),
    stopBtn: $("#stopBtn"),
    modeHint: $("#modeHint"),
    modelHint: $("#modelHint"),
    skillHint: $("#skillHint"),
    skillSep: $("#skillSep"),
    privacyNote: $("#privacyNote"),
    skillsGrid: $("#skillsGrid"),
    skillsDisable: $("#skillsDisable"),
    skillSummary: $("#skillSummary"),
    newFileBtn: $("#newFileBtn"),
    newFileForm: $("#newFileForm"),
    newFileInput: $("#newFileInput"),
    fileList: $("#fileList"),
    fileIcon: $(".file-icon"),
    editorName: $("#editorName"),
    saveState: $("#saveState"),
    askFileBtn: $("#askFileBtn"),
    deleteFileBtn: $("#deleteFileBtn"),
    fileEditor: $("#fileEditor"),
    editorStats: $("#editorStats"),
    termOutput: $("#termOutput"),
    termForm: $("#termForm"),
    termInput: $("#termInput"),
    termClear: $("#termClear"),
    modelPopover: $("#modelPopover"),
    modelSearch: $("#modelSearch"),
    freeOnly: $("#freeOnly"),
    modelList: $("#modelList"),
    modelCount: $("#modelCount"),
    refreshModels: $("#refreshModels"),
    settingsModal: $("#settingsModal"),
    settingsClose: $("#settingsClose"),
    keyForm: $("#keyForm"),
    apiKeyInput: $("#apiKeyInput"),
    revealKey: $("#revealKey"),
    saveKeyBtn: $("#saveKeyBtn"),
    testBtn: $("#testBtn"),
    keyStatus: $("#keyStatus"),
    testResult: $("#testResult"),
    freeOnlySetting: $("#freeOnlySetting"),
    settingsModelName: $("#settingsModelName"),
    chatStats: $("#chatStats"),
    exportBtn: $("#exportBtn"),
    importBtn: $("#importBtn"),
    importFile: $("#importFile"),
    clearBtn: $("#clearBtn"),
    toasts: $("#toasts"),
  };

  let state = loadState();
  let models = [];
  let activeStream = null;
  let clearTimer = 0;
  let saveTimer = 0;
  let editorFile = null;
  let editorTimer = 0;
  let deleteTimer = 0;
  let termLines = [];
  let termHistory = [];
  let termHistoryIndex = 0;

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function loadState() {
    const base = {
      version: 2,
      apiKey: "",
      keyInfo: null,
      settings: { agent: "codex", model: null, freeOnly: true, skills: [] },
      files: { ...DEFAULT_FILES },
      activeFile: "README.md",
      view: "dashboard",
      chats: [],
      activeChatId: null,
    };
    const saved = readJSON(STATE_KEY, null);
    if (!saved || typeof saved !== "object") return base;
    const settings = { ...base.settings, ...(saved.settings || {}) };
    const legacyAgent = saved.settings && saved.settings.mode;
    if (!AGENTS[settings.agent]) settings.agent = AGENTS[legacyAgent] ? legacyAgent : "codex";
    settings.skills = Array.isArray(settings.skills) ? settings.skills.filter((id) => SKILL_MAP.has(id)) : [];
    const files = saved.files && typeof saved.files === "object" && !Array.isArray(saved.files) ? { ...saved.files } : { ...DEFAULT_FILES };
    for (const [name, content] of Object.entries(files)) {
      if (typeof content !== "string") delete files[name];
    }
    const chats = Array.isArray(saved.chats)
      ? saved.chats
          .filter((chat) => chat && Array.isArray(chat.messages))
          .map((chat) => {
            const agent = AGENTS[chat.agent] ? chat.agent : AGENTS[chat.mode] ? chat.mode : "codex";
            return {
              ...chat,
              agent,
              messages: chat.messages.map((message) => {
                const messageAgent = AGENTS[message.agent] ? message.agent : AGENTS[message.mode] ? message.mode : agent;
                return { ...message, agent: messageAgent };
              }),
            };
          })
      : [];
    const merged = {
      ...base,
      ...saved,
      version: 2,
      settings,
      files,
      chats,
    };
    if (!merged.files[merged.activeFile]) merged.activeFile = Object.keys(merged.files)[0] || null;
    if (!merged.chats.some((chat) => chat.id === merged.activeChatId)) merged.activeChatId = null;
    if (!VIEW_META[merged.view]) merged.view = "dashboard";
    return merged;
  }

  function save() {
    clearTimeout(saveTimer);
    writeJSON(STATE_KEY, state);
    updateStorage();
  }

  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = 0;
      writeJSON(STATE_KEY, state);
      updateStorage();
    }, 500);
  }

  function getChat() {
    return state.chats.find((chat) => chat.id === state.activeChatId) || null;
  }

  function getMessage(id) {
    const chat = getChat();
    return chat ? chat.messages.find((message) => message.id === id) || null : null;
  }

  function getModel(id) {
    return models.find((model) => model.id === id) || null;
  }

  function modelLabel(model) {
    if (!model) return "Free model";
    return String(model.name || model.id).replace(/\s*\(free\)\s*$/i, "").replace(/:free$/i, "");
  }

  function chipLabel(model) {
    const label = modelLabel(model);
    const parts = label.split(/:\s*/);
    return parts[parts.length - 1] || label;
  }

  function currentModelId() {
    const chat = getChat();
    return (chat && chat.model) || state.settings.model || null;
  }

  function isStreaming() {
    return Boolean(activeStream);
  }

  function enabledSkills() {
    return state.settings.skills.map((id) => SKILL_MAP.get(id)).filter(Boolean);
  }

  function agentFor(key) {
    return AGENTS[key] || AGENTS.codex;
  }

  function formatBytes(bytes) {
    if (!bytes || bytes < 1) return "0 KB";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / Math.pow(1024, index);
    return value.toFixed(index === 0 ? 0 : 1) + " " + units[index];
  }

  function formatNumber(n) {
    return Number(n || 0).toLocaleString("en-US");
  }

  function timeAgo(timestamp) {
    const time = Number(timestamp) || 0;
    if (!time) return "";
    const diff = Date.now() - time;
    if (diff < 60000) return "just now";
    if (diff < 3600000) return Math.floor(diff / 60000) + "m ago";
    if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago";
    if (diff < 7 * 86400000) return Math.floor(diff / 86400000) + "d ago";
    return new Date(time).toLocaleDateString([], { month: "short", day: "numeric" });
  }

  async function updateStorage() {
    let used = 0;
    try {
      const raw = localStorage.getItem(STATE_KEY) || "";
      used = new Blob([raw]).size;
    } catch {
      used = 0;
    }
    let quota = 0;
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        quota = estimate.quota || 0;
        used = Math.max(used, estimate.usage || 0);
      }
    } catch {}
    dom.storageUse.textContent = formatBytes(used);
    const pct = quota ? Math.min(100, Math.max(used > 0 ? 2 : 0, (used / quota) * 100)) : used > 0 ? 2 : 0;
    dom.storageBar.style.width = pct + "%";
  }

  function normalizeModel(raw) {
    const id = String(raw.id || "");
    const pricing = raw.pricing || {};
    const prompt = Number(pricing.prompt);
    const completion = Number(pricing.completion);
    const free =
      (Number.isFinite(prompt) && prompt === 0 && Number.isFinite(completion) && completion === 0) ||
      /:free$/i.test(id);
    const architecture = raw.architecture || {};
    const output = Array.isArray(architecture.output_modalities) ? architecture.output_modalities : [];
    const input = Array.isArray(architecture.input_modalities) ? architecture.input_modalities : [];
    const chat = output.length ? output.every((modality) => modality === "text") && (!input.length || input.includes("text")) : true;
    return {
      id,
      name: raw.name || id,
      description: raw.description || "",
      context: Number(raw.context_length || raw.top_provider?.context_length || 0),
      free,
      chat,
    };
  }

  function fallbackModels() {
    return FALLBACK_MODELS.map((model) => ({ ...model }));
  }

  async function loadModels(force = false) {
    if (!force) {
      const cached = readJSON(MODELS_KEY, null);
      if (cached && Array.isArray(cached.models) && Date.now() - cached.at < MODELS_TTL) {
        models = cached.models;
        if (models.length) return models;
      }
    }
    try {
      const response = await fetch(API + "/models", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const payload = await response.json();
      const list = Array.isArray(payload.data) ? payload.data.map(normalizeModel).filter((model) => model.id) : [];
      if (!list.length) throw new Error("Empty model list");
      models = list.sort((a, b) => {
        if (a.free !== b.free) return a.free ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      writeJSON(MODELS_KEY, { at: Date.now(), models });
      return models;
    } catch (error) {
      if (!models.length) {
        const cached = readJSON(MODELS_KEY, null);
        models = cached && Array.isArray(cached.models) && cached.models.length ? cached.models : fallbackModels();
      }
      return models;
    }
  }

  function pickDefaultModel() {
    const usable = models.filter((model) => model.chat !== false);
    const free = usable.filter((model) => model.free);
    const pool = free.length ? free : usable;
    const router = pool.find((model) => model.id === "openrouter/free");
    if (router) return router;
    for (const needle of PREFERRED_FREE) {
      const hit = pool.find((model) => model.id.toLowerCase().includes(needle));
      if (hit) return hit;
    }
    const codey = pool.find((model) => CODE_HINTS.some((hint) => (model.id + " " + model.name).toLowerCase().includes(hint)));
    if (codey) return codey;
    return pool.slice().sort((a, b) => b.context - a.context)[0] || null;
  }

  function ensureModel() {
    if (state.settings.model && getModel(state.settings.model)) return state.settings.model;
    if (state.settings.model && !models.length) return state.settings.model;
    const picked = pickDefaultModel();
    if (picked) {
      state.settings.model = picked.id;
      return picked.id;
    }
    return state.settings.model || null;
  }

  function candidateModels(preferred) {
    const out = [];
    const add = (id) => {
      if (id && !out.includes(id)) out.push(id);
    };
    add(preferred);
    add("openrouter/free");
    const free = models.filter((model) => model.free && model.chat !== false);
    for (const needle of PREFERRED_FREE) {
      const hit = free.find((model) => model.id.toLowerCase().includes(needle));
      if (hit) add(hit.id);
    }
    const sorted = free.slice().sort((a, b) => b.context - a.context);
    for (const model of sorted) add(model.id);
    for (const model of FALLBACK_MODELS) add(model.id);
    return out.slice(0, 4);
  }

  function buildSystem(agentKey) {
    const agent = agentFor(agentKey);
    const parts = [agent.system];
    const skills = enabledSkills();
    if (skills.length) {
      parts.push(
        "Apply these enabled skills for this conversation: " +
          skills.map((skill) => `${skill.label} — ${skill.prompt}`).join(" ")
      );
    }
    parts.push("You are responding inside a browser workspace. The user can copy code, edit local files, and run a simulated local shell, but you cannot execute code yourself unless they paste output.");
    return parts.join("\n\n");
  }

  function updateAgentTheme() {
    const agent = agentFor(state.settings.agent);
    document.documentElement.style.setProperty("--agent-accent", agent.accent);
    document.documentElement.style.setProperty("--agent-rgb", agent.rgb);
  }

  function renderHeader() {
    const model = getModel(currentModelId());
    dom.modelName.textContent = model ? modelLabel(model) : currentModelId() ? currentModelId().split("/").pop() : "Choose a model";
    const badge = dom.modelBtn.querySelector(".free-badge");
    if (badge) badge.hidden = !(model && model.free);
    dom.modelHint.textContent = model ? (model.free ? "Free" : "Paid") + " · " + modelLabel(model) : "No model selected";
    dom.settingsModelName.textContent = model ? modelLabel(model) : "Not selected";

    const agent = agentFor(state.settings.agent);
    dom.agentName.textContent = agent.label;
    dom.agentDot.style.background = agent.accent;
    dom.agentDot.style.boxShadow = "0 0 8px rgba(" + agent.rgb + ", 0.55)";
    dom.modeHint.textContent = agent.label;
    dom.modeHint.style.color = agent.accent;
    dom.input.placeholder = agent.placeholder;
    dom.welcomeAgent.textContent = agent.label + " · free models";

    const skills = enabledSkills();
    dom.skillSep.hidden = !skills.length;
    dom.skillHint.hidden = !skills.length;
    dom.skillHint.textContent = skills.length === 1 ? skills[0].label : skills.length + " skills";
    dom.skillHint.title = skills.map((skill) => skill.label).join(", ");
  }

  function renderConnection() {
    const hasKey = Boolean(state.apiKey);
    const invalid = state.keyInfo && state.keyInfo.invalid;
    dom.statusDot.className = "status-dot" + (hasKey ? (invalid ? " error" : " online") : "");
    if (!hasKey) {
      dom.accountTitle.textContent = "Connect OpenRouter";
      dom.accountSub.textContent = "Bring your own key";
    } else if (invalid) {
      dom.accountTitle.textContent = "Key needs attention";
      dom.accountSub.textContent = "Open settings to reconnect";
    } else {
      dom.accountTitle.textContent = state.keyInfo?.label || "OpenRouter connected";
      const usage = state.keyInfo?.usage;
      const limit = state.keyInfo?.limit;
      if (typeof limit === "number" && limit > 0) {
        dom.accountSub.textContent = "$" + Number(usage || 0).toFixed(2) + " of $" + Number(limit).toFixed(2) + " used";
      } else if (typeof usage === "number" && usage > 0) {
        dom.accountSub.textContent = "$" + usage.toFixed(2) + " used · key saved locally";
      } else {
        dom.accountSub.textContent = "Free tier · key saved locally";
      }
    }
    dom.connectBtnText.textContent = hasKey ? "OpenRouter connected" : "Connect OpenRouter key";
    dom.dashEyebrow.classList.toggle("online", hasKey && !invalid);
    dom.dashEyebrowText.textContent = !hasKey
      ? "OpenForge OS · bring your own OpenRouter key"
      : invalid
        ? "OpenRouter key needs attention"
        : "OpenRouter connected · free models ready";
    dom.privacyNote.textContent = hasKey ? "Key never leaves this browser except to OpenRouter" : "Chats stay in this browser";
    renderChatAlert();
  }

  function renderChatAlert() {
    if (!state.apiKey) {
      dom.chatAlert.hidden = false;
      dom.chatAlert.className = "chat-alert";
      dom.chatAlert.innerHTML =
        ICONS.info +
        "<span>Connect your OpenRouter key to start. Free models also require Model Training + Logging in OpenRouter privacy settings.</span>" +
        '<button class="text-btn" type="button" data-open-settings>Open settings</button>';
      return;
    }
    if (state.keyInfo && state.keyInfo.invalid) {
      dom.chatAlert.hidden = false;
      dom.chatAlert.className = "chat-alert bad";
      dom.chatAlert.innerHTML =
        ICONS.alert +
        "<span>OpenRouter rejected your key. Paste a valid key, then test the model.</span>" +
        '<button class="text-btn" type="button" data-open-settings>Fix key</button>';
      return;
    }
    dom.chatAlert.hidden = true;
    dom.chatAlert.className = "chat-alert";
    dom.chatAlert.innerHTML = "";
  }

  function renderSidebar() {
    const query = dom.chatSearch.value.trim().toLowerCase();
    const chats = state.chats.filter((chat) => {
      if (!query) return true;
      const haystack = (chat.title + " " + (chat.model || "") + " " + (chat.agent || "")).toLowerCase();
      return haystack.includes(query);
    });
    chats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    dom.sessionCount.textContent = String(chats.length);
    renderBadges();
    if (!chats.length) {
      dom.chatList.innerHTML =
        '<div class="chat-empty">' +
        (state.chats.length ? "No chats match “" + escapeHtml(dom.chatSearch.value.trim()) + "”." : "No chats yet. Start one above — it will stay in this browser.") +
        "</div>";
      return;
    }
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const groups = [
      { label: "Today", min: startOfToday, max: Infinity },
      { label: "Yesterday", min: startOfToday - 86400000, max: startOfToday },
      { label: "Previous 7 days", min: startOfToday - 7 * 86400000, max: startOfToday - 86400000 },
      { label: "Older", min: 0, max: startOfToday - 7 * 86400000 },
    ];
    let html = "";
    for (const group of groups) {
      const items = chats.filter((chat) => {
        const time = chat.updatedAt || chat.createdAt || 0;
        return time >= group.min && time < group.max;
      });
      if (!items.length) continue;
      html += '<div class="chat-group-label">' + group.label + "</div>";
      for (const chat of items) {
        const active = chat.id === state.activeChatId ? " active" : "";
        const agent = agentFor(chat.agent);
        html +=
          '<div class="chat-item' + active + '" data-chat-id="' + escapeHtml(chat.id) + '" role="button" tabindex="0" aria-label="' + escapeHtml(chat.title) + '" style="--agent:' + agent.accent + '">' +
          ICONS.chat +
          '<span class="chat-title">' + escapeHtml(chat.title || "New chat") + "</span>" +
          '<button class="chat-del" data-delete-id="' + escapeHtml(chat.id) + '" aria-label="Delete chat" title="Delete chat">' + ICONS.trash + "</button>" +
          "</div>";
      }
    }
    dom.chatList.innerHTML = html;
  }

  function renderBadges() {
    const count = state.chats.length;
    dom.navChatCount.hidden = count === 0;
    dom.navChatCount.textContent = String(count);
    const skills = state.settings.skills.length;
    dom.navSkillCount.hidden = skills === 0;
    dom.navSkillCount.textContent = String(skills);
  }

  function renderDashboard() {
    const totalMessages = state.chats.reduce((sum, chat) => sum + (chat.messages?.length || 0), 0);
    const freeCount = models.filter((model) => model.free && model.chat !== false).length;
    const skills = enabledSkills();
    const stats = [
      ["Chats", formatNumber(state.chats.length), "saved locally"],
      ["Messages", formatNumber(totalMessages), "in this browser"],
      ["Skills on", formatNumber(skills.length), "of " + SKILLS.length + " available"],
      ["Free models", freeCount ? formatNumber(freeCount) : "—", "via OpenRouter"],
    ];
    dom.statRow.innerHTML = stats
      .map(
        ([label, value, sub]) =>
          '<div class="stat-card"><span>' + escapeHtml(label) + "</span><strong>" + escapeHtml(value) + "</strong><small>" + escapeHtml(sub) + "</small></div>"
      )
      .join("");

    dom.agentGrid.innerHTML = Object.entries(AGENTS)
      .map(([key, agent]) => {
        const active = state.settings.agent === key;
        return (
          '<button class="agent-card' + (active ? " active" : "") + '" data-agent="' + key + '" style="--agent:' + agent.accent + ";--agent-rgb:" + agent.rgb + '" aria-pressed="' + active + '">' +
          '<span class="agent-avatar">' + escapeHtml(agent.avatar) + "</span>" +
          '<span class="agent-card-copy"><strong>' + escapeHtml(agent.label) + "</strong><span>" + escapeHtml(agent.blurb) + "</span></span>" +
          '<span class="agent-card-state">' + (active ? "Active" : "Use") + "</span>" +
          "</button>"
        );
      })
      .join("");

    dom.dashSkills.innerHTML = SKILLS.map((skill) => {
      const on = state.settings.skills.includes(skill.id);
      return (
        '<button class="skill-pill' + (on ? " on" : "") + '" data-skill="' + skill.id + '" aria-pressed="' + on + '">' +
        '<span class="tag">' + skill.tag + "</span>" + escapeHtml(skill.label) +
        "</button>"
      );
    }).join("");

    const recent = state.chats.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 4);
    if (!recent.length) {
      dom.dashRecent.innerHTML = '<div class="empty-state">No sessions yet. Start a chat and it will show up here.</div>';
    } else {
      dom.dashRecent.innerHTML = recent
        .map((chat) => {
          const agent = agentFor(chat.agent);
          return (
            '<button class="recent-item" data-open-chat="' + escapeHtml(chat.id) + '" style="--agent:' + agent.accent + '">' +
            '<span class="recent-dot"></span>' +
            '<span class="recent-copy"><strong>' + escapeHtml(chat.title || "New chat") + "</strong><span>" + escapeHtml(agent.label) + " · " + (chat.messages?.length || 0) + " messages</span></span>" +
            '<span class="recent-time">' + escapeHtml(timeAgo(chat.updatedAt)) + "</span>" +
            "</button>"
          );
        })
        .join("");
    }

    const agent = agentFor(state.settings.agent);
    const model = getModel(currentModelId());
    dom.systemCard.innerHTML =
      '<div class="system-copy"><span class="panel-kicker">System</span><strong>' +
      (state.apiKey ? (state.keyInfo?.invalid ? "OpenRouter key needs attention" : "OpenRouter connected") : "No API key connected") +
      "</strong><p>" +
      (state.apiKey
        ? (state.keyInfo?.invalid ? "Update the key in Settings and rerun the model test." : "Requests go directly from this browser to OpenRouter. No server in the middle.")
        : "Add a key to run agents. Free models also need Model Training + Logging enabled in OpenRouter privacy settings.") +
      "</p></div>" +
      '<div class="system-grid">' +
      "<div><span>Agent</span><strong>" + escapeHtml(agent.label) + "</strong></div>" +
      "<div><span>Model</span><strong>" + escapeHtml(model ? modelLabel(model) : "Not selected") + "</strong></div>" +
      "<div><span>Skills</span><strong>" + state.settings.skills.length + " on</strong></div>" +
      "<div><span>Storage</span><strong>" + escapeHtml(dom.storageUse.textContent) + "</strong></div>" +
      "</div>" +
      '<div class="system-actions"><button class="ghost-btn small" type="button" data-open-settings>Open settings</button></div>';
  }

  function renderSkills() {
    dom.skillSummary.textContent = state.settings.skills.length + " of " + SKILLS.length + " skills enabled · added to every new request";
    dom.skillsDisable.disabled = state.settings.skills.length === 0;
    dom.skillsGrid.innerHTML = SKILLS.map((skill) => {
      const on = state.settings.skills.includes(skill.id);
      return (
        '<button class="skill-card' + (on ? " on" : "") + '" data-skill="' + skill.id + '" aria-pressed="' + on + '">' +
        '<span class="skill-tag">' + skill.tag + "</span>" +
        '<span class="skill-copy"><strong>' + escapeHtml(skill.label) + "</strong><p>" + escapeHtml(skill.desc) + "</p></span>" +
        '<span class="skill-toggle">' + (on ? "On" : "Off") + "</span>" +
        "</button>"
      );
    }).join("");
    renderBadges();
  }

  function fileTag(name) {
    const ext = String(name).split(".").pop().toLowerCase();
    const map = { js: "JS", mjs: "JS", cjs: "JS", ts: "TS", tsx: "TSX", jsx: "JSX", json: "{}", md: "MD", css: "CSS", scss: "SC", html: "HTML", py: "PY", rb: "RB", go: "GO", rs: "RS", sh: "SH", yml: "YML", yaml: "YML", txt: "TXT", env: "ENV" };
    return map[ext] || "TXT";
  }

  function renderWorkspace() {
    const names = Object.keys(state.files).sort((a, b) => a.localeCompare(b));
    if (!names.length) {
      state.activeFile = null;
    } else if (!names.includes(state.activeFile)) {
      state.activeFile = names[0];
    }
    if (!names.length) {
      dom.fileList.innerHTML = '<div class="empty-state">No files yet. Create one with +.</div>';
    } else {
      dom.fileList.innerHTML = names
        .map((name) => {
          const active = name === state.activeFile;
          const size = new Blob([state.files[name] || ""]).size;
          return (
            '<button class="file-item' + (active ? " active" : "") + '" data-file="' + escapeHtml(name) + '">' +
            '<span class="file-icon">' + escapeHtml(fileTag(name)) + "</span>" +
            '<span class="file-name">' + escapeHtml(name) + "</span>" +
            '<span class="file-size">' + escapeHtml(formatBytes(size)) + "</span>" +
            "</button>"
          );
        })
        .join("");
    }
    const active = state.activeFile;
    const hasFile = Boolean(active);
    dom.editorName.textContent = hasFile ? active : "No file selected";
    dom.fileIcon.textContent = hasFile ? fileTag(active) : "—";
    dom.fileEditor.disabled = !hasFile;
    dom.askFileBtn.disabled = !hasFile;
    dom.deleteFileBtn.disabled = !hasFile;
    if (hasFile && (editorFile !== active || document.activeElement !== dom.fileEditor)) {
      dom.fileEditor.value = state.files[active] || "";
      editorFile = active;
    }
    if (!hasFile && document.activeElement !== dom.fileEditor) {
      dom.fileEditor.value = "";
      editorFile = null;
    }
    updateEditorStats();
  }

  function updateEditorStats() {
    const text = dom.fileEditor.value || "";
    const lines = text ? text.split("\n").length : 0;
    dom.editorStats.textContent = lines + " lines · " + text.length + " chars";
  }

  function renderTerminal() {
    dom.termOutput.innerHTML = termLines
      .map((line) => '<div class="term-line ' + (line.cls || "term-out") + '">' + escapeHtml(line.text) + "</div>")
      .join("");
    dom.termOutput.scrollTop = dom.termOutput.scrollHeight;
  }

  function writeTerm(text, cls = "term-out") {
    termLines.push({ text, cls });
    renderTerminal();
  }

  function resetTerminal() {
    termLines = [];
    writeTerm("OpenForge shell v2.0 — browser workspace. No remote execution.", "term-dim");
    writeTerm('Type "help" to see available commands.', "term-dim");
    writeTerm("", "term-out");
  }

  function renderWelcome() {
    const chat = getChat();
    const show = !chat || !chat.messages.length;
    dom.welcome.hidden = !show;
    if (show) dom.messages.innerHTML = "";
  }

  function reasoningHtml(message) {
    if (!message.reasoning) return "";
    return (
      '<details class="reasoning"' + (message.streaming ? " open" : "") + ">" +
      "<summary>Reasoning · " + escapeHtml(String(message.reasoning.length)) + " chars</summary>" +
      '<div class="reasoning-body">' + escapeHtml(message.reasoning) + "</div>" +
      "</details>"
    );
  }

  function footHtml(message) {
    if (message.streaming) {
      return message.content ? "<span>Generating…</span>" : "";
    }
    const parts = [];
    if (message.usage && Number(message.usage.total_tokens)) parts.push(formatNumber(message.usage.total_tokens) + " tokens");
    if (message.ms) parts.push((message.ms / 1000).toFixed(1) + "s");
    if (message.stopped) parts.push("Stopped");
    if (message.finishReason === "length") parts.push('<span class="warn">Hit the length limit</span>');
    if (message.error) parts.push('<span class="warn">Request failed</span>');
    return parts.join(" · ");
  }

  function errorLinks(message) {
    let links = "";
    if (/settings\/privacy/i.test(message)) {
      links += '<a href="' + PRIVACY_URL + '" target="_blank" rel="noopener noreferrer">Open privacy settings ↗</a>';
    }
    if (/openrouter\.ai\/keys|rejected|invalid/i.test(message)) {
      links += '<a href="' + KEYS_URL + '" target="_blank" rel="noopener noreferrer">Check API keys ↗</a>';
    }
    return links ? '<div class="error-links">' + links + "</div>" : "";
  }

  function errorCard(message, retryId) {
    return (
      '<div class="error-card">' + ICONS.alert +
      "<div><strong>Couldn't get a response</strong><div>" + escapeHtml(message) + "</div>" +
      errorLinks(message) +
      (retryId ? '<button class="text-btn" data-retry="' + escapeHtml(retryId) + '">Try again</button>' : "") +
      "</div></div>"
    );
  }

  function messageBodyHtml(message, retryId) {
    let html = "";
    if (message.error) html += errorCard(message.error, retryId);
    if (message.content) {
      html += '<div class="md">' + renderMarkdown(message.content) + "</div>";
    } else if (message.streaming && !message.error) {
      html += '<div class="typing"><i></i><i></i><i></i></div>';
    } else if (!message.error) {
      html += '<div class="md"><p><em>No response.</em></p></div>';
    }
    return html;
  }

  function messageHtml(message, chat, canRetry) {
    const isUser = message.role === "user";
    const agent = agentFor(message.agent || chat.agent);
    const model = getModel(message.model || chat.model);
    const author = isUser ? "You" : agent.label;
    const avatar = isUser ? "Y" : agent.avatar;
    const time = message.createdAt ? new Date(message.createdAt) : null;
    const meta = [
      !isUser && model ? '<span class="model-chip" title="' + escapeHtml(model.id) + '">' + escapeHtml(chipLabel(model)) + "</span>" : "",
      time ? '<span class="model-chip" title="' + escapeHtml(time.toLocaleString()) + '">' + time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + "</span>" : "",
    ].join("");
    return (
      '<article class="msg ' + (isUser ? "user" : "assistant") + (message.streaming ? " streaming" : "") + '" data-msg-id="' + escapeHtml(message.id) + '" style="--agent:' + agent.accent + ";--agent-rgb:" + agent.rgb + '">' +
      '<div class="avatar">' + escapeHtml(avatar) + "</div>" +
      '<div class="msg-main">' +
      '<div class="msg-head"><strong>' + escapeHtml(author) + "</strong>" + meta +
      '<div class="msg-actions">' +
      (message.content || message.error
        ? '<button class="msg-action" data-copy-msg="' + escapeHtml(message.id) + '" title="Copy message" aria-label="Copy message">' + ICONS.copy + "</button>"
        : "") +
      (canRetry ? '<button class="msg-action" data-retry="' + escapeHtml(message.id) + '" title="Regenerate response" aria-label="Regenerate response">' + ICONS.retry + "</button>" : "") +
      "</div></div>" +
      '<div class="reasoning-slot">' + reasoningHtml(message) + "</div>" +
      '<div class="md-slot">' + messageBodyHtml(message, canRetry ? message.id : "") + "</div>" +
      '<div class="foot-slot">' + footHtml(message) + "</div>" +
      "</div></article>"
    );
  }

  function renderMessages() {
    const chat = getChat();
    renderWelcome();
    if (!chat || !chat.messages.length) {
      dom.messages.innerHTML = "";
      return;
    }
    let lastAssistant = -1;
    chat.messages.forEach((message, index) => {
      if (message.role === "assistant") lastAssistant = index;
    });
    dom.messages.innerHTML = chat.messages
      .map((message, index) => messageHtml(message, chat, index === lastAssistant && !message.streaming))
      .join("");
  }

  function paintMessage(message, chat) {
    if (state.view !== "chat" || state.activeChatId !== chat.id) return;
    const element = dom.messages.querySelector('[data-msg-id="' + message.id + '"]');
    if (!element) return;
    const stick = nearBottom();
    element.classList.toggle("streaming", Boolean(message.streaming));
    element.querySelector(".reasoning-slot").innerHTML = reasoningHtml(message);
    element.querySelector(".md-slot").innerHTML = messageBodyHtml(message, message.error ? message.id : "");
    element.querySelector(".foot-slot").innerHTML = footHtml(message);
    if (stick) dom.chatScroll.scrollTop = dom.chatScroll.scrollHeight;
  }

  function renderAll() {
    const chat = getChat();
    if (chat && chat.model) state.settings.model = chat.model;
    if (chat && chat.agent) state.settings.agent = chat.agent;
    updateAgentTheme();
    renderHeader();
    renderConnection();
    renderSidebar();
    renderDashboard();
    renderSkills();
    renderWorkspace();
    renderMessages();
    updateComposer();
    renderSettingsStats();
    updateStorage();
  }

  function renderSettingsStats() {
    const totalMessages = state.chats.reduce((sum, chat) => sum + (chat.messages?.length || 0), 0);
    dom.chatStats.textContent = state.chats.length
      ? state.chats.length + " chat" + (state.chats.length === 1 ? "" : "s") + " · " + totalMessages + " message" + (totalMessages === 1 ? "" : "s")
      : "No chats yet.";
    dom.freeOnlySetting.checked = Boolean(state.settings.freeOnly);
    dom.freeOnly.checked = Boolean(state.settings.freeOnly);
  }

  function updateComposer() {
    const busy = isStreaming();
    dom.sendBtn.disabled = busy || !dom.input.value.trim();
    dom.stopBtn.hidden = !busy;
    dom.input.disabled = false;
  }

  function nearBottom() {
    const el = dom.chatScroll;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
  }

  function scrollToBottom(force = false) {
    if (force || nearBottom()) {
      requestAnimationFrame(() => {
        dom.chatScroll.scrollTop = dom.chatScroll.scrollHeight;
      });
    }
  }

  function autoResize() {
    dom.input.style.height = "auto";
    dom.input.style.height = Math.min(dom.input.scrollHeight, 210) + "px";
  }

  function titleFrom(text) {
    const cleaned = text.replace(/[#*`>_~\[\]\(\)]/g, " ").replace(/\s+/g, " ").trim();
    return cleaned.length > 48 ? cleaned.slice(0, 47).trimEnd() + "…" : cleaned || "New chat";
  }

  function showView(name, options = {}) {
    const view = VIEW_META[name] ? name : "dashboard";
    state.view = view;
    dom.panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === view));
    dom.navItems.forEach((item) => {
      const active = item.dataset.view === view;
      item.classList.toggle("active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    const meta = VIEW_META[view];
    dom.viewTitle.textContent = meta[0];
    dom.viewSub.textContent = meta[1];
    document.title = "OpenForge OS — " + meta[0];
    if (view !== "chat") closeSidebar();
    if (view === "chat") {
      renderMessages();
      if (getChat()) scrollToBottom(true);
      else dom.chatScroll.scrollTop = 0;
      if (options.focus) setTimeout(() => dom.input.focus(), 20);
    }
    if (view === "workspace") renderWorkspace();
    if (view === "terminal") setTimeout(() => dom.termInput.focus(), 20);
    scheduleSave();
  }

  function createChat() {
    const current = getChat();
    if (current && !current.messages.length) {
      current.agent = state.settings.agent;
      if (!current.model) current.model = state.settings.model;
      current.updatedAt = Date.now();
      save();
      renderAll();
      return current;
    }
    const chat = {
      id: uid(),
      title: "New chat",
      agent: state.settings.agent,
      model: state.settings.model,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    state.chats.unshift(chat);
    state.activeChatId = chat.id;
    save();
    renderAll();
    return chat;
  }

  function selectChat(id) {
    if (activeStream && activeStream.chatId !== id) stopGeneration();
    const chat = state.chats.find((item) => item.id === id);
    if (!chat) return;
    state.activeChatId = chat.id;
    state.settings.agent = chat.agent || state.settings.agent;
    if (chat.model) state.settings.model = chat.model;
    save();
    renderAll();
    showView("chat");
    closeSidebar();
    scrollToBottom(true);
    dom.input.focus();
  }

  function deleteChat(id) {
    if (activeStream && activeStream.chatId === id) stopGeneration();
    const index = state.chats.findIndex((chat) => chat.id === id);
    if (index < 0) return;
    const [removed] = state.chats.splice(index, 1);
    if (state.activeChatId === id) {
      state.activeChatId = state.chats[index]?.id || state.chats[index - 1]?.id || null;
      const next = getChat();
      if (next) {
        state.settings.agent = next.agent || state.settings.agent;
        if (next.model) state.settings.model = next.model;
      }
    }
    save();
    renderAll();
    toast("Deleted “" + (removed.title || "chat") + "”.", "info");
  }

  function setAgent(agentKey) {
    if (!AGENTS[agentKey]) return;
    if (isStreaming()) {
      toast("Stop the current response before switching agents.", "info");
      return;
    }
    const chat = getChat();
    state.settings.agent = agentKey;
    if (chat && !chat.messages.length) {
      chat.agent = agentKey;
      chat.updatedAt = Date.now();
      save();
      renderAll();
    } else if (chat && chat.messages.length) {
      createChat();
    } else {
      save();
      renderAll();
    }
    dom.input.focus();
  }

  function toggleSkill(id) {
    if (!SKILL_MAP.has(id)) return;
    const set = new Set(state.settings.skills);
    if (set.has(id)) {
      set.delete(id);
      toast("Skill disabled: " + SKILL_MAP.get(id).label, "info", 2400);
    } else {
      set.add(id);
      toast("Skill enabled: " + SKILL_MAP.get(id).label, "ok", 2400);
    }
    state.settings.skills = Array.from(set);
    save();
    renderAll();
  }

  function selectModel(id) {
    if (isStreaming()) {
      toast("Stop the current response before switching models.", "info");
      return;
    }
    const model = getModel(id);
    if (!model) return;
    state.settings.model = model.id;
    const chat = getChat();
    if (chat) {
      chat.model = model.id;
      chat.updatedAt = Date.now();
    }
    save();
    renderAll();
    closeModelPopover();
    if (!state.apiKey) toast("Model selected. Connect your OpenRouter key to send messages.", "info");
  }

  function renderModelList() {
    const freeOnly = Boolean(state.settings.freeOnly);
    const query = dom.modelSearch.value.trim().toLowerCase();
    const selected = currentModelId();
    const list = models
      .filter((model) => model.chat !== false)
      .filter((model) => !freeOnly || model.free)
      .filter((model) => !query || (model.name + " " + model.id).toLowerCase().includes(query))
      .slice(0, 300);
    dom.freeOnly.checked = freeOnly;
    dom.modelCount.textContent =
      list.length + " model" + (list.length === 1 ? "" : "s") + (freeOnly ? " · free tier" : " · all models");
    if (!list.length) {
      dom.modelList.innerHTML = '<div class="model-empty">No models match.<br />Try clearing the search' + (freeOnly ? " or turning off “Free only”" : "") + ".</div>";
      return;
    }
    dom.modelList.innerHTML = list
      .map((model) => {
        const isSelected = model.id === selected;
        const ctx = model.context ? Math.round(model.context / 1000) + "K ctx" : "";
        return (
          '<button class="model-item' + (isSelected ? " selected" : "") + '" data-model-id="' + escapeHtml(model.id) + '">' +
          '<div class="model-copy"><strong>' + escapeHtml(modelLabel(model)) + "</strong><span>" + escapeHtml(model.id) + (ctx ? " · " + ctx : "") + "</span></div>" +
          (model.free ? '<span class="free-badge">FREE</span>' : "") +
          (isSelected ? '<span class="model-check">' + ICONS.check + "</span>" : "") +
          "</button>"
        );
      })
      .join("");
  }

  function positionPopover(popover, button) {
    const rect = button.getBoundingClientRect();
    popover.style.top = Math.max(10, rect.bottom + 8) + "px";
    if (window.innerWidth > 640) {
      popover.style.right = Math.max(10, window.innerWidth - rect.right) + "px";
      popover.style.left = "auto";
    } else {
      popover.style.left = "12px";
      popover.style.right = "12px";
    }
  }

  function openModelPopover() {
    if (isStreaming()) {
      toast("Stop the current response first.", "info");
      return;
    }
    closeAgentPopover();
    ensureModel();
    renderHeader();
    dom.modelSearch.value = "";
    renderModelList();
    dom.modelPopover.hidden = false;
    dom.modelBtn.setAttribute("aria-expanded", "true");
    positionPopover(dom.modelPopover, dom.modelBtn);
    setTimeout(() => dom.modelSearch.focus(), 20);
  }

  function closeModelPopover() {
    dom.modelPopover.hidden = true;
    dom.modelBtn.setAttribute("aria-expanded", "false");
  }

  function renderAgentList() {
    dom.agentList.innerHTML = Object.entries(AGENTS)
      .map(([key, agent]) => {
        const active = state.settings.agent === key;
        return (
          '<button class="agent-option' + (active ? " active" : "") + '" data-agent-pick="' + key + '" style="--agent:' + agent.accent + ";--agent-rgb:" + agent.rgb + '">' +
          '<span class="agent-option-avatar">' + escapeHtml(agent.avatar) + "</span>" +
          '<span class="agent-option-copy"><strong>' + escapeHtml(agent.label) + "</strong><span>" + escapeHtml(agent.blurb) + "</span></span>" +
          '<span class="agent-option-state">' + (active ? "Active" : "") + "</span>" +
          "</button>"
        );
      })
      .join("");
  }

  function openAgentPopover() {
    if (isStreaming()) {
      toast("Stop the current response first.", "info");
      return;
    }
    closeModelPopover();
    renderAgentList();
    dom.agentPopover.hidden = false;
    dom.agentBtn.setAttribute("aria-expanded", "true");
    positionPopover(dom.agentPopover, dom.agentBtn);
  }

  function closeAgentPopover() {
    dom.agentPopover.hidden = true;
    dom.agentBtn.setAttribute("aria-expanded", "false");
  }

  function openSettings() {
    closeModelPopover();
    closeAgentPopover();
    dom.apiKeyInput.value = state.apiKey || "";
    dom.apiKeyInput.type = "password";
    dom.revealKey.setAttribute("aria-label", "Show API key");
    dom.freeOnlySetting.checked = Boolean(state.settings.freeOnly);
    dom.settingsModelName.textContent = getModel(currentModelId()) ? modelLabel(getModel(currentModelId())) : "Not selected";
    renderSettingsStats();
    dom.testResult.hidden = true;
    dom.testResult.className = "key-status";
    dom.testResult.innerHTML = "";
    if (state.keyInfo && state.apiKey) {
      setKeyStatus("ok", state.keyInfo.invalid ? "This key was rejected by OpenRouter. Paste a valid key." : "Connected as " + (state.keyInfo.label || "OpenRouter key") + ".", state.keyInfo.invalid);
    } else {
      setKeyStatus("", "", false);
    }
    dom.settingsModal.hidden = false;
    setTimeout(() => dom.apiKeyInput.focus(), 40);
  }

  function closeSettings() {
    dom.settingsModal.hidden = true;
  }

  function setKeyStatus(type, message, forceHide = false, target = dom.keyStatus) {
    if (!type || forceHide) {
      target.hidden = true;
      target.className = "key-status";
      target.innerHTML = "";
      return;
    }
    target.hidden = false;
    target.className = "key-status " + type;
    let link = "";
    if (/settings\/privacy/i.test(message)) {
      link = ' <a href="' + PRIVACY_URL + '" target="_blank" rel="noopener noreferrer">Open privacy settings ↗</a>';
    } else if (/openrouter\.ai\/keys/i.test(message)) {
      link = ' <a href="' + KEYS_URL + '" target="_blank" rel="noopener noreferrer">Check API keys ↗</a>';
    }
    target.innerHTML = (type === "ok" ? ICONS.check : ICONS.alert) + "<span>" + escapeHtml(message) + link + "</span>";
  }

  function openSidebar() {
    dom.sidebar.classList.add("open");
    dom.backdrop.hidden = false;
  }

  function closeSidebar() {
    dom.sidebar.classList.remove("open");
    dom.backdrop.hidden = true;
  }

  function toast(message, type = "info", duration = 4200) {
    const icons = { ok: ICONS.check, bad: ICONS.alert, info: ICONS.info };
    const element = document.createElement("div");
    element.className = "toast " + type;
    element.innerHTML = (icons[type] || ICONS.info) + "<span>" + escapeHtml(message) + "</span>";
    dom.toasts.appendChild(element);
    setTimeout(() => {
      element.classList.add("out");
      setTimeout(() => element.remove(), 220);
    }, duration);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const area = document.createElement("textarea");
        area.value = text;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand("copy");
        area.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  function isPrivacyError(text) {
    return /data policy|free model publication|model training|zdr|privacy settings/i.test(String(text || ""));
  }

  function friendlyError(error) {
    const raw = String((error && error.message) || error || "Unknown error");
    const status = error && error.status;
    if (isPrivacyError(raw)) {
      return "OpenRouter blocked this free model because of your privacy settings. Enable Model Training and Logging for API, turn ZDR-only off, then retry at openrouter.ai/settings/privacy. If it still fails, regenerate your key at openrouter.ai/keys.";
    }
    if (status === 401 || /401|invalid.*key|no auth|user not found/i.test(raw)) return "OpenRouter rejected this API key. Check it at openrouter.ai/keys and save it again in Settings.";
    if (status === 429 || /429|rate.?limit|too many requests/i.test(raw)) return "Rate limit reached for the free model pool. Wait a moment, enable OpenRouter credits for a higher daily limit, or pick another free model.";
    if (status === 402 || /402|credit|insufficient/i.test(raw)) return "This model requires credits on your OpenRouter account. Pick a model marked FREE or add credits.";
    if (status === 404 || /404|not found|no endpoints/i.test(raw)) return "That model has no available endpoints right now. Pick a different free model or use the Free Models Router.";
    if (/fetch|network|failed to load|load failed/i.test(raw)) return "Could not reach OpenRouter. Check your connection and try again.";
    return raw.length > 320 ? raw.slice(0, 317) + "…" : raw;
  }

  function parseChunk(chunk, message) {
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (json.error) {
        const detail = json.error.message || json.error.code || "OpenRouter returned an error.";
        const error = new Error(detail);
        if (json.error.code) error.code = json.error.code;
        throw error;
      }
      if (json.usage) message.usage = json.usage;
      const choice = json.choices && json.choices[0];
      if (!choice) continue;
      const delta = choice.delta || {};
      if (typeof delta.content === "string" && delta.content) message.content += delta.content;
      const reasoning = delta.reasoning ?? delta.reasoning_content;
      if (typeof reasoning === "string" && reasoning) message.reasoning += reasoning;
      if (choice.finish_reason) message.finishReason = choice.finish_reason;
    }
  }

  async function readStream(response, message) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let paintTimer = 0;
    let dirty = false;
    const paintSoon = () => {
      dirty = true;
      if (paintTimer) return;
      paintTimer = setTimeout(() => {
        paintTimer = 0;
        if (!dirty) return;
        dirty = false;
        const chat = state.chats.find((item) => item.id === activeStream?.chatId);
        if (chat) paintMessage(message, chat);
        scheduleSave();
      }, 55);
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (message.stopped) {
        try {
          await reader.cancel();
        } catch {}
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let index;
      while ((index = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        parseChunk(chunk, message);
        paintSoon();
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      parseChunk(buffer.replace(/\r\n/g, "\n"), message);
      paintSoon();
    }
    if (paintTimer) {
      clearTimeout(paintTimer);
      paintTimer = 0;
    }
    const chat = state.chats.find((item) => item.id === activeStream?.chatId);
    if (chat) paintMessage(message, chat);
  }

  function chatHeaders(stream) {
    return {
      Authorization: "Bearer " + state.apiKey,
      "Content-Type": "application/json",
      Accept: stream ? "text/event-stream" : "application/json",
      "HTTP-Referer": location.origin || "https://openforge.local",
      "X-Title": "OpenForge",
    };
  }

  async function httpError(response) {
    let payload = null;
    let text = "";
    try {
      payload = await response.json();
    } catch {
      try {
        text = await response.text();
      } catch {}
    }
    const detail = payload?.error?.message || payload?.message || text || "HTTP " + response.status + " from OpenRouter";
    const error = new Error(detail);
    error.status = response.status;
    error.code = payload?.error?.code || null;
    return error;
  }

  async function runNonStream(modelId, messages, message, signal) {
    const response = await fetch(API + "/chat/completions", {
      method: "POST",
      headers: chatHeaders(false),
      body: JSON.stringify({ model: modelId, messages, stream: false }),
      signal,
    });
    if (!response.ok) throw await httpError(response);
    const payload = await response.json();
    if (payload.error) {
      const error = new Error(payload.error.message || "OpenRouter returned an error.");
      if (payload.error.code) error.code = payload.error.code;
      throw error;
    }
    const choice = payload.choices && payload.choices[0];
    const content = choice?.message?.content;
    const reasoning = choice?.message?.reasoning ?? choice?.message?.reasoning_content;
    if (typeof content === "string") message.content += content;
    if (typeof reasoning === "string" && reasoning) message.reasoning += reasoning;
    if (payload.usage) message.usage = payload.usage;
    if (choice?.finish_reason) message.finishReason = choice.finish_reason;
  }

  async function runModel(modelId, messages, message, signal) {
    const response = await fetch(API + "/chat/completions", {
      method: "POST",
      headers: chatHeaders(true),
      body: JSON.stringify({ model: modelId, messages, stream: true }),
      signal,
    });
    if (!response.ok) throw await httpError(response);
    if (!response.body) {
      await runNonStream(modelId, messages, message, signal);
      return;
    }
    await readStream(response, message);
    if (!message.content && !message.reasoning && !message.stopped) {
      await runNonStream(modelId, messages, message, signal);
    }
  }

  async function streamAssistant(chat, userText) {
    if (!state.apiKey) {
      openSettings();
      return;
    }
    const requested = chat.model || state.settings.model || ensureModel();
    const candidates = candidateModels(requested);
    if (!candidates.length) {
      toast("No model available. Open the model picker and refresh.", "bad");
      return;
    }
    const agentKey = AGENTS[chat.agent] ? chat.agent : state.settings.agent;
    const controller = new AbortController();
    const message = {
      id: uid(),
      role: "assistant",
      content: "",
      reasoning: "",
      model: candidates[0],
      agent: agentKey,
      createdAt: Date.now(),
      streaming: true,
    };
    chat.messages.push(message);
    chat.updatedAt = Date.now();
    const startedAt = performance.now();
    activeStream = { controller, chatId: chat.id, msgId: message.id, stopped: false };
    renderAll();
    updateComposer();
    scrollToBottom(true);

    const history = chat.messages
      .filter((item) => item.id !== message.id)
      .filter((item) => item.role === "user" || (item.role === "assistant" && item.content && !item.error && !item.stopped))
      .map((item) => ({ role: item.role, content: item.content }));

    const messages = [{ role: "system", content: buildSystem(agentKey) }, ...history];
    let lastError = null;
    let usedFallback = false;

    for (const modelId of candidates) {
      if (controller.signal.aborted) break;
      if (modelId !== requested) usedFallback = true;
      message.model = modelId;
      chat.model = modelId;
      renderHeader();
      try {
        await runModel(modelId, messages, message, controller.signal);
        if (message.content || message.reasoning) break;
        lastError = new Error("The model returned an empty response. Try another free model.");
      } catch (error) {
        if (error.name === "AbortError") {
          message.stopped = true;
          break;
        }
        lastError = error;
        if (message.content) break;
        if (error.status === 401) {
          state.keyInfo = { ...(state.keyInfo || {}), invalid: true, checkedAt: Date.now() };
          renderConnection();
          break;
        }
        if (isPrivacyError(error.message)) break;
      }
    }

    message.streaming = false;
    message.ms = Math.round(performance.now() - startedAt);
    if (!message.stopped && !message.content && !message.reasoning) {
      message.error = friendlyError(lastError || new Error("No free model responded. Try again in a moment."));
      if (/rejected this API key/i.test(message.error)) toast("OpenRouter rejected your key. Update it in Settings.", "bad");
      if (isPrivacyError(message.error)) toast("Free models are blocked by your OpenRouter privacy settings.", "bad");
    } else if (usedFallback && !message.stopped) {
      const fallback = getModel(message.model);
      if (fallback) toast("Previous model was unavailable — replied with " + modelLabel(fallback) + ".", "info", 3200);
    }

    if (!chat.title || chat.title === "New chat") {
      chat.title = titleFrom(userText || chat.messages.find((item) => item.role === "user")?.content || "");
    }
    chat.updatedAt = Date.now();
    activeStream = null;
    save();
    renderAll();
    showView("chat");
    scrollToBottom();
    updateComposer();
    dom.input.focus();
  }

  function stopGeneration() {
    if (!activeStream) return;
    activeStream.stopped = true;
    const chat = state.chats.find((item) => item.id === activeStream.chatId);
    const message = chat && chat.messages.find((item) => item.id === activeStream.msgId);
    if (message) {
      message.stopped = true;
      message.streaming = false;
      paintMessage(message, chat);
    }
    activeStream.controller.abort();
  }

  async function handleSend(textOverride) {
    const text = String(textOverride ?? dom.input.value).trim();
    if (!text) return;
    if (isStreaming()) {
      toast("A response is still generating. Stop it or wait for it to finish.", "info");
      return;
    }
    if (!state.apiKey) {
      openSettings();
      toast("Connect your OpenRouter key to start.", "info");
      return;
    }
    if (!models.length) await loadModels();
    if (isStreaming()) return;
    ensureModel();
    showView("chat");
    const chat = getChat() || createChat();
    if (!chat.model) chat.model = state.settings.model;
    if (!chat.model) {
      toast("Choose a free model first.", "bad");
      openModelPopover();
      return;
    }
    if (!chat.messages.length) {
      chat.agent = state.settings.agent;
    }
    const now = Date.now();
    chat.messages.push({ id: uid(), role: "user", content: text, createdAt: now });
    chat.updatedAt = now;
    if (!chat.title || chat.title === "New chat") chat.title = titleFrom(text);
    dom.input.value = "";
    autoResize();
    save();
    renderAll();
    showView("chat");
    scrollToBottom(true);
    await streamAssistant(chat, text);
  }

  function startPrompt(text) {
    if (!text) return;
    if (isStreaming()) {
      toast("Stop the current response first.", "info");
      return;
    }
    const chat = getChat();
    if (chat && chat.messages.length) createChat();
    showView("chat");
    dom.input.value = text;
    autoResize();
    updateComposer();
    handleSend();
  }

  function retryMessage(id) {
    if (isStreaming()) return;
    if (!state.apiKey) {
      openSettings();
      toast("Reconnect your OpenRouter key first.", "info");
      return;
    }
    const chat = getChat();
    if (!chat) return;
    const index = chat.messages.findIndex((message) => message.id === id);
    if (index < 0) return;
    let userIndex = index;
    while (userIndex >= 0 && chat.messages[userIndex].role !== "user") userIndex--;
    if (userIndex < 0) return;
    chat.messages = chat.messages.slice(0, userIndex + 1);
    chat.updatedAt = Date.now();
    save();
    renderAll();
    scrollToBottom(true);
    const prompt = chat.messages[userIndex].content;
    streamAssistant(chat, prompt);
  }

  async function validateKey(key) {
    const response = await fetch(API + "/key", {
      headers: { Authorization: "Bearer " + key, Accept: "application/json" },
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {}
    if (!response.ok) {
      const detail = payload?.error?.message || payload?.message || "HTTP " + response.status;
      const error = new Error(detail);
      error.status = response.status;
      throw error;
    }
    return payload?.data || {};
  }

  async function submitKey(event) {
    event.preventDefault();
    const key = dom.apiKeyInput.value.trim();
    if (!key) {
      state.apiKey = "";
      state.keyInfo = null;
      save();
      renderAll();
      setKeyStatus("", "");
      toast("OpenRouter key removed from this browser.", "info");
      return;
    }
    dom.saveKeyBtn.disabled = true;
    const label = dom.saveKeyBtn.textContent;
    dom.saveKeyBtn.textContent = "Validating…";
    setKeyStatus("", "");
    try {
      const info = await validateKey(key);
      state.apiKey = key;
      state.keyInfo = {
        label: info.label || "OpenRouter key",
        usage: typeof info.usage === "number" ? info.usage : null,
        limit: typeof info.limit === "number" ? info.limit : null,
        isFreeTier: Boolean(info.is_free_tier),
        rateLimit: info.rate_limit || null,
        invalid: false,
        checkedAt: Date.now(),
      };
      save();
      renderAll();
      setKeyStatus("ok", "Connected as " + state.keyInfo.label + ". Free models are ready to use.");
      toast("OpenRouter connected.", "ok");
    } catch (error) {
      setKeyStatus("bad", friendlyError(error));
    } finally {
      dom.saveKeyBtn.disabled = false;
      dom.saveKeyBtn.textContent = label;
    }
  }

  async function testModel() {
    const key = dom.apiKeyInput.value.trim() || state.apiKey;
    if (!key) {
      setKeyStatus("bad", "Paste an OpenRouter key first.", false, dom.testResult);
      return;
    }
    if (!models.length) await loadModels();
    const modelId = ensureModel() || currentModelId();
    if (!modelId) {
      setKeyStatus("bad", "No model selected. Refresh the model list first.", false, dom.testResult);
      return;
    }
    dom.testBtn.disabled = true;
    const label = dom.testBtn.textContent;
    dom.testBtn.textContent = "Testing…";
    setKeyStatus("", "", false, dom.testResult);
    try {
      const response = await fetch(API + "/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
          Accept: "application/json",
          "HTTP-Referer": location.origin || "https://openforge.local",
          "X-Title": "OpenForge",
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: "Reply with exactly: ready" }],
          max_tokens: 12,
          stream: false,
        }),
      });
      if (!response.ok) throw await httpError(response);
      const payload = await response.json();
      if (payload.error) throw new Error(payload.error.message || "OpenRouter returned an error.");
      const content = String(payload?.choices?.[0]?.message?.content || "").trim();
      setKeyStatus("ok", "Test passed with " + (modelLabel(getModel(modelId)) || modelId) + (content ? ' — replied "' + content.slice(0, 40) + '"' : "."), false, dom.testResult);
    } catch (error) {
      setKeyStatus("bad", friendlyError(error), false, dom.testResult);
    } finally {
      dom.testBtn.disabled = false;
      dom.testBtn.textContent = label;
    }
  }

  async function revalidateKey() {
    if (!state.apiKey) return;
    if (state.keyInfo && Date.now() - (state.keyInfo.checkedAt || 0) < KEY_RECHECK) return;
    try {
      const info = await validateKey(state.apiKey);
      state.keyInfo = {
        label: info.label || state.keyInfo?.label || "OpenRouter key",
        usage: typeof info.usage === "number" ? info.usage : null,
        limit: typeof info.limit === "number" ? info.limit : null,
        isFreeTier: Boolean(info.is_free_tier),
        rateLimit: info.rate_limit || null,
        invalid: false,
        checkedAt: Date.now(),
      };
      save();
    } catch (error) {
      if (/401|invalid|no auth/i.test(String(error.message))) {
        state.keyInfo = { ...(state.keyInfo || {}), invalid: true, checkedAt: Date.now() };
        save();
      }
    }
    renderConnection();
  }

  function exportData() {
    const payload = {
      app: "OpenForge",
      version: 2,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      files: state.files,
      chats: state.chats,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "openforge-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Exported chats, files and settings.", "ok");
  }

  async function importData(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const incoming = Array.isArray(parsed) ? parsed : parsed?.chats;
      if (!Array.isArray(incoming)) throw new Error("No chats found in that file.");
      const known = new Set(state.chats.map((chat) => chat.id));
      let count = 0;
      for (const raw of incoming) {
        if (!raw || !Array.isArray(raw.messages)) continue;
        const agent = AGENTS[raw.agent] ? raw.agent : AGENTS[raw.mode] ? raw.mode : "codex";
        const chat = {
          id: raw.id && !known.has(raw.id) ? String(raw.id) : uid(),
          title: String(raw.title || "Imported chat").slice(0, 120),
          agent,
          model: typeof raw.model === "string" ? raw.model : null,
          createdAt: Number(raw.createdAt) || Date.now(),
          updatedAt: Number(raw.updatedAt) || Date.now(),
          messages: raw.messages
            .filter((message) => message && (message.role === "user" || message.role === "assistant"))
            .map((message) => ({
              id: uid(),
              role: message.role,
              content: String(message.content || ""),
              reasoning: typeof message.reasoning === "string" ? message.reasoning : "",
              model: message.model || raw.model || null,
              agent: AGENTS[message.agent] ? message.agent : AGENTS[message.mode] ? message.mode : agent,
              createdAt: Number(message.createdAt) || Date.now(),
            })),
        };
        known.add(chat.id);
        state.chats.push(chat);
        count++;
      }
      if (parsed.files && typeof parsed.files === "object" && !Array.isArray(parsed.files)) {
        for (const [name, content] of Object.entries(parsed.files)) {
          if (typeof content === "string") state.files[name] = content;
        }
        if (!state.activeFile) state.activeFile = Object.keys(state.files)[0] || null;
      }
      if (parsed.settings && typeof parsed.settings === "object") {
        if (Array.isArray(parsed.settings.skills)) {
          state.settings.skills = parsed.settings.skills.filter((id) => SKILL_MAP.has(id));
        }
        if (AGENTS[parsed.settings.agent]) state.settings.agent = parsed.settings.agent;
      }
      if (!count && !parsed.files) throw new Error("That file did not contain any usable chats or files.");
      state.chats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      if (state.chats.length) state.activeChatId = state.chats[0].id;
      save();
      renderAll();
      toast("Imported " + count + " chat" + (count === 1 ? "" : "s") + ".", "ok");
    } catch (error) {
      toast("Import failed: " + (error.message || "invalid file"), "bad");
    } finally {
      dom.importFile.value = "";
    }
  }

  function handleClear() {
    if (!state.chats.length) {
      toast("There is nothing to erase.", "info");
      return;
    }
    if (dom.clearBtn.dataset.confirm === "1") {
      clearTimeout(clearTimer);
      if (isStreaming()) stopGeneration();
      state.chats = [];
      state.activeChatId = null;
      save();
      renderAll();
      dom.clearBtn.dataset.confirm = "";
      dom.clearBtn.textContent = "Erase all chats";
      toast("All chats erased from this browser.", "ok");
      return;
    }
    dom.clearBtn.dataset.confirm = "1";
    dom.clearBtn.textContent = "Click again to confirm";
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      dom.clearBtn.dataset.confirm = "";
      dom.clearBtn.textContent = "Erase all chats";
    }, 3200);
  }

  function createFile(name) {
    const clean = String(name || "").trim().replace(/^\/+/, "");
    if (!clean) return;
    if (state.files[clean] !== undefined) {
      state.activeFile = clean;
      toast("File already exists.", "info");
    } else {
      state.files[clean] = "";
      state.activeFile = clean;
    }
    save();
    renderWorkspace();
    renderDashboard();
    dom.fileEditor.focus();
  }

  function deleteFile() {
    const name = state.activeFile;
    if (!name) return;
    if (dom.deleteFileBtn.dataset.confirm !== "1") {
      dom.deleteFileBtn.dataset.confirm = "1";
      dom.deleteFileBtn.style.color = "var(--red)";
      toast('Click delete again to remove "' + name + '".', "info", 2600);
      clearTimeout(deleteTimer);
      deleteTimer = setTimeout(() => {
        dom.deleteFileBtn.dataset.confirm = "";
        dom.deleteFileBtn.style.color = "";
      }, 3000);
      return;
    }
    clearTimeout(deleteTimer);
    dom.deleteFileBtn.dataset.confirm = "";
    dom.deleteFileBtn.style.color = "";
    delete state.files[name];
    editorFile = null;
    const names = Object.keys(state.files);
    state.activeFile = names[0] || null;
    save();
    renderWorkspace();
    renderDashboard();
    toast('Deleted "' + name + '".', "info");
  }

  async function runTerminal(raw) {
    const command = String(raw || "").trim();
    if (!command) return;
    termHistory.push(command);
    if (termHistory.length > 80) termHistory.shift();
    termHistoryIndex = termHistory.length;
    writeTerm("~/workspace $ " + command, "term-cmd");
    const [name, ...args] = command.split(/\s+/);
    const rest = command.slice(name.length).trim();
    const cmd = name.toLowerCase();
    switch (cmd) {
      case "help":
        writeTerm(
          [
            "Available commands:",
            "  help              show this help",
            "  ls                list workspace files",
            "  cat <file>        print a file",
            "  write <file> <t>  write text to a file",
            "  touch <file>      create an empty file",
            "  rm <file>         delete a file",
            "  open <file>       open a file in the workspace",
            "  pwd               print the workspace path",
            "  echo <text>       print text",
            "  date              print the current date",
            "  status            key, model, agent and skills",
            "  agents            list agents",
            "  skills            list skills",
            "  ask <prompt>      start a chat with the active agent",
            "  agent <prompt>    alias for ask",
            "  clear             clear the terminal",
            "",
            "This shell is simulated in your browser. It cannot run system commands.",
          ].join("\n"),
          "term-out"
        );
        break;
      case "ls": {
        const names = Object.keys(state.files).sort();
        writeTerm(names.length ? names.map((file) => fileTag(file).padEnd(5) + file).join("\n") : "(no files)", "term-out");
        break;
      }
      case "cat": {
        const file = rest;
        if (!file) {
          writeTerm("usage: cat <file>", "term-err");
        } else if (state.files[file] === undefined) {
          writeTerm("cat: " + file + ": no such file", "term-err");
        } else {
          writeTerm(state.files[file] || "(empty file)", "term-out");
        }
        break;
      }
      case "write": {
        const [file, ...textParts] = rest.split(/\s+/);
        if (!file || !textParts.length) {
          writeTerm("usage: write <file> <text>", "term-err");
        } else {
          state.files[file] = textParts.join(" ");
          if (!state.activeFile) state.activeFile = file;
          save();
          renderWorkspace();
          renderDashboard();
          writeTerm("wrote " + state.files[file].length + " chars to " + file, "term-ok");
        }
        break;
      }
      case "touch": {
        const file = rest;
        if (!file) {
          writeTerm("usage: touch <file>", "term-err");
        } else if (state.files[file] !== undefined) {
          writeTerm(file + " already exists", "term-dim");
        } else {
          state.files[file] = "";
          if (!state.activeFile) state.activeFile = file;
          save();
          renderWorkspace();
          renderDashboard();
          writeTerm("created " + file, "term-ok");
        }
        break;
      }
      case "rm": {
        const file = rest;
        if (!file || state.files[file] === undefined) {
          writeTerm("rm: " + (file || "") + ": no such file", "term-err");
        } else {
          delete state.files[file];
          if (state.activeFile === file) state.activeFile = Object.keys(state.files)[0] || null;
          save();
          renderWorkspace();
          renderDashboard();
          writeTerm("removed " + file, "term-ok");
        }
        break;
      }
      case "open": {
        const file = rest;
        if (!file || state.files[file] === undefined) {
          writeTerm("open: " + (file || "") + ": no such file", "term-err");
        } else {
          state.activeFile = file;
          editorFile = null;
          save();
          renderWorkspace();
          showView("workspace");
          writeTerm("opened " + file, "term-ok");
        }
        break;
      }
      case "pwd":
        writeTerm("~/workspace", "term-out");
        break;
      case "echo":
        writeTerm(args.join(" "), "term-out");
        break;
      case "date":
        writeTerm(new Date().toString(), "term-out");
        break;
      case "status": {
        const model = getModel(currentModelId());
        const agent = agentFor(state.settings.agent);
        writeTerm(
          [
            "key:    " + (state.apiKey ? (state.keyInfo?.invalid ? "rejected" : "connected") : "not connected"),
            "agent:  " + agent.label,
            "model:  " + (model ? modelLabel(model) : currentModelId() || "none"),
            "skills: " + (state.settings.skills.length ? state.settings.skills.map((id) => SKILL_MAP.get(id)?.label || id).join(", ") : "none"),
            "files:  " + Object.keys(state.files).length,
            "chats:  " + state.chats.length,
          ].join("\n"),
          "term-out"
        );
        break;
      }
      case "agents":
        writeTerm(Object.entries(AGENTS).map(([key, agent]) => (key === state.settings.agent ? "* " : "  ") + agent.label + " — " + agent.blurb).join("\n"), "term-out");
        break;
      case "skills":
        writeTerm(SKILLS.map((skill) => (state.settings.skills.includes(skill.id) ? "[x] " : "[ ] ") + skill.label + " — " + skill.desc).join("\n"), "term-out");
        break;
      case "ask":
      case "agent":
        if (!rest) {
          writeTerm("usage: ask <prompt>", "term-err");
        } else {
          writeTerm("sending to " + agentFor(state.settings.agent).label + "…", "term-ok");
          startPrompt(rest);
        }
        break;
      case "clear":
        resetTerminal();
        break;
      default:
        writeTerm("openforge: command not found: " + name + '. Type "help" for commands.', "term-err");
        break;
    }
  }

  function bindEvents() {
    dom.newChatBtn.addEventListener("click", () => {
      if (isStreaming()) stopGeneration();
      createChat();
      showView("chat");
      closeSidebar();
      dom.input.focus();
    });

    dom.chatSearch.addEventListener("input", renderSidebar);

    dom.chatList.addEventListener("click", (event) => {
      const del = event.target.closest("[data-delete-id]");
      if (del) {
        event.stopPropagation();
        deleteChat(del.dataset.deleteId);
        return;
      }
      const item = event.target.closest("[data-chat-id]");
      if (item) selectChat(item.dataset.chatId);
    });

    dom.chatList.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const item = event.target.closest("[data-chat-id]");
      if (!item || event.target.closest("[data-delete-id]")) return;
      event.preventDefault();
      selectChat(item.dataset.chatId);
    });

    dom.appNav.addEventListener("click", (event) => {
      const item = event.target.closest("[data-view]");
      if (item) showView(item.dataset.view);
    });

    document.addEventListener("click", (event) => {
      const goto = event.target.closest("[data-goto]");
      if (goto) {
        showView(goto.dataset.goto);
        if (goto.dataset.goto === "chat" && !getChat()) createChat();
        return;
      }
      if (event.target.closest("[data-open-settings]")) {
        openSettings();
        return;
      }
      const recent = event.target.closest("[data-open-chat]");
      if (recent) {
        selectChat(recent.dataset.openChat);
      }
    });

    dom.agentBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (dom.agentPopover.hidden) openAgentPopover();
      else closeAgentPopover();
    });

    dom.agentList.addEventListener("click", (event) => {
      const pick = event.target.closest("[data-agent-pick]");
      if (!pick) return;
      setAgent(pick.dataset.agentPick);
      closeAgentPopover();
      showView("chat");
    });

    dom.agentGrid.addEventListener("click", (event) => {
      const card = event.target.closest("[data-agent]");
      if (!card) return;
      setAgent(card.dataset.agent);
      showView("chat");
    });

    dom.modelBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (dom.modelPopover.hidden) openModelPopover();
      else closeModelPopover();
    });

    dom.modelSearch.addEventListener("input", renderModelList);

    dom.modelList.addEventListener("click", (event) => {
      const item = event.target.closest("[data-model-id]");
      if (item) selectModel(item.dataset.modelId);
    });

    dom.freeOnly.addEventListener("change", () => {
      state.settings.freeOnly = dom.freeOnly.checked;
      dom.freeOnlySetting.checked = state.settings.freeOnly;
      save();
      renderModelList();
    });

    dom.refreshModels.addEventListener("click", async () => {
      dom.refreshModels.textContent = "Refreshing…";
      dom.refreshModels.disabled = true;
      await loadModels(true);
      ensureModel();
      renderModelList();
      renderHeader();
      renderDashboard();
      dom.refreshModels.textContent = "Refresh list";
      dom.refreshModels.disabled = false;
      toast("Loaded " + models.length + " models.", "ok");
    });

    dom.keyBtn.addEventListener("click", openSettings);
    dom.connectBtn.addEventListener("click", openSettings);
    dom.settingsBtn.addEventListener("click", openSettings);
    dom.browseModelsBtn.addEventListener("click", openModelPopover);

    dom.settingsClose.addEventListener("click", closeSettings);
    dom.settingsModal.addEventListener("click", (event) => {
      if (event.target === dom.settingsModal) closeSettings();
    });

    dom.keyForm.addEventListener("submit", submitKey);
    dom.testBtn.addEventListener("click", testModel);

    dom.revealKey.addEventListener("click", () => {
      const show = dom.apiKeyInput.type === "password";
      dom.apiKeyInput.type = show ? "text" : "password";
      dom.revealKey.setAttribute("aria-label", show ? "Hide API key" : "Show API key");
    });

    dom.freeOnlySetting.addEventListener("change", () => {
      state.settings.freeOnly = dom.freeOnlySetting.checked;
      dom.freeOnly.checked = state.settings.freeOnly;
      save();
      if (!dom.modelPopover.hidden) renderModelList();
    });

    dom.dashForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = dom.dashInput.value.trim();
      if (!text) {
        dom.dashInput.focus();
        return;
      }
      dom.dashInput.value = "";
      startPrompt(text);
    });

    dom.dashInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        dom.dashForm.requestSubmit();
      }
    });

    dom.dashForm.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-prompt]");
      if (!chip) return;
      dom.dashInput.value = chip.dataset.prompt;
      dom.dashInput.focus();
    });

    dom.quickGrid.addEventListener("click", (event) => {
      const card = event.target.closest("[data-prompt]");
      if (!card) return;
      dom.input.value = card.dataset.prompt;
      autoResize();
      updateComposer();
      dom.input.focus();
    });

    dom.dashSkills.addEventListener("click", (event) => {
      const pill = event.target.closest("[data-skill]");
      if (pill) toggleSkill(pill.dataset.skill);
    });

    dom.skillsGrid.addEventListener("click", (event) => {
      const card = event.target.closest("[data-skill]");
      if (card) toggleSkill(card.dataset.skill);
    });

    dom.skillsDisable.addEventListener("click", () => {
      state.settings.skills = [];
      save();
      renderAll();
      toast("All skills disabled.", "info");
    });

    dom.composer.addEventListener("submit", (event) => {
      event.preventDefault();
      handleSend();
    });

    dom.input.addEventListener("input", () => {
      autoResize();
      updateComposer();
    });

    dom.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        if (dom.sendBtn.disabled) return;
        dom.composer.requestSubmit();
      }
    });

    dom.stopBtn.addEventListener("click", stopGeneration);

    dom.messages.addEventListener("click", async (event) => {
      const retry = event.target.closest("[data-retry]");
      if (retry) {
        retryMessage(retry.dataset.retry);
        return;
      }
      const copy = event.target.closest("[data-copy-msg]");
      if (copy) {
        const message = getMessage(copy.dataset.copyMsg);
        if (message && message.content) {
          const ok = await copyText(message.content);
          toast(ok ? "Message copied." : "Copy failed.", ok ? "ok" : "bad", 2200);
        }
        return;
      }
      const code = event.target.closest(".copy-code");
      if (code) {
        const raw = decodeURIComponent(code.dataset.copy || "");
        const ok = await copyText(raw);
        if (ok) {
          const original = code.innerHTML;
          code.classList.add("copied");
          code.innerHTML = ICONS.check + "Copied";
          setTimeout(() => {
            code.classList.remove("copied");
            code.innerHTML = original;
          }, 1500);
        } else {
          toast("Copy failed.", "bad", 2200);
        }
      }
    });

    dom.newFileBtn.addEventListener("click", () => {
      dom.newFileForm.hidden = !dom.newFileForm.hidden;
      if (!dom.newFileForm.hidden) {
        dom.newFileInput.value = "";
        setTimeout(() => dom.newFileInput.focus(), 20);
      }
    });

    dom.newFileForm.addEventListener("submit", (event) => {
      event.preventDefault();
      createFile(dom.newFileInput.value);
      dom.newFileForm.hidden = true;
    });

    dom.fileList.addEventListener("click", (event) => {
      const item = event.target.closest("[data-file]");
      if (!item) return;
      state.activeFile = item.dataset.file;
      editorFile = null;
      renderWorkspace();
    });

    dom.fileEditor.addEventListener("input", () => {
      const name = state.activeFile;
      if (!name) return;
      state.files[name] = dom.fileEditor.value;
      updateEditorStats();
      dom.saveState.textContent = "Saving…";
      clearTimeout(editorTimer);
      editorTimer = setTimeout(() => {
        save();
        dom.saveState.textContent = "Saved";
        renderDashboard();
      }, 450);
    });

    dom.askFileBtn.addEventListener("click", () => {
      const name = state.activeFile;
      if (!name) return;
      const content = state.files[name] || "";
      const clipped = content.length > 6000 ? content.slice(0, 6000) + "\n… [truncated]" : content;
      startPrompt(
        "Use this file from my workspace.\n\nFile: " + name + "\n```\n" + clipped + "\n```\n\nReview it, explain the main risks, and propose concrete improvements."
      );
    });

    dom.deleteFileBtn.addEventListener("click", deleteFile);

    dom.termForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const command = dom.termInput.value;
      dom.termInput.value = "";
      runTerminal(command);
    });

    dom.termInput.addEventListener("keydown", (event) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!termHistory.length) return;
        termHistoryIndex = Math.max(0, termHistoryIndex - 1);
        dom.termInput.value = termHistory[termHistoryIndex] || "";
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        termHistoryIndex = Math.min(termHistory.length, termHistoryIndex + 1);
        dom.termInput.value = termHistory[termHistoryIndex] || "";
      }
    });

    dom.termClear.addEventListener("click", resetTerminal);

    dom.exportBtn.addEventListener("click", exportData);
    dom.importBtn.addEventListener("click", () => dom.importFile.click());
    dom.importFile.addEventListener("change", () => {
      if (dom.importFile.files && dom.importFile.files[0]) importData(dom.importFile.files[0]);
    });
    dom.clearBtn.addEventListener("click", handleClear);

    dom.menuBtn.addEventListener("click", openSidebar);
    dom.sidebarClose.addEventListener("click", closeSidebar);
    dom.backdrop.addEventListener("click", closeSidebar);

    document.addEventListener("click", (event) => {
      if (!dom.modelPopover.hidden && !event.target.closest("#modelPopover") && !event.target.closest("#modelBtn")) {
        closeModelPopover();
      }
      if (!dom.agentPopover.hidden && !event.target.closest("#agentPopover") && !event.target.closest("#agentBtn")) {
        closeAgentPopover();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (!dom.settingsModal.hidden) {
          closeSettings();
          return;
        }
        if (!dom.modelPopover.hidden) {
          closeModelPopover();
          return;
        }
        if (!dom.agentPopover.hidden) {
          closeAgentPopover();
          return;
        }
        if (dom.sidebar.classList.contains("open")) {
          closeSidebar();
          return;
        }
        if (isStreaming()) stopGeneration();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (isStreaming()) stopGeneration();
        createChat();
        showView("chat");
        dom.input.focus();
      }
      if (event.key === "Tab" && !dom.settingsModal.hidden) {
        const focusables = dom.settingsModal.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), a[href], textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      if (!dom.settingsModal.hidden) return;
      const tag = (event.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || event.metaKey || event.ctrlKey || event.altKey) return;
      const views = { "1": "dashboard", "2": "chat", "3": "skills", "4": "workspace", "5": "terminal" };
      if (views[event.key]) showView(views[event.key]);
    });

    window.addEventListener("resize", () => {
      if (!dom.modelPopover.hidden) positionPopover(dom.modelPopover, dom.modelBtn);
      if (!dom.agentPopover.hidden) positionPopover(dom.agentPopover, dom.agentBtn);
    });
  }

  function inlineMarkdown(text) {
    const codeSpans = [];
    let source = String(text).replace(/`([^`\n]+)`/g, (match, code) => {
      const index = codeSpans.length;
      codeSpans.push(code);
      return "\u0001IC" + index + "\u0001";
    });
    source = escapeHtml(source);
    source = source.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    source = source.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
    source = source.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    source = source.replace(/(^|[^_])_([^_\n]+)_/g, "$1<em>$2</em>");
    source = source.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
    source = source.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    source = source.replace(/\u0001IC(\d+)\u0001/g, (match, index) => "<code>" + escapeHtml(codeSpans[Number(index)]) + "</code>");
    return source;
  }

  function codeBlockHtml(language, code) {
    const lang = escapeHtml((language || "text").slice(0, 24));
    const encoded = encodeURIComponent(code);
    return (
      '<div class="code-block"><div class="code-head"><span class="code-lang">' + lang + "</span>" +
      '<button class="copy-code" data-copy="' + escapeHtml(encoded) + '" type="button">' + ICONS.copy + "Copy</button></div>" +
      "<pre><code>" + escapeHtml(code) + "</code></pre></div>"
    );
  }

  function splitTableRow(row) {
    return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
  }

  function renderMarkdown(source) {
    let text = String(source || "").replace(/\r\n/g, "\n");
    const codeBlocks = [];
    text = text.replace(/```([^\n`]*)\n?([\s\S]*?)(?:```|$)/g, (match, lang, code) => {
      const index = codeBlocks.length;
      codeBlocks.push({ lang: (lang || "").trim().split(/\s+/)[0] || "text", code: code.replace(/\n$/, "") });
      return "\n\n@@CODEFENCE" + index + "@@\n\n";
    });

    const lines = text.split("\n");
    const output = [];
    let paragraph = [];
    let listType = null;

    const flushParagraph = () => {
      if (!paragraph.length) return;
      output.push("<p>" + inlineMarkdown(paragraph.join(" ")) + "</p>");
      paragraph = [];
    };
    const closeList = () => {
      if (!listType) return;
      output.push("</" + listType + ">");
      listType = null;
    };

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      let line = rawLine;
      const trimmed = line.trim();

      if (!trimmed) {
        flushParagraph();
        closeList();
        continue;
      }

      const codeMatch = trimmed.match(/^@@CODEFENCE(\d+)@@$/);
      if (codeMatch) {
        flushParagraph();
        closeList();
        const block = codeBlocks[Number(codeMatch[1])];
        if (block) output.push(codeBlockHtml(block.lang, block.code));
        continue;
      }

      const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        flushParagraph();
        closeList();
        const level = heading[1].length;
        output.push("<h" + level + ">" + inlineMarkdown(heading[2]) + "</h" + level + ">");
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        flushParagraph();
        closeList();
        output.push("<hr />");
        continue;
      }

      if (/^>\s?/.test(trimmed)) {
        flushParagraph();
        closeList();
        const quote = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          quote.push(lines[i].replace(/^\s*>\s?/, ""));
          i++;
        }
        i--;
        output.push("<blockquote>" + inlineMarkdown(quote.join(" ")) + "</blockquote>");
        continue;
      }

      if (trimmed.includes("|") && lines[i + 1] && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(lines[i + 1])) {
        flushParagraph();
        closeList();
        const header = splitTableRow(lines[i]);
        const rows = [];
        let j = i + 2;
        while (j < lines.length && lines[j].includes("|") && lines[j].trim()) {
          rows.push(splitTableRow(lines[j]));
          j++;
        }
        let table = "<table><thead><tr>" + header.map((cell) => "<th>" + inlineMarkdown(cell) + "</th>").join("") + "</tr></thead><tbody>";
        for (const row of rows) {
          table += "<tr>" + header.map((_, cellIndex) => "<td>" + inlineMarkdown(row[cellIndex] || "") + "</td>").join("") + "</tr>";
        }
        table += "</tbody></table>";
        output.push(table);
        i = j - 1;
        continue;
      }

      const unordered = trimmed.match(/^[-*+]\s+(.*)$/);
      const ordered = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
      if (unordered || ordered) {
        flushParagraph();
        const type = unordered ? "ul" : "ol";
        if (listType !== type) {
          closeList();
          output.push("<" + type + ">");
          listType = type;
        }
        const itemText = unordered ? unordered[1] : ordered[2];
        const task = unordered ? itemText.match(/^\[( |x|X)\]\s+(.*)$/) : null;
        if (task) {
          const checked = task[1].toLowerCase() === "x";
          output.push(
            '<li class="task-item"><span class="task-box' + (checked ? " done" : "") + '">' +
            (checked ? ICONS.check : "") + "</span>" + inlineMarkdown(task[2]) + "</li>"
          );
        } else {
          output.push("<li>" + inlineMarkdown(itemText) + "</li>");
        }
        continue;
      }

      paragraph.push(trimmed);
    }
    flushParagraph();
    closeList();
    return output.join("");
  }

  async function init() {
    bindEvents();
    autoResize();
    resetTerminal();

    const chat = getChat();
    if (chat) {
      state.settings.agent = chat.agent || state.settings.agent;
      if (chat.model) state.settings.model = chat.model;
    }

    updateAgentTheme();
    renderAll();
    updateStorage();
    showView(state.view || "dashboard");

    await loadModels();
    ensureModel();
    renderAll();
    const restored = getChat();
    if (restored && restored.messages.length) scrollToBottom(true);
    updateStorage();
    revalidateKey();
  }

  init();
})();
