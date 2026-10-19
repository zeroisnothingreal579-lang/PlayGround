import { Router } from 'express'
import { db } from '../db.js'
import { requireAdmin } from '../auth.js'
import { asyncHandler } from '../http.js'
import { runtimeInfo, syncDevices, toDevice } from '../device/manager.js'
import type { DeviceRow } from '../device/types.js'

export const adminRouter = Router()
adminRouter.use(requireAdmin)

adminRouter.get('/overview', asyncHandler(async (_req, res) => {
  await syncDevices()
  const users = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM users')
  const devices = await db.get<{ count: number; running: number; demo: number }>(
    "SELECT COUNT(*) AS count, SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running, SUM(CASE WHEN is_demo = 1 THEN 1 ELSE 0 END) AS demo FROM devices",
  )
  const storage = await db.get<{ bytes: number }>('SELECT COALESCE(SUM(size), 0) AS bytes FROM files')
  const auditRows = await db.query<any>('SELECT id, action, target, actor_email, created_at FROM audit_log ORDER BY created_at DESC LIMIT 8')
  res.json({
    overview: {
      users: Number(users?.count || 0),
      devices: Number(devices?.count || 0),
      running: Number(devices?.running || 0),
      demoDevices: Number(devices?.demo || 0),
      storageMb: Number(storage?.bytes || 0) / (1024 * 1024),
      runtime: await runtimeInfo(),
      recentAudit: auditRows.map((row) => ({
        id: row.id, action: row.action, target: row.target, actor: row.actor_email, createdAt: row.created_at,
      })),
    },
  })
}))

adminRouter.get('/users', asyncHandler(async (_req, res) => {
  const rows = await db.query<any>(
    `SELECT u.id, u.email, u.name, u.role, u.plan_id, u.status, u.created_at,
      (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id) AS device_count
     FROM users u ORDER BY u.created_at ASC`,
  )
  res.json({
    users: rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      planId: row.plan_id,
      status: row.status,
      createdAt: row.created_at,
      deviceCount: Number(row.device_count || 0),
    })),
  })
}))

adminRouter.get('/devices', asyncHandler(async (_req, res) => {
  await syncDevices()
  const rows = await db.query<DeviceRow & { email: string }>(
    'SELECT d.*, u.email FROM devices d JOIN users u ON u.id = d.user_id ORDER BY d.created_at ASC',
  )
  res.json({
    devices: rows.map((row) => ({ ...toDevice(row), ownerEmail: row.email, avdName: row.avd_name })),
  })
}))

adminRouter.get('/audit', asyncHandler(async (_req, res) => {
  const rows = await db.query<any>('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100')
  res.json({
    audit: rows.map((row) => ({
      id: row.id,
      actor: row.actor_email,
      action: row.action,
      target: row.target,
      meta: row.meta ? JSON.parse(row.meta) : null,
      ip: row.ip,
      createdAt: row.created_at,
    })),
  })
}))
