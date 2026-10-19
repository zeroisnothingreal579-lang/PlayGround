import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema";

type Db = Database.Database;

const globalForDb = globalThis as unknown as {
  __replicaDb?: Db;
  __replicaDbPath?: string;
};

function resolveDbPath(): string {
  return process.env.DATABASE_PATH || path.join(process.cwd(), "data", "replica-studio.db");
}

function openDatabase(): Db {
  const dbPath = resolveDbPath();
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  if (dbPath !== ":memory:") {
    db.pragma("journal_mode = WAL");
  }
  db.exec(SCHEMA_SQL);
  migrate(db);
  const row = db
    .prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1")
    .get() as { version: number } | undefined;
  if (!row || row.version < SCHEMA_VERSION) {
    db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
      SCHEMA_VERSION,
      new Date().toISOString(),
    );
  }
  seedSettings(db);
  return db;
}

function migrate(db: Db) {
  const columns = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "target_kind")) {
    db.exec("ALTER TABLE projects ADD COLUMN target_kind TEXT NOT NULL DEFAULT 'website'");
  }
  db.exec(
    "UPDATE projects SET target_kind = 'apk' WHERE target_kind = 'website' AND (target_url IS NULL OR target_url = '') AND EXISTS (SELECT 1 FROM apk_uploads WHERE apk_uploads.project_id = projects.id)",
  );
}

function seedSettings(db: Db) {
  const now = new Date().toISOString();
  const defaults: Record<string, string> = {
    repoUrl:
      process.env.REPLICA_REPO_URL || "https://github.com/Jakeschincariol/replica-skill",
    aiProvider: process.env.AI_PROVIDER || "",
    aiModel: process.env.AI_MODEL || "",
    storage: "sqlite",
    executionTimeoutMs: process.env.SANDBOX_TIMEOUT_MS || "15000",
    maxOutputTokens: process.env.AI_MAX_OUTPUT_TOKENS || "8192",
    sandboxMode: process.env.SANDBOX_MODE || "docker",
    allowDemoMode: process.env.DEMO_MODE === "true" ? "true" : "false",
  };
  const insert = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
  );
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(defaults)) insert.run(key, value, now);
  });
  tx();
}

export function getDb(): Db {
  const dbPath = resolveDbPath();
  if (!globalForDb.__replicaDb || globalForDb.__replicaDbPath !== dbPath) {
    globalForDb.__replicaDb?.close();
    globalForDb.__replicaDb = openDatabase();
    globalForDb.__replicaDbPath = dbPath;
  }
  return globalForDb.__replicaDb;
}

export function resetDbForTests() {
  if (globalForDb.__replicaDb) {
    try {
      globalForDb.__replicaDb.close();
    } catch {
      // already closed
    }
  }
  globalForDb.__replicaDb = undefined;
  globalForDb.__replicaDbPath = undefined;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function uid(): string {
  return crypto.randomUUID();
}
