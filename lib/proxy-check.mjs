import net from 'node:net'

const TARGET_HOST = 'api.ipify.org'
const TARGET_PORT = 80
const IP_RE = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/

class Reader {
  constructor(socket) {
    this.buffer = Buffer.alloc(0)
    this.ended = false
    this.error = null
    this.waiter = null
    socket.on('data', (data) => {
      this.buffer = Buffer.concat([this.buffer, data])
      this.pump()
    })
    socket.on('end', () => {
      this.ended = true
      this.pump()
    })
    socket.on('close', () => {
      this.ended = true
      this.pump()
    })
    socket.on('error', (error) => {
      this.error = error
      this.ended = true
      this.pump()
    })
  }

  take(n) {
    const out = this.buffer.subarray(0, n)
    this.buffer = this.buffer.subarray(n)
    return out
  }

  pump() {
    const waiter = this.waiter
    if (!waiter) return
    const result = waiter.check()
    if (result === 'wait') return
    this.waiter = null
    if (result instanceof Error) waiter.reject(result)
    else waiter.resolve(result)
  }

  await(check) {
    return new Promise((resolve, reject) => {
      this.waiter = { check, resolve, reject }
      this.pump()
    })
  }

  read(n) {
    if (this.buffer.length >= n) return Promise.resolve(this.take(n))
    if (this.ended) return Promise.reject(this.error || new Error('socket closed'))
    return this.await(() => {
      if (this.buffer.length >= n) return this.take(n)
      if (this.ended) return this.error || new Error('socket closed')
      return 'wait'
    })
  }

  readUntil(marker) {
    const needle = Buffer.from(marker)
    return this.await(() => {
      const at = this.buffer.indexOf(needle)
      if (at >= 0) return this.take(at + needle.length)
      if (this.ended) {
        if (this.buffer.length) return this.take(this.buffer.length)
        return this.error || new Error('socket closed')
      }
      return 'wait'
    })
  }

  readAll() {
    return this.await(() => (this.ended ? this.take(this.buffer.length) : 'wait'))
  }
}

function connect(host, port, timeout) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('connect timeout'))
    }, timeout)
    socket.once('connect', () => {
      clearTimeout(timer)
      socket.setNoDelay(true)
      resolve(socket)
    })
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function socks5Handshake(reader, socket, host, port) {
  socket.write(Buffer.from([0x05, 0x01, 0x00]))
  const greeting = await reader.read(2)
  if (greeting[0] !== 0x05 || greeting[1] !== 0x00) throw new Error('socks5 greeting rejected')
  const hostBytes = Buffer.from(host)
  const request = Buffer.alloc(7 + hostBytes.length)
  request[0] = 0x05
  request[1] = 0x01
  request[2] = 0x00
  request[3] = 0x03
  request[4] = hostBytes.length
  hostBytes.copy(request, 5)
  request.writeUInt16BE(port, 5 + hostBytes.length)
  socket.write(request)
  const head = await reader.read(4)
  if (head[0] !== 0x05) throw new Error('socks5 bad version')
  if (head[1] !== 0x00) throw new Error(`socks5 connect failed (${head[1]})`)
  if (head[3] === 0x01) await reader.read(4 + 2)
  else if (head[3] === 0x04) await reader.read(16 + 2)
  else if (head[3] === 0x03) {
    const length = await reader.read(1)
    await reader.read(length[0] + 2)
  } else throw new Error('socks5 bad address type')
}

function httpRequest() {
  return [
    `GET http://${TARGET_HOST}/ HTTP/1.1`,
    `Host: ${TARGET_HOST}`,
    'Accept: text/plain',
    'Accept-Encoding: identity',
    'User-Agent: IPShift/1.0 (+proxy-health-check)',
    'Connection: close',
    '',
    ''
  ].join('\r\n')
}

function tunnelRequest() {
  return [
    `GET / HTTP/1.1`,
    `Host: ${TARGET_HOST}`,
    'Accept: text/plain',
    'Accept-Encoding: identity',
    'User-Agent: IPShift/1.0 (+proxy-health-check)',
    'Connection: close',
    '',
    ''
  ].join('\r\n')
}

export async function checkProxy(proxy, timeout = 6000) {
  const started = Date.now()
  let socket
  let timer
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => {
      socket?.destroy()
      reject(new Error('health check timeout'))
    }, timeout)
    timer.unref?.()
  })
  guard.catch(() => {})
  try {
    const work = (async () => {
      socket = await connect(proxy.host, proxy.port, timeout)
      const reader = new Reader(socket)
      if (proxy.protocol === 'socks5') {
        await socks5Handshake(reader, socket, TARGET_HOST, TARGET_PORT)
        socket.write(tunnelRequest())
      } else {
        socket.write(httpRequest())
      }
      const response = await reader.readAll()
      const text = response.toString('utf8')
      const split = text.indexOf('\r\n\r\n')
      if (split < 0) throw new Error('empty proxy response')
      const status = Number.parseInt(text.slice(0, text.indexOf('\r\n')).split(' ')[1], 10)
      if (status !== 200) throw new Error(`proxy returned HTTP ${status}`)
      const body = text.slice(split + 4).trim().split(/\s/)[0]
      if (!IP_RE.test(body)) throw new Error('unexpected health response')
      return { ok: true, ip: body, ms: Date.now() - started }
    })()
    return await Promise.race([work, guard])
  } catch (error) {
    return { ok: false, error: error.message, ms: Date.now() - started }
  } finally {
    clearTimeout(timer)
    socket?.destroy()
  }
}
