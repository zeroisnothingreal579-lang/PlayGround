import type { NextFunction, Request, Response } from 'express'

type Bucket = { tokens: number; updated: number }

const buckets = new Map<string, Bucket>()

export function rateLimit(options: { key: string; limit: number; windowMs: number }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const identity = `${options.key}:${req.user?.id || req.ip || 'anon'}`
    const now = Date.now()
    const bucket = buckets.get(identity) || { tokens: options.limit, updated: now }
    const elapsed = now - bucket.updated
    const refill = (elapsed / options.windowMs) * options.limit
    bucket.tokens = Math.min(options.limit, bucket.tokens + refill)
    bucket.updated = now
    if (bucket.tokens < 1) {
      const retry = Math.ceil(((1 - bucket.tokens) / options.limit) * (options.windowMs / 1000))
      res.setHeader('Retry-After', String(retry))
      res.status(429).json({ error: 'Too many requests. Please slow down.', code: 'rate_limited' })
      return
    }
    bucket.tokens -= 1
    buckets.set(identity, bucket)
    next()
  }
}

setInterval(() => {
  const cutoff = Date.now() - 1000 * 60 * 30
  for (const [key, bucket] of buckets) if (bucket.updated < cutoff) buckets.delete(key)
}, 1000 * 60 * 5).unref()
