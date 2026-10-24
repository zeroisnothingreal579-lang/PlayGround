import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type {
  AdObservation,
  CreateBatchResponse,
  SessionOptions,
  SessionRecord,
  VerifiedMetric,
} from "../shared/types.js";
import { config } from "./config.js";
import { HttpError, newId, nowIso } from "./lib/util.js";
import { toCsv, extractUrlsFromCsv } from "./lib/csv.js";
import { issueSessionToken } from "./lib/crypto.js";
import { buildAnalytics, buildOverview, adRows, linkRows, sessionRows, verifiedRows } from "./services/analytics.js";
import { createAndInspectLinks, inspectLinkById } from "./services/linkService.js";
import { getPublicSettings, updateAiSettings, type AiSettingsInput } from "./services/settings.js";
import { policySummary } from "./services/policy.js";
import { SessionManager } from "./services/sessionManager.js";
import { realtime } from "./realtime.js";
import type { Store } from "./store/types.js";
import {
  createLimiter,
  requireAnalyticsToken,
  requireAuth,
  requireWorkerToken,
  securityHeaders,
  verifyLoginPassword,
} from "./security.js";

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

function asyncHandler(handler: Handler): Handler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function stringField(value: unknown, max = 300): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function pathParam(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function bodyStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string") return value.split(/[\n,]+/);
  return [];
}

function workerIdFrom(req: Request): string {
  const id = req.header("x-worker-id");
  if (!id) throw new HttpError(400, "x-worker-id header is required", "missing_worker_id");
  return id.slice(0, 120);
}

function requestOptions(body: Record<string, unknown>): SessionOptions {
  const raw = (body.options ?? {}) as SessionOptions;
  const options: SessionOptions = { ...raw };
  if (body.aiEnabled !== undefined) options.aiEnabled = Boolean(body.aiEnabled);
  if (body.maxActions !== undefined) options.maxActions = Number(body.maxActions);
  if (body.viewport && typeof body.viewport === "object") {
    const viewport = body.viewport as { width?: unknown; height?: unknown };
    options.viewport = { width: Number(viewport.width) || 1280, height: Number(viewport.height) || 800 };
  }
  if (body.proxy !== undefined) options.proxy = body.proxy ? String(body.proxy) : null;
  return options;
}

function parseVerified(body: Record<string, unknown>): VerifiedMetric {
  const source = stringField(body.source, 80);
  const metric = stringField(body.metric, 20) as VerifiedMetric["metric"];
  const value = Number(body.value);
  const periodStart = stringField(body.periodStart, 40);
  const periodEnd = stringField(body.periodEnd, 40);
  if (!source) throw new HttpError(400, "source is required", "invalid_verified_metric");
  if (!["visits", "clicks", "impressions", "earnings", "other"].includes(metric)) {
    throw new HttpError(400, "metric must be visits, clicks, impressions, earnings, or other", "invalid_verified_metric");
  }
  if (!Number.isFinite(value) || value < 0) throw new HttpError(400, "value must be a non-negative number", "invalid_verified_metric");
  const startMs = Date.parse(periodStart);
  const endMs = Date.parse(periodEnd);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    throw new HttpError(400, "periodStart and periodEnd must be valid dates with end >= start", "invalid_verified_metric");
  }
  return {
    id: newId("ver"),
    source,
    metric,
    value: Number(value.toFixed(4)),
    periodStart: new Date(startMs).toISOString(),
    periodEnd: new Date(endMs).toISOString(),
    importedAt: nowIso(),
    note: stringField(body.note, 500) || null,
    raw: body.raw && typeof body.raw === "object" ? (body.raw as Record<string, unknown>) : null,
  };
}

export function createApp(store: Store, manager: SessionManager): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(securityHeaders);
  app.use(express.json({ limit: "3mb" }));
  app.use(createLimiter({ name: "global", windowMs: 60_000, max: config.rateLimitPerMinute }));

  app.get("/api/health", asyncHandler(async (_req, res) => {
    res.json({
      status: "ok",
      version: config.version,
      uptimeSeconds: Math.round(process.uptime()),
      demoMode: config.demoMode,
      authRequired: config.authRequired,
      database: store.kind,
      browser: {
        configured: Boolean(config.browser.executablePath),
        executable: config.browser.executablePath || null,
        headless: config.browser.headless,
      },
      features: {
        workerRegistration: Boolean(config.workerToken),
        verifiedAnalyticsImport: Boolean(config.analyticsApiKey),
        aiProvider: (await getPublicSettings(store)).ai.hasApiKey,
      },
    });
  }));

  const loginLimiter = createLimiter({ name: "login", windowMs: 15 * 60_000, max: 12 });
  app.post("/api/auth/login", loginLimiter, asyncHandler(async (req, res) => {
    const password = stringField((req.body as Record<string, unknown>)?.password, 300);
    if (config.authRequired && !verifyLoginPassword(password)) {
      res.status(401).json({ error: "Invalid password", code: "invalid_credentials" });
      return;
    }
    const mode = config.authRequired ? "password" : "demo";
    const token = issueSessionToken(mode);
    res.json({ token: token.token, expiresAt: token.expiresAt, mode });
  }));

  const workerLimiter = createLimiter({ name: "worker", windowMs: 60_000, max: 600 });
  app.post("/api/workers/register", workerLimiter, requireWorkerToken, asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const name = stringField(body.name, 80);
    const region = stringField(body.region, 40);
    if (!name || !region) throw new HttpError(400, "name and region are required", "invalid_worker");
    const worker = await manager.workers.registerRemote({
      id: body.id ? stringField(body.id, 120) : undefined,
      name,
      region,
      maxSessions: body.maxSessions === undefined ? undefined : Number(body.maxSessions),
      bandwidthMbps: body.bandwidthMbps === undefined ? undefined : Number(body.bandwidthMbps),
      meta: body.meta && typeof body.meta === "object" ? (body.meta as Record<string, unknown>) : undefined,
    });
    res.status(201).json({ worker });
  }));

  app.post("/api/workers/:id/heartbeat", workerLimiter, requireWorkerToken, asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const worker = await manager.workers.heartbeatRemote(pathParam(req, "id"), {
      cpu: body.cpu === undefined ? undefined : Number(body.cpu),
      memory: body.memory === undefined ? undefined : Number(body.memory),
      bandwidthMbps: body.bandwidthMbps === undefined ? undefined : Number(body.bandwidthMbps),
      activeSessions: body.activeSessions === undefined ? undefined : Number(body.activeSessions),
    });
    if (!worker) throw new HttpError(404, "Remote worker not found", "worker_not_found");
    res.json({ worker });
  }));

  app.get("/api/worker/jobs", workerLimiter, requireWorkerToken, asyncHandler(async (req, res) => {
    const workerId = workerIdFrom(req);
    const limit = Math.max(1, Math.min(10, Number(req.query.limit) || 3));
    const jobs = await manager.claimRemoteJobs(workerId, limit);
    res.json({ jobs });
  }));

  app.get("/api/worker/sessions/:id/state", workerLimiter, requireWorkerToken, asyncHandler(async (req, res) => {
    const workerId = workerIdFrom(req);
    const session = await store.getSession(pathParam(req, "id"));
    if (!session) throw new HttpError(404, "Session not found", "session_not_found");
    if (session.workerId !== workerId) throw new HttpError(403, "Session is assigned to another worker", "wrong_worker");
    res.json(manager.getRemoteControls(pathParam(req, "id")));
  }));

  app.post("/api/worker/sessions/:id/update", workerLimiter, requireWorkerToken, asyncHandler(async (req, res) => {
    const workerId = workerIdFrom(req);
    const session = await manager.applyRemoteUpdate(workerId, pathParam(req, "id"), req.body as Partial<SessionRecord>);
    res.json({ session });
  }));

  app.post("/api/worker/sessions/:id/events", workerLimiter, requireWorkerToken, asyncHandler(async (req, res) => {
    const workerId = workerIdFrom(req);
    const body = req.body as Record<string, unknown>;
    if (!["system", "navigation", "inspection", "action", "ad", "ai", "warning", "error", "summary"].includes(String(body.type))) {
      throw new HttpError(400, "Invalid event type", "invalid_event");
    }
    if (!["info", "success", "warn", "error"].includes(String(body.level))) {
      throw new HttpError(400, "Invalid event level", "invalid_event");
    }
    await manager.addRemoteEvent(workerId, pathParam(req, "id"), {
      type: body.type as never,
      level: body.level as never,
      message: stringField(body.message, 2000),
      data: body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : null,
    });
    res.status(201).json({ ok: true });
  }));

  app.post("/api/worker/sessions/:id/ads", workerLimiter, requireWorkerToken, asyncHandler(async (req, res) => {
    const workerId = workerIdFrom(req);
    const ad = await manager.addRemoteAd(workerId, pathParam(req, "id"), req.body as Partial<AdObservation>);
    res.status(201).json({ ad });
  }));

  app.post("/api/worker/sessions/:id/preview", workerLimiter, requireWorkerToken, asyncHandler(async (req, res) => {
    const workerId = workerIdFrom(req);
    const dataUrl = stringField((req.body as Record<string, unknown>)?.dataUrl, 2_500_000);
    if (!dataUrl.startsWith("data:image/")) throw new HttpError(400, "Preview must be an image data URL", "invalid_preview");
    manager.setRemotePreview(workerId, pathParam(req, "id"), dataUrl);
    res.status(202).json({ ok: true });
  }));

  const verifiedLimiter = createLimiter({ name: "verified", windowMs: 60_000, max: 60 });
  app.post("/api/analytics/verified", verifiedLimiter, requireAnalyticsToken, asyncHandler(async (req, res) => {
    const metric = parseVerified(req.body as Record<string, unknown>);
    await store.addVerified(metric);
    realtime.emit({ type: "analytics.updated", at: nowIso() });
    realtime.emit({ type: "overview.updated", at: nowIso() });
    res.status(201).json({ metric });
  }));

  app.use("/api", requireAuth);

  app.get("/api/auth/session", asyncHandler(async (req, res) => {
    res.json({ authenticated: true, mode: req.auth?.mode ?? "demo", authRequired: config.authRequired });
  }));

  app.get("/api/overview", asyncHandler(async (_req, res) => {
    res.json(await buildOverview(store));
  }));

  app.get("/api/policy", (_req, res) => {
    res.json(policySummary());
  });

  const linkLimiter = createLimiter({ name: "links", windowMs: 60_000, max: 40 });
  app.post("/api/links", linkLimiter, asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const urls = body.urls ? bodyStrings(body.urls) : body.text ? bodyStrings(body.text) : [];
    if (urls.length === 0) throw new HttpError(400, "Provide urls or text", "no_urls");
    const source = stringField(body.source, 40) || "manual";
    const links = await createAndInspectLinks(store, urls, source);
    res.status(201).json({ links, accepted: links.length });
  }));

  app.post("/api/links/import", linkLimiter, asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const kind = stringField(body.kind, 20) || "csv";
    let urls: string[] = [];
    if (kind === "csv") {
      const csv = stringField(body.csv, 2_000_000);
      if (!csv) throw new HttpError(400, "CSV content is required", "empty_csv");
      urls = extractUrlsFromCsv(csv);
    } else {
      urls = bodyStrings(body.urls ?? body.text);
    }
    if (urls.length === 0) throw new HttpError(400, "No URLs found in the import", "no_urls");
    const links = await createAndInspectLinks(store, urls, `csv:${stringField(body.filename, 80) || "import"}`);
    res.status(201).json({ links, accepted: links.length });
  }));

  app.get("/api/links", asyncHandler(async (req, res) => {
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 500));
    res.json({ items: await store.listLinks(limit) });
  }));

  app.get("/api/links/:id", asyncHandler(async (req, res) => {
    const link = await store.getLink(pathParam(req, "id"));
    if (!link) throw new HttpError(404, "Link not found", "link_not_found");
    res.json({ link });
  }));

  app.post("/api/links/:id/inspect", linkLimiter, asyncHandler(async (req, res) => {
    const link = await inspectLinkById(store, pathParam(req, "id"));
    res.json({ link });
  }));

  app.delete("/api/links/:id", asyncHandler(async (req, res) => {
    const removed = await store.deleteLink(pathParam(req, "id"));
    if (!removed) throw new HttpError(404, "Link not found", "link_not_found");
    realtime.emit({ type: "overview.updated", at: nowIso() });
    res.status(204).end();
  }));

  const batchLimiter = createLimiter({ name: "batches", windowMs: 60_000, max: 30 });
  app.post("/api/batches", batchLimiter, asyncHandler(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const linkId = stringField(body.linkId, 120);
    const count = Number(body.count);
    if (!linkId) throw new HttpError(400, "linkId is required", "invalid_batch");
    const result: CreateBatchResponse = await manager.createBatch(linkId, count, requestOptions(body));
    res.status(201).json(result);
  }));

  app.get("/api/sessions", asyncHandler(async (req, res) => {
    const statuses = String(req.query.status ?? "")
      .split(",")
      .map((status) => status.trim())
      .filter(Boolean) as SessionRecord["status"][];
    const sessions = await store.listSessions({
      linkId: req.query.linkId ? String(req.query.linkId) : undefined,
      batchId: req.query.batchId ? String(req.query.batchId) : undefined,
      status: statuses.length ? statuses : undefined,
      limit: Math.max(1, Math.min(1000, Number(req.query.limit) || 500)),
    });
    res.json({ items: sessions.map((session) => manager.decorate(session)), total: sessions.length });
  }));

  app.get("/api/sessions/:id", asyncHandler(async (req, res) => {
    const session = await store.getSession(pathParam(req, "id"));
    if (!session) throw new HttpError(404, "Session not found", "session_not_found");
    res.json({ session: manager.decorate(session) });
  }));

  app.get("/api/sessions/:id/events", asyncHandler(async (req, res) => {
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 300));
    res.json({ items: await store.listEvents(pathParam(req, "id"), limit) });
  }));

  app.get("/api/sessions/:id/ads", asyncHandler(async (req, res) => {
    res.json({ items: await store.listAds({ sessionId: pathParam(req, "id"), limit: 300 }) });
  }));

  app.post("/api/sessions/:id/start", asyncHandler(async (req, res) => {
    res.json({ session: await manager.startSession(pathParam(req, "id")) });
  }));
  app.post("/api/sessions/:id/pause", asyncHandler(async (req, res) => {
    res.json({ session: await manager.pauseSession(pathParam(req, "id")) });
  }));
  app.post("/api/sessions/:id/resume", asyncHandler(async (req, res) => {
    res.json({ session: await manager.resumeSession(pathParam(req, "id")) });
  }));
  app.post("/api/sessions/:id/stop", asyncHandler(async (req, res) => {
    res.json({ session: await manager.stopSession(pathParam(req, "id")) });
  }));

  app.post("/api/sessions/start-all", batchLimiter, asyncHandler(async (req, res) => {
    const ids = bodyStrings((req.body as Record<string, unknown>)?.ids);
    res.json(await manager.startMany(ids.length ? ids : undefined));
  }));
  app.post("/api/sessions/pause-all", batchLimiter, asyncHandler(async (req, res) => {
    const ids = bodyStrings((req.body as Record<string, unknown>)?.ids);
    res.json(await manager.pauseMany(ids.length ? ids : undefined));
  }));
  app.post("/api/sessions/resume-all", batchLimiter, asyncHandler(async (req, res) => {
    const ids = bodyStrings((req.body as Record<string, unknown>)?.ids);
    res.json(await manager.resumeMany(ids.length ? ids : undefined));
  }));
  app.post("/api/sessions/stop-all", batchLimiter, asyncHandler(async (req, res) => {
    const ids = bodyStrings((req.body as Record<string, unknown>)?.ids);
    res.json(await manager.stopMany(ids.length ? ids : undefined));
  }));

  app.get("/api/activity", asyncHandler(async (req, res) => {
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 200));
    res.json({ items: await store.listRecentEvents(limit) });
  }));

  app.get("/api/ads", asyncHandler(async (req, res) => {
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit) || 500));
    res.json({
      items: await store.listAds({
        sessionId: req.query.sessionId ? String(req.query.sessionId) : undefined,
        linkId: req.query.linkId ? String(req.query.linkId) : undefined,
        limit,
      }),
      disclosure: "Detected placements are observations, not verified impressions. Only authorized platform imports can create verified metrics.",
    });
  }));

  app.get("/api/workers", asyncHandler(async (_req, res) => {
    res.json({ items: await manager.workers.list() });
  }));

  app.get("/api/analytics", asyncHandler(async (req, res) => {
    const days = Number(req.query.days) || 14;
    res.json(await buildAnalytics(store, days));
  }));

  app.get("/api/analytics/verified", asyncHandler(async (_req, res) => {
    res.json({
      items: await store.listVerified(500),
      configured: Boolean(config.analyticsApiKey),
      note: "Verified metrics are only accepted through the authorized analytics import endpoint.",
    });
  }));

  app.get("/api/analytics/export", asyncHandler(async (req, res) => {
    const type = String(req.query.type || "sessions");
    const format = String(req.query.format || "csv");
    if (format !== "csv") throw new HttpError(400, "Only CSV export is supported", "unsupported_format");
    let rows: Array<Record<string, unknown>>;
    let name: string;
    if (type === "sessions") {
      rows = sessionRows(await store.listSessions({ limit: 5000 }), await store.listLinks(2000));
      name = "sessions";
    } else if (type === "links") {
      rows = linkRows(await store.listLinks(2000));
      name = "links";
    } else if (type === "ads") {
      rows = adRows(await store.listAds({ limit: 5000 }));
      name = "ad-observations";
    } else if (type === "verified") {
      rows = verifiedRows(await store.listVerified(1000));
      name = "verified-metrics";
    } else {
      throw new HttpError(400, "Export type must be sessions, links, ads, or verified", "invalid_export_type");
    }
    const csv = `\uFEFF${toCsv(rows)}`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="linkpilot-${name}-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }));

  app.get("/api/settings", asyncHandler(async (_req, res) => {
    res.json(await getPublicSettings(store));
  }));

  app.put("/api/settings/ai", asyncHandler(async (req, res) => {
    const body = req.body as AiSettingsInput;
    res.json(await updateAiSettings(store, body));
  }));

  app.use("/api", (req, res) => {
    res.status(404).json({ error: `Unknown API route ${req.method} ${req.path}`, code: "not_found" });
  });

  const dist = resolve(process.cwd(), "dist");
  if (existsSync(dist) && config.nodeEnv !== "test") {
    app.use(express.static(dist, { index: false, maxAge: "1h" }));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api") || req.path.startsWith("/ws")) {
        next();
        return;
      }
      res.sendFile(resolve(dist, "index.html"));
    });
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message, code: error.code, details: error.details });
      return;
    }
    const maybe = error as { type?: string; status?: number; message?: string };
    if (maybe?.type === "entity.too.large") {
      res.status(413).json({ error: "Request body is too large", code: "payload_too_large" });
      return;
    }
    if (maybe?.type === "entity.parse.failed") {
      res.status(400).json({ error: "Request body is not valid JSON", code: "invalid_json" });
      return;
    }
    console.error("[api] unhandled error", error);
    res.status(500).json({
      error: config.nodeEnv === "production" ? "Internal server error" : maybe?.message || "Internal server error",
      code: "internal_error",
    });
  });

  return app;
}
