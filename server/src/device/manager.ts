import fs from 'node:fs'
import path from 'node:path'
import { db } from '../db.js'
import { config } from '../config.js'
import { nowIso, id } from '../util.js'
import type { Device, DeviceStatus, Plan, ProviderKind, RuntimeInfo, UsageSummary } from '../../../shared/contracts.js'
import { catalogFor, profileById, sdkAvailable, systemImageAvailable } from './catalog.js'
import { avdNameFor, findBootedEmulator, isBooted, listDevices } from './adb.js'
import { DemoProvider } from './demo.js'
import { EmulatorProvider, ExternalProvider } from './emulator.js'
import type { DeviceProvider, DeviceRow } from './types.js'

const demoProvider = new DemoProvider()
const emulatorProvider = new EmulatorProvider()
const externalProvider = new ExternalProvider()

type PlanRow = {
  id: string
  name: string
  tagline: string
  price_cents: number
  max_devices: number
  max_concurrent: number
  storage_mb: number
  vcpu: number
  ram_mb: number
  monthly_hours: number
  features: string
}

export function planToJson(row: PlanRow): Plan {
  let features: string[] = []
  try { features = JSON.parse(row.features) } catch { features = [] }
  return {
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
    features,
  }
}

export async function getPlan(planId: string): Promise<Plan> {
  const row = await db.get<PlanRow>('SELECT * FROM plans WHERE id = ?', [planId])
  if (!row) throw new Error('Plan not found')
  return planToJson(row)
}

export async function effectiveProviderKind(): Promise<ProviderKind> {
  if (config.provider === 'demo') return 'demo'
  if (config.provider === 'external') return 'external'
  if (config.provider === 'emulator') return 'emulator'
  if (config.provider === 'auto') {
    if (sdkAvailable() && systemImageAvailable()) return 'emulator'
    const devices = await listDevices(true)
    if (devices.some((device) => device.state === 'device')) return 'external'
  }
  return 'demo'
}

function providerFor(device: DeviceRow): DeviceProvider {
  if (device.is_demo === 1 || device.provider === 'demo') return demoProvider
  if (device.provider === 'external') return externalProvider
  return emulatorProvider
}

export function toDevice(row: DeviceRow): Device {
  const active = row.status === 'running' && row.is_demo === 0
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    androidVersion: row.android_version,
    apiLevel: row.api_level,
    profileId: row.profile_id,
    profileName: row.profile_name,
    resolution: row.resolution,
    ramMb: row.ram_mb,
    vcpu: row.vcpu,
    storageGb: row.storage_gb,
    region: row.region,
    gms: row.gms === 1,
    status: row.status as DeviceStatus,
    provider: row.provider as ProviderKind,
    isDemo: row.is_demo === 1,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastStartedAt: row.last_started_at,
    streamCapable: active,
  }
}

export async function getDeviceRow(deviceId: string) {
  return db.get<DeviceRow>('SELECT * FROM devices WHERE id = ?', [deviceId])
}

const starting = new Set<string>()
let syncPromise: Promise<void> | null = null
let lastSync = 0

async function findSerial(device: DeviceRow): Promise<string | null> {
  if (device.provider === 'external') {
    if (device.provider_ref && (await isBooted(device.provider_ref))) return device.provider_ref
    const devices = await listDevices(true)
    for (const entry of devices) {
      if (entry.state === 'device' && (await isBooted(entry.serial))) return entry.serial
    }
    return null
  }
  if (device.provider_ref && (await isBooted(device.provider_ref))) return device.provider_ref
  if (device.avd_name) {
    const found = await findBootedEmulator(device.avd_name)
    if (found) return found
  }
  return null
}

async function doSync() {
  const rows = await db.query<DeviceRow>('SELECT * FROM devices WHERE is_demo = 0')
  if (!rows.length) return
  const devices = await listDevices(true)
  const bootedSerials: string[] = []
  const avdBySerial = new Map<string, string | null>()
  for (const entry of devices) {
    if (entry.state !== 'device') continue
    if (await isBooted(entry.serial)) {
      bootedSerials.push(entry.serial)
      avdBySerial.set(entry.serial, await avdNameFor(entry.serial))
    }
  }

  for (const row of rows) {
    if (starting.has(row.id)) continue
    let serial: string | null = null
    if (row.provider_ref && bootedSerials.includes(row.provider_ref)) serial = row.provider_ref
    if (!serial && row.avd_name) {
      for (const candidate of bootedSerials) {
        if (avdBySerial.get(candidate) === row.avd_name) { serial = candidate; break }
      }
    }
    if (!serial && row.provider === 'external') serial = bootedSerials[0] || null

    if (serial) {
      if (row.status !== 'running' || row.provider_ref !== serial) {
        await db.run("UPDATE devices SET status = 'running', provider_ref = ?, error_message = NULL, updated_at = ? WHERE id = ?", [serial, nowIso(), row.id])
      }
    } else if (row.status === 'running' || row.status === 'starting' || row.status === 'stopping') {
      await db.run("UPDATE devices SET status = 'stopped', provider_ref = NULL, updated_at = ? WHERE id = ?", [nowIso(), row.id])
    }
  }
}

export function syncDevices(force = false): Promise<void> {
  if (syncPromise) return syncPromise
  if (!force && Date.now() - lastSync < 2500) return Promise.resolve()
  syncPromise = doSync()
    .catch((error) => console.error('[runtime] sync failed', error))
    .finally(() => {
      lastSync = Date.now()
      syncPromise = null
    })
  return syncPromise
}

export async function runtimeInfo(): Promise<RuntimeInfo> {
  const kind = await effectiveProviderKind()
  const available = kind === 'emulator'
    ? sdkAvailable() && systemImageAvailable()
    : kind === 'external'
      ? Boolean(await externalProvider.available())
      : false
  let bootedDevices = 0
  try {
    const devices = await listDevices(true)
    for (const device of devices) {
      if (device.state === 'device' && (await isBooted(device.serial))) bootedDevices += 1
    }
  } catch { bootedDevices = 0 }

  let mode: RuntimeInfo['mode'] = 'demo'
  let label = 'Demo environment'
  let detail = 'No Android runtime is configured. Any demo phone is clearly labelled and is not a live device.'
  if (kind !== 'demo') {
    if (available) {
      mode = 'live'
      label = kind === 'emulator'
        ? (config.gmsAvailable ? 'Managed Android · Google Play' : 'Managed AOSP runtime')
        : 'Attached Android runtime'
      detail = kind === 'emulator'
        ? `KVM-backed ${config.gmsAvailable ? 'Google Play' : 'AOSP'} Android emulator · ${bootedDevices} booted · WebSocket frame transport`
        : `External adb device · ${bootedDevices} online · WebSocket frame transport`
    } else {
      mode = 'degraded'
      label = 'Runtime unavailable'
      detail = 'An Android runtime is configured but adb cannot reach a booted device right now.'
    }
  }
  return {
    mode,
    provider: kind,
    label,
    detail,
    androidHome: config.androidHome || null,
    adbAvailable: available,
    externalSerial: config.androidSerial || null,
    gmsAvailable: config.gmsAvailable,
    bootedDevices,
    streamingTransport: mode === 'live' ? 'websocket-frames' : 'none',
    demoSeed: config.seedDemo,
    maxRunning: config.maxRunning,
    serverTime: nowIso(),
  }
}

export async function getCatalog(planId: string, deviceCount: number) {
  const runtime = await runtimeInfo()
  const plan = await getPlan(planId)
  const provisionable = runtime.mode !== 'demo' && deviceCount < plan.maxDevices
  return {
    runtime,
    ...catalogFor(config.gmsAvailable),
    plan,
    provisionable,
  }
}

function deviceLimitError() {
  return Object.assign(new Error('Your plan device limit has been reached. Delete a phone or upgrade your plan.'), { status: 403, code: 'plan_limit' })
}

export async function createDevice(userId: string, planId: string, input: {
  name: string
  profileId: string
  androidVersion: string
  apiLevel: number
  ramMb: number
  vcpu: number
  storageGb: number
  region: string
  gms: boolean
}) {
  const plan = await getPlan(planId)
  const existing = await db.get<{ count: number }>('SELECT COUNT(*) AS count FROM devices WHERE user_id = ?', [userId])
  if (Number(existing?.count || 0) >= plan.maxDevices) throw deviceLimitError()
  if (input.storageGb * 1024 > plan.storageMb) throw Object.assign(new Error(`Your plan allows ${(plan.storageMb / 1024).toFixed(0)} GB of storage.`), { status: 400 })
  if (input.ramMb > plan.ramMb) throw Object.assign(new Error(`Your plan allows up to ${plan.ramMb} MB RAM per phone.`), { status: 400 })
  if (input.vcpu > plan.vcpu) throw Object.assign(new Error(`Your plan allows up to ${plan.vcpu} vCPU.`), { status: 400 })

  const kind = await effectiveProviderKind()
  if (kind === 'external') {
    const bound = await db.get<{ count: number }>("SELECT COUNT(*) AS count FROM devices WHERE provider = 'external' AND is_demo = 0 AND user_id = ?", [userId])
    if (Number(bound?.count || 0) > 0) {
      throw Object.assign(new Error('This node has one external Android runtime and it is already bound to a phone.'), { status: 409, code: 'runtime_capacity' })
    }
  }
  if (input.gms && !config.gmsAvailable) {
    throw Object.assign(new Error('Google services are not licensed on this node. Create an AOSP device instead.'), { status: 400 })
  }

  const profile = profileById(input.profileId)
  const deviceId = id('d')
  const timestamp = nowIso()
  const isDemo = kind === 'demo' ? 1 : 0
  const avdName = kind === 'emulator' ? `cd_${deviceId.replace(/[^a-z0-9]/gi, '').slice(-14)}` : null
  await db.run(
    `INSERT INTO devices (id, user_id, name, android_version, api_level, profile_id, profile_name, resolution, ram_mb, vcpu,
      storage_gb, region, gms, status, provider, provider_ref, avd_name, is_demo, error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stopped', ?, NULL, ?, ?, NULL, ?, ?)`,
    [
      deviceId, userId, input.name, input.androidVersion, input.apiLevel, profile.id, profile.name, profile.resolution,
      input.ramMb, input.vcpu, input.storageGb, input.region, input.gms ? 1 : 0, kind, avdName, isDemo, timestamp, timestamp,
    ],
  )
  await logActivity(userId, {
    deviceId,
    deviceName: input.name,
    action: 'phone.created',
    detail: isDemo ? 'Demo phone created (no Android runtime attached).' : `Phone provisioned on the ${kind} runtime.`,
    demo: isDemo === 1,
  })
  await audit(userId, 'device.create', `${input.name} (${deviceId})`, { provider: kind, isDemo })
  return (await getDeviceRow(deviceId))!
}

export async function startDevice(device: DeviceRow, planId: string) {
  if (starting.has(device.id)) return
  if (device.status === 'running' && !device.is_demo) {
    const serial = await findSerial(device)
    if (serial) return
  }
  const plan = await getPlan(planId)
  const running = await db.get<{ count: number }>(
    "SELECT COUNT(*) AS count FROM devices WHERE user_id = ? AND status IN ('running', 'starting')",
    [device.user_id],
  )
  if (Number(running?.count || 0) >= plan.maxConcurrent) {
    throw Object.assign(new Error(`Your ${plan.name} plan allows ${plan.maxConcurrent} concurrent phone${plan.maxConcurrent === 1 ? '' : 's'}. Stop another phone first.`), { status: 409, code: 'concurrency_limit' })
  }
  if (device.is_demo === 0) {
    const global = await db.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM devices WHERE status IN ('running', 'starting') AND is_demo = 0 AND id != ?",
      [device.id],
    )
    if (Number(global?.count || 0) >= config.maxRunning) {
      throw Object.assign(new Error(`This runtime node is at capacity (${config.maxRunning} concurrent Android instance${config.maxRunning === 1 ? '' : 's'}). Stop another phone or add a runtime node.`), { status: 409, code: 'runtime_capacity' })
    }
  }

  const provider = providerFor(device)
  starting.add(device.id)
  await db.run("UPDATE devices SET status = 'starting', error_message = NULL, updated_at = ? WHERE id = ?", [nowIso(), device.id])
  await logActivity(device.user_id, {
    deviceId: device.id,
    deviceName: device.name,
    action: 'phone.starting',
    detail: device.is_demo ? 'Demo state changing to running (not a live Android instance).' : `Booting ${device.android_version} on the ${device.provider} runtime.`,
    demo: device.is_demo === 1,
  })

  void (async () => {
    try {
      const result = await provider.start(device)
      if (device.is_demo) {
        await db.run("UPDATE devices SET status = 'running', provider_ref = NULL, last_started_at = ?, updated_at = ? WHERE id = ?", [nowIso(), nowIso(), device.id])
      } else {
        await db.run(
          "UPDATE devices SET status = 'running', provider_ref = ?, error_message = NULL, last_started_at = ?, updated_at = ? WHERE id = ?",
          [result.serial, nowIso(), nowIso(), device.id],
        )
      }
      await logActivity(device.user_id, {
        deviceId: device.id,
        deviceName: device.name,
        action: device.is_demo ? 'phone.demo_on' : 'phone.running',
        detail: result.detail,
        demo: device.is_demo === 1,
      })
    } catch (error: any) {
      const message = error?.message || 'Could not start Android'
      await db.run("UPDATE devices SET status = 'error', error_message = ?, provider_ref = NULL, updated_at = ? WHERE id = ?", [message, nowIso(), device.id])
      await logActivity(device.user_id, {
        deviceId: device.id,
        deviceName: device.name,
        action: 'phone.error',
        detail: message,
        demo: device.is_demo === 1,
      })
    } finally {
      starting.delete(device.id)
    }
  })()
}

export async function stopDevice(device: DeviceRow) {
  if (starting.has(device.id) || device.status === 'starting') {
    throw Object.assign(new Error('This phone is still starting. Wait for boot to finish before stopping it.'), { status: 409, code: 'device_starting' })
  }
  await db.run("UPDATE devices SET status = 'stopping', updated_at = ? WHERE id = ?", [nowIso(), device.id])
  const provider = providerFor(device)
  try {
    await provider.stop(device)
  } catch (error: any) {
    await db.run("UPDATE devices SET status = 'error', error_message = ?, updated_at = ? WHERE id = ?", [error?.message || 'Stop failed', nowIso(), device.id])
    throw error
  }
  await db.run("UPDATE devices SET status = 'stopped', provider_ref = NULL, error_message = NULL, updated_at = ? WHERE id = ?", [nowIso(), device.id])
  await logActivity(device.user_id, {
    deviceId: device.id,
    deviceName: device.name,
    action: device.is_demo ? 'phone.demo_off' : 'phone.stopped',
    detail: device.is_demo ? 'Demo phone stopped.' : 'Android instance stopped. Persistent storage is retained.',
    demo: device.is_demo === 1,
  })
}

export async function restartDevice(device: DeviceRow, planId: string) {
  if (device.status === 'running' || device.status === 'error') {
    await stopDevice(device)
    const fresh = await getDeviceRow(device.id)
    if (fresh) await startDevice(fresh, planId)
  } else {
    await startDevice(device, planId)
  }
}

export async function deleteDevice(device: DeviceRow) {
  const provider = providerFor(device)
  try { await provider.remove(device) } catch (error) { console.error('[device] remove failed', error) }
  await db.run('DELETE FROM files WHERE device_id = ?', [device.id])
  await db.run('DELETE FROM devices WHERE id = ?', [device.id])
  try { fs.rmSync(path.join(config.storageDir, device.id), { recursive: true, force: true }) } catch { /* ignore */ }
  await logActivity(device.user_id, {
    deviceId: null,
    deviceName: device.name,
    action: 'phone.deleted',
    detail: 'Phone and its stored files were deleted.',
    demo: device.is_demo === 1,
  })
  await audit(device.user_id, 'device.delete', `${device.name} (${device.id})`, {})
}

export async function streamSerial(device: DeviceRow) {
  if (device.is_demo === 1 || device.provider === 'demo') throw Object.assign(new Error('Demo phones have no Android stream. Create a phone on a live runtime.'), { status: 409, code: 'demo_no_stream' })
  const serial = await findSerial(device)
  if (!serial) throw Object.assign(new Error('Android is not running for this phone. Start it and try again.'), { status: 409, code: 'device_not_running' })
  return serial
}

export async function usageFor(userId: string, planId: string): Promise<UsageSummary> {
  const plan = await getPlan(planId)
  const devices = await db.query<DeviceRow>('SELECT * FROM devices WHERE user_id = ?', [userId])
  const fileStats = await db.get<{ bytes: number }>('SELECT COALESCE(SUM(size), 0) AS bytes FROM files WHERE user_id = ?', [userId])
  const usage = await db.get<{ minutes: number; storage_mb: number }>(
    'SELECT COALESCE(SUM(minutes), 0) AS minutes, COALESCE(SUM(storage_mb), 0) AS storage_mb FROM usage WHERE user_id = ?',
    [userId],
  )
  return {
    period: nowIso().slice(0, 7),
    minutes: Number(usage?.minutes || 0),
    storageMb: Number(fileStats?.bytes || 0) / (1024 * 1024),
    deviceCount: devices.length,
    runningCount: devices.filter((device) => device.status === 'running').length,
    limits: {
      maxDevices: plan.maxDevices,
      maxConcurrent: plan.maxConcurrent,
      storageMb: plan.storageMb,
      monthlyHours: plan.monthlyHours,
      vcpu: plan.vcpu,
      ramMb: plan.ramMb,
    },
  }
}

export async function logActivity(userId: string, event: {
  deviceId: string | null
  deviceName: string | null
  action: string
  detail: string
  demo: boolean
}) {
  await db.run(
    'INSERT INTO activity (id, user_id, device_id, device_name, action, detail, demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id('ev'), userId, event.deviceId, event.deviceName, event.action, event.detail, event.demo ? 1 : 0, nowIso()],
  )
}

export async function audit(actorId: string | null, action: string, target: string | null, meta: Record<string, unknown>) {
  const actor = actorId ? await db.get<{ email: string }>('SELECT email FROM users WHERE id = ?', [actorId]) : null
  await db.run(
    'INSERT INTO audit_log (id, actor_id, actor_email, action, target, meta, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id('aud'), actorId, actor?.email || null, action, target, JSON.stringify(meta), null, nowIso()],
  )
}

export async function syncExternalAdoption() {
  await syncDevices(true)
}
