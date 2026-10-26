"use strict";

const cb = (() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const icon = (name, cls = "") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const isMobile = () => window.innerWidth <= 760;
  const nowIso = (offsetDays = 0) => new Date(Date.now() - offsetDays * 86400000).toISOString();
  const dayKey = (offsetDays = 0) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const fmtBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[index]}`;
  };
  const fmtTimeAgo = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.max(1, Math.round(diff / 60000));
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  };
  const hexToRgb = (hex) => {
    const value = hex.replace("#", "");
    const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
    const num = parseInt(full, 16);
    return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`;
  };

  const ACCENTS = {
    violet: ["#8b7cff", "#67e8f9", "Violet"],
    cyan: ["#22d3ee", "#818cf8", "Cyan"],
    emerald: ["#34d399", "#22d3ee", "Emerald"],
    rose: ["#fb7185", "#f0abfc", "Rose"],
    amber: ["#fbbf24", "#fb7185", "Amber"]
  };

  const WALLPAPERS = [
    ["aurora", "Aurora"],
    ["midnight", "Midnight"],
    ["sunset", "Sunset"],
    ["ocean", "Ocean"],
    ["forest", "Forest"],
    ["pearl", "Pearl"]
  ];

  const REGIONS = {
    "us-west-2": 12,
    "us-east-1": 18,
    "eu-west-2": 26,
    "ap-south-1": 34,
    "ap-southeast-2": 41
  };

  const makeFile = (content, ext = "txt", days = 0) => ({ type: "file", content, ext, modified: nowIso(days) });
  const makeFolder = (children = {}) => ({ type: "folder", children });

  const welcomeMd = [
    "# Welcome to Aether CloudBook",
    "",
    "Your entire laptop now lives in the cloud.",
    "",
    "## What is inside",
    "",
    "- **8 vCPU** of dedicated compute",
    "- **20 GB** of instant memory",
    "- **1 TB** of NVMe cloud storage",
    "- **10 Gbps** networking with 12 ms latency",
    "",
    "Everything runs in us-west-2 and syncs the moment you make a change.",
    "",
    "## Try this",
    "",
    "1. Open the Terminal and type `neofetch`",
    "2. Watch your live resources in System Monitor",
    "3. Browse the web in Google Chrome",
    "4. Create a note in Notes and it will follow you to any device",
    "",
    "> There is no local machine to manage. Close the lid, open another device, and keep going.",
    "",
    "Welcome aboard.",
    "",
    "— The Aether team"
  ].join("\n");

  const guideMd = [
    "# CloudBook guide",
    "",
    "## Windows",
    "",
    "Drag the title bar to move a window. Use the bottom-right corner to resize. The three dots close, minimize, and maximize.",
    "",
    "## Apps",
    "",
    "Open the launcher with the grid button in the dock, or press Command + K. Everything is one search away.",
    "",
    "## Storage",
    "",
    "CloudBook includes 1 TB of NVMe storage. Use Files to browse your home folder, projects, and shared cloud folder.",
    "",
    "## Keyboard",
    "",
    "- Command + K — app launcher",
    "- Escape — close menus and overlays",
    "- Command + S — save in the editor",
    "",
    "## Power",
    "",
    "Lock or sleep the machine from the control centre. Your sessions stay warm in the cloud."
  ].join("\n");

  const roadmapMd = [
    "# Q4 roadmap",
    "",
    "- [x] Ship instant cloud boot",
    "- [x] 20 GB memory tier",
    "- [x] Shared 1 TB workspace",
    "- [ ] GPU accelerated workspaces",
    "- [ ] Multiplayer desktop sessions",
    "- [ ] Offline cache handoff",
    "",
    "Owner: Alex",
    "Status: on track"
  ].join("\n");

  const indexHtml = [
    "<!doctype html>",
    "<html>",
    "  <head>",
    "    <title>Aurora Studio</title>",
    "    <link rel=\"stylesheet\" href=\"styles.css\">",
    "  </head>",
    "  <body>",
    "    <main class=\"hero\">",
    "      <p class=\"eyebrow\">Design without limits</p>",
    "      <h1>A studio in the cloud.</h1>",
    "      <p>Built on Aether CloudBook.</p>",
    "    </main>",
    "  </body>",
    "</html>"
  ].join("\n");

  const stylesCss = [
    ":root {",
    "  --ink: #eef1ff;",
    "  --accent: #8b7cff;",
    "  --accent-2: #67e8f9;",
    "}",
    "",
    "body {",
    "  margin: 0;",
    "  min-height: 100vh;",
    "  display: grid;",
    "  place-items: center;",
    "  color: var(--ink);",
    "  font-family: Inter, system-ui, sans-serif;",
    "  background: radial-gradient(circle at 30% 20%, #241a5c, #05060f 65%);",
    "}",
    "",
    ".hero h1 {",
    "  font-size: 64px;",
    "  letter-spacing: -0.05em;",
    "  margin: 0;",
    "}",
    "",
    ".eyebrow {",
    "  text-transform: uppercase;",
    "  letter-spacing: 0.2em;",
    "  color: var(--accent-2);",
    "}"
  ].join("\n");

  const teamNotesMd = [
    "# Team notes",
    "",
    "## Weekly sync",
    "",
    "- CloudBook 2.4 rollout is complete in us-west-2",
    "- New storage tier is live for every account",
    "- Latency is holding at 12 ms",
    "- Next: GPU workspaces in preview",
    "",
    "Shared by the Cloud Platform team."
  ].join("\n");

  const svgArt = (inner, w = 900, h = 640) => `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`
  )}`;

  const ARTWORKS = [
    {
      title: "Aurora",
      src: svgArt(`
        <defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1b1140"/><stop offset=".55" stop-color="#5626a8"/><stop offset="1" stop-color="#0b1230"/></linearGradient>
        <linearGradient id="b" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#67e8f9" stop-opacity=".9"/><stop offset="1" stop-color="#c084fc" stop-opacity="0"/></linearGradient>
        <filter id="g"><feGaussianBlur stdDeviation="22"/></filter></defs>
        <rect width="900" height="640" fill="url(#a)"/>
        <path d="M-100 390 C 160 260, 280 500, 500 330 S 820 160, 1020 250" fill="none" stroke="url(#b)" stroke-width="90" filter="url(#g)" opacity=".7"/>
        <path d="M-80 470 C 180 360, 340 540, 560 400 S 850 270, 1000 330" fill="none" stroke="#8b7cff" stroke-width="36" filter="url(#g)" opacity=".4"/>
        <circle cx="720" cy="140" r="46" fill="#67e8f9" opacity=".65" filter="url(#g)"/>
        <g fill="#fff"><circle cx="120" cy="100" r="1.6"/><circle cx="240" cy="70" r="1.2"/><circle cx="690" cy="60" r="1.4"/><circle cx="820" cy="120" r="1"/><circle cx="560" cy="90" r="1.2"/></g>
      `)
    },
    {
      title: "Nebula",
      src: svgArt(`
        <defs><radialGradient id="n" cx=".5" cy=".5" r=".7"><stop stop-color="#3b0e76"/><stop offset=".5" stop-color="#120b2e"/><stop offset="1" stop-color="#04050c"/></radialGradient>
        <filter id="b"><feGaussianBlur stdDeviation="18"/></filter></defs>
        <rect width="900" height="640" fill="url(#n)"/>
        <circle cx="470" cy="300" r="170" fill="#ec4899" opacity=".22" filter="url(#b)"/>
        <circle cx="620" cy="360" r="120" fill="#8b5cf6" opacity=".3" filter="url(#b)"/>
        <circle cx="350" cy="360" r="90" fill="#22d3ee" opacity=".22" filter="url(#b)"/>
        <circle cx="470" cy="300" r="44" fill="#fde68a" opacity=".8" filter="url(#b)"/>
        <g fill="#fff"><circle cx="160" cy="130" r="1.4"/><circle cx="260" cy="220" r="1"/><circle cx="720" cy="120" r="1.6"/><circle cx="800" cy="300" r="1.2"/><circle cx="140" cy="480" r="1.3"/><circle cx="650" cy="520" r="1"/><circle cx="820" cy="560" r="1.4"/></g>
      `)
    },
    {
      title: "Dunes",
      src: svgArt(`
        <defs><linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fb923c"/><stop offset=".5" stop-color="#7c2d5b"/><stop offset="1" stop-color="#180e2e"/></linearGradient></defs>
        <rect width="900" height="640" fill="url(#d)"/>
        <circle cx="660" cy="170" r="70" fill="#fde68a" opacity=".9"/>
        <path d="M0 480 C 180 390 280 430 420 460 S 700 390 900 470 V640 H0Z" fill="#3c1338"/>
        <path d="M0 540 C 200 460 380 520 540 500 S 760 460 900 520 V640 H0Z" fill="#1c0b28"/>
        <path d="M0 590 C 240 530 460 570 660 550 S 820 530 900 560 V640 H0Z" fill="#0b0717"/>
      `)
    },
    {
      title: "Ocean",
      src: svgArt(`
        <defs><linearGradient id="o" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#082f49"/><stop offset=".55" stop-color="#0e7490"/><stop offset="1" stop-color="#020617"/></linearGradient>
        <linearGradient id="l" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#67e8f9"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></linearGradient></defs>
        <rect width="900" height="640" fill="url(#o)"/>
        <path d="M0 390 C 170 320 330 450 470 390 S 760 300 900 370" fill="none" stroke="url(#l)" stroke-width="3" opacity=".8"/>
        <path d="M0 470 C 220 380 360 540 540 450 S 760 390 900 460" fill="none" stroke="#22d3ee" stroke-width="2" opacity=".35"/>
        <circle cx="690" cy="170" r="58" fill="#bae6fd" opacity=".55"/>
        <circle cx="690" cy="170" r="90" fill="#67e8f9" opacity=".13"/>
      `)
    },
    {
      title: "Evergreen",
      src: svgArt(`
        <defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#052e16"/><stop offset=".55" stop-color="#166534"/><stop offset="1" stop-color="#020617"/></linearGradient></defs>
        <rect width="900" height="640" fill="url(#f)"/>
        <circle cx="680" cy="130" r="54" fill="#d9f99d" opacity=".6"/>
        <path d="M0 460 L150 250 L260 420 L410 170 L560 430 L680 300 L900 500 V640 H0Z" fill="#064e3b" opacity=".75"/>
        <path d="M0 540 L180 360 L330 510 L500 300 L680 500 L820 400 L900 470 V640 H0Z" fill="#022c22"/>
        <path d="M0 590 L200 470 L380 580 L560 430 L760 560 L900 520 V640 H0Z" fill="#010f0b"/>
      `)
    },
    {
      title: "Neon City",
      src: svgArt(`
        <defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#1e1b4b"/><stop offset="1" stop-color="#08070f"/></linearGradient>
        <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f472b6"/><stop offset="1" stop-color="#7c3aed" stop-opacity=".1"/></linearGradient></defs>
        <rect width="900" height="640" fill="url(#c)"/>
        <g fill="#140f2d"><rect x="60" y="250" width="100" height="390"/><rect x="190" y="180" width="120" height="460"/><rect x="350" y="300" width="90" height="340"/><rect x="470" y="210" width="130" height="430"/><rect x="640" y="280" width="95" height="360"/><rect x="770" y="160" width="100" height="480"/></g>
        <g stroke="url(#s)" stroke-width="3" fill="none" opacity=".85"><path d="M190 180 H310 M470 210 H600 M770 160 H870"/></g>
        <g fill="#67e8f9" opacity=".65"><rect x="80" y="290" width="8" height="8"/><rect x="110" y="330" width="8" height="8"/><rect x="210" y="230" width="8" height="8"/><rect x="250" y="280" width="8" height="8"/><rect x="500" y="260" width="8" height="8"/><rect x="550" y="320" width="8" height="8"/><rect x="680" y="330" width="8" height="8"/><rect x="800" y="220" width="8" height="8"/></g>
        <g fill="#f472b6" opacity=".6"><rect x="130" y="380" width="8" height="8"/><rect x="290" y="250" width="8" height="8"/><rect x="510" y="390" width="8" height="8"/><rect x="700" y="260" width="8" height="8"/><rect x="830" y="340" width="8" height="8"/></g>
      `)
    },
    {
      title: "Bloom",
      src: svgArt(`
        <defs><radialGradient id="b2" cx=".5" cy=".45" r=".65"><stop stop-color="#7e22ce"/><stop offset=".6" stop-color="#3b0764"/><stop offset="1" stop-color="#0b0418"/></radialGradient></defs>
        <rect width="900" height="640" fill="url(#b2)"/>
        <g transform="translate(460 320)" fill="none" stroke="#f0abfc" opacity=".8">
          <ellipse rx="160" ry="52" transform="rotate(20)" stroke-width="2"/>
          <ellipse rx="160" ry="52" transform="rotate(80)" stroke-width="2"/>
          <ellipse rx="160" ry="52" transform="rotate(140)" stroke-width="2"/>
          <circle r="48" fill="#fbcfe8" opacity=".35" stroke="none"/>
        </g>
        <circle cx="460" cy="320" r="18" fill="#fdf4ff"/>
        <g fill="#fff" opacity=".8"><circle cx="170" cy="130" r="1.6"/><circle cx="720" cy="100" r="1.2"/><circle cx="790" cy="470" r="1.5"/><circle cx="120" cy="500" r="1.2"/><circle cx="640" cy="550" r="1.3"/></g>
      `)
    },
    {
      title: "Eclipse",
      src: svgArt(`
        <defs><linearGradient id="e" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#0f172a"/><stop offset=".6" stop-color="#1e1b4b"/><stop offset="1" stop-color="#020617"/></linearGradient>
        <radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop stop-color="#fbbf24" stop-opacity=".9"/><stop offset=".45" stop-color="#f97316" stop-opacity=".45"/><stop offset="1" stop-color="#f97316" stop-opacity="0"/></radialGradient></defs>
        <rect width="900" height="640" fill="url(#e)"/>
        <circle cx="450" cy="300" r="200" fill="url(#glow)" opacity=".7"/>
        <circle cx="450" cy="300" r="120" fill="#090b18"/>
        <circle cx="450" cy="300" r="120" fill="none" stroke="#fde68a" stroke-width="2" opacity=".65"/>
        <g fill="#fff"><circle cx="180" cy="140" r="1.4"/><circle cx="270" cy="90" r="1"/><circle cx="700" cy="120" r="1.5"/><circle cx="780" cy="260" r="1.1"/><circle cx="140" cy="420" r="1.2"/><circle cx="680" cy="500" r="1.4"/><circle cx="820" cy="540" r="1"/></g>
      `)
    }
  ];

  function defaultState() {
    return {
      version: 1,
      user: { name: "Alex Rivera", email: "alex@aether.cloud" },
      settings: {
        wallpaper: "aurora",
        accent: "violet",
        theme: "dark",
        volume: 70,
        brightness: 100,
        wifi: true,
        sync: true,
        bluetooth: false,
        focus: false,
        reduceMotion: false,
        region: "us-west-2"
      },
      installed: ["home", "chrome", "mail", "calendar", "files", "monitor", "terminal", "notes", "editor", "photos", "music", "camera", "calculator", "store", "settings"],
      notes: [
        {
          id: "note-welcome",
          title: "Welcome to CloudBook",
          body: "This note lives in the cloud.\n\nOpen it on your phone, tablet, or another laptop and keep typing from the exact same place.\n\nTry Command + K to search everything.",
          updated: nowIso(0)
        },
        {
          id: "note-ideas",
          title: "Ideas for Aurora Studio",
          body: "1. A homepage that feels like a sunrise\n2. Editorial type with lots of air\n3. Subtle motion on scroll\n4. A case study for the CloudBook launch\n5. Ship the first version this week",
          updated: nowIso(1)
        },
        {
          id: "note-shopping",
          title: "Cloud workspace checklist",
          body: "- Move final renders to cloud/shared\n- Invite the design team\n- Set up nightly backups\n- Archive the old prototype\n- Book the launch retro",
          updated: nowIso(3)
        }
      ],
      photos: [],
      events: [
        { id: "ev-standup", title: "Daily standup", date: dayKey(0), time: "09:30", duration: 30, color: "cyan", note: "Engineering sync · CloudBook team" },
        { id: "ev-design", title: "Design review", date: dayKey(1), time: "14:00", duration: 60, color: "violet", note: "Aurora launch review with the product team" },
        { id: "ev-focus", title: "Deep work block", date: dayKey(2), time: "10:00", duration: 120, color: "amber", note: "No meetings. Build the new desktop." },
        { id: "ev-launch", title: "CloudBook launch", date: dayKey(5), time: "16:00", duration: 90, color: "rose", note: "Ship AetherOS 2.4 to everyone" }
      ],
      mail: {
        messages: [
          {
            id: "mail-1",
            folder: "inbox",
            from: "Maya Chen",
            email: "maya@aether.cloud",
            subject: "CloudBook 2.4 launch checklist",
            preview: "We are green across every region. Here is the final checklist before the launch window.",
            body: "Hi Alex,\n\nWe are green across every region. Here is the final checklist before the launch window:\n\n1. Confirm the 20 GB memory tier is live in all zones\n2. Publish the CloudBook 2.4 release notes\n3. Schedule the launch note to every customer\n4. Keep the status page open during rollout\n\nThe team is ready. This is going to be a great release.\n\nMaya",
            date: nowIso(0),
            read: false,
            starred: true
          },
          {
            id: "mail-2",
            folder: "inbox",
            from: "Aether Cloud",
            email: "hello@aether.cloud",
            subject: "Your new 1 TB cloud volume is ready",
            preview: "Your workspace has been upgraded. NVMe storage, snapshots, and instant sync are now active.",
            body: "Hello Alex,\n\nYour CloudBook Pro workspace has been upgraded to 1 TB of encrypted NVMe storage.\n\nWhat is new:\n- Instant snapshots every hour\n- Three-zone replication\n- Shared folders for your team\n- No egress fees\n\nNothing is required from you. Everything is already live.\n\n— Aether Cloud",
            date: nowIso(1),
            read: false,
            starred: false
          },
          {
            id: "mail-3",
            folder: "inbox",
            from: "Dev Patel",
            email: "dev@aurorastudio.co",
            subject: "Homepage handoff",
            preview: "The new homepage is in the shared CloudBook folder. Can you take a look before Friday?",
            body: "Hey Alex,\n\nThe new homepage is in the shared CloudBook folder. I tightened the hero section and added the launch story.\n\nCan you take a look before Friday? The only open question is whether we keep the full-width chart or move it into the case study.\n\nThanks,\nDev",
            date: nowIso(2),
            read: true,
            starred: true
          },
          {
            id: "mail-4",
            folder: "inbox",
            from: "Aether Security",
            email: "security@aether.cloud",
            subject: "New sign-in from Chrome on Linux",
            preview: "We noticed a new sign-in to your CloudBook account from San Francisco.",
            body: "We noticed a new sign-in to your CloudBook account.\n\nDevice: Chrome on Linux\nLocation: San Francisco, US\nTime: Today at 09:12\n\nIf this was you, no action is needed. If not, lock your CloudBook and change your password immediately.\n\n— Aether Security",
            date: nowIso(3),
            read: true,
            starred: false
          },
          {
            id: "mail-5",
            folder: "sent",
            from: "Alex Rivera",
            email: "alex@aether.cloud",
            subject: "Re: Homepage handoff",
            preview: "Looks great. Let's keep the full-width chart and add the case study below it.",
            body: "Hi Dev,\n\nLooks great. Let's keep the full-width chart and add the case study below it.\n\nI will review the copy on Thursday and send final notes.\n\nAlex",
            date: nowIso(1),
            read: true,
            starred: false
          }
        ]
      },
      files: makeFolder({
        home: makeFolder({
          alex: makeFolder({
            Documents: makeFolder({
              "Welcome.md": makeFile(welcomeMd, "md", 0),
              "CloudBook-Guide.md": makeFile(guideMd, "md", 1),
              "Roadmap.md": makeFile(roadmapMd, "md", 2)
            }),
            Projects: makeFolder({
              "aurora-site": makeFolder({
                "index.html": makeFile(indexHtml, "html", 0),
                "styles.css": makeFile(stylesCss, "css", 0)
              }),
              "untitled-idea.txt": makeFile("A cloud-first studio site with a single giant headline and nothing else.", "txt", 4)
            }),
            Pictures: makeFolder({
              "aurora.svg": makeFile(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="640"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#2b1055"/><stop offset="1" stop-color="#05060f"/></linearGradient></defs><rect width="900" height="640" fill="url(#g)"/><path d="M0 400 C220 260 380 520 600 350 S850 220 900 280" fill="none" stroke="#67e8f9" stroke-width="60" opacity=".55"/><circle cx="700" cy="140" r="48" fill="#f0abfc" opacity=".7"/></svg>`, "svg", 1)
            }),
            Downloads: makeFolder({
              "cloud-notes.txt": makeFile("CloudBook 2.4 release notes\n\n- 20 GB memory tier\n- 1 TB NVMe storage\n- Faster cold starts\n- New control centre", "txt", 5)
            }),
            Music: makeFolder({})
          })
        }),
        cloud: makeFolder({
          shared: makeFolder({
            "team-notes.md": makeFile(teamNotesMd, "md", 0)
          })
        }),
        etc: makeFolder({
          "os-release": makeFile("NAME=\"AetherOS\"\nVERSION=\"2.4 LTS (CloudBook)\"\nID=aetheros\nPRETTY_NAME=\"AetherOS 2.4 LTS\"", "txt", 30)
        })
      })
    };
  }

  function loadState() {
    const base = defaultState();
    try {
      const raw = localStorage.getItem("aether.cloudbook.v1");
      if (!raw) return base;
      const saved = JSON.parse(raw);
      if (saved.user) base.user = { ...base.user, ...saved.user };
      if (saved.settings) base.settings = { ...base.settings, ...saved.settings };
      if (Array.isArray(saved.installed)) {
        const installed = saved.installed.map((id) => (id === "browser" ? "chrome" : id)).filter((id) => typeof id === "string");
        const merged = new Set([...installed, ...base.installed]);
        const ordered = base.installed.filter((id) => merged.has(id));
        const extra = [...merged].filter((id) => !base.installed.includes(id));
        base.installed = ["home", ...Array.from(new Set([...ordered.filter((id) => id !== "home"), ...extra]))];
      }
      if (Array.isArray(saved.notes)) base.notes = saved.notes;
      if (Array.isArray(saved.photos)) base.photos = saved.photos;
      if (Array.isArray(saved.events)) base.events = saved.events;
      if (saved.mail && Array.isArray(saved.mail.messages)) base.mail = { messages: saved.mail.messages };
      if (saved.files && saved.files.type === "folder") base.files = saved.files;
    } catch (error) {
      return base;
    }
    return base;
  }

  function save() {
    try {
      localStorage.setItem("aether.cloudbook.v1", JSON.stringify(state));
    } catch (error) {
      toast("Storage limit reached", "Some changes could not be saved.", "alert");
    }
  }

  const state = loadState();

  const APPS = {};
  function registerApp(id, def) {
    APPS[id] = { id, ...def };
  }

  function propagateApps() {
    const filesMount = APPS.files?.mount;
    if (filesMount) filesMount.installed = state.installed;
  }

  function avatarText() {
    return (state.user.name || "A").trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  }

  function firstName() {
    return (state.user.name || "Alex").trim().split(/\s+/)[0];
  }

  function greeting() {
    const hour = new Date().getHours();
    const word = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    return `${word}, ${firstName()}`;
  }

  function latency() {
    return REGIONS[state.settings.region] ?? 12;
  }

  function applySettings() {
    const accent = ACCENTS[state.settings.accent] || ACCENTS.violet;
    document.documentElement.style.setProperty("--accent", accent[0]);
    document.documentElement.style.setProperty("--accent-2", accent[1]);
    document.documentElement.style.setProperty("--accent-rgb", hexToRgb(accent[0]));
    document.documentElement.dataset.theme = state.settings.theme;
    document.body.classList.toggle("reduce-motion", Boolean(state.settings.reduceMotion));
    const wallpaper = $("#wallpaper");
    wallpaper.dataset.wallpaper = state.settings.wallpaper;
    const region = $("#regionLabel");
    const lat = $("#latencyLabel");
    if (region) region.textContent = state.settings.region;
    if (lat) lat.textContent = `${latency()} ms`;
    $$(".cc-avatar, .lock-avatar").forEach((el) => { el.textContent = avatarText(); });
    $$(".avatar-btn").forEach((el) => { el.textContent = avatarText(); });
    const nameEl = $("#ccName");
    if (nameEl) nameEl.textContent = state.user.name;
    const greet = $("#ccGreeting");
    if (greet) greet.textContent = greeting();
    const brightness = state.settings.brightness ?? 100;
    const desktop = $("#desktop");
    if (desktop) desktop.style.filter = brightness < 100 ? `brightness(${brightness / 100})` : "";
    updateToggleUI();
  }

  function updateToggleUI() {
    $$(".cc-toggle[data-toggle]").forEach((el) => {
      const key = el.dataset.toggle;
      el.classList.toggle("on", Boolean(state.settings[key]));
    });
    const vol = $("#volumeRange");
    if (vol) vol.value = state.settings.volume;
    const bright = $("#brightnessRange");
    if (bright) bright.value = state.settings.brightness;
  }

  let toastTimer = 0;
  function toast(title, message = "", kind = "info") {
    const stack = $("#toastStack");
    if (!stack) return;
    const iconName = kind === "alert" ? "bell" : kind === "success" ? "check" : "cloud-check";
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<span class="toast-icon">${icon(iconName)}</span><span class="toast-text"><strong>${esc(title)}</strong>${message ? `<span>${esc(message)}</span>` : ""}</span>`;
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 280);
    }, 3200);
  }

  function modalRoot() {
    return $("#modalRoot");
  }

  function promptModal(title, description, value = "", placeholder = "", confirmText = "Save") {
    return new Promise((resolve) => {
      const root = modalRoot();
      root.innerHTML = `
        <div class="modal-backdrop">
          <form class="modal">
            <h3>${esc(title)}</h3>
            <p>${esc(description)}</p>
            <input class="field" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false">
            <div class="modal-actions">
              <button type="button" class="btn ghost" data-cancel>Cancel</button>
              <button type="submit" class="btn primary">${esc(confirmText)}</button>
            </div>
          </form>
        </div>`;
      const input = $("input", root);
      const close = (result) => { root.innerHTML = ""; resolve(result); };
      $("[data-cancel]", root).onclick = () => close(null);
      root.querySelector(".modal-backdrop").addEventListener("click", (event) => {
        if (event.target === event.currentTarget) close(null);
      });
      $("form", root).onsubmit = (event) => {
        event.preventDefault();
        close(input.value.trim() || null);
      };
      input.focus();
      input.select();
    });
  }

  function confirmModal(title, description, confirmText = "Confirm", danger = false) {
    return new Promise((resolve) => {
      const root = modalRoot();
      root.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal">
            <h3>${esc(title)}</h3>
            <p>${esc(description)}</p>
            <div class="modal-actions">
              <button type="button" class="btn ghost" data-cancel>Cancel</button>
              <button type="button" class="btn ${danger ? "danger" : "primary"}" data-confirm>${esc(confirmText)}</button>
            </div>
          </div>
        </div>`;
      const close = (result) => { root.innerHTML = ""; resolve(result); };
      $("[data-cancel]", root).onclick = () => close(false);
      $("[data-confirm]", root).onclick = () => close(true);
      root.querySelector(".modal-backdrop").addEventListener("click", (event) => {
        if (event.target === event.currentTarget) close(false);
      });
    });
  }

  function getNode(parts) {
    let node = state.files;
    for (const part of parts) {
      if (!node || node.type !== "folder" || !node.children || !node.children[part]) return null;
      node = node.children[part];
    }
    return node;
  }

  function parentOf(parts) {
    return parts.length ? getNode(parts.slice(0, -1)) : null;
  }

  function uniqueName(folder, wanted) {
    if (!folder?.children || !folder.children[wanted]) return wanted;
    const dot = wanted.lastIndexOf(".");
    const stem = dot > 0 ? wanted.slice(0, dot) : wanted;
    const ext = dot > 0 ? wanted.slice(dot) : "";
    let index = 2;
    while (folder.children[`${stem} ${index}${ext}`]) index += 1;
    return `${stem} ${index}${ext}`;
  }

  function fileType(name) {
    const ext = String(name).split(".").pop().toLowerCase();
    if (["md", "txt", "markdown"].includes(ext)) return "txt";
    if (["js", "ts", "css", "html", "json", "svg", "py", "sh"].includes(ext)) return "code";
    if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return "image";
    return "file";
  }

  function writeNode(parts, content) {
    const node = getNode(parts);
    if (!node || node.type !== "file") return false;
    node.content = content;
    node.modified = new Date().toISOString();
    save();
    return true;
  }

  function createNode(parts, name, type, content = "") {
    const folder = getNode(parts);
    if (!folder || folder.type !== "folder") return null;
    const finalName = uniqueName(folder, name);
    folder.children[finalName] = type === "folder"
      ? makeFolder({})
      : makeFile(content, finalName.split(".").pop()?.toLowerCase() || "txt", 0);
    save();
    return finalName;
  }

  function deleteNode(parts, name) {
    const folder = getNode(parts);
    if (!folder || !folder.children?.[name]) return false;
    delete folder.children[name];
    save();
    return true;
  }

  function renameNode(parts, oldName, newName) {
    const folder = getNode(parts);
    if (!folder || !folder.children?.[oldName]) return false;
    const finalName = uniqueName(folder, newName);
    folder.children[finalName] = folder.children[oldName];
    if (finalName !== oldName) delete folder.children[oldName];
    save();
    return finalName;
  }

  function openFile(parts) {
    const node = getNode(parts);
    if (!node) return;
    const ext = String(parts[parts.length - 1]).split(".").pop().toLowerCase();
    if (node.type === "folder") {
      openApp("files", { path: parts });
      return;
    }
    if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) {
      const src = node.content.startsWith("data:") ? node.content : `data:image/svg+xml,${encodeURIComponent(node.content)}`;
      openApp("photos", { lightbox: { title: parts[parts.length - 1], src }, custom: true });
      return;
    }
    openApp("editor", { path: parts });
  }

  const openWindows = new Map();
  let windowZ = 200;
  let focusedId = null;

  function updateDockState() {
    $$(".dock-btn[data-app]").forEach((el) => {
      const id = el.dataset.app;
      const win = openWindows.get(id);
      el.classList.toggle("running", Boolean(win));
      el.classList.toggle("focused", Boolean(win) && focusedId === id && !win.el.classList.contains("minimized"));
    });
  }

  function focusedWindow() {
    return focusedId ? openWindows.get(focusedId) : null;
  }

  function focusWindow(win) {
    if (!win) return;
    focusedId = win.id;
    win.el.style.zIndex = String(++windowZ);
    openWindows.forEach((item) => item.el.classList.toggle("focused", item === win));
    updateDockState();
  }

  function minimizeWindow(win) {
    win.el.classList.add("minimized");
    if (focusedId === win.id) {
      focusedId = null;
      const next = Array.from(openWindows.values()).filter((item) => !item.el.classList.contains("minimized")).sort((a, b) => Number(b.el.style.zIndex) - Number(a.el.style.zIndex))[0];
      if (next) focusWindow(next);
    }
    updateDockState();
  }

  function closeWindow(win) {
    win.cleanups.forEach((fn) => {
      try { fn(); } catch (error) { /* ignored */ }
    });
    win.el.remove();
    openWindows.delete(win.id);
    if (focusedId === win.id) {
      focusedId = null;
      const next = Array.from(openWindows.values()).sort((a, b) => Number(b.el.style.zIndex) - Number(a.el.style.zIndex))[0];
      if (next) focusWindow(next);
    }
    updateDockState();
  }

  function toggleMaximize(win) {
    win.el.classList.toggle("maximized");
    focusWindow(win);
  }

  function addWindowAction(win, iconName, label, handler) {
    const actions = $(".window-actions", win.el);
    const button = document.createElement("button");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = icon(iconName);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handler();
    });
    actions.appendChild(button);
    return button;
  }

  function bindDrag(win) {
    const bar = $(".window-bar", win.el);
    bar.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      focusWindow(win);
      if (win.el.classList.contains("maximized") || isMobile()) return;
      const rect = win.el.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      const startZ = win.el.style.zIndex;
      bar.setPointerCapture(event.pointerId);
      const move = (moveEvent) => {
        const maxLeft = Math.max(0, window.innerWidth - 90);
        const maxTop = Math.max(46, window.innerHeight - 70);
        win.el.style.left = `${clamp(moveEvent.clientX - offsetX, 0, maxLeft)}px`;
        win.el.style.top = `${clamp(moveEvent.clientY - offsetY, 46, maxTop)}px`;
      };
      const up = () => {
        bar.removeEventListener("pointermove", move);
        bar.removeEventListener("pointerup", up);
        bar.removeEventListener("pointercancel", up);
      };
      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", up);
      bar.addEventListener("pointercancel", up);
      win.el.style.zIndex = startZ;
    });
    bar.addEventListener("dblclick", (event) => {
      if (event.target.closest("button")) return;
      toggleMaximize(win);
    });
  }

  function openApp(id, opts = {}) {
    const def = APPS[id];
    if (!def) {
      toast("App not found", "This app is not installed.", "alert");
      return null;
    }
    const existing = openWindows.get(id);
    if (existing) {
      existing.el.classList.remove("minimized");
      focusWindow(existing);
      if (def.onReopen) def.onReopen(existing, opts);
      return existing;
    }
    const template = $("#windowTemplate");
    const fragment = template.content.cloneNode(true);
    const el = fragment.querySelector(".window");
    const body = $(".window-body", el);
    el.dataset.app = id;
    const width = Math.min(def.w || 780, window.innerWidth - 24);
    const height = Math.min(def.h || 560, window.innerHeight - (isMobile() ? 132 : 120));
    const offset = (openWindows.size % 5) * 24;
    let left = Math.round((window.innerWidth - width) / 2 + offset - 48);
    let top = Math.round(64 + offset);
    if (id === "home") {
      left = Math.round((window.innerWidth - width) / 2);
      top = isMobile() ? 52 : 62;
    }
    if (isMobile()) {
      left = 6;
      top = 52;
      el.style.width = "";
      el.style.height = "";
    } else {
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
      el.style.left = `${Math.max(4, left)}px`;
      el.style.top = `${Math.max(48, top)}px`;
    }
    $(".window-app-name", el).textContent = def.name;
    const iconWrap = $(".window-app-icon", el);
    const accent = ACCENTS[state.settings.accent] || ACCENTS.violet;
    iconWrap.style.background = `linear-gradient(145deg, ${accent[0]}, ${accent[1]})`;
    iconWrap.innerHTML = icon(def.icon);
    el.addEventListener("pointerdown", () => focusWindow(win), true);
    $("[data-window-action='close']", el).addEventListener("click", () => closeWindow(win));
    $("[data-window-action='minimize']", el).addEventListener("click", () => minimizeWindow(win));
    $("[data-window-action='maximize']", el).addEventListener("click", () => toggleMaximize(win));
    const win = { id, def, el, body, opts, cleanups: [] };
    openWindows.set(id, win);
    bindDrag(win);
    $("#windows").appendChild(el);
    try {
      def.mount(win);
    } catch (error) {
      body.innerHTML = `<div class="files-empty">${icon("alert")}<strong>This app hit a snag.</strong><span>${esc(error.message)}</span></div>`;
      console.error(error);
    }
    focusWindow(win);
    updateDockState();
    return win;
  }

  function renderDesktopIcons() {
    const icons = [
      { kind: "drive", iconName: "hard-drive", label: "CloudBook Pro", action: () => openApp("files", { path: [] }) },
      { kind: "folder", iconName: "folder", label: "Projects", action: () => openApp("files", { path: ["home", "alex", "Projects"] }) },
      { kind: "file", iconName: "file", label: "Welcome.md", action: () => openFile(["home", "alex", "Documents", "Welcome.md"]) },
      { kind: "app", iconName: "chrome", label: "Google Chrome", action: () => openApp("chrome") },
      { kind: "app", iconName: "mail", label: "Mail", action: () => openApp("mail") }
    ];
    const root = $("#desktopIcons");
    root.innerHTML = icons.map((item, index) => `
      <button class="desk-icon" data-kind="${item.kind}" data-desk="${index}">
        <span class="desk-tile">${icon(item.iconName)}</span>
        <span>${esc(item.label)}</span>
      </button>`).join("");
    $$("[data-desk]", root).forEach((button) => {
      button.addEventListener("click", () => icons[Number(button.dataset.desk)].action());
    });
  }

  function renderDock() {
    const dock = $("#dock");
    const order = [...state.installed];
    if (!order.includes("settings")) order.push("settings");
    if (!order.includes("store")) order.splice(Math.max(0, order.length - 1), 0, "store");
    if (!order.includes("home")) order.unshift("home");
    const launcher = `
      <button class="dock-btn dock-launcher" id="dockLauncher" title="App launcher">
        <span class="app-icon">${icon("launch")}</span>
        <span class="dock-tip">Launcher</span>
      </button>
      <span class="dock-sep"></span>`;
    const unread = state.mail?.messages?.filter((message) => message.folder === "inbox" && !message.read).length || 0;
    const apps = order.filter((id) => APPS[id]).map((id) => `
      <button class="dock-btn" data-app="${id}" title="${esc(APPS[id].name)}">
        <span class="app-icon" data-app="${id}">${icon(APPS[id].icon)}${id === "mail" && unread ? `<span class="dock-badge">${unread}</span>` : ""}</span>
        <span class="dock-tip">${esc(APPS[id].name)}</span>
      </button>`).join("");
    dock.innerHTML = launcher + apps;
    $("#dockLauncher").addEventListener("click", toggleLauncher);
    $$(".dock-btn[data-app]", dock).forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.app;
        const win = openWindows.get(id);
        if (!win) {
          openApp(id);
          return;
        }
        if (win.el.classList.contains("minimized")) {
          win.el.classList.remove("minimized");
          focusWindow(win);
          return;
        }
        if (focusedId === id) {
          minimizeWindow(win);
        } else {
          focusWindow(win);
        }
      });
    });
    updateDockState();
  }

  function renderLauncher(filter = "") {
    const grid = $("#launcherGrid");
    const query = filter.trim().toLowerCase();
    const apps = state.installed.filter((id) => APPS[id] && (query || (id !== "home" && id !== "settings"))).filter((id) => {
      if (!query) return true;
      const app = APPS[id];
      return app.name.toLowerCase().includes(query) || id.includes(query);
    });
    if (!apps.length) {
      grid.innerHTML = `<div class="launcher-empty">No apps match “${esc(filter)}”</div>`;
      return;
    }
    grid.innerHTML = apps.map((id) => `
      <button class="launcher-item" data-open="${id}">
        <span class="app-icon" data-app="${id}">${icon(APPS[id].icon)}</span>
        <span>${esc(APPS[id].name)}</span>
      </button>`).join("");
    $$("[data-open]", grid).forEach((button) => {
      button.addEventListener("click", () => {
        closeLauncher();
        openApp(button.dataset.open);
      });
    });
  }

  let launcherOpen = false;
  function openLauncher() {
    launcherOpen = true;
    $("#launcher").hidden = false;
    const input = $("#launcherSearch");
    input.value = "";
    renderLauncher("");
    setTimeout(() => input.focus(), 30);
  }

  function closeLauncher() {
    launcherOpen = false;
    $("#launcher").hidden = true;
  }

  function toggleLauncher() {
    if (launcherOpen) closeLauncher();
    else openLauncher();
  }

  function renderCalendar() {
    const grid = $("#ccCalendar");
    if (!grid) return;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const first = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const monthEl = $("#ccMonth");
    if (monthEl) monthEl.textContent = `${monthNames[month]} ${year}`;
    let html = ["S", "M", "T", "W", "T", "F", "S"].map((day) => `<span class="day-label">${day}</span>`).join("");
    for (let i = 0; i < first; i += 1) html += "<span></span>";
    for (let day = 1; day <= days; day += 1) {
      const today = day === now.getDate();
      html += `<span class="${today ? "today" : ""}">${day}</span>`;
    }
    grid.innerHTML = html;
  }

  function tickClock() {
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    const shortDate = now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
    const longDate = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
    const clockTime = $("#clockTime");
    const clockDate = $("#clockDate");
    const lockTime = $("#lockTime");
    const lockDate = $("#lockDate");
    if (clockTime) clockTime.textContent = time;
    if (clockDate) clockDate.textContent = shortDate;
    if (lockTime) lockTime.textContent = time;
    if (lockDate) lockDate.textContent = longDate;
  }

  function openControlCenter() {
    const panel = $("#controlCenter");
    panel.hidden = false;
    renderCalendar();
    updateToggleUI();
    const greet = $("#ccGreeting");
    if (greet) greet.textContent = greeting();
    const name = $("#ccName");
    if (name) name.textContent = state.user.name;
  }

  function closeControlCenter() {
    $("#controlCenter").hidden = true;
  }

  function lockScreen() {
    closeControlCenter();
    closeLauncher();
    $("#lockScreen").hidden = false;
  }

  function unlockScreen() {
    $("#lockScreen").hidden = true;
  }

  function sleepScreen() {
    closeControlCenter();
    closeLauncher();
    $("#powerScreen").hidden = false;
  }

  function wakeScreen() {
    $("#powerScreen").hidden = true;
    tickClock();
    toast("Back online", "Reconnected to us-west-2 in 12 ms.", "success");
  }

  function restart() {
    toast("Restarting CloudBook", "Warm boot in progress…");
    setTimeout(() => window.location.reload(), 700);
  }

  async function factoryReset() {
    const yes = await confirmModal("Reset CloudBook?", "This clears local settings, notes, and files stored in this browser. Your cloud snapshot will be untouched.", "Reset everything", true);
    if (!yes) return;
    try { localStorage.removeItem("aether.cloudbook.v1"); } catch (error) { /* ignored */ }
    window.location.reload();
  }

  function setVolume(value) {
    state.settings.volume = Number(value);
    save();
    if (window.CloudBookAudio?.setVolume) window.CloudBookAudio.setVolume(state.settings.volume);
    updateToggleUI();
  }

  function bindShell() {
    const brand = $("#brandBtn");
    brand?.addEventListener("click", toggleLauncher);
    $("#clockBtn")?.addEventListener("click", () => {
      const panel = $("#controlCenter");
      if (panel.hidden) openControlCenter();
      else closeControlCenter();
    });
    $("#avatarBtn")?.addEventListener("click", () => {
      const panel = $("#controlCenter");
      if (panel.hidden) openControlCenter();
      else closeControlCenter();
    });
    $("#wifiBtn")?.addEventListener("click", () => {
      state.settings.wifi = !state.settings.wifi;
      save();
      updateToggleUI();
      toast(state.settings.wifi ? "Cloud Wi-Fi connected" : "Cloud Wi-Fi paused", state.settings.wifi ? "6E · 10 Gbps · 12 ms" : "Downloads will resume when reconnected", state.settings.wifi ? "success" : "info");
    });
    $("#batteryBtn")?.addEventListener("click", () => toast("Battery 98%", "Charging via Cloud Power. About 9 hours remaining."));
    $("#volumeBtn")?.addEventListener("click", () => {
      const next = state.settings.volume > 0 ? 0 : 70;
      setVolume(next);
      toast(next === 0 ? "Muted" : "Sound on", next === 0 ? "System audio is muted." : `Volume set to ${next}%.`);
    });
    $("#ccClose")?.addEventListener("click", closeControlCenter);
    $("#ccSettings")?.addEventListener("click", () => { closeControlCenter(); openApp("settings"); });
    $("#ccLock")?.addEventListener("click", lockScreen);
    $("#ccSleep")?.addEventListener("click", sleepScreen);
    $("#unlockBtn")?.addEventListener("click", unlockScreen);
    $("#powerWake")?.addEventListener("click", wakeScreen);
    $("#launcherClose")?.addEventListener("click", closeLauncher);
    $("#launcherLock")?.addEventListener("click", () => { closeLauncher(); lockScreen(); });
    $("#launcherSearch")?.addEventListener("input", (event) => renderLauncher(event.target.value));
    $("#launcher")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) closeLauncher();
    });
    $("#brightnessRange")?.addEventListener("input", (event) => {
      state.settings.brightness = Number(event.target.value);
      applySettings();
      save();
    });
    $("#volumeRange")?.addEventListener("input", (event) => setVolume(event.target.value));
    $$(".cc-toggle[data-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.toggle;
        state.settings[key] = !state.settings[key];
        updateToggleUI();
        save();
        const labels = { wifi: "Cloud Wi-Fi", sync: "Cloud sync", bluetooth: "Bluetooth", focus: "Focus" };
        toast(`${labels[key]} ${state.settings[key] ? "on" : "off"}`, state.settings[key] ? "Preference saved to your cloud profile." : "You can turn it back on anytime.");
      });
    });
    $$(".tb-menu").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.menuAction;
        if (action === "new-note") openApp("notes", { new: true });
        if (action === "launcher") openLauncher();
        if (action === "settings") openApp("settings");
      });
    });
    $$("[data-open]").forEach((button) => {
      if (button.closest("#launcherGrid") || button.closest(".home")) return;
      button.addEventListener("click", () => openApp(button.dataset.open));
    });
    document.addEventListener("keydown", (event) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggleLauncher();
      }
      if (event.key === "Escape") {
        closeLauncher();
        closeControlCenter();
        if (!$("#lockScreen").hidden) unlockScreen();
      }
    });
    document.addEventListener("pointerdown", (event) => {
      const panel = $("#controlCenter");
      if (!panel.hidden && !panel.contains(event.target) && !event.target.closest("#clockBtn") && !event.target.closest("#avatarBtn")) {
        closeControlCenter();
      }
    });
    let wasMobile = isMobile();
    window.addEventListener("resize", () => {
      const mobile = isMobile();
      if (mobile === wasMobile) return;
      wasMobile = mobile;
      $$(".window").forEach((el) => {
        const win = openWindows.get(el.dataset.app);
        if (!win) return;
        if (mobile) {
          el.style.left = "";
          el.style.top = "";
          el.style.width = "";
          el.style.height = "";
          return;
        }
        if (el.classList.contains("maximized")) return;
        const width = Math.min(win.def.w || 780, window.innerWidth - 24);
        const height = Math.min(win.def.h || 560, window.innerHeight - 120);
        const index = Array.from(openWindows.values()).indexOf(win);
        const offset = (index % 5) * 24;
        let left = Math.round((window.innerWidth - width) / 2 + offset - 48);
        let top = Math.round(64 + offset);
        if (win.id === "home") {
          left = Math.round((window.innerWidth - width) / 2);
          top = 62;
        }
        el.style.width = `${width}px`;
        el.style.height = `${height}px`;
        el.style.left = `${Math.max(4, left)}px`;
        el.style.top = `${Math.max(48, top)}px`;
      });
    });
  }

  function renderAll() {
    applySettings();
    renderDesktopIcons();
    renderDock();
    renderLauncher();
    renderCalendar();
    tickClock();
    bindShell();
  }

  function start() {
    renderAll();
    openApp("home");
    setInterval(tickClock, 1000);
    const boot = $("#boot");
    setTimeout(() => {
      boot.classList.add("exit");
      setTimeout(() => boot.remove(), 500);
    }, 430);
    setTimeout(() => {
      if (state.settings.sync) toast("CloudBook online", "20 GB RAM · 1 TB NVMe · us-west-2", "success");
    }, 1700);
  }

  return {
    $, $$, icon, esc, uid, clamp, wait, isMobile, nowIso, fmtBytes, fmtTimeAgo,
    ACCENTS, WALLPAPERS, REGIONS, ARTWORKS,
    state, save, applySettings, toast, promptModal, confirmModal,
    getNode, parentOf, uniqueName, fileType, writeNode, createNode, deleteNode, renameNode, openFile,
    APPS, registerApp, openApp, openWindows,
    focusedWindow, focusWindow, minimizeWindow, closeWindow, toggleMaximize, addWindowAction,
    renderDock, renderLauncher, openLauncher, closeLauncher, toggleLauncher,
    openControlCenter, closeControlCenter, lockScreen, unlockScreen, sleepScreen, wakeScreen,
    restart, factoryReset, setVolume, setVolumeUI: updateToggleUI,
    firstName, greeting, latency, avatarText,
    start
  };
})();
