import { Pool, type QueryResultRow } from "pg";
import type {
  AdObservation,
  BatchRecord,
  LinkRecord,
  SessionEvent,
  SessionRecord,
  VerifiedMetric,
  WorkerRecord,
} from "../../shared/types.js";
import type { AdFilter, SessionFilter, Store, StoredSettings } from "./types.js";

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapLink(row: QueryResultRow): LinkRecord {
  return {
    id: row.id,
    originalUrl: row.original_url,
    normalizedUrl: row.normalized_url,
    status: row.status,
    source: row.source,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
    inspection: row.inspection ?? null,
  };
}

function mapSession(row: QueryResultRow): SessionRecord {
  return {
    id: row.id,
    batchId: row.batch_id,
    linkId: row.link_id,
    index: row.idx,
    label: row.label,
    status: row.status,
    agentState: row.agent_state,
    targetUrl: row.target_url,
    currentUrl: row.current_url,
    finalUrl: row.final_url,
    title: row.title,
    progress: row.progress,
    workerId: row.worker_id,
    workerName: row.worker_name,
    elapsedMs: Number(row.elapsed_ms ?? 0),
    actionsCount: row.actions_count,
    adsDetected: row.ads_detected,
    summary: row.summary,
    error: row.error,
    startedAt: iso(row.started_at),
    endedAt: iso(row.ended_at),
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
    options: row.options ?? {},
  };
}

function mapEvent(row: QueryResultRow): SessionEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    ts: iso(row.ts)!,
    type: row.type,
    level: row.level,
    message: row.message,
    data: row.data ?? null,
  };
}

function mapAd(row: QueryResultRow): AdObservation {
  return {
    id: row.id,
    sessionId: row.session_id,
    linkId: row.link_id,
    format: row.format,
    network: row.network,
    selector: row.selector,
    visibleMs: Number(row.visible_ms ?? 0),
    detectedAt: iso(row.detected_at)!,
    method: row.method,
    verified: false,
    size: row.size,
    pageUrl: row.page_url,
  };
}

function mapWorker(row: QueryResultRow): WorkerRecord {
  return {
    id: row.id,
    name: row.name,
    region: row.region,
    kind: row.kind,
    status: row.status,
    cpu: Number(row.cpu ?? 0),
    memory: Number(row.memory ?? 0),
    bandwidthMbps: Number(row.bandwidth_mbps ?? 0),
    activeSessions: row.active_sessions,
    maxSessions: row.max_sessions,
    lastHeartbeat: iso(row.last_heartbeat)!,
    meta: row.meta ?? {},
  };
}

function mapBatch(row: QueryResultRow): BatchRecord {
  return {
    id: row.id,
    linkId: row.link_id,
    requested: row.requested,
    options: row.options ?? {},
    createdAt: iso(row.created_at)!,
  };
}

function mapVerified(row: QueryResultRow): VerifiedMetric {
  return {
    id: row.id,
    source: row.source,
    metric: row.metric,
    value: Number(row.value),
    periodStart: iso(row.period_start)!,
    periodEnd: iso(row.period_end)!,
    importedAt: iso(row.imported_at)!,
    note: row.note,
    raw: row.raw ?? null,
  };
}

const SESSION_COLUMNS: Record<string, string> = {
  batchId: "batch_id",
  linkId: "link_id",
  index: "idx",
  label: "label",
  status: "status",
  agentState: "agent_state",
  targetUrl: "target_url",
  currentUrl: "current_url",
  finalUrl: "final_url",
  title: "title",
  progress: "progress",
  workerId: "worker_id",
  workerName: "worker_name",
  elapsedMs: "elapsed_ms",
  actionsCount: "actions_count",
  adsDetected: "ads_detected",
  summary: "summary",
  error: "error",
  startedAt: "started_at",
  endedAt: "ended_at",
  updatedAt: "updated_at",
  options: "options",
};

const LINK_COLUMNS: Record<string, string> = {
  originalUrl: "original_url",
  normalizedUrl: "normalized_url",
  status: "status",
  source: "source",
  updatedAt: "updated_at",
  inspection: "inspection",
};

export class PostgresStore implements Store {
  kind = "postgres" as const;
  private pool: Pool;

  constructor(connectionString: string, ssl: boolean) {
    this.pool = new Pool({
      connectionString,
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE TABLE IF NOT EXISTS lp_links (
          id TEXT PRIMARY KEY,
          original_url TEXT NOT NULL,
          normalized_url TEXT NOT NULL,
          status TEXT NOT NULL,
          source TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          inspection JSONB
        );
        CREATE TABLE IF NOT EXISTS lp_sessions (
          id TEXT PRIMARY KEY,
          batch_id TEXT NOT NULL,
          link_id TEXT NOT NULL,
          idx INTEGER NOT NULL,
          label TEXT NOT NULL,
          status TEXT NOT NULL,
          agent_state TEXT NOT NULL,
          target_url TEXT NOT NULL,
          current_url TEXT,
          final_url TEXT,
          title TEXT,
          progress INTEGER NOT NULL DEFAULT 0,
          worker_id TEXT NOT NULL,
          worker_name TEXT NOT NULL,
          elapsed_ms BIGINT NOT NULL DEFAULT 0,
          actions_count INTEGER NOT NULL DEFAULT 0,
          ads_detected INTEGER NOT NULL DEFAULT 0,
          summary TEXT,
          error TEXT,
          started_at TIMESTAMPTZ,
          ended_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          options JSONB NOT NULL DEFAULT '{}'::jsonb
        );
        CREATE TABLE IF NOT EXISTS lp_events (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          ts TIMESTAMPTZ NOT NULL,
          type TEXT NOT NULL,
          level TEXT NOT NULL,
          message TEXT NOT NULL,
          data JSONB
        );
        CREATE TABLE IF NOT EXISTS lp_ads (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          link_id TEXT NOT NULL,
          format TEXT NOT NULL,
          network TEXT,
          selector TEXT NOT NULL,
          visible_ms BIGINT NOT NULL DEFAULT 0,
          detected_at TIMESTAMPTZ NOT NULL,
          method TEXT NOT NULL,
          verified BOOLEAN NOT NULL DEFAULT FALSE,
          size TEXT,
          page_url TEXT
        );
        CREATE TABLE IF NOT EXISTS lp_workers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          region TEXT NOT NULL,
          kind TEXT NOT NULL,
          status TEXT NOT NULL,
          cpu REAL NOT NULL DEFAULT 0,
          memory REAL NOT NULL DEFAULT 0,
          bandwidth_mbps REAL NOT NULL DEFAULT 0,
          active_sessions INTEGER NOT NULL DEFAULT 0,
          max_sessions INTEGER NOT NULL DEFAULT 1,
          last_heartbeat TIMESTAMPTZ NOT NULL,
          meta JSONB NOT NULL DEFAULT '{}'::jsonb
        );
        CREATE TABLE IF NOT EXISTS lp_batches (
          id TEXT PRIMARY KEY,
          link_id TEXT NOT NULL,
          requested INTEGER NOT NULL,
          options JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL
        );
        CREATE TABLE IF NOT EXISTS lp_verified_metrics (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL,
          metric TEXT NOT NULL,
          value NUMERIC NOT NULL,
          period_start TIMESTAMPTZ NOT NULL,
          period_end TIMESTAMPTZ NOT NULL,
          imported_at TIMESTAMPTZ NOT NULL,
          note TEXT,
          raw JSONB
        );
        CREATE TABLE IF NOT EXISTS lp_settings (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL
        );
        CREATE INDEX IF NOT EXISTS lp_sessions_link_idx ON lp_sessions(link_id);
        CREATE INDEX IF NOT EXISTS lp_sessions_created_idx ON lp_sessions(created_at DESC);
        CREATE INDEX IF NOT EXISTS lp_events_session_idx ON lp_events(session_id, ts DESC);
        CREATE INDEX IF NOT EXISTS lp_ads_session_idx ON lp_ads(session_id);
        CREATE INDEX IF NOT EXISTS lp_links_created_idx ON lp_links(created_at DESC);
      `);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async listLinks(limit = 500): Promise<LinkRecord[]> {
    const result = await this.pool.query("SELECT * FROM lp_links ORDER BY created_at DESC LIMIT $1", [limit]);
    return result.rows.map(mapLink);
  }

  async getLink(id: string): Promise<LinkRecord | null> {
    const result = await this.pool.query("SELECT * FROM lp_links WHERE id = $1", [id]);
    return result.rows[0] ? mapLink(result.rows[0]) : null;
  }

  async createLink(link: LinkRecord): Promise<LinkRecord> {
    const result = await this.pool.query(
      `INSERT INTO lp_links (id, original_url, normalized_url, status, source, created_at, updated_at, inspection)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        link.id,
        link.originalUrl,
        link.normalizedUrl,
        link.status,
        link.source,
        link.createdAt,
        link.updatedAt,
        link.inspection ? JSON.stringify(link.inspection) : null,
      ],
    );
    return mapLink(result.rows[0]);
  }

  async updateLink(id: string, patch: Partial<LinkRecord>): Promise<LinkRecord | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let param = 1;
    for (const [key, column] of Object.entries(LINK_COLUMNS)) {
      const value = (patch as Record<string, unknown>)[key];
      if (value === undefined) continue;
      sets.push(`${column} = $${param}`);
      values.push(key === "inspection" && value ? JSON.stringify(value) : value);
      param += 1;
    }
    if (sets.length === 0) return this.getLink(id);
    values.push(id);
    const result = await this.pool.query(
      `UPDATE lp_links SET ${sets.join(", ")} WHERE id = $${param} RETURNING *`,
      values,
    );
    return result.rows[0] ? mapLink(result.rows[0]) : null;
  }

  async deleteLink(id: string): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM lp_links WHERE id = $1", [id]);
    if ((result.rowCount ?? 0) === 0) return false;
    await this.pool.query("DELETE FROM lp_sessions WHERE link_id = $1", [id]);
    return true;
  }

  async listSessions(filter: SessionFilter = {}): Promise<SessionRecord[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (filter.linkId) {
      values.push(filter.linkId);
      conditions.push(`link_id = $${values.length}`);
    }
    if (filter.batchId) {
      values.push(filter.batchId);
      conditions.push(`batch_id = $${values.length}`);
    }
    if (filter.status?.length) {
      values.push(filter.status);
      conditions.push(`status = ANY($${values.length})`);
    }
    values.push(filter.limit ?? 1000);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.pool.query(
      `SELECT * FROM lp_sessions ${where} ORDER BY created_at DESC, idx DESC LIMIT $${values.length}`,
      values,
    );
    return result.rows.map(mapSession);
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const result = await this.pool.query("SELECT * FROM lp_sessions WHERE id = $1", [id]);
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  async createSessions(sessions: SessionRecord[]): Promise<void> {
    if (sessions.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const session of sessions) {
        await client.query(
          `INSERT INTO lp_sessions
           (id,batch_id,link_id,idx,label,status,agent_state,target_url,current_url,final_url,title,progress,worker_id,worker_name,elapsed_ms,actions_count,ads_detected,summary,error,started_at,ended_at,created_at,updated_at,options)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
          [
            session.id,
            session.batchId,
            session.linkId,
            session.index,
            session.label,
            session.status,
            session.agentState,
            session.targetUrl,
            session.currentUrl,
            session.finalUrl,
            session.title,
            session.progress,
            session.workerId,
            session.workerName,
            session.elapsedMs,
            session.actionsCount,
            session.adsDetected,
            session.summary,
            session.error,
            session.startedAt,
            session.endedAt,
            session.createdAt,
            session.updatedAt,
            JSON.stringify(session.options ?? {}),
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateSession(id: string, patch: Partial<SessionRecord>): Promise<SessionRecord | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let param = 1;
    for (const [key, column] of Object.entries(SESSION_COLUMNS)) {
      const value = (patch as Record<string, unknown>)[key];
      if (value === undefined) continue;
      sets.push(`${column} = $${param}`);
      values.push(key === "options" ? JSON.stringify(value) : value);
      param += 1;
    }
    if (sets.length === 0) return this.getSession(id);
    values.push(id);
    const result = await this.pool.query(
      `UPDATE lp_sessions SET ${sets.join(", ")} WHERE id = $${param} RETURNING *`,
      values,
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  async listEvents(sessionId: string, limit = 300): Promise<SessionEvent[]> {
    const result = await this.pool.query(
      "SELECT * FROM lp_events WHERE session_id = $1 ORDER BY ts DESC LIMIT $2",
      [sessionId, limit],
    );
    return result.rows.map(mapEvent);
  }

  async listRecentEvents(limit = 200): Promise<SessionEvent[]> {
    const result = await this.pool.query("SELECT * FROM lp_events ORDER BY ts DESC LIMIT $1", [limit]);
    return result.rows.map(mapEvent);
  }

  async addEvent(event: SessionEvent): Promise<void> {
    await this.addEvents([event]);
  }

  async addEvents(events: SessionEvent[]): Promise<void> {
    if (events.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const event of events) {
        await client.query(
          `INSERT INTO lp_events (id, session_id, ts, type, level, message, data)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
          [event.id, event.sessionId, event.ts, event.type, event.level, event.message, event.data ? JSON.stringify(event.data) : null],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listAds(filter: AdFilter = {}): Promise<AdObservation[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (filter.sessionId) {
      values.push(filter.sessionId);
      conditions.push(`session_id = $${values.length}`);
    }
    if (filter.linkId) {
      values.push(filter.linkId);
      conditions.push(`link_id = $${values.length}`);
    }
    values.push(filter.limit ?? 500);
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.pool.query(
      `SELECT * FROM lp_ads ${where} ORDER BY detected_at DESC LIMIT $${values.length}`,
      values,
    );
    return result.rows.map(mapAd);
  }

  async addAds(ads: AdObservation[]): Promise<void> {
    if (ads.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const ad of ads) {
        await client.query(
          `INSERT INTO lp_ads (id,session_id,link_id,format,network,selector,visible_ms,detected_at,method,verified,size,page_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,FALSE,$10,$11) ON CONFLICT (id) DO NOTHING`,
          [
            ad.id,
            ad.sessionId,
            ad.linkId,
            ad.format,
            ad.network,
            ad.selector,
            ad.visibleMs,
            ad.detectedAt,
            ad.method,
            ad.size,
            ad.pageUrl,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listWorkers(): Promise<WorkerRecord[]> {
    const result = await this.pool.query("SELECT * FROM lp_workers ORDER BY name ASC");
    return result.rows.map(mapWorker);
  }

  async getWorker(id: string): Promise<WorkerRecord | null> {
    const result = await this.pool.query("SELECT * FROM lp_workers WHERE id = $1", [id]);
    return result.rows[0] ? mapWorker(result.rows[0]) : null;
  }

  async upsertWorker(worker: WorkerRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO lp_workers (id,name,region,kind,status,cpu,memory,bandwidth_mbps,active_sessions,max_sessions,last_heartbeat,meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         name=EXCLUDED.name, region=EXCLUDED.region, kind=EXCLUDED.kind, status=EXCLUDED.status,
         cpu=EXCLUDED.cpu, memory=EXCLUDED.memory, bandwidth_mbps=EXCLUDED.bandwidth_mbps,
         active_sessions=EXCLUDED.active_sessions, max_sessions=EXCLUDED.max_sessions,
         last_heartbeat=EXCLUDED.last_heartbeat, meta=EXCLUDED.meta`,
      [
        worker.id,
        worker.name,
        worker.region,
        worker.kind,
        worker.status,
        worker.cpu,
        worker.memory,
        worker.bandwidthMbps,
        worker.activeSessions,
        worker.maxSessions,
        worker.lastHeartbeat,
        JSON.stringify(worker.meta ?? {}),
      ],
    );
  }

  async createBatch(batch: BatchRecord): Promise<void> {
    await this.pool.query(
      "INSERT INTO lp_batches (id,link_id,requested,options,created_at) VALUES ($1,$2,$3,$4,$5)",
      [batch.id, batch.linkId, batch.requested, JSON.stringify(batch.options ?? {}), batch.createdAt],
    );
  }

  async getBatch(id: string): Promise<BatchRecord | null> {
    const result = await this.pool.query("SELECT * FROM lp_batches WHERE id = $1", [id]);
    return result.rows[0] ? mapBatch(result.rows[0]) : null;
  }

  async listBatches(limit = 100): Promise<BatchRecord[]> {
    const result = await this.pool.query("SELECT * FROM lp_batches ORDER BY created_at DESC LIMIT $1", [limit]);
    return result.rows.map(mapBatch);
  }

  async listVerified(limit = 500): Promise<VerifiedMetric[]> {
    const result = await this.pool.query("SELECT * FROM lp_verified_metrics ORDER BY imported_at DESC LIMIT $1", [limit]);
    return result.rows.map(mapVerified);
  }

  async addVerified(metric: VerifiedMetric): Promise<void> {
    await this.pool.query(
      `INSERT INTO lp_verified_metrics (id,source,metric,value,period_start,period_end,imported_at,note,raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        metric.id,
        metric.source,
        metric.metric,
        metric.value,
        metric.periodStart,
        metric.periodEnd,
        metric.importedAt,
        metric.note,
        metric.raw ? JSON.stringify(metric.raw) : null,
      ],
    );
  }

  async getRawSettings(): Promise<StoredSettings> {
    const result = await this.pool.query("SELECT value FROM lp_settings WHERE key = 'app'");
    return result.rows[0]?.value ?? {};
  }

  async saveRawSettings(settings: StoredSettings): Promise<StoredSettings> {
    await this.pool.query(
      `INSERT INTO lp_settings (key,value) VALUES ('app',$1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(settings)],
    );
    return settings;
  }
}
