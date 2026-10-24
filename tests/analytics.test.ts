import assert from "node:assert/strict";
import test from "node:test";
import { buildAnalytics, buildOverview, sessionRows } from "../server/services/analytics.js";
import type { AdObservation, LinkRecord, SessionRecord, VerifiedMetric, WorkerRecord } from "../shared/types.js";
import type { Store } from "../server/store/types.js";

const now = Date.now();
const recent = new Date(now - 60 * 60 * 1000).toISOString();
const old = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();

function link(id: string, domain: string, status: "ready" | "error", blocked = false): LinkRecord {
  return {
    id,
    originalUrl: `https://${domain}/go`,
    normalizedUrl: `https://${domain}/go`,
    status,
    source: "test",
    createdAt: recent,
    updatedAt: recent,
    inspection: {
      finalUrl: `https://${domain}/final`,
      finalDomain: domain,
      httpStatus: blocked ? 403 : 200,
      title: "Test",
      description: null,
      contentType: "text/html",
      chain: [],
      durationMs: 10,
      risk: blocked ? "medium" : "low",
      flags: blocked ? ["blocked_response"] : [],
      adNetworks: [],
      captcha: false,
      loop: false,
      blocked,
      suspicious: false,
      pageBytes: 10,
      payoutNotes: [],
    },
  };
}

function session(
  id: string,
  linkId: string,
  status: SessionRecord["status"],
  createdAt: string,
  targetUrl: string,
  finalUrl: string | null,
): SessionRecord {
  return {
    id,
    batchId: "batch-1",
    linkId,
    index: 1,
    label: id,
    status,
    agentState: "done",
    targetUrl,
    currentUrl: finalUrl,
    finalUrl,
    title: "Test",
    progress: 100,
    workerId: "local",
    workerName: "local",
    elapsedMs: 100,
    actionsCount: 1,
    adsDetected: 0,
    summary: "done",
    error: status === "failed" ? "boom" : null,
    startedAt: createdAt,
    endedAt: createdAt,
    createdAt,
    updatedAt: createdAt,
    options: {},
  };
}

function ad(id: string, sessionId: string, linkId: string, detectedAt: string): AdObservation {
  return {
    id,
    sessionId,
    linkId,
    format: "banner",
    network: "Test Network",
    selector: ".ad",
    visibleMs: 1000,
    detectedAt,
    method: "heuristic",
    verified: false,
    size: "300x250",
    pageUrl: "https://dest.example/final",
  };
}

function metric(id: string, kind: VerifiedMetric["metric"], value: number): VerifiedMetric {
  return {
    id,
    source: "publisher-report",
    metric: kind,
    value,
    periodStart: recent,
    periodEnd: recent,
    importedAt: recent,
    note: null,
    raw: null,
  };
}

const links = [link("l1", "dest.example", "ready"), link("l2", "other.example", "error", true)];
const sessions = [
  session("s1", "l1", "completed", recent, "https://start.example/a", "https://dest.example/final"),
  session("s2", "l2", "failed", recent, "https://start.example/b", "https://other.example/final"),
  session("s3", "l1", "completed", old, "https://start.example/c", "https://dest.example/final"),
  session("s4", "l1", "running", recent, "https://third.example/path", null),
];
const ads = [ad("a1", "s1", "l1", recent), ad("a2", "s2", "l2", recent), ad("a3", "s3", "l1", old)];
const verified = [metric("v1", "impressions", 100), metric("v2", "visits", 5), metric("v3", "earnings", 1.5)];
const workers: WorkerRecord[] = [
  {
    id: "local",
    name: "local",
    region: "local",
    kind: "local",
    status: "online",
    cpu: 10,
    memory: 20,
    bandwidthMbps: 100,
    activeSessions: 1,
    maxSessions: 3,
    lastHeartbeat: recent,
    meta: {},
  },
];

const store = {
  listLinks: async () => links,
  listSessions: async () => sessions,
  listAds: async () => ads,
  listWorkers: async () => workers,
  listVerified: async () => verified,
} as unknown as Store;

test("buildAnalytics counts only sessions in range and separates verified metrics", async () => {
  const analytics = await buildAnalytics(store, 7);
  assert.equal(analytics.sessionCount, 3);
  assert.equal(analytics.completed, 1);
  assert.equal(analytics.failed, 1);
  assert.equal(analytics.successRate, 50);
  assert.equal(analytics.adsDetected, 2);
  assert.equal(analytics.rangeDays, 7);
  assert.equal(analytics.series.length, 7);
  assert.equal(analytics.destinations[0]?.domain, "dest.example");
  assert.equal(analytics.verifiedTotals.impressions, 100);
  assert.equal(analytics.verifiedTotals.visits, 5);
  assert.equal(analytics.verifiedTotals.earnings, 1.5);
  assert.equal(analytics.verified.length, 3);
});

test("buildOverview summarizes links, sessions, ads, and verified impressions", async () => {
  const overview = await buildOverview(store);
  assert.equal(overview.links.total, 2);
  assert.equal(overview.links.ready, 1);
  assert.equal(overview.links.error, 1);
  assert.equal(overview.redirects.successRate, 50);
  assert.equal(overview.redirects.blocked, 1);
  assert.equal(overview.sessions.total, 4);
  assert.equal(overview.sessions.active, 1);
  assert.equal(overview.sessions.completed, 2);
  assert.equal(overview.ads.detected, 3);
  assert.equal(overview.ads.verifiedImpressions, 100);
  assert.equal(overview.destinations, 2);
  assert.equal(overview.workers.online, 1);
});

test("sessionRows includes resolved domains and omits undefined values safely", () => {
  const rows = sessionRows(sessions.slice(0, 2), links);
  assert.equal(rows[0]?.final_domain, "dest.example");
  assert.equal(rows[1]?.final_domain, "other.example");
  assert.equal(rows[0]?.status, "completed");
});
