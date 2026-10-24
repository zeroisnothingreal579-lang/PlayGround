import { createServer } from "node:http";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { attachWebSocket } from "./realtime.js";
import { SessionManager } from "./services/sessionManager.js";
import { closeStore, getStore } from "./store/index.js";

async function main(): Promise<void> {
  const store = await getStore();
  const manager = new SessionManager(store);
  await manager.init();
  const app = createApp(store, manager);
  const server = createServer(app);
  const wss = attachWebSocket(server);

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`[linkpilot] Port ${config.port} is already in use. Stop the other process or set PORT.`);
    } else {
      console.error("[linkpilot] HTTP server error", error);
    }
    process.exit(1);
  });

  await new Promise<void>((resolve) => {
    server.listen(config.port, config.host, () => resolve());
  });

  console.log(`[linkpilot] LinkPilot AI v${config.version} listening on http://${config.host}:${config.port}`);
  console.log(`[linkpilot] Store: ${store.kind}${store.kind === "file" ? ` (${config.dataDir}/linkpilot.json)` : ""}`);
  console.log(`[linkpilot] Auth: ${config.authRequired ? "password protected" : "demo mode (set AUTH_PASSWORD for production)"}`);
  console.log(`[linkpilot] Browser: ${config.browser.executablePath || "Playwright-managed Chromium"}`);
  console.log(`[linkpilot] Workers: ${config.allowDockerWorkers ? "remote registration enabled" : "local only"}`);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[linkpilot] ${signal} received, shutting down`);
    await manager.close();
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closeStore();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    console.error("[linkpilot] Unhandled rejection", reason);
  });
  process.on("uncaughtException", (error) => {
    console.error("[linkpilot] Uncaught exception", error);
  });
}

main().catch((error) => {
  console.error("[linkpilot] Failed to start", error);
  process.exit(1);
});
