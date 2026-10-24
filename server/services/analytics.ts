import type {
  AnalyticsDestination,
  AnalyticsPoint,
  AnalyticsSummary,
  LinkRecord,
  Overview,
  SessionRecord,
  VerifiedMetric,
} from "../../shared/types.js";
import { nowIso } from "../lib/util.js";
import type { Store } from "../store/types.js";

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export async function buildOverview(store: Store): Promise<Overview> {
  const [links, sessions, ads, workers, verified] = await Promise.all([
    store.listLinks(2000),
    store.listSessions({ limit: 2000 }),
    store.listAds({ limit: 5000 }),
    store.listWorkers(),
    store.listVerified(1000),
  ]);

  const inspected = links.filter((link) => link.status === "ready" || link.status === "error");
  const successful = inspected.filter((link) => link.status === "ready");
  const destinations = new Set(
    links
      .map((link) => link.inspection?.finalDomain)
      .filter((domain): domain is string => Boolean(domain)),
  );
  const verifiedImpressions = verified
    .filter((metric) => metric.metric === "impressions")
    .reduce((sum, metric) => sum + metric.value, 0);

  return {
    links: {
      total: links.length,
      ready: links.filter((link) => link.status === "ready").length,
      error: links.filter((link) => link.status === "error").length,
      inspecting: links.filter((link) => link.status === "inspecting" || link.status === "pending").length,
    },
    sessions: {
      total: sessions.length,
      active: sessions.filter((session) => ["starting", "running", "paused"].includes(session.status)).length,
      queued: sessions.filter((session) => session.status === "queued").length,
      completed: sessions.filter((session) => session.status === "completed").length,
      failed: sessions.filter((session) => session.status === "failed").length,
      stopped: sessions.filter((session) => session.status === "stopped").length,
    },
    ads: {
      detected: ads.length,
      verifiedImpressions: Number(verifiedImpressions.toFixed(2)),
    },
    workers: {
      online: workers.filter((worker) => worker.status !== "offline").length,
      total: workers.length,
    },
    redirects: {
      successRate: inspected.length ? Number(((successful.length / inspected.length) * 100).toFixed(1)) : 0,
      blocked: links.filter((link) => link.inspection?.blocked).length,
      loops: links.filter((link) => link.inspection?.loop).length,
    },
    destinations: destinations.size,
    lastUpdated: nowIso(),
  };
}

export async function buildAnalytics(store: Store, rangeDays = 14): Promise<AnalyticsSummary> {
  const days = Math.max(1, Math.min(365, rangeDays));
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const [sessions, links, ads, verified] = await Promise.all([
    store.listSessions({ limit: 5000 }),
    store.listLinks(2000),
    store.listAds({ limit: 5000 }),
    store.listVerified(500),
  ]);
  const linkById = new Map<string, LinkRecord>(links.map((link) => [link.id, link]));
  const inRange = sessions.filter((session) => Date.parse(session.createdAt) >= since);
  const adsInRange = ads.filter((ad) => Date.parse(ad.detectedAt) >= since);

  const seriesMap = new Map<string, AnalyticsPoint>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = dayKey(new Date(Date.now() - offset * 24 * 60 * 60 * 1000));
    seriesMap.set(date, { date, sessions: 0, completed: 0, failed: 0, ads: 0 });
  }
  for (const session of inRange) {
    const key = session.createdAt.slice(0, 10);
    const point = seriesMap.get(key);
    if (!point) continue;
    point.sessions += 1;
    if (session.status === "completed") point.completed += 1;
    if (session.status === "failed") point.failed += 1;
  }
  for (const ad of adsInRange) {
    const point = seriesMap.get(ad.detectedAt.slice(0, 10));
    if (point) point.ads += 1;
  }

  const destinationMap = new Map<string, AnalyticsDestination>();
  for (const session of inRange) {
    const link = linkById.get(session.linkId);
    const domain =
      link?.inspection?.finalDomain || domainOf(session.finalUrl) || domainOf(session.currentUrl) || domainOf(session.targetUrl) || "unknown";
    const existing = destinationMap.get(domain) ?? { domain, sessions: 0, completed: 0 };
    existing.sessions += 1;
    if (session.status === "completed") existing.completed += 1;
    destinationMap.set(domain, existing);
  }

  const completed = inRange.filter((session) => session.status === "completed").length;
  const failed = inRange.filter((session) => session.status === "failed").length;
  const denominator = completed + failed;
  const verifiedTotals: Record<string, number> = {};
  for (const metric of verified) {
    verifiedTotals[metric.metric] = Number(((verifiedTotals[metric.metric] ?? 0) + metric.value).toFixed(2));
  }

  return {
    series: Array.from(seriesMap.values()),
    destinations: Array.from(destinationMap.values()).sort((a, b) => b.sessions - a.sessions).slice(0, 12),
    sessionCount: inRange.length,
    completed,
    failed,
    successRate: denominator ? Number(((completed / denominator) * 100).toFixed(1)) : 0,
    adsDetected: adsInRange.length,
    verified: verified.filter((metric) => Date.parse(metric.periodEnd) >= since).slice(0, 100),
    verifiedTotals,
    rangeDays: days,
  };
}

export function sessionRows(sessions: SessionRecord[], links: LinkRecord[]): Array<Record<string, unknown>> {
  const linkById = new Map(links.map((link) => [link.id, link]));
  return sessions.map((session) => ({
    session_id: session.id,
    batch_id: session.batchId,
    link_id: session.linkId,
    label: session.label,
    status: session.status,
    worker: session.workerName,
    target_url: session.targetUrl,
    final_url: session.finalUrl,
    final_domain: linkById.get(session.linkId)?.inspection?.finalDomain ?? domainOf(session.finalUrl) ?? "",
    ads_detected: session.adsDetected,
    actions: session.actionsCount,
    elapsed_ms: session.elapsedMs,
    started_at: session.startedAt ?? "",
    ended_at: session.endedAt ?? "",
    summary: session.summary ?? "",
    error: session.error ?? "",
  }));
}

export function linkRows(links: LinkRecord[]): Array<Record<string, unknown>> {
  return links.map((link) => ({
    link_id: link.id,
    original_url: link.originalUrl,
    final_url: link.inspection?.finalUrl ?? "",
    final_domain: link.inspection?.finalDomain ?? "",
    status: link.status,
    risk: link.inspection?.risk ?? "",
    http_status: link.inspection?.httpStatus ?? "",
    redirect_hops: link.inspection?.chain.length ?? 0,
    flags: link.inspection?.flags.join("|") ?? "",
    ad_networks: link.inspection?.adNetworks.join("|") ?? "",
    captcha: link.inspection?.captcha ? "true" : "false",
    created_at: link.createdAt,
  }));
}

export function adRows(ads: Awaited<ReturnType<Store["listAds"]>>): Array<Record<string, unknown>> {
  return ads.map((ad) => ({
    ad_id: ad.id,
    session_id: ad.sessionId,
    link_id: ad.linkId,
    format: ad.format,
    network: ad.network ?? "",
    size: ad.size ?? "",
    visible_ms: ad.visibleMs,
    detected_at: ad.detectedAt,
    method: ad.method,
    verified_impression: ad.verified ? "true" : "false",
    page_url: ad.pageUrl ?? "",
  }));
}

export function verifiedRows(metrics: VerifiedMetric[]): Array<Record<string, unknown>> {
  return metrics.map((metric) => ({
    metric_id: metric.id,
    source: metric.source,
    metric: metric.metric,
    value: metric.value,
    period_start: metric.periodStart,
    period_end: metric.periodEnd,
    imported_at: metric.importedAt,
    note: metric.note ?? "",
  }));
}
