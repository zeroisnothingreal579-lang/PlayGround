import type { Server } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { consumeStreamTicket } from './tickets.js'
import { getDeviceRow } from './device/manager.js'
import { keyEvent, inputText, pngSize, rotate, screencap, swipe, tap } from './device/adb.js'

interface StreamState {
  alive: boolean
  width: number
  height: number
  inputs: number
  inputWindow: number
  lastFrameAt: number
  prevFrameAt: number
  seq: number
  failures: number
}

function sendJson(socket: WebSocket, payload: Record<string, unknown>) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload))
}

export function attachStreamServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })

  server.on('upgrade', (request: any, socket: any, head: any) => {
    try {
      const url = new URL(request.url || '/', 'http://localhost')
      if (url.pathname !== '/api/v1/ws/stream') {
        socket.destroy()
        return
      }
      const ticket = url.searchParams.get('ticket') || ''
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, ticket)
      })
    } catch {
      socket.destroy()
    }
  })

  wss.on('connection', async (socket: WebSocket, _request: any, rawTicket: unknown) => {
    const ticket = typeof rawTicket === 'string' ? rawTicket : ''
    const data = await consumeStreamTicket(ticket)
    if (!data) {
      sendJson(socket, { type: 'error', message: 'This streaming ticket is invalid or has expired. Reopen the phone.' })
      socket.close(4401, 'invalid ticket')
      return
    }
    const device = await getDeviceRow(data.deviceId)
    if (!device || device.user_id !== data.userId) {
      socket.close(4403, 'forbidden')
      return
    }
    if (device.is_demo === 1) {
      sendJson(socket, { type: 'error', message: 'Demo phones are not connected to an Android runtime.' })
      socket.close(4409, 'demo device')
      return
    }
    const serial = device.provider_ref
    if (!serial) {
      sendJson(socket, { type: 'error', message: 'Android is not running. Start the phone and reconnect.' })
      socket.close(4409, 'not running')
      return
    }

    const state: StreamState = {
      alive: true,
      width: 1080,
      height: 2400,
      inputs: 0,
      inputWindow: Date.now(),
      lastFrameAt: 0,
      prevFrameAt: 0,
      seq: 0,
      failures: 0,
    }

    sendJson(socket, {
      type: 'ready',
      deviceId: device.id,
      deviceName: device.name,
      serial,
      transport: 'websocket-frames',
      codec: 'png',
      provider: device.provider,
      androidVersion: device.android_version,
      serverTime: new Date().toISOString(),
    })

    socket.on('pong', () => { state.alive = true })

    socket.on('message', (raw) => {
      const rawLength = Buffer.isBuffer(raw)
        ? raw.length
        : Array.isArray(raw)
          ? raw.reduce((total, chunk) => total + chunk.length, 0)
          : raw.byteLength
      if (rawLength > 16_000) return
      const now = Date.now()
      if (now - state.inputWindow > 10_000) {
        state.inputs = 0
        state.inputWindow = now
      }
      state.inputs += 1
      if (state.inputs > 120) return

      let message: any
      try { message = JSON.parse(raw.toString()) } catch { return }
      if (!message || typeof message.type !== 'string') return

      if (message.type === 'ping') {
        sendJson(socket, { type: 'pong', ts: now })
        return
      }

      void (async () => {
        try {
          if (message.type === 'gesture') {
            const clamp = (value: number) => Math.max(0, Math.min(1, Number(value) || 0))
            const x1 = clamp(message.x1) * state.width
            const y1 = clamp(message.y1) * state.height
            const x2 = clamp(message.x2 ?? message.x1) * state.width
            const y2 = clamp(message.y2 ?? message.y1) * state.height
            if (message.kind === 'tap') await tap(serial, x1, y1)
            else if (message.kind === 'longpress') await swipe(serial, x1, y1, x1, y1, 900)
            else await swipe(serial, x1, y1, x2, y2, Number(message.duration) || 220)
          } else if (message.type === 'key') {
            await keyEvent(serial, String(message.key || ''))
          } else if (message.type === 'text') {
            await inputText(serial, String(message.text || '').slice(0, 1000))
          } else if (message.type === 'rotate') {
            await rotate(serial)
          }
        } catch (error: any) {
          sendJson(socket, { type: 'input_error', message: error?.message || 'Input failed' })
        }
      })()
    })

    const heartbeat = setInterval(() => {
      if (!state.alive) {
        socket.terminate()
        return
      }
      state.alive = false
      try { socket.ping() } catch { /* ignore */ }
    }, 30_000)

    const cleanup = () => {
      clearInterval(heartbeat)
      if (frameTimer) clearTimeout(frameTimer)
    }

    let frameTimer: NodeJS.Timeout | null = null

    const loop = async () => {
      if (socket.readyState !== WebSocket.OPEN) {
        cleanup()
        return
      }
      try {
        if (socket.bufferedAmount > 4 * 1024 * 1024) {
          frameTimer = setTimeout(loop, 220)
          return
        }
        const frame = await screencap(serial)
        if (!frame) {
          state.failures += 1
          if (state.failures >= 4) {
            sendJson(socket, { type: 'error', message: 'Lost the Android frame source. The phone may have stopped.' })
            socket.close(4410, 'capture failed')
            cleanup()
            return
          }
        } else {
          state.failures = 0
          const size = pngSize(frame)
          if (size.width && size.height) {
            state.width = size.width
            state.height = size.height
          }
          const now = Date.now()
          state.prevFrameAt = state.lastFrameAt || now
          state.lastFrameAt = now
          state.seq += 1
          sendJson(socket, {
            type: 'frame',
            seq: state.seq,
            ts: Date.now(),
            width: state.width,
            height: state.height,
            bytes: frame.length,
          })
          if (socket.readyState === WebSocket.OPEN) socket.send(frame)
          if (state.seq % 20 === 0) {
            sendJson(socket, {
              type: 'stats',
              fps: Math.round(1000 / Math.max(1, state.lastFrameAt - state.prevFrameAt)),
              seq: state.seq,
              ts: Date.now(),
            })
          }
        }
      } catch (error: any) {
        state.failures += 1
        if (state.failures > 6) {
          sendJson(socket, { type: 'error', message: error?.message || 'The streaming gateway reported an error.' })
          socket.close(4411, 'stream error')
          cleanup()
          return
        }
      }
      frameTimer = setTimeout(loop, 140)
    }

    socket.on('close', cleanup)
    socket.on('error', cleanup)
    loop()
  })

  return wss
}
