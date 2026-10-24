import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const dataDir = resolve(process.env.DATA_DIR || ".data");
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true, mode: 0o700 });

function loadEncryptionKey(): Buffer {
  const fromEnv = process.env.CREDENTIAL_ENCRYPTION_KEY || "";
  if (fromEnv.length >= 32) {
    if (/^[0-9a-f]{64}$/i.test(fromEnv)) return Buffer.from(fromEnv, "hex");
    return Buffer.from(fromEnv, "utf8").subarray(0, 32);
  }
  const keyFile = join(dataDir, "credential.key");
  if (existsSync(keyFile)) {
    const stored = readFileSync(keyFile, "utf8").trim();
    if (/^[0-9a-f]{64}$/i.test(stored)) return Buffer.from(stored, "hex");
  }
  const generated = randomBytes(32);
  writeFileSync(keyFile, generated.toString("hex"), { mode: 0o600 });
  return generated;
}

function detectChromium(): string | undefined {
  const candidates = [
    process.env.CHROMIUM_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/ms-playwright/chromium/chrome-linux/chrome",
  ].filter(Boolean) as string[];
  return candidates.find((candidate) => existsSync(candidate));
}

function detectPlaywrightChromium(): string | undefined {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    join(process.env.HOME || "", ".cache/ms-playwright"),
  ].filter(Boolean) as string[];
  for (const root of roots) {
    try {
      for (const entry of readdirSync(root)) {
        if (!entry.startsWith("chromium-")) continue;
        for (const suffix of ["chrome-linux/chrome", "chrome-linux/headless_shell"]) {
          const candidate = join(root, entry, suffix);
          if (existsSync(candidate)) return candidate;
        }
      }
    } catch {
      /* noop */
    }
  }
  return undefined;
}

const chromiumPath = detectChromium() || detectPlaywrightChromium();
const authPassword = process.env.AUTH_PASSWORD || "";
const demoMode = bool(process.env.DEMO_MODE, !authPassword);

export const config = {
  version: "1.0.0",
  port: int(process.env.PORT || process.env.APP_PORT, 3000),
  host: process.env.HOST || "0.0.0.0",
  nodeEnv: process.env.NODE_ENV || "development",
  dataDir,
  databaseUrl: process.env.DATABASE_URL || "",
  databaseSsl: bool(process.env.DATABASE_SSL, false),
  databaseFallback: bool(process.env.DATABASE_FALLBACK, true),
  authPassword,
  authSecret: process.env.AUTH_SECRET || randomBytes(32).toString("hex"),
  authRequired: Boolean(authPassword),
  demoMode,
  tokenTtlHours: int(process.env.AUTH_TOKEN_TTL_HOURS, 24 * 7),
  encryptionKey: loadEncryptionKey(),
  workerToken: process.env.WORKER_TOKEN || "",
  analyticsApiKey: process.env.ANALYTICS_API_KEY || "",
  llm: {
    baseUrl: process.env.LLM_BASE_URL || "https://api.openai.com/v1",
    model: process.env.LLM_MODEL || "gpt-4o-mini",
    apiKey: process.env.LLM_API_KEY || "",
    temperature: Number(process.env.LLM_TEMPERATURE || 0.2),
  },
  maxConcurrentSessions: int(process.env.MAX_CONCURRENT_SESSIONS, 3),
  maxSessionsPerBatch: Math.min(100, int(process.env.MAX_SESSIONS_PER_BATCH, 100)),
  maxActiveSessions: int(process.env.MAX_ACTIVE_SESSIONS, 25),
  rateLimitPerMinute: int(process.env.RATE_LIMIT_PER_MINUTE, 240),
  blockPrivateTargets: bool(process.env.BLOCK_PRIVATE_TARGETS, true),
  allowDockerWorkers: bool(process.env.ALLOW_DOCKER_WORKERS, true),
  browser: {
    executablePath: chromiumPath || "",
    headless: bool(process.env.BROWSER_HEADLESS, true),
    noSandbox: bool(process.env.BROWSER_NO_SANDBOX, Boolean(chromiumPath && chromiumPath.startsWith("/usr"))),
  },
  worker: {
    id: process.env.WORKER_ID || "worker-local-1",
    name: process.env.WORKER_NAME || "local-edge-1",
    region: process.env.WORKER_REGION || "local",
    maxSessions: int(process.env.WORKER_MAX_SESSIONS, 12),
    bandwidthMbps: Number(process.env.WORKER_BANDWIDTH_MBPS || 1000),
  },
  inspector: {
    timeoutMs: int(process.env.INSPECT_TIMEOUT_MS, 12000),
    maxRedirects: int(process.env.INSPECT_MAX_REDIRECTS, 10),
    maxBodyBytes: int(process.env.INSPECT_MAX_BODY_BYTES, 768 * 1024),
    userAgent:
      process.env.INSPECT_USER_AGENT ||
      "LinkPilotAI/1.0 (authorized redirect and ad-placement inspection)",
  },
  allowLocalTargets: bool(process.env.ALLOW_LOCAL_TARGETS, false),
  eventRetention: int(process.env.EVENT_RETENTION, 20000),
  previewIntervalMs: int(process.env.PREVIEW_INTERVAL_MS, 3500),
};

export type AppConfig = typeof config;
