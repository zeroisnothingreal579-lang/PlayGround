/* PlayGround Chat - a small, dependency-free chat workspace.
 * Talks to an OpenAI-compatible completions endpoint that allows browser
 * (CORS) access, and falls back to a built-in offline agent when the network
 * or the model is unavailable, so the page always works. */

(function () {
  "use strict";

  // ---- Config -------------------------------------------------------------
  var API_URL = "https://text.pollinations.ai/openai";
  var STORE_KEY = "playground.chat.v2";
  var THEME_KEY = "playground.chat.theme";
  var PROFILE_KEY = "playground.chat.profile";
  var MAX_HISTORY = 24;
  var REQUEST_TIMEOUT = 90000;

  var PERSONAS = {
    assistant: {
      label: "Assistant",
      initials: "AI",
      system:
        "You are a helpful, friendly and concise AI assistant. Answer clearly, " +
        "use short paragraphs, and use markdown (lists, code fences, bold) when it helps. " +
        "If you are unsure, say so honestly instead of inventing facts.",
    },
    coder: {
      label: "Coder",
      initials: "{}",
      system:
        "You are a senior software engineer. Give correct, runnable code with brief " +
        "explanations. Prefer simple, modern solutions. Wrap code in fenced blocks with a " +
        "language tag. Call out edge cases and security concerns when relevant.",
    },
    writer: {
      label: "Writer",
      initials: "W",
      system:
        "You are an expert editor and writer. Write with a clear, warm and precise voice. " +
        "Prefer strong verbs and concrete detail. When asked to draft, give a polished result " +
        "and keep commentary short.",
    },
    tutor: {
      label: "Tutor",
      initials: "T",
      system:
        "You are a patient tutor. Explain ideas step by step, check understanding, and use " +
        "simple analogies. Encourage the learner and avoid unnecessary jargon.",
    },
  };

  // ---- Utilities ----------------------------------------------------------
  function $(id) {
    return document.getElementById(id);
  }

  function uid() {
    return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function timeLabel(ts) {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (error) {
      return "";
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // ---- Persistence --------------------------------------------------------
  function loadStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var data = raw ? JSON.parse(raw) : null;
      if (data && Array.isArray(data.conversations) && data.conversations.length) {
        if (!data.conversations.some(function (c) { return c.id === data.activeId; })) {
          data.activeId = data.conversations[0].id;
        }
        return data;
      }
    } catch (error) {
      /* corrupt or unavailable storage: start fresh */
    }
    return null;
  }

  function saveStore() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (error) {
      /* storage full or blocked: ignore */
    }
  }

  function loadProfile() {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}") || {};
    } catch (error) {
      return {};
    }
  }

  function saveProfile(profile) {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch (error) {
      /* ignore */
    }
  }

  function newConversation(persona) {
    return {
      id: uid(),
      title: "New chat",
      persona: persona || "assistant",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
  }

  // ---- Markdown (small, safe renderer) -----------------------------------
  function renderInline(text) {
    var out = escapeHtml(text);
    out = out.replace(/`([^`\n]+)`/g, function (match, code) {
      return "<code>" + code + "</code>";
    });
    out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    out = out.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, function (match, label, href) {
      return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + label + "</a>";
    });
    return out;
  }

  function codeBlockHtml(lang, code) {
    var label = lang ? escapeHtml(lang) : "code";
    return (
      '<div class="code-block"><header><span>' +
      label +
      '</span><button class="copy-code" type="button">Copy</button></header>' +
      "<pre><code>" +
      escapeHtml(code) +
      "</code></pre></div>"
    );
  }

  function textToBlocks(text) {
    var lines = text.split("\n");
    var html = "";
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (!line.trim()) {
        i++;
        continue;
      }
      var heading = line.match(/^(#{1,3})\s+(.*)$/);
      if (heading) {
        var level = heading[1].length;
        html += "<h" + level + ">" + renderInline(heading[2]) + "</h" + level + ">";
        i++;
        continue;
      }
      if (/^\s*[-*+]\s+/.test(line)) {
        var items = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          items.push("<li>" + renderInline(lines[i].replace(/^\s*[-*+]\s+/, "")) + "</li>");
          i++;
        }
        html += "<ul>" + items.join("") + "</ul>";
        continue;
      }
      if (/^\s*\d+\.\s+/.test(line)) {
        var ordered = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          ordered.push("<li>" + renderInline(lines[i].replace(/^\s*\d+\.\s+/, "")) + "</li>");
          i++;
        }
        html += "<ol>" + ordered.join("") + "</ol>";
        continue;
      }
      var para = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !/^(#{1,3})\s+/.test(lines[i]) && !/^\s*[-*+]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      html += "<p>" + renderInline(para.join("\n")).replace(/\n/g, "<br>") + "</p>";
    }
    return html;
  }

  function renderMarkdown(text) {
    var source = String(text || "");
    var fences = /```([^\n`]*)\n?([\s\S]*?)```/g;
    var parts = [];
    var last = 0;
    var match;
    while ((match = fences.exec(source))) {
      if (match.index > last) parts.push({ type: "text", value: source.slice(last, match.index) });
      parts.push({ type: "code", lang: match[1].trim(), value: match[2].replace(/\n$/, "") });
      last = fences.lastIndex;
    }
    if (last < source.length) parts.push({ type: "text", value: source.slice(last) });
    return parts
      .map(function (part) {
        return part.type === "code" ? codeBlockHtml(part.lang, part.value) : textToBlocks(part.value);
      })
      .join("");
  }

  // ---- Local offline agent ------------------------------------------------
  function evalMath(expression) {
    var tokens = expression.match(/\d+\.?\d*|[+\-*/%^()]/g);
    if (!tokens || tokens.length < 3) return null;
    var pos = 0;
    function peek() { return tokens[pos]; }
    function parseExpr() {
      var value = parseTerm();
      while (peek() === "+" || peek() === "-") {
        var op = tokens[pos++];
        var rhs = parseTerm();
        value = op === "+" ? value + rhs : value - rhs;
      }
      return value;
    }
    function parseTerm() {
      var value = parseFactor();
      while (peek() === "*" || peek() === "/" || peek() === "%") {
        var op = tokens[pos++];
        var rhs = parseFactor();
        if (op === "*") value *= rhs;
        else if (op === "/") value /= rhs;
        else value %= rhs;
      }
      return value;
    }
    function parseFactor() {
      var base = parseUnary();
      if (peek() === "^") { pos++; base = Math.pow(base, parseFactor()); }
      return base;
    }
    function parseUnary() {
      if (peek() === "-") { pos++; return -parseUnary(); }
      if (peek() === "+") { pos++; return parseUnary(); }
      return parsePrimary();
    }
    function parsePrimary() {
      var token = tokens[pos];
      if (token === "(") {
        pos++;
        var value = parseExpr();
        if (peek() === ")") pos++;
        return value;
      }
      pos++;
      return Number(token);
    }
    var result;
    try {
      result = parseExpr();
    } catch (error) {
      return null;
    }
    if (pos !== tokens.length || !isFinite(result)) return null;
    return result;
  }

  function greeting() {
    var hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }

  function randomOf(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function localReply(text, profile) {
    var raw = String(text || "").trim();
    var lower = raw.toLowerCase();

    if (!raw) return "I'm here. What would you like to talk about?";

    if (/^(hi|hey|hello|yo|sup|hiya|howdy)\b/.test(lower)) {
      return greeting() + "! I'm running in local mode right now, but I can still help with quick things. What's on your mind?";
    }
    if (/how are you|how's it going|how are things/.test(lower)) {
      return "Running smoothly, thanks for asking. What can I do for you?";
    }
    if (/who are you|your name|what are you/.test(lower)) {
      return "I'm the PlayGround chat agent. I answer questions, help you write and reason through problems. You can pick a different persona in the sidebar.";
    }
    if (/(what can you do|help|commands|how do you work)/.test(lower)) {
      return [
        "Here's what I can do right now:",
        "- Answer questions and hold a conversation.",
        "- Do quick math (try `12 * (3 + 4)` or \"what is 15% of 240\").",
        "- Tell you the time and date.",
        "- Remember your name if you say \"my name is ...\".",
        "- Brainstorm and draft text.",
        "",
        "When the model is reachable I switch to full online mode automatically.",
      ].join("\n");
    }
    if (/\btime\b|\bclock\b/.test(lower) && !/\btimes\b/.test(lower)) {
      return "It's " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + ".";
    }
    if (/\bdate\b|\bwhat day\b|\btoday\b/.test(lower)) {
      return "Today is " + new Date().toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" }) + ".";
    }
    if (/flip a coin/.test(lower)) return "🪙 " + randomOf(["Heads.", "Tails."]);
    if (/roll (a )?(dice|die|d6)/.test(lower)) return "🎲 You rolled a " + (1 + Math.floor(Math.random() * 6)) + ".";
    if (/roll (a )?d20/.test(lower)) return "🎲 You rolled a " + (1 + Math.floor(Math.random() * 20)) + ".";

    var nameMatch = raw.match(/\bmy name is\s+([a-z][a-z' -]{0,40})/i) || raw.match(/\bi am\s+([a-z][a-z' -]{0,40})/i);
    if (nameMatch) {
      var name = nameMatch[1].trim().replace(/\s+(please|thanks|thank you)$/i, "");
      profile.name = name.charAt(0).toUpperCase() + name.slice(1);
      saveProfile(profile);
      return "Nice to meet you, " + profile.name + ". I'll remember that.";
    }
    if (/who am i|what's my name|what is my name|do you know my name/.test(lower)) {
      return profile.name ? "You're " + profile.name + "." : "You haven't told me your name yet. Say \"my name is ...\" and I'll remember it.";
    }

    var candidate = lower
      .replace(/\bwhat is\b|\bwhats\b|\bwhat's\b|\bcalculate\b|\bcompute\b|\bevaluate\b|\bsolve\b|\bequals?\b/g, " ")
      .replace(/\bplus\b/g, "+")
      .replace(/\bminus\b/g, "-")
      .replace(/\btimes\b|\bmultiplied by\b/g, "*")
      .replace(/\bdivided by\b|\bover\b/g, "/")
      .replace(/[a-z?=,:!]/g, " ")
      .trim();
    if (/[\d]/.test(candidate) && /[+\-*/%^]/.test(candidate)) {
      var percent = raw.match(/(\d+\.?\d*)\s*%\s*of\s*(\d+\.?\d*)/i);
      if (percent) {
        var pct = (parseFloat(percent[1]) / 100) * parseFloat(percent[2]);
        return escapeHtml(percent[1]) + "% of " + escapeHtml(percent[2]) + " is **" + pct + "**.";
      }
      var value = evalMath(candidate);
      if (value !== null) return "That's **" + value + "**.";
    }

    return [
      "I couldn't reach the online model just now, so I'm answering in local mode.",
      "",
      "I can still help with quick math, the time and date, or remembering your name. Try one of those, or send your message again.",
    ].join("\n");
  }

  // ---- State --------------------------------------------------------------
  var state = loadStore() || { conversations: [newConversation("assistant")], activeId: null };
  if (!state.activeId) state.activeId = state.conversations[0].id;
  var profile = loadProfile();

  var currentAbort = null;
  var streaming = false;
  var stickToBottom = true;
  var online = null; // null = unknown, true = last request ok, false = local fallback

  // ---- DOM ----------------------------------------------------------------
  var els = {
    app: $("app"),
    sidebar: $("sidebar"),
    backdrop: $("backdrop"),
    menu: $("menu"),
    newChat: $("new-chat"),
    convoList: $("convo-list"),
    persona: $("persona"),
    themeToggle: $("theme-toggle"),
    themeValue: $("theme-value"),
    title: $("convo-title"),
    status: $("status"),
    statusDot: $("status-dot"),
    statusText: $("status-text"),
    clear: $("clear"),
    messages: $("messages"),
    composer: $("composer"),
    input: $("input"),
    send: $("send"),
    emptyTemplate: $("empty-template"),
  };

  function activeConversation() {
    return (
      state.conversations.find(function (c) { return c.id === state.activeId; }) ||
      state.conversations[0]
    );
  }

  function setStatus(mode) {
    if (mode === "online") online = true;
    else if (mode === "local") online = false;

    var label = "Ready";
    var kind = "";
    if (streaming) {
      label = "Thinking…";
      kind = "busy";
    } else if (online === false) {
      label = "Local mode";
      kind = "local";
    } else if (online === true) {
      label = "Online model";
      kind = "online";
    }
    els.statusText.textContent = label;
    els.statusDot.className = "status-dot" + (kind ? " " + kind : "");
    els.status.title = label;
  }

  // ---- Rendering ----------------------------------------------------------
  function renderSidebar() {
    els.convoList.innerHTML = "";
    var items = state.conversations.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    items.forEach(function (convo) {
      var item = document.createElement("div");
      item.className = "convo-item" + (convo.id === state.activeId ? " active" : "");
      item.setAttribute("role", "button");
      item.tabIndex = 0;
      item.dataset.id = convo.id;

      var icon = document.createElement("span");
      icon.className = "icon";
      icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 3z"/></svg>';

      var title = document.createElement("span");
      title.className = "title";
      title.textContent = convo.title || "New chat";

      var del = document.createElement("button");
      del.className = "del";
      del.type = "button";
      del.setAttribute("aria-label", "Delete chat");
      del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';

      item.append(icon, title, del);
      els.convoList.append(item);
    });

    if (!items.length) {
      var note = document.createElement("div");
      note.className = "empty-note";
      note.textContent = "No chats yet.";
      els.convoList.append(note);
    }
  }

  function messageElement(message) {
    var isUser = message.role === "user";
    var convo = activeConversation();
    var persona = PERSONAS[convo.persona] || PERSONAS.assistant;

    var row = document.createElement("div");
    row.className = "msg " + (isUser ? "user" : "agent");

    var avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = isUser ? (profile.name ? profile.name.charAt(0).toUpperCase() : "You") : persona.initials;

    var wrap = document.createElement("div");
    wrap.className = "bubble-wrap";

    var bubble = document.createElement("div");
    bubble.className = "bubble" + (message.error ? " error" : "");
    if (message.streaming && !message.content) {
      bubble.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
    } else {
      bubble.innerHTML = renderMarkdown(message.content) + (message.streaming ? '<span class="caret"></span>' : "");
    }

    wrap.append(bubble);

    if (!message.streaming) {
      var meta = document.createElement("div");
      meta.className = "meta";
      var stamp = document.createElement("span");
      stamp.textContent = timeLabel(message.ts);
      meta.append(stamp);
      if (!isUser && message.content) {
        var copy = document.createElement("button");
        copy.type = "button";
        copy.textContent = "Copy";
        copy.dataset.copy = "1";
        meta.append(copy);
      }
      wrap.append(meta);
    }

    row.append(avatar, wrap);
    if (message.streaming) row.dataset.streaming = "1";
    return row;
  }

  function renderMessages() {
    var convo = activeConversation();
    els.messages.innerHTML = "";

    if (!convo.messages.length) {
      var empty = els.emptyTemplate.content.cloneNode(true);
      els.messages.append(empty);
      els.title.textContent = "New chat";
      return;
    }

    els.title.textContent = convo.title || "New chat";
    var thread = document.createElement("div");
    thread.className = "thread";
    convo.messages.forEach(function (message) {
      thread.append(messageElement(message));
    });
    els.messages.append(thread);
    scrollToBottom(true);
  }

  function scrollToBottom(force) {
    if (!force && !stickToBottom) return;
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  // ---- Chat flow ----------------------------------------------------------
  function buildApiMessages(convo) {
    var persona = PERSONAS[convo.persona] || PERSONAS.assistant;
    var messages = [{ role: "system", content: persona.system }];
    if (profile.name) {
      messages[0].content += " The user's name is " + profile.name + ".";
    }
    convo.messages
      .filter(function (m) { return !m.error && m.content && m.content.trim(); })
      .slice(-MAX_HISTORY)
      .forEach(function (m) {
        messages.push({ role: m.role === "user" ? "user" : "assistant", content: m.content });
      });
    return messages;
  }

  async function streamCompletion(messages, onDelta, onReasoning, signal) {
    var response = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: messages, stream: true, private: true }),
      signal: signal,
    });

    if (!response.ok) {
      var detail = "";
      try { detail = (await response.text()).slice(0, 300); } catch (error) { /* ignore */ }
      throw new Error("HTTP " + response.status + (detail ? ": " + detail : ""));
    }
    if (!response.body) throw new Error("No response body");

    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buffer = "";
    var produced = false;

    function handleLine(line) {
      var trimmed = line.trim();
      if (!trimmed || trimmed.indexOf("data:") !== 0) return false;
      var payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return true;
      try {
        var json = JSON.parse(payload);
        var delta = json.choices && json.choices[0] && json.choices[0].delta;
        if (delta && typeof delta.content === "string" && delta.content) {
          produced = true;
          onDelta(delta.content);
        }
        if (delta && typeof delta.reasoning === "string" && delta.reasoning && onReasoning) {
          onReasoning(delta.reasoning);
        }
      } catch (error) {
        /* keep-alive or partial chunk */
      }
      return false;
    }

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      var newlineIndex;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        var line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (handleLine(line)) return produced;
      }
    }
    if (buffer) handleLine(buffer);
    return produced;
  }

  function titleFrom(text) {
    var clean = text.replace(/\s+/g, " ").trim();
    if (clean.length <= 42) return clean || "New chat";
    return clean.slice(0, 42).trim() + "…";
  }

  var streamRenderQueued = false;
  function queueStreamRender(renderFn) {
    if (streamRenderQueued) return;
    streamRenderQueued = true;
    requestAnimationFrame(function () {
      streamRenderQueued = false;
      renderFn();
    });
  }

  async function sendMessage(text) {
    var content = String(text || "").trim();
    if (!content || streaming) return;

    var convo = activeConversation();
    stickToBottom = true;
    els.app.classList.remove("nav-open");

    convo.messages.push({ role: "user", content: content, ts: Date.now() });
    if (convo.messages.length === 1 || convo.title === "New chat") {
      convo.title = titleFrom(content);
    }
    convo.updatedAt = Date.now();

    var reply = { role: "agent", content: "", ts: Date.now(), streaming: true };
    convo.messages.push(reply);

    streaming = true;
    saveStore();
    renderSidebar();
    renderMessages();

    var bubbleEl = els.messages.querySelector('[data-streaming="1"] .bubble');
    var reasoning = "";
    var updateBubble = function () {
      if (!bubbleEl) return;
      if (reply.content) {
        bubbleEl.innerHTML = renderMarkdown(reply.content) + '<span class="caret"></span>';
      } else if (reasoning) {
        bubbleEl.innerHTML = '<span class="thinking">' + escapeHtml(reasoning.replace(/\s+/g, " ").slice(-260)) + '</span><span class="caret"></span>';
      }
      scrollToBottom();
    };

    setStatus("busy");
    els.send.classList.add("streaming");
    els.input.value = "";
    resizeInput();

    var controller = new AbortController();
    currentAbort = controller;
    var timeout = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT);

    var accumulated = "";
    var mode = "online";
    try {
      var apiMessages = buildApiMessages(convo);
      var produced = await streamCompletion(
        apiMessages,
        function (delta) {
          accumulated += delta;
          reply.content = accumulated;
          queueStreamRender(updateBubble);
        },
        function (chunk) {
          reasoning += chunk;
          if (!reply.content) queueStreamRender(updateBubble);
        },
        controller.signal
      );
      if (!produced || !accumulated.trim()) throw new Error("Empty response");
    } catch (error) {
      if (accumulated.trim()) {
        reply.content = accumulated;
        mode = "online";
      } else {
        mode = "local";
        reply.content = "";
        updateLocalStreaming(reply, localReply(content, profile), updateBubble);
        await wait(420);
      }
    } finally {
      clearTimeout(timeout);
      currentAbort = null;
    }

    reply.content = reply.content || accumulated;
    if (!reply.content.trim()) {
      if (mode === "local") {
        reply.content = localReply(content, profile);
      } else {
        reply.content = "I didn't get a response from the model. Please try again.";
        reply.error = true;
      }
    }
    delete reply.streaming;
    convo.updatedAt = Date.now();
    streaming = false;
    setStatus(mode === "online" ? "online" : "local");
    els.send.classList.remove("streaming");
    saveStore();
    renderMessages();
    els.input.focus();
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function updateLocalStreaming(reply, fullText, updateBubble) {
    // Reveal the offline answer progressively so it feels live.
    var words = fullText.split(/(\s+)/);
    var index = 0;
    return new Promise(function (resolve) {
      var step = function () {
        if (!streaming) { resolve(); return; }
        index += 1;
        reply.content = words.slice(0, index).join("");
        updateBubble();
        if (index >= words.length) { resolve(); return; }
        setTimeout(step, words[index] && words[index].trim() ? 18 : 8);
      };
      step();
    });
  }

  function stopStreaming() {
    if (currentAbort) currentAbort.abort();
  }

  // ---- Composer -----------------------------------------------------------
  function resizeInput() {
    els.input.style.height = "auto";
    els.input.style.height = clamp(els.input.scrollHeight, 24, 200) + "px";
  }

  function submit() {
    if (streaming) {
      stopStreaming();
      return;
    }
    sendMessage(els.input.value);
  }

  // ---- Theme --------------------------------------------------------------
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    els.themeValue.textContent = theme === "light" ? "Light" : "Dark";
    try { localStorage.setItem(THEME_KEY, theme); } catch (error) { /* ignore */ }
  }

  // ---- Events -------------------------------------------------------------
  function wire() {
    els.persona.innerHTML = "";
    Object.keys(PERSONAS).forEach(function (key) {
      var option = document.createElement("option");
      option.value = key;
      option.textContent = PERSONAS[key].label;
      els.persona.append(option);
    });

    els.composer.addEventListener("submit", function (event) {
      event.preventDefault();
      submit();
    });

    els.input.addEventListener("input", resizeInput);
    els.input.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit();
      }
    });

    els.send.addEventListener("click", function (event) {
      if (streaming) {
        event.preventDefault();
        stopStreaming();
      }
    });

    els.newChat.addEventListener("click", function () {
      var convo = newConversation("assistant");
      state.conversations.unshift(convo);
      state.activeId = convo.id;
      saveStore();
      renderSidebar();
      renderMessages();
      els.app.classList.remove("nav-open");
      els.input.value = "";
      resizeInput();
      els.input.focus();
    });

    els.persona.addEventListener("change", function () {
      activeConversation().persona = els.persona.value;
      saveStore();
      renderMessages();
    });

    els.convoList.addEventListener("click", function (event) {
      var item = event.target.closest(".convo-item");
      if (!item) return;
      var id = item.dataset.id;
      if (event.target.closest(".del")) {
        state.conversations = state.conversations.filter(function (c) { return c.id !== id; });
        if (!state.conversations.length) state.conversations.push(newConversation("assistant"));
        if (state.activeId === id) state.activeId = state.conversations[0].id;
        saveStore();
        renderSidebar();
        renderMessages();
        return;
      }
      state.activeId = id;
      saveStore();
      renderSidebar();
      renderMessages();
      els.app.classList.remove("nav-open");
    });

    els.convoList.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      var item = event.target.closest(".convo-item");
      if (!item) return;
      event.preventDefault();
      state.activeId = item.dataset.id;
      saveStore();
      renderSidebar();
      renderMessages();
    });

    els.clear.addEventListener("click", function () {
      var convo = activeConversation();
      convo.messages = [];
      convo.title = "New chat";
      convo.updatedAt = Date.now();
      saveStore();
      renderSidebar();
      renderMessages();
      els.input.focus();
    });

    els.menu.addEventListener("click", function () {
      var open = els.app.classList.toggle("nav-open");
      els.menu.setAttribute("aria-expanded", open ? "true" : "false");
      els.backdrop.hidden = !open;
    });

    els.backdrop.addEventListener("click", function () {
      els.app.classList.remove("nav-open");
      els.menu.setAttribute("aria-expanded", "false");
      els.backdrop.hidden = true;
    });

    els.themeToggle.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      applyTheme(next);
    });

    els.messages.addEventListener("click", function (event) {
      var chip = event.target.closest("#chips button");
      if (chip) {
        sendMessage(chip.dataset.prompt);
        return;
      }
      var copyCode = event.target.closest(".copy-code");
      if (copyCode) {
        var code = copyCode.closest(".code-block").querySelector("code");
        copyText(code ? code.textContent : "", copyCode, "Copy");
        return;
      }
      var copyBtn = event.target.closest('[data-copy="1"]');
      if (copyBtn) {
        var bubble = copyBtn.closest(".bubble-wrap").querySelector(".bubble");
        copyText(bubble ? bubble.innerText : "", copyBtn, "Copy");
      }
    });

    els.messages.addEventListener("scroll", function () {
      var distance = els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight;
      stickToBottom = distance < 60;
    });

    window.addEventListener("resize", resizeInput);
  }

  function copyText(text, button, idle) {
    var done = function () {
      button.textContent = "Copied";
      setTimeout(function () { button.textContent = idle; }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    try {
      var area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      done();
    } catch (error) {
      /* ignore */
    }
  }

  // ---- Boot ---------------------------------------------------------------
  function boot() {
    var storedTheme = null;
    try { storedTheme = localStorage.getItem(THEME_KEY); } catch (error) { /* ignore */ }
    if (!storedTheme) {
      storedTheme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    applyTheme(storedTheme);

    wire();
    els.persona.value = activeConversation().persona;
    renderSidebar();
    renderMessages();
    setStatus();
    resizeInput();
    els.input.focus();
  }

  boot();
})();
