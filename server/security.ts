import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { safeEqual, verifySessionToken } from "./lib/crypto.js";

declare module "express-serve-static-core" {
  interface Request {
    auth?: { sub: string; mode: "password" | "demo" };
  }
}

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  if (config.nodeEnv === "production") {
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' ws: wss:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
    );
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.authRequired) {
    req.auth = { sub: "operator", mode: "demo" };
    next();
    return;
  }
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: "Authentication required", code: "unauthorized" });
    return;
  }
  req.auth = { sub: payload.sub, mode: payload.mode };
  next();
}

export function verifyLoginPassword(candidate: string): boolean {
  if (!config.authPassword) return true;
  return safeEqual(candidate, config.authPassword);
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface LimitOptions {
  name: string;
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
}

export function createLimiter(options: LimitOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${options.name}:${options.key ? options.key(req) : req.ip || "anonymous"}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    const remaining = Math.max(0, options.max - bucket.count);
    res.setHeader("X-RateLimit-Limit", String(options.max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: "Rate limit exceeded. Try again shortly.", code: "rate_limited", details: { retryAfter } });
      return;
    }
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref?.();

export function requireWorkerToken(req: Request, res: Response, next: NextFunction): void {
  if (!config.workerToken) {
    res.status(503).json({
      error: "Remote workers are disabled. Set WORKER_TOKEN to enable worker registration.",
      code: "workers_disabled",
    });
    return;
  }
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.headers["x-worker-token"];
  if (typeof token !== "string" || !safeEqual(token, config.workerToken)) {
    res.status(401).json({ error: "Invalid worker token", code: "unauthorized" });
    return;
  }
  next();
}

export function requireAnalyticsToken(req: Request, res: Response, next: NextFunction): void {
  if (!config.analyticsApiKey) {
    res.status(503).json({
      error: "Verified analytics import is disabled. Set ANALYTICS_API_KEY to enable it.",
      code: "analytics_disabled",
    });
    return;
  }
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token || !safeEqual(token, config.analyticsApiKey)) {
    res.status(401).json({ error: "Invalid analytics API key", code: "unauthorized" });
    return;
  }
  next();
}
