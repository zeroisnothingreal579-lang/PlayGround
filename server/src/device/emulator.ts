import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { config, DATA_PATHS } from '../config.js'
import { androidHomePaths, sdkAvailable, systemImageAvailable } from './catalog.js'
import {
  adb,
  adbDevice,
  avdNameFor,
  findBootedEmulator,
  isBooted,
  listDevices,
  spawnEmulator,
  startAdbServer,
} from './adb.js'
import type { DeviceProvider, DeviceRow, ProviderStartResult } from './types.js'

function avdFor(device: DeviceRow) {
  if (device.avd_name) return device.avd_name
  return `cd_${device.id.replace(/[^a-z0-9]/gi, '').slice(-14)}`
}

function logPath(deviceId: string) {
  return path.join(DATA_PATHS.logs, `${deviceId}.log`)
}

function pidPath(deviceId: string) {
  return path.join(DATA_PATHS.run, `${deviceId}.pid`)
}

async function avdExists(name: string) {
  const paths = androidHomePaths()
  if (!paths) return false
  if (!fs.existsSync(paths.avdmanager)) return false
  const result = await new Promise<{ code: number; out: string }>((resolve) => {
    const proc = spawn(paths.avdmanager, ['list', 'avd'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    proc.stdout.on('data', (chunk) => { out += chunk.toString() })
    proc.stderr.on('data', (chunk) => { out += chunk.toString() })
    proc.on('exit', (code) => resolve({ code: code || 0, out }))
    proc.on('error', () => resolve({ code: 1, out }))
  })
  return result.out.split('\n').some((line) => line.trim() === `Name: ${name}`)
}

async function createAvd(device: DeviceRow, name: string) {
  const paths = androidHomePaths()
  if (!paths) throw new Error('Android SDK is not configured')
  fs.mkdirSync(DATA_PATHS.logs, { recursive: true })
  const args = ['create', 'avd', '-n', name, '-k', config.avdImage, '-d', config.avdDevice, '--force']
  const exitCode = await new Promise<number>((resolve, reject) => {
    const proc = spawn(paths.avdmanager, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''
    proc.stdout.on('data', (chunk) => { output += chunk.toString() })
    proc.stderr.on('data', (chunk) => { output += chunk.toString() })
    proc.on('error', reject)
    proc.on('exit', (code) => {
      fs.appendFileSync(logPath(device.id), `\n[avdmanager] ${output}\n`)
      resolve(code || 0)
    })
    proc.stdin.write('no\n')
    proc.stdin.end()
  })
  if (exitCode !== 0) throw new Error(`Could not create Android virtual device ${name}`)
}

async function pickPort() {
  const devices = await listDevices(true)
  const used = new Set(
    devices
      .map((device) => Number(device.serial.replace('emulator-', '')))
      .filter((value) => Number.isFinite(value)),
  )
  for (let port = 5554; port <= 5680; port += 2) {
    if (!used.has(port)) return port
  }
  throw new Error('No free emulator ports are available on this node')
}

async function waitForBoot(serial: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  const started = Date.now()
  while (Date.now() < deadline) {
    if (await isBooted(serial)) return true
    const devices = await listDevices(true)
    const entry = devices.find((device) => device.serial === serial)
    if (!entry && Date.now() - started > 25_000) return false
    await new Promise((resolve) => setTimeout(resolve, 2500))
  }
  return false
}

async function stopProcess(device: DeviceRow) {
  const serial = device.provider_ref
  if (serial) {
    const result = await adbDevice(serial, ['emu', 'kill'], 8000)
    if (result.code !== 0) await adbDevice(serial, ['reboot', '-p'], 8000).catch(() => undefined)
  }
  try {
    const pid = Number(fs.readFileSync(pidPath(device.id), 'utf8'))
    if (pid) process.kill(pid, 'SIGTERM')
  } catch {
    /* process already gone */
  }
  try { fs.rmSync(pidPath(device.id), { force: true }) } catch { /* ignore */ }
}

export class EmulatorProvider implements DeviceProvider {
  kind = 'emulator' as const

  async available() {
    return sdkAvailable() && systemImageAvailable()
  }

  async start(device: DeviceRow): Promise<ProviderStartResult> {
    const name = avdFor(device)
    const existing = await findBootedEmulator(name)
    if (existing) {
      return { serial: existing, detail: `Attached to running ${name} (${existing})` }
    }
    await startAdbServer()
    if (!(await this.available())) {
      throw new Error('Android emulator or the AOSP system image is not installed on this node')
    }
    if (!(await avdExists(name))) await createAvd(device, name)

    const port = await pickPort()
    const serial = `emulator-${port}`
    fs.mkdirSync(DATA_PATHS.run, { recursive: true })
    fs.mkdirSync(DATA_PATHS.logs, { recursive: true })
    fs.appendFileSync(logPath(device.id), `\n[clouddroid] start ${name} on ${serial} at ${new Date().toISOString()}\n`)
    const args = [
      '-avd', name,
      '-port', String(port),
      '-no-window',
      '-no-audio',
      '-no-boot-anim',
      '-gpu', 'swiftshader_indirect',
      '-no-snapshot',
      '-accel', 'on',
      '-memory', String(Math.min(Math.max(device.ram_mb, 2048), 4096)),
    ]
    const proc = spawnEmulator(args, logPath(device.id))
    if (proc.pid) fs.writeFileSync(pidPath(device.id), String(proc.pid))

    const booted = await waitForBoot(serial, config.bootTimeoutMs)
    if (!booted) {
      await stopProcess({ ...device, provider_ref: serial })
      throw new Error('Android boot timed out. Check the device log on the runtime node.')
    }
    await adbDevice(serial, ['shell', 'input', 'keyevent', '82'], 5000).catch(() => undefined)
    return { serial, detail: `Android booted on ${serial}` }
  }

  async stop(device: DeviceRow) {
    await stopProcess(device)
  }

  async status(device: DeviceRow) {
    if (device.provider_ref) {
      const booted = await isBooted(device.provider_ref)
      if (booted) return { running: true, serial: device.provider_ref }
    }
    const found = await findBootedEmulator(avdFor(device))
    return { running: Boolean(found), serial: found }
  }

  async remove(device: DeviceRow) {
    await stopProcess(device)
    const paths = androidHomePaths()
    const name = avdFor(device)
    if (paths && fs.existsSync(paths.avdmanager) && (await avdExists(name))) {
      await new Promise<void>((resolve) => {
        const proc = spawn(paths.avdmanager, ['delete', 'avd', '-n', name], { stdio: 'ignore' })
        proc.on('exit', () => resolve())
        proc.on('error', () => resolve())
      })
    }
    try { fs.rmSync(logPath(device.id), { force: true }) } catch { /* ignore */ }
  }
}

export class ExternalProvider implements DeviceProvider {
  kind = 'external' as const

  private async serial() {
    if (config.androidSerial) return config.androidSerial
    const devices = await listDevices(true)
    const candidate = devices.find((device) => device.state === 'device')
    return candidate?.serial || null
  }

  async available() {
    return Boolean(await this.serial())
  }

  async start(device: DeviceRow): Promise<ProviderStartResult> {
    const serial = (await this.serial()) || device.provider_ref
    if (!serial) throw new Error('No external Android device is connected to adb')
    if (!(await isBooted(serial))) throw new Error(`External device ${serial} is connected but Android has not booted`)
    return { serial, detail: `Attached to external device ${serial}` }
  }

  async stop(device: DeviceRow) {
    if (device.provider_ref?.startsWith('emulator-')) {
      await adbDevice(device.provider_ref, ['emu', 'kill'], 8000).catch(() => undefined)
    }
  }

  async status(device: DeviceRow) {
    const serial = device.provider_ref || (await this.serial())
    if (!serial) return { running: false, serial: null }
    return { running: await isBooted(serial), serial }
  }

  async remove() {
    /* Never delete an externally-managed Android device. */
  }
}
