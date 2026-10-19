import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'
import { config, DATA_PATHS } from '../config.js'
import { androidHomePaths } from './catalog.js'

const exec = promisify(execFile)

export interface AdbResult {
  stdout: string
  stderr: string
  code: number
}

function adbBin() {
  const paths = androidHomePaths()
  if (paths && fs.existsSync(paths.adb)) return paths.adb
  return 'adb'
}

export async function adb(args: string[], timeout = 15_000): Promise<AdbResult> {
  try {
    const { stdout, stderr } = await exec(adbBin(), args, { timeout, maxBuffer: 32 * 1024 * 1024 })
    return { stdout, stderr, code: 0 }
  } catch (error: any) {
    return { stdout: error.stdout || '', stderr: error.stderr || error.message || '', code: error.code || 1 }
  }
}

export async function adbDevice(serial: string, args: string[], timeout = 15_000) {
  return adb(['-s', serial, ...args], timeout)
}

export interface AdbDeviceInfo {
  serial: string
  state: string
}

let deviceCache: { at: number; devices: AdbDeviceInfo[] } = { at: 0, devices: [] }

export async function listDevices(force = false): Promise<AdbDeviceInfo[]> {
  if (!force && Date.now() - deviceCache.at < 1500) return deviceCache.devices
  const result = await adb(['devices'], 8000)
  const devices = result.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state] = line.split(/\s+/)
      return { serial, state }
    })
    .filter((device) => device.serial && device.state)
  deviceCache = { at: Date.now(), devices }
  return devices
}

export async function isBooted(serial: string) {
  const result = await adbDevice(serial, ['shell', 'getprop', 'sys.boot_completed'], 8000)
  return result.stdout.trim() === '1'
}

export async function avdNameFor(serial: string): Promise<string | null> {
  if (!serial.startsWith('emulator-')) return null
  const result = await adbDevice(serial, ['emu', 'avd', 'name'], 5000)
  if (result.code !== 0) return null
  return result.stdout.split(/\r?\n/)[0]?.trim() || null
}

export async function findBootedEmulator(avdName?: string | null): Promise<string | null> {
  const devices = await listDevices(true)
  for (const device of devices) {
    if (device.state !== 'device' || !device.serial.startsWith('emulator-')) continue
    if (avdName) {
      const name = await avdNameFor(device.serial)
      if (name !== avdName) continue
    }
    if (await isBooted(device.serial)) return device.serial
  }
  return null
}

export async function screencap(serial: string): Promise<Buffer | null> {
  try {
    const { stdout } = await exec(adbBin(), ['-s', serial, 'exec-out', 'screencap', '-p'], {
      timeout: 20_000,
      maxBuffer: 24 * 1024 * 1024,
      encoding: 'buffer',
    })
    const buffer = Buffer.from(stdout)
    if (buffer.length > 16 && buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') return buffer
    return null
  } catch {
    return null
  }
}

export function pngSize(buffer: Buffer) {
  if (buffer.length < 24) return { width: 0, height: 0 }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

export async function tap(serial: string, x: number, y: number) {
  await adbDevice(serial, ['shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y))], 8000)
}

export async function swipe(serial: string, x1: number, y1: number, x2: number, y2: number, duration = 240) {
  await adbDevice(
    serial,
    ['shell', 'input', 'swipe', String(Math.round(x1)), String(Math.round(y1)), String(Math.round(x2)), String(Math.round(y2)), String(Math.round(duration))],
    12_000,
  )
}

const KEYCODES: Record<string, string> = {
  back: '4', home: '3', recents: '187', menu: '82', enter: '66', del: '67',
  volumeup: '24', volumedown: '25', power: '26', wakeup: '224', sleep: '223',
  arrowup: '19', arrowdown: '20', arrowleft: '21', arrowright: '22',
  escape: '111', tab: '61', space: '62',
}

export async function keyEvent(serial: string, key: string) {
  const code = KEYCODES[key.toLowerCase()] || (/^\d+$/.test(key) ? key : null)
  if (!code) return false
  const result = await adbDevice(serial, ['shell', 'input', 'keyevent', code], 8000)
  return result.code === 0
}

export async function inputText(serial: string, text: string) {
  const clean = text.replace(/[\u0000-\u001f]/g, ' ').slice(0, 1000)
  if (!clean) return
  const escaped = clean
    .replace(/%/g, '%25')
    .replace(/ /g, '%s')
    .replace(/([&|;<>()$`\\!"'*?[\]{}#~])/g, '\\$1')
  await adbDevice(serial, ['shell', 'input', 'text', escaped], 15_000)
}

export async function rotate(serial: string) {
  const current = await adbDevice(serial, ['shell', 'settings', 'get', 'system', 'user_rotation'], 5000)
  const value = Number(current.stdout.trim() || 0)
  const next = (Number.isFinite(value) ? value + 1 : 1) % 4
  await adbDevice(serial, ['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0'], 5000)
  await adbDevice(serial, ['shell', 'settings', 'put', 'system', 'user_rotation', String(next)], 5000)
  return next
}

export async function deviceProps(serial: string) {
  const result = await adbDevice(serial, ['shell', 'getprop'], 10_000)
  const props: Record<string, string> = {}
  for (const line of result.stdout.split('\n')) {
    const match = line.match(/^\[([^\]]+)\]: \[(.*)\]$/)
    if (match) props[match[1]] = match[2]
  }
  return {
    release: props['ro.build.version.release'] || null,
    sdk: props['ro.build.version.sdk'] || null,
    model: props['ro.product.model'] || null,
    build: props['ro.build.display.id'] || null,
  }
}

export async function pushFile(serial: string, localPath: string, remotePath: string) {
  const result = await adbDevice(serial, ['push', localPath, remotePath], 120_000)
  return result.code === 0 ? { ok: true, message: result.stdout.trim() } : { ok: false, message: result.stderr.trim() }
}

export async function installApk(serial: string, localPath: string, remoteName: string) {
  const remotePath = `/data/local/tmp/${remoteName}`
  const pushed = await pushFile(serial, localPath, remotePath)
  if (!pushed.ok) return { ok: false, message: `Upload to device failed: ${pushed.message}` }
  const result = await adbDevice(serial, ['shell', 'pm', 'install', '-r', remotePath], 180_000)
  await adbDevice(serial, ['shell', 'rm', '-f', remotePath], 8000)
  const output = `${result.stdout}\n${result.stderr}`.trim()
  return { ok: /Success/i.test(output), message: output.split('\n').filter(Boolean).slice(-2).join(' ') || 'No output from package manager' }
}

export async function startAdbServer() {
  await adb(['start-server'], 15_000)
}

export function spawnEmulator(args: string[], logFile: string) {
  fs.mkdirSync(DATA_PATHS.logs, { recursive: true })
  const paths = androidHomePaths()
  const binary = paths?.emulator || 'emulator'
  const out = fs.openSync(logFile, 'a')
  const proc = spawn(binary, args, {
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, ANDROID_HOME: config.androidHome, ANDROID_SDK_ROOT: config.androidHome },
  })
  proc.unref()
  return proc
}
