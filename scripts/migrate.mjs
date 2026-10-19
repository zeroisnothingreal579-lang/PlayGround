#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const source = fs.readFileSync(path.join(process.cwd(), "lib/db/schema.ts"), "utf8");
const match = source.match(/export const SCHEMA_SQL = `([\s\S]*?)`;/);
if (!match) {
  console.error("Could not find SCHEMA_SQL in lib/db/schema.ts");
  process.exit(1);
}
const dbPath = process.env.DATABASE_PATH || "./data/replica-studio.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(match[1]);
const projectColumns = db.prepare("PRAGMA table_info(projects)").all();
if (!projectColumns.some((column) => column.name === "target_kind")) {
  db.exec("ALTER TABLE projects ADD COLUMN target_kind TEXT NOT NULL DEFAULT 'website'");
}
db.exec(
  "UPDATE projects SET target_kind = 'apk' WHERE target_kind = 'website' AND (target_url IS NULL OR target_url = '') AND EXISTS (SELECT 1 FROM apk_uploads WHERE apk_uploads.project_id = projects.id)",
);
db.prepare(
  "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
).run(2, new Date().toISOString());
db.close();
console.log(`Replica Studio schema ready at ${dbPath}`);
