import { join } from "node:path";
import { config } from "../config.js";
import { FileStore } from "./fileStore.js";
import { PostgresStore } from "./postgresStore.js";
import type { Store } from "./types.js";

let storePromise: Promise<Store> | null = null;

async function buildStore(): Promise<Store> {
  if (config.databaseUrl) {
    const postgres = new PostgresStore(config.databaseUrl, config.databaseSsl);
    try {
      await postgres.init();
      console.log("[store] PostgreSQL connected");
      return postgres;
    } catch (error) {
      console.error("[store] PostgreSQL initialization failed:", error instanceof Error ? error.message : error);
      await postgres.close().catch(() => undefined);
      if (!config.databaseFallback) throw error;
      console.warn("[store] Falling back to the local JSON store. Set DATABASE_FALLBACK=false to disable.");
    }
  } else {
    console.warn(`[store] DATABASE_URL is not set. Using local JSON store at ${join(config.dataDir, "linkpilot.json")} for development.`);
  }
  const file = new FileStore(join(config.dataDir, "linkpilot.json"));
  await file.init();
  return file;
}

export async function getStore(): Promise<Store> {
  storePromise ??= buildStore();
  return storePromise;
}

export async function closeStore(): Promise<void> {
  if (!storePromise) return;
  const store = await storePromise;
  await store.close();
  storePromise = null;
}

export type { Store } from "./types.js";
