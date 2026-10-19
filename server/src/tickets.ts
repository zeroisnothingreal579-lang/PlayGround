import { token } from './util.js'
import { config } from './config.js'

export interface StreamTicketData {
  userId: string
  deviceId: string
  expiresAt: number
}

const tickets = new Map<string, StreamTicketData>()
let redisClient: any = null
let redisTried = false

async function getRedis() {
  if (!config.redisUrl || redisTried) return redisClient
  redisTried = true
  try {
    const { createClient } = await import('redis')
    const client = createClient({ url: config.redisUrl })
    client.on('error', (error: Error) => console.error('[redis]', error.message))
    await client.connect()
    redisClient = client
    console.log('[redis] connected for stream tickets')
  } catch (error) {
    console.warn('[redis] unavailable, using in-process tickets')
  }
  return redisClient
}

export async function issueStreamTicket(userId: string, deviceId: string) {
  const ticket = token(32)
  const data: StreamTicketData = { userId, deviceId, expiresAt: Date.now() + 60_000 }
  const redis = await getRedis()
  if (redis) {
    await redis.set(`clouddroid:ticket:${ticket}`, JSON.stringify(data), { PX: 60_000 }).catch(() => null)
  }
  tickets.set(ticket, data)
  return { ticket, expiresAt: new Date(data.expiresAt).toISOString() }
}

export async function consumeStreamTicket(ticket: string): Promise<StreamTicketData | null> {
  const local = tickets.get(ticket)
  tickets.delete(ticket)
  const redis = await getRedis()
  let data = local || null
  if (redis) {
    try {
      const raw = await redis.getDel(`clouddroid:ticket:${ticket}`)
      if (raw) data = JSON.parse(raw) as StreamTicketData
    } catch { /* fall back to local */ }
  }
  if (!data) return null
  if (data.expiresAt < Date.now()) return null
  return data
}

setInterval(() => {
  const now = Date.now()
  for (const [ticket, data] of tickets) if (data.expiresAt < now) tickets.delete(ticket)
}, 60_000).unref()
