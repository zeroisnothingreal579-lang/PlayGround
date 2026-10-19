import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'
import { asyncHandler, httpError } from '../http.js'
import { nowIso } from '../util.js'
import { rateLimit } from '../rate-limit.js'
import {
  audit, getCatalog, getPlan, logActivity, runtimeInfo, syncDevices, usageFor,
} from '../device/manager.js'

export const systemRouter = Router()

systemRouter.get('/healthz', asyncHandler(async (_req, res) => {
  const dbOk = await db.health()
  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    service: 'clouddroid',
    database: db.engine,
    time: nowIso(),
  })
}))

systemRouter.get('/plans', asyncHandler(async (_req, res) => {
  const rows = await db.query<any>('SELECT * FROM plans ORDER BY sort_order ASC')
  res.json({
    plans: rows.map((row) => ({
      id: row.id,
      name: row.name,
      tagline: row.tagline,
      priceCents: row.price_cents,
      maxDevices: row.max_devices,
      maxConcurrent: row.max_concurrent,
      storageMb: row.storage_mb,
      vcpu: row.vcpu,
      ramMb: row.ram_mb,
      monthlyHours: row.monthly_hours,
      features: JSON.parse(row.features || '[]'),
    })),
  })
}))

systemRouter.get('/system/runtime', asyncHandler(async (_req, res) => {
  const info = await runtimeInfo()
  res.json({ ...info, androidHome: null, externalSerial: info.externalSerial ? info.externalSerial.replace(/\d+$/, '••••') : null })
}))

systemRouter.get('/public/status', asyncHandler(async (_req, res) => {
  const info = await runtimeInfo()
  const counts = await db.get<{ devices: number; demo: number; users: number }>(
    'SELECT COUNT(*) AS devices, SUM(CASE WHEN is_demo = 1 THEN 1 ELSE 0 END) AS demo, (SELECT COUNT(*) FROM users) AS users FROM devices',
  )
  res.json({
    mode: info.mode,
    label: info.label,
    transport: info.streamingTransport,
    gmsAvailable: info.gmsAvailable,
    bootedDevices: info.bootedDevices,
    devices: Number(counts?.devices || 0),
    demoDevices: Number(counts?.demo || 0),
    users: Number(counts?.users || 0),
  })
}))

systemRouter.get('/catalog', requireAuth, asyncHandler(async (req, res) => {
  await syncDevices()
  const count = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM devices WHERE user_id = ?', [req.user!.id])
  res.json(await getCatalog(req.user!.planId, Number(count?.count || 0)))
}))

systemRouter.get('/usage', requireAuth, asyncHandler(async (req, res) => {
  await syncDevices()
  res.json({ usage: await usageFor(req.user!.id, req.user!.planId) })
}))

systemRouter.get('/activity', requireAuth, asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100)
  const rows = await db.query<any>(
    'SELECT id, action, detail, device_id, device_name, demo, created_at FROM activity WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [req.user!.id, limit],
  )
  res.json({
    activity: rows.map((row) => ({
      id: row.id,
      action: row.action,
      detail: row.detail,
      deviceId: row.device_id,
      deviceName: row.device_name,
      createdAt: row.created_at,
      demo: row.demo === 1,
    })),
  })
}))

systemRouter.get('/billing', requireAuth, asyncHandler(async (req, res) => {
  const plan = await getPlan(req.user!.planId)
  const usage = await usageFor(req.user!.id, req.user!.planId)
  const invoices = await db.query<any>('SELECT * FROM invoices WHERE user_id = ? ORDER BY created_at DESC', [req.user!.id])
  res.json({
    plan,
    usage,
    billingMode: 'preview',
    notice: 'Billing is in preview mode. No payment method is charged in this environment.',
    invoices: invoices.map((row) => ({
      id: row.id,
      number: row.number,
      amountCents: row.amount_cents,
      status: row.status,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      createdAt: row.created_at,
      demo: row.demo === 1,
    })),
  })
}))

systemRouter.post('/billing/change-plan', requireAuth, rateLimit({ key: 'plan-change', limit: 10, windowMs: 60 * 60 * 1000 }), asyncHandler(async (req, res) => {
  const body = z.object({ planId: z.enum(['free', 'basic', 'pro', 'business']) }).parse(req.body)
  const plan = await getPlan(body.planId)
  const count = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM devices WHERE user_id = ?', [req.user!.id])
  if (Number(count?.count || 0) > plan.maxDevices) {
    throw httpError(409, `The ${plan.name} plan supports ${plan.maxDevices} phones. Delete ${Number(count?.count) - plan.maxDevices} phone(s) before downgrading.`, 'plan_device_limit')
  }
  await db.run('UPDATE users SET plan_id = ?, updated_at = ? WHERE id = ?', [plan.id, nowIso(), req.user!.id])
  await logActivity(req.user!.id, {
    deviceId: null,
    deviceName: null,
    action: 'billing.plan_changed',
    detail: `Plan switched to ${plan.name} (preview billing — no charge).`,
    demo: true,
  })
  await audit(req.user!.id, 'billing.plan_change', plan.id, { preview: true })
  res.json({ plan, notice: 'Preview billing only. No payment was processed.' })
}))
