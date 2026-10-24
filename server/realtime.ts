import type { IncomingMessage, Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { AdObservation, LinkRecord, SessionEvent, SessionRecord, WorkerRecord } from "../shared/types.js";
import { verifySessionToken } from "./lib/crypto.js";
import { config } from "./config.js";

export type LiveEvent =
  | { type: "hello"; at: string }
  | { type: "session.updated"; session: SessionRecord }
  | { type: "session.preview"; sessionId: string; dataUrl: string; at: string }
  | { type: "session.event"; event: SessionEvent }
  | { type: "link.updated"; link: LinkRecord }
  | { type: "worker.updated"; worker: WorkerRecord }
  | { type: "ads.updated"; ad: AdObservation }
  | { type: "overview.updated"; at: string }
  | { type: "analytics.updated"; at: string };

type Listener = (event: LiveEvent) => void;

class RealtimeHub {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: LiveEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[realtime] listener error", error);
      }
    }
  }
}

export const realtime = new RealtimeHub();

function extractToken(request: IncomingMessage): string | null {
  const url = new URL(request.url || "/", "http://localhost");
  const fromQuery = url.searchParams.get("token");
  if (fromQuery) return fromQuery;
  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return null;
}

export function attachWebSocket(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<WebSocket>();

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname !== "/ws") return;
    if (config.authRequired) {
      const token = extractToken(request);
      if (!verifySessionToken(token)) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: "hello", at: new Date().toISOString() } satisfies LiveEvent));
    ws.on("close", () => clients.delete(ws));
    ws.on("error", () => clients.delete(ws));
    ws.on("message", (data) => {
      if (data.toString() === "ping") ws.send(JSON.stringify({ type: "pong", at: new Date().toISOString() }));
    });
  });

  const unsubscribe = realtime.subscribe((event) => {
    const payload = JSON.stringify(event);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  });

  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: "heartbeat", at: new Date().toISOString() }));
    }
  }, 25_000);
  heartbeat.unref?.();

  wss.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    for (const client of clients) client.terminate();
    clients.clear();
  });

  return wss;
}
