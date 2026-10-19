import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'
import { asyncHandler, httpError } from '../http.js'
import { rateLimit } from '../rate-limit.js'
import { nowIso } from '../util.js'
import {
  audit, createDevice, deleteDevice, effectiveProviderKind, getDeviceRow, getPlan, restartDevice,
  startDevice, stopDevice, streamSerial, syncDevices, toDevice, usageFor,
} from '../device/manager.js'
import { pngSize, screencap } from '../device/adb.js'
import { issueStreamTicket } from '../tickets.js'
import type { DeviceRow } from '../device/types.js'

export const devicesRouter = Router()
devicesRouter.use(requireAuth)

async function ownedDevice(userId: string, role: string, id: string) {
  await syncDevices()
  const row = await getDeviceRow(id)
  if (!row || (row.user_id !== userId && role !== 'admin')) throw httpError(404, 'Phone not found.', 'device_not_found')
  return row
}

devicesRouter.get('/', asyncHandler(async (req, res) => {
  await syncDevices()
  const rows = await db.query<DeviceRow>('SELECT * FROM devices WHERE user_id = ? ORDER BY created_at ASC', [req.user!.id])
  res.json({ devices: rows.map(toDevice) })
}))

devicesRouter.post('/', rateLimit({ key: 'device-create', limit: 20, windowMs: 10 * 60 * 1000 }), asyncHandler(async (req, res) => {
  const body = z.object({
    name: z.string().trim().min(1, 'Give your phone a name').max(40),
    androidVersion: z.string().min(1),
    apiLevel: z.number().int().min(30).max(36),
    profileId: z.enum(['pixel_5', 'pixel_6', 'pixel_7', 'tablet_11']),
    ramMb: z.number().int().min(2048).max(8192),
    vcpu: z.number().int().min(1).max(8),
    storageGb: z.number().int().refine((value) => [16, 32, 64, 128].includes(value), 'Choose a supported storage size'),
    region: z.literal('local'),
    gms: z.boolean().default(false),
  }).parse(req.body)

  if (body.gms) throw httpError(400, 'Google services are not licensed on this node.', 'gms_unavailable')
  const plan = await getPlan(req.user!.planId)
  const count = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM devices WHERE user_id = ?', [req.user!.id])
  if (Number(count?.count || 0) >= plan.maxDevices) throw httpError(403, 'Your plan device limit has been reached.', 'plan_limit')

  const row = await createDevice(req.user!.id, req.user!.planId, body)
  res.status(201).json({ device: toDevice(row) })
}))

devicesRouter.get('/:id', asyncHandler(async (req, res) => {
  const row = await ownedDevice(req.user!.id, req.user!.role, req.params.id)
  const provider = await effectiveProviderKind()
  res.json({
    device: toDevice(row),
    runtime: {
      provider,
      live: row.is_demo === 0 && row.status === 'running',
      transport: row.is_demo === 1 ? 'none' : 'websocket-frames',
    },
  })
}))

devicesRouter.patch('/:id', asyncHandler(async (req, res) => {
  const row = await ownedDevice(req.user!.id, req.user!.role, req.params.id)
  const body = z.object({ name: z.string().trim().min(1).max(40) }).parse(req.body)
  await db.run('UPDATE devices SET name = ?, updated_at = ? WHERE id = ?', [body.name, nowIso(), row.id])
  await audit(req.user!.id, 'device.rename', `${row.name} -> ${body.name}`, { deviceId: row.id })
  res.json({ device: toDevice((await getDeviceRow(row.id))!) })
}))

devicesRouter.delete('/:id', rateLimit({ key: 'device-delete', limit: 30, windowMs: 10 * 60 * 1000 }), asyncHandler(async (req, res) => {
  const row = await ownedDevice(req.user!.id, req.user!.role, req.params.id)
  await deleteDevice(row)
  res.json({ ok: true })
}))

devicesRouter.post('/:id/start', rateLimit({ key: 'device-start', limit: 30, windowMs: 5 * 60 * 1000 }), asyncHandler(async (req, res) => {
  const row = await ownedDevice(req.user!.id, req.user!.role, req.params.id)
  await startDevice(row, req.user!.planId)
  res.status(202).json({ device: toDevice((await getDeviceRow(row.id))!) })
}))

devicesRouter.post('/:id/stop', rateLimit({ key: 'device-stop', limit: 30, windowMs: 5 * 60 * 1000 }), asyncHandler(async (req, res) => {
  const row = await ownedDevice(req.user!.id, req.user!.role, req.params.id)
  await stopDevice(row)
  res.json({ device: toDevice((await getDeviceRow(row.id))!) })
}))

devicesRouter.post('/:id/restart', rateLimit({ key: 'device-restart', limit: 30, windowMs: 5 * 60 * 1000 }), asyncHandler(async (req, res) => {
  const row = await ownedDevice(req.user!.id, req.user!.role, req.params.id)
  await restartDevice(row, req.user!.planId)
  res.status(202).json({ device: toDevice((await getDeviceRow(row.id))!) })
}))

devicesRouter.get('/:id/status', asyncHandler(async (req, res) => {
  const row = await ownedDevice(req.user!.id, req.user!.role, req.params.id)
  const fresh = await getDeviceRow(row.id)
  res.json({ device: toDevice(fresh!), usage: await usageFor(req.user!.id, req.user!.planId) })
}))

const snapshotCache = new Map<string, { at: number; buffer: Buffer }>()

devicesRouter.get('/:id/snapshot', asyncHandler(async (req, res) => {
  const row = await ownedDevice(req.user!.id, req.user!.role, req.params.id)
  if (row.is_demo === 1 || row.status !== 'running') throw httpError(404, 'No live screen is available.', 'no_snapshot')
  const cached = snapshotCache.get(row.id)
  if (cached && Date.now() - cached.at < 4000) {
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'no-store')
    res.end(cached.buffer)
    return
  }
  const serial = await streamSerial(row)
  const buffer = await screencap(serial)
  if (!buffer) throw httpError(503, 'The Android runtime did not return a frame.', 'capture_failed')
  snapshotCache.set(row.id, { at: Date.now(), buffer })
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', 'no-store')
  res.end(buffer)
}))

devicesRouter.get('/:id/screenshot', asyncHandler(async (req, res) => {
  const row = await ownedDevice(req.user!.id, req.user!.role, req.params.id)
  const serial = await streamSerial(row)
  const buffer = await screencap(serial)
  if (!buffer) throw httpError(503, 'The Android runtime did not return a frame.', 'capture_failed')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Content-Disposition', `attachment; filename="${row.name.replace(/[^\w-]+/g, '_')}-${stamp}.png"`)
  res.end(buffer)
}))

devicesRouter.post('/:id/stream-ticket', rateLimit({ key: 'stream-ticket', limit: 60, windowMs: 5 * 60 * 1000 }), asyncHandler(async (req, res) => {
  const row = await ownedDevice(req.user!.id, req.user!.role, req.params.id)
  const serial = await streamSerial(row)
  const ticket = await issueStreamTicket(req.user!.id, row.id)
  const size = { width: 0, height: 0 }
  void pngSize
  res.json({
    ...ticket,
    wsPath: `/api/v1/ws/stream?ticket=${encodeURIComponent(ticket.ticket)}`,
    transport: 'websocket-frames',
    serialHint: serial.replace(/\d+$/, '••••'),
    size,
  })
}))
