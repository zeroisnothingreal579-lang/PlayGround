import { Router } from 'express'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { db } from '../db.js'
import { requireAuth } from '../auth.js'
import { config, DATA_PATHS } from '../config.js'
import { asyncHandler, httpError } from '../http.js'
import { rateLimit } from '../rate-limit.js'
import { classifyFile, id, nowIso, slugifyFilename } from '../util.js'
import { getDeviceRow, getPlan, logActivity, streamSerial, syncDevices } from '../device/manager.js'
import { installApk, pushFile } from '../device/adb.js'
import type { DeviceRow } from '../device/types.js'
import type { DeviceFile } from '../../../shared/contracts.js'

export const filesRouter = Router()
filesRouter.use(requireAuth)

const ALLOWED_EXTENSIONS = new Set([
  'apk', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'bmp',
  'mp4', 'webm', 'mov', 'mkv', 'mp3', 'wav', 'ogg',
  'pdf', 'txt', 'md', 'csv', 'json', 'xml', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'zip', 'tar', 'gz', '7z',
])

fs.mkdirSync(DATA_PATHS.uploads, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, DATA_PATHS.uploads),
  filename: (_req, _file, callback) => callback(null, `${id('up')}.upload`),
})

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const ext = (file.originalname.split('.').pop() || '').toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      callback(httpError(400, `.${ext || 'unknown'} files are not supported. Upload APKs, images, video, documents or archives.`))
      return
    }
    callback(null, true)
  },
})

type FileRow = {
  id: string
  device_id: string
  user_id: string
  name: string
  size: number
  mime: string
  storage_key: string
  kind: DeviceFile['kind']
  pushed: number
  created_at: string
}

function toFile(row: FileRow): DeviceFile {
  return {
    id: row.id,
    deviceId: row.device_id,
    name: row.name,
    size: Number(row.size),
    mime: row.mime,
    kind: row.kind,
    createdAt: row.created_at,
    pushed: row.pushed === 1,
  }
}

async function ownedDevice(userId: string, deviceId: string) {
  await syncDevices()
  const device = await getDeviceRow(deviceId)
  if (!device || device.user_id !== userId) throw httpError(404, 'Phone not found.', 'device_not_found')
  return device
}

async function storageUsed(userId: string) {
  const row = await db.get<{ bytes: number }>('SELECT COALESCE(SUM(size), 0) AS bytes FROM files WHERE user_id = ?', [userId])
  return Number(row?.bytes || 0)
}

filesRouter.get('/files', asyncHandler(async (req, res) => {
  const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : null
  const rows = deviceId
    ? await db.query<FileRow>('SELECT * FROM files WHERE user_id = ? AND device_id = ? ORDER BY created_at DESC', [req.user!.id, deviceId])
    : await db.query<FileRow>('SELECT * FROM files WHERE user_id = ? ORDER BY created_at DESC', [req.user!.id])
  res.json({ files: rows.map(toFile), usedBytes: await storageUsed(req.user!.id) })
}))

filesRouter.get('/devices/:id/files', asyncHandler(async (req, res) => {
  await ownedDevice(req.user!.id, req.params.id)
  const rows = await db.query<FileRow>('SELECT * FROM files WHERE user_id = ? AND device_id = ? ORDER BY created_at DESC', [req.user!.id, req.params.id])
  res.json({ files: rows.map(toFile), usedBytes: await storageUsed(req.user!.id) })
}))

filesRouter.post(
  '/devices/:id/files',
  rateLimit({ key: 'upload', limit: 40, windowMs: 10 * 60 * 1000 }),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const device = await ownedDevice(req.user!.id, req.params.id)
    const file = req.file
    if (!file) throw httpError(400, 'Choose a file to upload.', 'no_file')

    const plan = await getPlan(req.user!.planId)
    const used = await storageUsed(req.user!.id)
    if (used + file.size > plan.storageMb * 1024 * 1024) {
      fs.rmSync(file.path, { force: true })
      throw httpError(413, `This upload would exceed your ${(plan.storageMb / 1024).toFixed(0)} GB storage allowance.`, 'storage_limit')
    }

    const originalName = slugifyFilename(Buffer.from(file.originalname, 'latin1').toString('utf8'))
    const fileId = id('f')
    const extension = path.extname(originalName).toLowerCase()
    const deviceDir = path.join(config.storageDir, device.id)
    fs.mkdirSync(deviceDir, { recursive: true })
    const storageKey = `${fileId}${extension}`
    fs.renameSync(file.path, path.join(deviceDir, storageKey))

    let pushed = false
    let message = 'Stored in CloudDroid storage.'
    if (device.is_demo === 0 && device.status === 'running') {
      try {
        const serial = await streamSerial(device)
        const result = await pushFile(serial, path.join(deviceDir, storageKey), `/sdcard/Download/${originalName}`)
        pushed = result.ok
        message = result.ok ? `Copied to /sdcard/Download/${originalName}` : `Stored in CloudDroid. Device copy failed: ${result.message}`
      } catch (error: any) {
        message = `Stored in CloudDroid. Device copy failed: ${error.message}`
      }
    } else if (device.is_demo === 1) {
      message = 'Stored in CloudDroid storage. Demo phones have no Android storage.'
    }

    const row: FileRow = {
      id: fileId,
      device_id: device.id,
      user_id: req.user!.id,
      name: originalName,
      size: file.size,
      mime: file.mimetype || 'application/octet-stream',
      storage_key: storageKey,
      kind: classifyFile(originalName, file.mimetype || ''),
      pushed: pushed ? 1 : 0,
      created_at: nowIso(),
    }
    await db.run(
      'INSERT INTO files (id, device_id, user_id, name, size, mime, storage_key, kind, pushed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [row.id, row.device_id, row.user_id, row.name, row.size, row.mime, row.storage_key, row.kind, row.pushed, row.created_at],
    )
    await logActivity(req.user!.id, {
      deviceId: device.id,
      deviceName: device.name,
      action: 'file.uploaded',
      detail: `${originalName} uploaded${pushed ? ' and copied to the phone' : ''}.`,
      demo: device.is_demo === 1,
    })
    res.status(201).json({ file: toFile(row), message, devicePushed: pushed })
  }),
)

filesRouter.get('/files/:id/download', asyncHandler(async (req, res) => {
  const row = await db.get<FileRow>('SELECT * FROM files WHERE id = ? AND user_id = ?', [req.params.id, req.user!.id])
  if (!row) throw httpError(404, 'File not found.', 'file_not_found')
  const filePath = path.join(config.storageDir, row.device_id, row.storage_key)
  if (!fs.existsSync(filePath)) throw httpError(404, 'The stored file is missing.', 'file_missing')
  res.setHeader('Content-Type', row.mime || 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename="${row.name.replace(/[^\w.\- ]+/g, '_')}"`)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  fs.createReadStream(filePath).pipe(res)
}))

filesRouter.post('/files/:id/install', rateLimit({ key: 'apk-install', limit: 15, windowMs: 10 * 60 * 1000 }), asyncHandler(async (req, res) => {
  const row = await db.get<FileRow>('SELECT * FROM files WHERE id = ? AND user_id = ?', [req.params.id, req.user!.id])
  if (!row) throw httpError(404, 'File not found.', 'file_not_found')
  if (row.kind !== 'apk') throw httpError(400, 'Only APK files can be installed.', 'not_apk')
  const device = await ownedDevice(req.user!.id, row.device_id)
  if (device.is_demo === 1) throw httpError(409, 'Demo phones cannot install applications.', 'demo_no_install')
  if (device.status !== 'running') throw httpError(409, 'Start the phone before installing an APK.', 'device_not_running')
  const filePath = path.join(config.storageDir, row.device_id, row.storage_key)
  if (!fs.existsSync(filePath)) throw httpError(404, 'The stored APK is missing.', 'file_missing')
  const header = fs.readFileSync(filePath, { encoding: null }).subarray(0, 4)
  if (!(header[0] === 0x50 && header[1] === 0x4b)) throw httpError(400, 'This file is not a valid APK archive.', 'invalid_apk')

  const serial = await streamSerial(device)
  const result = await installApk(serial, filePath, `clouddroid-${row.id}.apk`)
  await logActivity(req.user!.id, {
    deviceId: device.id,
    deviceName: device.name,
    action: result.ok ? 'apk.installed' : 'apk.failed',
    detail: result.ok ? `${row.name} installed through Android Package Manager.` : `Install rejected: ${result.message}`,
    demo: false,
  })
  if (!result.ok) throw httpError(422, result.message || 'Android rejected the APK.', 'install_failed')
  res.json({ ok: true, message: result.message })
}))

filesRouter.delete('/files/:id', asyncHandler(async (req, res) => {
  const row = await db.get<FileRow>('SELECT * FROM files WHERE id = ? AND user_id = ?', [req.params.id, req.user!.id])
  if (!row) throw httpError(404, 'File not found.', 'file_not_found')
  await db.run('DELETE FROM files WHERE id = ?', [row.id])
  fs.rmSync(path.join(config.storageDir, row.device_id, row.storage_key), { force: true })
  res.json({ ok: true })
}))

export type { DeviceRow }
