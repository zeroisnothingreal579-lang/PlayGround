"use strict";

function mountCalendar(win) {
  const todayKey = cb.dayKey(0);
  let cursor = new Date();
  cursor.setDate(1);
  let selected = todayKey;
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const parseKey = (key) => new Date(`${key}T00:00:00`);
  const keyFor = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const eventsOn = (key) => S.events.filter((event) => event.date === key).sort((a, b) => a.time.localeCompare(b.time));
  const colorFor = (color) => ({ cyan: "#67e8f9", violet: "#a78bfa", amber: "#fbbf24", rose: "#fb7185", emerald: "#6ee7b7" }[color] || "#a78bfa");
  const render = () => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    const cells = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = keyFor(date);
      return {
        key,
        date,
        current: date.getMonth() === month,
        today: key === todayKey,
        selected: key === selected,
        events: eventsOn(key)
      };
    });
    const selectedDate = parseKey(selected);
    const dayEvents = eventsOn(selected);
    win.body.innerHTML = `
      <div class="calendar-app">
        <section class="cal-main">
          <header class="cal-top">
            <div>
              <span class="cal-kicker">${cb.icon("calendar")} Cloud calendar</span>
              <h2>${monthNames[month]} ${year}</h2>
            </div>
            <div class="cal-nav">
              <button class="icon-btn" data-cal-prev aria-label="Previous month">${cb.icon("chevron-left")}</button>
              <button class="btn sm ghost" data-cal-today>Today</button>
              <button class="icon-btn" data-cal-next aria-label="Next month">${cb.icon("chevron-right")}</button>
            </div>
          </header>
          <div class="cal-weekdays">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<span>${day}</span>`).join("")}</div>
          <div class="cal-grid">
            ${cells.map((cell) => `
              <button class="cal-day ${cell.current ? "" : "muted"} ${cell.today ? "today" : ""} ${cell.selected ? "selected" : ""}" data-cal-day="${cell.key}">
                <span>${cell.date.getDate()}</span>
                <div class="cal-dots">${cell.events.slice(0, 3).map((event) => `<i style="background:${colorFor(event.color)}"></i>`).join("")}</div>
              </button>`).join("")}
          </div>
        </section>
        <aside class="cal-side">
          <span class="cal-kicker">${dayNames[selectedDate.getDay()]} · ${eventsOn(selected).length} event${eventsOn(selected).length === 1 ? "" : "s"}</span>
          <h3>${selectedDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })}</h3>
          <div class="cal-events">
            ${dayEvents.length ? dayEvents.map((event) => `
              <article class="cal-event" data-color="${event.color}">
                <span class="cal-event-dot"></span>
                <div>
                  <strong>${cb.esc(event.title)}</strong>
                  <span>${cb.esc(event.time)} · ${event.duration} min</span>
                  ${event.note ? `<em>${cb.esc(event.note)}</em>` : ""}
                </div>
                <button class="icon-btn" data-delete-event="${event.id}" aria-label="Delete event">${cb.icon("trash")}</button>
              </article>`).join("") : `<div class="cal-empty">${cb.icon("calendar")}<strong>No events yet</strong><span>Add one below to plan your day.</span></div>`}
          </div>
          <form class="cal-form" data-event-form>
            <strong>Add event</strong>
            <input data-event-title placeholder="Event title" maxlength="60" aria-label="Event title">
            <div class="cal-form-row">
              <input type="time" data-event-time value="09:00" aria-label="Event time">
              <select data-event-color aria-label="Event colour">
                <option value="violet">Violet</option>
                <option value="cyan">Cyan</option>
                <option value="amber">Amber</option>
                <option value="rose">Rose</option>
                <option value="emerald">Emerald</option>
              </select>
            </div>
            <button class="btn primary" type="submit">${cb.icon("plus")} Add event</button>
          </form>
          <div class="cal-upcoming">
            <strong>Coming up</strong>
            ${S.events.filter((event) => event.date >= todayKey).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).slice(0, 3).map((event) => `
              <button data-cal-day="${event.date}">
                <i style="background:${colorFor(event.color)}"></i>
                <div><strong>${cb.esc(event.title)}</strong><span>${parseKey(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${event.time}</span></div>
              </button>`).join("")}
          </div>
        </aside>
      </div>`;
    bind();
  };
  const bind = () => {
    cb.$("[data-cal-prev]", win.body).addEventListener("click", () => {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
      render();
    });
    cb.$("[data-cal-next]", win.body).addEventListener("click", () => {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      render();
    });
    cb.$("[data-cal-today]", win.body).addEventListener("click", () => {
      const today = new Date();
      cursor = new Date(today.getFullYear(), today.getMonth(), 1);
      selected = todayKey;
      render();
    });
    cb.$$("[data-cal-day]", win.body).forEach((button) => {
      button.addEventListener("click", () => {
        selected = button.dataset.calDay;
        const date = parseKey(selected);
        cursor = new Date(date.getFullYear(), date.getMonth(), 1);
        render();
      });
    });
    cb.$$("[data-delete-event]", win.body).forEach((button) => {
      button.addEventListener("click", () => {
        S.events = S.events.filter((event) => event.id !== button.dataset.deleteEvent);
        cb.save();
        render();
        cb.toast("Event removed", "Your calendar has been updated.", "info");
      });
    });
    cb.$("[data-event-form]", win.body).addEventListener("submit", (event) => {
      event.preventDefault();
      const titleInput = cb.$("[data-event-title]", win.body);
      const title = titleInput.value.trim();
      if (!title) {
        cb.toast("Add a title", "Every event needs a short name.", "alert");
        titleInput.focus();
        return;
      }
      S.events.push({
        id: cb.uid(),
        title,
        date: selected,
        time: cb.$("[data-event-time]", win.body).value || "09:00",
        duration: 30,
        color: cb.$("[data-event-color]", win.body).value,
        note: ""
      });
      cb.save();
      render();
      cb.toast("Event added", `${title} is on your calendar.`, "success");
    });
  };
  render();
}

function mountMail(win) {
  let folder = win.opts.folder || "inbox";
  let composing = false;
  let draft = { to: "", subject: "", body: "" };
  let selectedId = win.opts.messageId || S.mail.messages.find((message) => message.folder === "inbox" && !message.read)?.id || S.mail.messages[0]?.id || null;
  const folderNames = { inbox: "Inbox", starred: "Starred", sent: "Sent", archive: "Archive" };
  const folderMessages = () => {
    if (folder === "starred") return S.mail.messages.filter((message) => message.starred);
    return S.mail.messages.filter((message) => message.folder === folder);
  };
  const unreadCount = () => S.mail.messages.filter((message) => message.folder === "inbox" && !message.read).length;
  const selectedMessage = () => S.mail.messages.find((message) => message.id === selectedId) || null;
  const ensureSelected = () => {
    const list = folderMessages();
    if (!list.some((message) => message.id === selectedId)) selectedId = list[0]?.id || null;
  };
  const markRead = (message) => {
    if (!message || message.read) return;
    message.read = true;
    cb.save();
    cb.renderDock();
  };
  const render = () => {
    ensureSelected();
    const list = folderMessages();
    const message = selectedMessage();
    win.body.innerHTML = `
      <div class="mail-app">
        <aside class="mail-sidebar">
          <button class="btn primary mail-compose" data-compose>${cb.icon("edit")} Compose</button>
          <nav class="mail-folders">
            <button class="${folder === "inbox" ? "active" : ""}" data-folder="inbox">${cb.icon("mail")} Inbox ${unreadCount() ? `<em>${unreadCount()}</em>` : ""}</button>
            <button class="${folder === "starred" ? "active" : ""}" data-folder="starred">${cb.icon("star")} Starred</button>
            <button class="${folder === "sent" ? "active" : ""}" data-folder="sent">${cb.icon("send")} Sent</button>
            <button class="${folder === "archive" ? "active" : ""}" data-folder="archive">${cb.icon("archive")} Archive</button>
          </nav>
          <div class="mail-storage">
            <span>CloudMail storage</span>
            <div><i></i></div>
            <small>4.2 GB of 100 GB used</small>
          </div>
        </aside>
        <section class="mail-list">
          <header class="mail-list-head">
            <div><span>${folderNames[folder]}</span><small>${list.length} message${list.length === 1 ? "" : "s"}</small></div>
            <button class="icon-btn" data-compose aria-label="Compose">${cb.icon("edit")}</button>
          </header>
          <div class="mail-rows">
            ${list.length ? list.map((item) => `
              <article class="mail-row ${item.id === selectedId ? "active" : ""} ${item.read ? "" : "unread"}" data-mail-id="${item.id}">
                <span class="mail-avatar">${cb.esc((item.from || "A").split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase())}</span>
                <div class="mail-row-copy">
                  <div><strong>${cb.esc(item.from)}</strong><span>${cb.fmtTimeAgo(item.date)}</span></div>
                  <b>${cb.esc(item.subject)}</b>
                  <p>${cb.esc(item.preview)}</p>
                </div>
                <button class="mail-star ${item.starred ? "on" : ""}" data-star-mail="${item.id}" aria-label="Star message">${cb.icon("star")}</button>
              </article>`).join("") : `<div class="mail-empty">${cb.icon("mail")}<strong>Nothing here</strong><span>This folder is empty.</span></div>`}
          </div>
        </section>
        <section class="mail-reader">
          ${composing ? `
            <form class="mail-compose-form" data-compose-form>
              <div class="mail-compose-head"><strong>New message</strong><button type="button" class="icon-btn" data-discard aria-label="Discard">${cb.icon("x")}</button></div>
              <label>To<input data-draft-to value="${cb.esc(draft.to)}" placeholder="name@example.com" autocomplete="off"></label>
              <label>Subject<input data-draft-subject value="${cb.esc(draft.subject)}" placeholder="Subject" autocomplete="off"></label>
              <textarea data-draft-body placeholder="Write your message..." aria-label="Message body">${cb.esc(draft.body)}</textarea>
              <div class="mail-compose-foot"><button type="submit" class="btn primary">${cb.icon("send")} Send</button><button type="button" class="btn ghost" data-discard>Cancel</button></div>
            </form>` : message ? `
            <div class="mail-reader-head">
              <div class="mail-reader-actions">
                <button class="icon-btn" data-reply title="Reply">${cb.icon("reply")}</button>
                <button class="icon-btn" data-archive-mail title="Archive">${cb.icon("archive")}</button>
                <button class="icon-btn ${message.starred ? "active" : ""}" data-star-mail="${message.id}" title="Star">${cb.icon("star")}</button>
                <button class="icon-btn" data-delete-mail title="Delete">${cb.icon("trash")}</button>
              </div>
              <span>${cb.fmtTimeAgo(message.date)}</span>
            </div>
            <h2>${cb.esc(message.subject)}</h2>
            <div class="mail-sender">
              <span class="mail-avatar">${cb.esc((message.from || "A").split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase())}</span>
              <div><strong>${cb.esc(message.from)}</strong><span>${cb.esc(message.email)}</span></div>
              <em>to me</em>
            </div>
            <pre class="mail-body">${cb.esc(message.body)}</pre>
            <div class="mail-reply-box" data-reply>${cb.icon("reply")} Reply</div>` : `
            <div class="mail-empty">${cb.icon("mail")}<strong>Select a message</strong><span>Choose a conversation from the list or compose a new one.</span><button class="btn primary" data-compose>${cb.icon("edit")} Compose</button></div>`}
        </section>
      </div>`;
    bind();
  };
  const bind = () => {
    cb.$$("[data-folder]", win.body).forEach((button) => {
      button.addEventListener("click", () => {
        folder = button.dataset.folder;
        composing = false;
        selectedId = null;
        render();
      });
    });
    cb.$$("[data-compose]", win.body).forEach((button) => {
      button.addEventListener("click", () => {
        composing = true;
        draft = { to: "", subject: "", body: "" };
        render();
        cb.$("[data-draft-to]", win.body)?.focus();
      });
    });
    cb.$$("[data-discard]", win.body).forEach((button) => {
      button.addEventListener("click", () => {
        composing = false;
        render();
      });
    });
    cb.$$("[data-mail-id]", win.body).forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.closest("[data-star-mail]")) return;
        selectedId = row.dataset.mailId;
        const message = selectedMessage();
        markRead(message);
        composing = false;
        render();
      });
    });
    cb.$$("[data-star-mail]", win.body).forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const message = S.mail.messages.find((item) => item.id === button.dataset.starMail);
        if (!message) return;
        message.starred = !message.starred;
        cb.save();
        render();
      });
    });
    cb.$("[data-reply]", win.body)?.addEventListener("click", () => {
      const message = selectedMessage();
      if (!message) return;
      draft = {
        to: message.email,
        subject: `Re: ${message.subject}`,
        body: `\n\nOn ${new Date(message.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${message.from} wrote:\n${message.body.split("\n").map((line) => `> ${line}`).join("\n")}`
      };
      composing = true;
      render();
    });
    cb.$("[data-archive-mail]", win.body)?.addEventListener("click", () => {
      const message = selectedMessage();
      if (!message) return;
      message.folder = "archive";
      cb.save();
      selectedId = null;
      render();
      cb.renderDock();
      cb.toast("Message archived", "You can find it in Archive.", "success");
    });
    cb.$("[data-delete-mail]", win.body)?.addEventListener("click", () => {
      const message = selectedMessage();
      if (!message) return;
      S.mail.messages = S.mail.messages.filter((item) => item.id !== message.id);
      cb.save();
      selectedId = null;
      render();
      cb.renderDock();
      cb.toast("Message deleted", "The conversation was removed.", "info");
    });
    cb.$("[data-compose-form]", win.body)?.addEventListener("submit", (event) => {
      event.preventDefault();
      const to = cb.$("[data-draft-to]", win.body).value.trim();
      const subject = cb.$("[data-draft-subject]", win.body).value.trim() || "(No subject)";
      const body = cb.$("[data-draft-body]", win.body).value.trim();
      if (!to) {
        cb.toast("Add a recipient", "Who should receive this message?", "alert");
        cb.$("[data-draft-to]", win.body).focus();
        return;
      }
      const message = {
        id: cb.uid(),
        folder: "sent",
        from: S.user.name,
        email: S.user.email,
        subject,
        preview: body.slice(0, 110) || "Sent from CloudMail",
        body: `To: ${to}\n\n${body}`,
        date: cb.nowIso(0),
        read: true,
        starred: false
      };
      S.mail.messages.push(message);
      cb.save();
      folder = "sent";
      selectedId = message.id;
      composing = false;
      render();
      cb.toast("Message sent", `Your email to ${to} is on its way.`, "success");
    });
  };
  render();
}

function mountCamera(win) {
  let stream = null;
  let facing = "user";
  let mirrored = true;
  let shots = [];
  let starting = false;
  win.body.innerHTML = `
    <div class="camera-app">
      <header class="camera-head">
        <div><span class="camera-kicker">${cb.icon("camera")} Cloud camera</span><h2>Camera</h2></div>
        <div class="camera-head-actions">
          <span class="camera-status" data-camera-status><i></i> Camera off</span>
          <button class="icon-btn" data-camera-flip title="Switch camera">${cb.icon("refresh")}</button>
        </div>
      </header>
      <div class="camera-stage">
        <video data-camera-video autoplay playsinline muted hidden></video>
        <div class="camera-off" data-camera-off>
          <span class="camera-lens">${cb.icon("camera")}</span>
          <h3>Your camera is off</h3>
          <p>Turn on your webcam to take a photo. Captured images are saved to Photos in your cloud drive.</p>
          <button class="btn primary" data-camera-start>${cb.icon("camera")} Turn on camera</button>
        </div>
        <span class="camera-live" data-camera-live hidden>Live</span>
      </div>
      <div class="camera-controls">
        <button class="camera-shutter" data-camera-shoot disabled aria-label="Take photo"><span></span></button>
        <button class="btn sm ghost" data-camera-mirror>${cb.icon("refresh")} Mirror</button>
      </div>
      <div class="camera-gallery">
        <div class="camera-gallery-head"><strong>Recent captures</strong><span data-camera-count>0 photos</span></div>
        <div class="camera-shots" data-camera-shots><span class="camera-gallery-empty">Captured photos will appear here.</span></div>
      </div>
    </div>`;
  const video = cb.$("[data-camera-video]", win.body);
  const status = cb.$("[data-camera-status]", win.body);
  const off = cb.$("[data-camera-off]", win.body);
  const live = cb.$("[data-camera-live]", win.body);
  const shutter = cb.$("[data-camera-shoot]", win.body);
  const shotsEl = cb.$("[data-camera-shots]", win.body);
  const countEl = cb.$("[data-camera-count]", win.body);
  const bind = () => {};
  const setStatus = (text, tone = "") => {
    status.innerHTML = `<i class="${tone}"></i> ${cb.esc(text)}`;
    status.dataset.tone = tone;
  };
  const renderShots = () => {
    countEl.textContent = `${shots.length} photo${shots.length === 1 ? "" : "s"}`;
    shotsEl.innerHTML = shots.length
      ? shots.map((shot, index) => `<button class="camera-shot" data-shot="${index}"><img src="${shot.src}" alt="${cb.esc(shot.title)}"><span>${cb.esc(shot.title)}</span></button>`).join("")
      : `<span class="camera-gallery-empty">Captured photos will appear here.</span>`;
    cb.$$("[data-shot]", shotsEl).forEach((button) => {
      button.addEventListener("click", () => {
        const shot = shots[Number(button.dataset.shot)];
        cb.openApp("photos", { lightbox: shot });
      });
    });
  };
  const stop = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    video.srcObject = null;
    video.hidden = true;
    live.hidden = true;
    off.hidden = false;
    shutter.disabled = true;
    setStatus("Camera off");
  };
  const start = async () => {
    if (starting) return;
    starting = true;
    setStatus("Connecting…");
    off.innerHTML = `<span class="camera-lens">${cb.icon("camera")}</span><h3>Connecting to your camera</h3><p>Allow camera access if your browser asks.</p>`;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera API unavailable");
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      video.srcObject = stream;
      await video.play().catch(() => {});
      video.hidden = false;
      off.hidden = true;
      live.hidden = false;
      shutter.disabled = false;
      setStatus("Live · 1280 × 720", "live");
      if (mirrored) video.style.transform = "scaleX(-1)";
    } catch (error) {
      stop();
      setStatus("Camera unavailable");
      off.innerHTML = `<span class="camera-lens">${cb.icon("camera")}</span><h3>Camera unavailable</h3><p>Allow camera access in your browser, or continue without a webcam. You can still upload photos to your cloud gallery.</p><button class="btn primary" data-camera-start>${cb.icon("refresh")} Try again</button><button class="btn ghost" data-camera-upload>${cb.icon("upload")} Upload a photo</button><input type="file" accept="image/*" data-camera-file hidden>`;
    } finally {
      starting = false;
    }
  };
  const capture = () => {
    if (!stream || video.readyState < 2) {
      cb.toast("Camera not ready", "Wait a moment, then try again.", "info");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext("2d");
    if (mirrored) {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const src = canvas.toDataURL("image/jpeg", 0.88);
    const title = `Camera ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
    const shot = { title, src };
    shots.unshift(shot);
    if (shots.length > 12) shots.pop();
    S.photos.push(shot);
    cb.save();
    renderShots();
    cb.toast("Photo captured", "Saved to Photos in your cloud drive.", "success");
  };
  const addUpload = (file) => {
    if (!file) return;
    if (file.size > 1600000) {
      cb.toast("Image is too large", "Choose an image under 1.6 MB.", "alert");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const shot = { title: file.name.replace(/\.[^.]+$/, ""), src: reader.result };
      shots.unshift(shot);
      S.photos.push(shot);
      cb.save();
      renderShots();
      cb.toast("Photo added", "Your image is now in Photos.", "success");
    };
    reader.readAsDataURL(file);
  };
  win.body.addEventListener("click", (event) => {
    if (event.target.closest("[data-camera-start]")) start();
    if (event.target.closest("[data-camera-upload]")) cb.$("[data-camera-file]", win.body)?.click();
    if (event.target.closest("[data-camera-shoot]")) capture();
    if (event.target.closest("[data-camera-mirror]")) {
      mirrored = !mirrored;
      video.style.transform = mirrored ? "scaleX(-1)" : "none";
      cb.toast("Mirror", mirrored ? "Preview is mirrored." : "Preview is normal.", "info");
    }
    if (event.target.closest("[data-camera-flip]")) {
      facing = facing === "user" ? "environment" : "user";
      if (stream) {
        stop();
        start();
      } else {
        cb.toast("Camera switched", facing === "user" ? "Front camera selected." : "Rear camera selected.", "info");
      }
    }
  });
  win.body.addEventListener("change", (event) => {
    if (event.target.matches("[data-camera-file]")) addUpload(event.target.files?.[0]);
  });
  win.cleanups.push(stop);
  renderShots();
}

cb.registerApp("calendar", {
  name: "Calendar",
  icon: "calendar",
  w: 920,
  h: 630,
  mount: mountCalendar,
  category: "Productivity",
  description: "Plan your week with a beautiful month view, event colours, and persistent cloud events.",
  rating: "4.9"
});

cb.registerApp("mail", {
  name: "Mail",
  icon: "mail",
  w: 980,
  h: 640,
  mount: mountMail,
  category: "Productivity",
  description: "A complete CloudMail inbox with compose, reply, archive, stars, and unread badges.",
  rating: "4.9"
});

cb.registerApp("camera", {
  name: "Camera",
  icon: "camera",
  w: 760,
  h: 620,
  mount: mountCamera,
  category: "Media",
  description: "Use your real webcam in the cloud browser, capture photos, and save them straight to Photos.",
  rating: "4.8"
});
