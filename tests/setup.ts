import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach } from "vitest";
import { getDb, resetDbForTests } from "@/lib/db";
import { updateSettings } from "@/lib/db/repo";

const testRoot = path.join(os.tmpdir(), `replica-studio-test-${process.pid}-${Date.now()}`);
const dbPath = path.join(testRoot, "replica-studio.db");
fs.mkdirSync(testRoot, { recursive: true });

process.env.DATABASE_PATH = dbPath;
process.env.APK_STORAGE_DIR = path.join(testRoot, "apk-storage");
process.env.APK_MAX_UPLOAD_BYTES = String(50 * 1024 * 1024);
process.env.SKIP_GITHUB_SYNC = "true";
process.env.DEMO_MODE = "false";
process.env.SANDBOX_MODE = "disabled";
delete process.env.AI_PROVIDER;
delete process.env.AI_MODEL;
delete process.env.OPENAI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENROUTER_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.OLLAMA_BASE_URL;
delete process.env.OPENAI_BASE_URL;
delete process.env.ANTHROPIC_BASE_URL;

export function resetDatabase() {
  const db = getDb();
  db.exec(`
    DELETE FROM execution_logs;
    DELETE FROM workflow_steps;
    DELETE FROM workflow_runs;
    DELETE FROM activities;
    DELETE FROM project_files;
    DELETE FROM apk_analyses;
    DELETE FROM apk_uploads;
    DELETE FROM projects;
    DELETE FROM script_approvals;
    DELETE FROM skills;
  `);
  updateSettings({
    aiProvider: "",
    aiModel: "",
    allowDemoMode: false,
    sandboxMode: "disabled",
    executionTimeoutMs: 15000,
    maxOutputTokens: 8192,
  });
}

beforeEach(() => {
  resetDatabase();
});

afterAll(() => {
  resetDbForTests();
  fs.rmSync(testRoot, { recursive: true, force: true });
});
