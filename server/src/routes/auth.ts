import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db.js'
import { rateLimit } from '../rate-limit.js'
import {
  cookieOptions, createSession, requireAuth, revokeSession, SESSION_COOKIE, userRowById,
} from '../auth.js'
import { hashPassword, id, nowIso, parseUserAgent, verifyPassword } from '../util.js'
import { asyncHandler, httpError } from '../http.js'
import { getPlan, usageFor } from '../device/manager.js'

export const authRouter = Router()

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(200)
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(200)

authRouter.post('/register', rateLimit({ key: 'register', limit: 8, windowMs: 60 * 60 * 1000 }), asyncHandler(async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(2, 'Enter your name').max(80),
    email: emailSchema,
    password: passwordSchema,
  }).parse(req.body)
  const existing = await db.get('SELECT id FROM users WHERE email = ?', [body.email])
  if (existing) throw httpError(409, 'An account with this email already exists.', 'email_taken')
  const userId = id('u')
  const timestamp = nowIso()
  await db.run(
    `INSERT INTO users (id, email, name, password_hash, role, plan_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'user', 'free', 'active', ?, ?)`,
    [userId, body.email, body.name, hashPassword(body.password), timestamp, timestamp],
  )
  await createSession(req, res, userId)
  await db.run(
    'INSERT INTO usage (id, user_id, device_id, period, minutes, storage_mb, updated_at) VALUES (?, ?, NULL, ?, 0, 0, ?)',
    [id('use'), userId, timestamp.slice(0, 7), timestamp],
  )
  const user = await userRowById(userId)
  const plan = await getPlan('free')
  res.status(201).json({ user, plan })
}))

authRouter.post('/login', rateLimit({ key: 'login', limit: 12, windowMs: 10 * 60 * 1000 }), asyncHandler(async (req, res) => {
  const body = z.object({ email: emailSchema, password: z.string().max(200) }).parse(req.body)
  const row = await db.get<{ id: string; password_hash: string; status: string }>('SELECT * FROM users WHERE email = ?', [body.email])
  if (!row || !verifyPassword(body.password, row.password_hash)) {
    throw httpError(401, 'Incorrect email or password.', 'invalid_credentials')
  }
  if (row.status !== 'active') throw httpError(403, 'This account is suspended. Contact support.', 'account_suspended')
  await createSession(req, res, row.id)
  const user = await userRowById(row.id)
  const plan = await getPlan((user as any).planId)
  res.json({ user, plan })
}))

authRouter.post('/logout', asyncHandler(async (req, res) => {
  if (req.sessionId) await revokeSession(res, req.sessionId, req)
  else res.clearCookie(SESSION_COOKIE, { path: '/' })
  res.json({ ok: true })
}))

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await userRowById(req.user!.id)
  res.json({ user, plan: await getPlan(req.user!.planId), usage: await usageFor(req.user!.id, req.user!.planId) })
}))

authRouter.patch('/me', requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({ name: z.string().trim().min(2).max(80), email: emailSchema }).parse(req.body)
  const existing = await db.get('SELECT id FROM users WHERE email = ? AND id != ?', [body.email, req.user!.id])
  if (existing) throw httpError(409, 'That email is already in use.', 'email_taken')
  await db.run('UPDATE users SET name = ?, email = ?, updated_at = ? WHERE id = ?', [body.name, body.email, nowIso(), req.user!.id])
  res.json({ user: await userRowById(req.user!.id) })
}))

authRouter.post('/me/password', requireAuth, rateLimit({ key: 'password', limit: 8, windowMs: 15 * 60 * 1000 }), asyncHandler(async (req, res) => {
  const body = z.object({ currentPassword: z.string(), newPassword: passwordSchema }).parse(req.body)
  const row = await db.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [req.user!.id])
  if (!row || !verifyPassword(body.currentPassword, row.password_hash)) throw httpError(400, 'Current password is incorrect.', 'invalid_password')
  await db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hashPassword(body.newPassword), nowIso(), req.user!.id])
  await db.run('UPDATE sessions SET revoked = 1 WHERE user_id = ? AND id != ?', [req.user!.id, req.sessionId])
  res.json({ ok: true })
}))

authRouter.get('/sessions', requireAuth, asyncHandler(async (req, res) => {
  const rows = await db.query<{ id: string; created_at: string; expires_at: string; user_agent: string | null; ip: string | null }>(
    'SELECT id, created_at, expires_at, user_agent, ip FROM sessions WHERE user_id = ? AND revoked = 0 AND expires_at > ? ORDER BY created_at DESC',
    [req.user!.id, nowIso()],
  )
  res.json({
    sessions: rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      userAgent: parseUserAgent(row.user_agent || undefined),
      ip: row.ip,
      current: row.id === req.sessionId,
    })),
  })
}))

authRouter.delete('/sessions/:id', requireAuth, asyncHandler(async (req, res) => {
  await db.run('UPDATE sessions SET revoked = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user!.id])
  if (req.params.id === req.sessionId) res.clearCookie(SESSION_COOKIE, { path: '/' })
  res.json({ ok: true })
}))

authRouter.delete('/me', requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({ password: z.string() }).parse(req.body)
  const row = await db.get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [req.user!.id])
  if (!row || !verifyPassword(body.password, row.password_hash)) throw httpError(400, 'Password is incorrect.', 'invalid_password')
  const devices = await db.query<{ id: string }>('SELECT id FROM devices WHERE user_id = ?', [req.user!.id])
  for (const device of devices) {
    await db.run('DELETE FROM files WHERE device_id = ?', [device.id])
    await db.run('DELETE FROM devices WHERE id = ?', [device.id])
  }
  await db.run('DELETE FROM sessions WHERE user_id = ?', [req.user!.id])
  await db.run('DELETE FROM files WHERE user_id = ?', [req.user!.id])
  await db.run('DELETE FROM activity WHERE user_id = ?', [req.user!.id])
  await db.run('DELETE FROM usage WHERE user_id = ?', [req.user!.id])
  await db.run('DELETE FROM invoices WHERE user_id = ?', [req.user!.id])
  await db.run('DELETE FROM users WHERE id = ?', [req.user!.id])
  res.clearCookie(SESSION_COOKIE, { path: '/' })
  res.json({ ok: true })
}))

export { cookieOptions }
