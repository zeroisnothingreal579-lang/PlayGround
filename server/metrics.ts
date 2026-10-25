import { readFile } from 'node:fs/promises'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import os from 'node:os'
import { config } from './config.js'
import { orchestrator } from './orchestrator.js'
import type { ServerMetric } from './types.js'

const histogram = monitorEventLoopDelay({ resolution: 10 })
histogram.enable()

let lastNetwork = { at: 0, received: 0, sent: 0, inKbps: 0, outKbps: 0 }

async function readNetworkBytes(): Promise<{ received: number; sent: number } | null> {
  try {
    const raw = await readFile('/proc/net/dev', 'utf8')
    let received = 0
    let sent = 0
    for (const line of raw.split('\n').slice(2)) {
      const [namePart, dataPart] = line.split(':')
      if (!dataPart) continue
      const name = namePart.trim()
      if (name === 'lo') continue
      const fields = dataPart.trim().split(/\s+/).map(Number)
      received += fields[0] || 0
      sent += fields[8] || 0
    }
    return { received, sent }
  } catch {
    return null
  }
}

async function localMetrics(): Promise<ServerMetric> {
  const total = os.totalmem()
  const free = os.freemem()
  const used = total - free
  const cpuLoad = os.loadavg()[0] / Math.max(1, os.cpus().length)
  const network = await readNetworkBytes()
  const now = Date.now()
  if (network) {
    if (lastNetwork.at && now > lastNetwork.at) {
      const seconds = (now - lastNetwork.at) / 1000
      lastNetwork.inKbps = Math.max(0, ((network.received - lastNetwork.received) * 8) / 1000 / seconds)
      lastNetwork.outKbps = Math.max(0, ((network.sent - lastNetwork.sent) * 8) / 1000 / seconds)
    }
    lastNetwork = { ...lastNetwork, at: now, received: network.received, sent: network.sent }
  }
  const cpuPercent = Math.min(100, Math.max(0, cpuLoad * 100))
  const memoryPercent = Math.min(100, (used / total) * 100)
  return {
    id: 'local-worker',
    name: config.serverName,
    region: config.region,
    kind: 'local',
    status: cpuPercent > 92 || memoryPercent > 94 ? 'degraded' : 'online',
    cpuPercent: Math.round(cpuPercent * 10) / 10,
    memoryPercent: Math.round(memoryPercent * 10) / 10,
    memoryUsedMb: Math.round(used / 1024 / 1024),
    memoryTotalMb: Math.round(total / 1024 / 1024),
    bandwidthInKbps: Math.round(lastNetwork.inKbps * 10) / 10,
    bandwidthOutKbps: Math.round(lastNetwork.outKbps * 10) / 10,
    uptimeSeconds: Math.round(process.uptime()),
    activeSessions: orchestrator.activeSessionCount(),
    maxSessions: config.maxConcurrentSessions,
    latencyMs: Math.round((histogram.mean / 1_000_000) * 10) / 10,
    connection: `HTTP · WebSocket${config.automationEnabled ? ' · Chromium' : ''}`,
  }
}

async function remoteMetrics(worker: (typeof config.workers)[number]): Promise<ServerMetric> {
  const base: ServerMetric = {
    id: worker.id,
    name: worker.name,
    region: worker.region,
    kind: 'worker',
    status: 'offline',
    cpuPercent: 0,
    memoryPercent: 0,
    memoryUsedMb: 0,
    memoryTotalMb: 0,
    bandwidthInKbps: 0,
    bandwidthOutKbps: 0,
    uptimeSeconds: 0,
    activeSessions: 0,
    maxSessions: worker.maxSessions,
    latencyMs: 0,
    connection: worker.url ? 'Health endpoint unreachable' : 'No URL configured',
  }
  if (!worker.url) return base
  const started = Date.now()
  try {
    const response = await fetch(`${worker.url.replace(/\/$/, '')}/api/worker-health`, {
      headers: {
        accept: 'application/json',
        ...(process.env.WORKER_HEALTH_TOKEN ? { authorization: `Bearer ${process.env.WORKER_HEALTH_TOKEN}` } : {}),
      },
      signal: AbortSignal.timeout(2500),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = await response.json() as Partial<ServerMetric> & { error?: string }
    if (body.error) throw new Error(body.error)
    return {
      ...base,
      status: body.status === 'degraded' ? 'degraded' : 'online',
      cpuPercent: Number(body.cpuPercent) || 0,
      memoryPercent: Number(body.memoryPercent) || 0,
      memoryUsedMb: Number(body.memoryUsedMb) || 0,
      memoryTotalMb: Number(body.memoryTotalMb) || 0,
      bandwidthInKbps: Number(body.bandwidthInKbps) || 0,
      bandwidthOutKbps: Number(body.bandwidthOutKbps) || 0,
      uptimeSeconds: Number(body.uptimeSeconds) || 0,
      activeSessions: Number(body.activeSessions) || 0,
      maxSessions: Number(body.maxSessions) || worker.maxSessions,
      latencyMs: Date.now() - started,
      connection: 'Remote worker health OK',
    }
  } catch (error) {
    return {
      ...base,
      latencyMs: Date.now() - started,
      connection: error instanceof Error ? error.message : 'Health check failed',
    }
  }
}

export async function collectServers(): Promise<ServerMetric[]> {
  const local = await localMetrics()
  const remote = await Promise.all(config.workers.map(remoteMetrics))
  return [local, ...remote]
}
