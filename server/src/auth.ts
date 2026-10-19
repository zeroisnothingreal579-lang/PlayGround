import type { NextFunction, Request, Response } from 'express'
import { db } from './db.js'
import { config } from './config.js'
import { parseUserAgent, sha256, signJwt, verifyJwt } from './util.js'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: 'user' | 'admin'
  planId: string
  createdAt: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
      sessionId?: string
    }
  }
}

export const SESSION_COOKIE = 'clouddroid_session'

type UserRow = {
  id: string
  email: string
  name: string
  password_hash: string
  role: 'user' | 'admin'
  plan_id: string
  created_at: string
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    planId: row.plan_id,
    createdAt: row.created_at,
  }
}

export function cookieOptions(req: Request) {
  const https = Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https')
  const secure = config.cookieSecure === 'auto' ? https : config.cookieSecure === true
  // When the app is embedded cross-site (e.g. the OpenCode preview iframe), the
  // session cookie is a third-party cookie: it must use SameSite=None; Secure,
  // otherwise browsers omit it on same-origin fetches made from the iframe.
  const sameSite = config.allowIframe && https ? 'none' as const : 'lax' as const
  return {
    httpOnly: true,
    sameSite,
    secure: sameSite === 'none' ? true : secure,
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  }
}

export async function createSession(req: Request, res: Response, userId: string) {
  const sessionId = sha256(`${userId}:${Date.now()}:${Math.random()}`).slice(0, 32)
  const createdAt = new Date()
  const expiresAt = new Date(createdAt.getTime() + 1000 * 60 * 60 * 24 * 7)
  await db.run(
    'INSERT INTO sessions (id, user_id, created_at, expires_at, revoked, user_agent, ip) VALUES (?, ?, ?, ?, 0, ?, ?)',
    [
      sessionId,
      userId,
      createdAt.toISOString(),
      expiresAt.toISOString(),
      (req.headers['user-agent'] || '').slice(0, 200),
      req.ip || null,
    ],
  )
  const jwt = signJwt({ sub: userId, jti: sessionId, iat: Math.floor(createdAt.getTime() / 1000), exp: Math.floor(expiresAt.getTime() / 1000) })
  res.cookie(SESSION_COOKIE, jwt, cookieOptions(req))
  return sessionId
}

export async function revokeSession(res: Response, sessionId: string, req?: Request) {
  await db.run('UPDATE sessions SET revoked = 1 WHERE id = ?', [sessionId])
  const options = req ? cookieOptions(req) : { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: config.cookieSecure === true }
  res.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: options.httpOnly, sameSite: options.sameSite, secure: options.secure })
}

export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const raw = req.cookies?.[SESSION_COOKIE]
    if (!raw) return next()
    const payload = verifyJwt(raw)
    if (!payload || typeof payload.sub !== 'string' || typeof payload.jti !== 'string') return next()
    const session = await db.get<{ revoked: number; expires_at: string }>(
      'SELECT revoked, expires_at FROM sessions WHERE id = ? AND user_id = ?',
      [payload.jti, payload.sub],
    )
    if (!session || session.revoked === 1 || new Date(session.expires_at).getTime() < Date.now()) return next()
    const row = await db.get<UserRow>('SELECT * FROM users WHERE id = ?', [payload.sub])
    if (!row) return next()
    req.user = toAuthUser(row)
    req.sessionId = payload.jti
    next()
  } catch (error) {
    next(error)
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' })
    return
  }
  next()
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required', code: 'unauthenticated' })
    return
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Administrator access required', code: 'forbidden' })
    return
  }
  next()
}

export async function userRowById(userId: string) {
  const row = await db.get<UserRow>('SELECT * FROM users WHERE id = ?', [userId])
  return row ? toAuthUser(row) : null
}

export function deviceLabel(ua: string | undefined) {
  return parseUserAgent(ua)
}
