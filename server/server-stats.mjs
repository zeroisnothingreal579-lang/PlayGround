import os from 'node:os'
import { existsSync, readFileSync } from 'node:fs'
import { config } from './config.mjs'

let lastNetwork = null

function readNetworkBytes() {
  try {
    const raw = readFileSync('/proc/net/dev', 'utf8')
    let received = 0
    let sent = 0
    for (const line of raw.split('\n').slice(2)) {
      const [name, rest] = line.split(':')
      if (!rest || name.trim() === 'lo') continue
      const fields = rest.trim().split(/\s+/)
      received += Number(fields[0]) || 0
      sent += Number(fields[8]) || 0
    }
    return { received, sent }
  } catch {
    return null
  }
}

function cpuSnapshot() {
  const cpus = os.cpus()
  let idle = 0
  let total = 0
  for (const cpu of cpus) {
    for (const value of Object.values(cpu.times)) total += value
    idle += cpu.times.idle
  }
  return { idle, total }
}

let lastCpu = cpuSnapshot()

export function serverStats(state, { engineAvailable = false } = {}) {
  const cpus = os.cpus()
  const currentCpu = cpuSnapshot()
  const idleDelta = currentCpu.idle - lastCpu.idle
  const totalDelta = currentCpu.total - lastCpu.total
  const cpuPercent = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0
  lastCpu = currentCpu
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const network = readNetworkBytes()
  const now = Date.now()
  let bandwidthKbps = 0
  if (network && lastNetwork) {
    const deltaBytes = (network.received - lastNetwork.received) + (network.sent - lastNetwork.sent)
    const seconds = Math.max(0.2, (now - lastNetwork.at) / 1000)
    bandwidthKbps = Math.round((deltaBytes * 8) / seconds / 1000)
  }
  if (network) lastNetwork = { ...network, at: now }
  const active = state.sessions.filter((session) => ['launching', 'loading', 'active'].includes(session.status)).length
  const queued = state.sessions.filter((session) => ['queued', 'paused'].includes(session.status)).length
  const connectivity = existsSync('/var/run/docker.sock') ? 'docker' : config.workerRegion === 'local-dev' ? 'local' : 'cloud'
  return {
    servers: [
      {
        id: config.workerId,
        name: 'Primary worker',
        region: config.workerRegion,
        status: 'online',
        runtime: connectivity,
        activeSessions: active,
        queuedSessions: queued,
        maxSessions: config.workerMaxSessions,
        cpuPercent,
        memoryPercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
        memoryUsedGb: Number(((totalMem - freeMem) / 1_073_741_824).toFixed(2)),
        memoryTotalGb: Number((totalMem / 1_073_741_824).toFixed(1)),
        bandwidthKbps,
        uptimeSeconds: Math.round(os.uptime()),
        loadAverage: os.loadavg().map((value) => Number(value.toFixed(2))),
        platform: `${os.platform()} ${os.arch()}`,
        nodeVersion: process.version,
        dockerAvailable: existsSync('/var/run/docker.sock'),
        playwrightInstalled: Boolean(engineAvailable),
        egressProfile: config.workerProxyServer ? 'authorized proxy' : 'direct',
        egressConfigured: Boolean(config.workerProxyServer),
      },
    ],
    limits: {
      maxSessions: config.maxSessions,
      maxConcurrentBrowsers: Number(state.settings?.maxConcurrentBrowsers) || config.maxConcurrentBrowsers,
      cpuCount: cpus.length,
    },
    isolation: 'Each Playwright context uses an independent cookie jar, storage, cache, and download policy. Remote worker dispatch is configured through the worker API.',
  }
}
