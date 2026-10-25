const net = require('node:net')
const http = require('node:http')

function parseProxyUrl(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null
  const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`)
  const protocol = url.protocol.replace(':', '')
  const port = Number(url.port || (protocol === 'https' ? 443 : protocol.startsWith('socks') ? 1080 : 80))
  if (!url.hostname || !port) return null
  return {
    protocol,
    host: url.hostname,
    port,
    username: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || '')
  }
}

function basicAuth(upstream) {
  if (!upstream.username && !upstream.password) return ''
  return `Proxy-Authorization: Basic ${Buffer.from(`${upstream.username}:${upstream.password}`).toString('base64')}\r\n`
}

function splitHostPort(value) {
  const text = String(value)
  if (text.startsWith('[')) {
    const end = text.indexOf(']')
    return [text.slice(1, end), Number(text.slice(end + 2))]
  }
  const index = text.lastIndexOf(':')
  return [text.slice(0, index), Number(text.slice(index + 1))]
}

function openSocket(host, port, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('proxy connection timed out'))
    }, timeout)
    socket.once('connect', () => {
      clearTimeout(timer)
      resolve(socket)
    })
    socket.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

function bufferedReader(socket) {
  let buffer = Buffer.alloc(0)
  const waiters = []

  function pump() {
    while (waiters.length) {
      const waiter = waiters[0]
      if (!waiter) break
      if (buffer.length < waiter.size) break
      waiters.shift()
      const out = buffer.subarray(0, waiter.size)
      buffer = buffer.subarray(waiter.size)
      waiter.resolve(out)
    }
  }

  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk])
    pump()
  })

  return size => new Promise((resolve, reject) => {
    if (buffer.length >= size) {
      const out = buffer.subarray(0, size)
      buffer = buffer.subarray(size)
      resolve(out)
      return
    }
    waiters.push({ size, resolve, reject })
    pump()
  })
}

async function socksConnect(upstream, host, port) {
  const socket = await openSocket(upstream.host, upstream.port)
  const read = bufferedReader(socket)
  socket.on('error', () => {})

  const useAuth = Boolean(upstream.username || upstream.password)
  socket.write(Buffer.from(useAuth ? [5, 2, 0, 2] : [5, 1, 0]))

  const choice = await read(2)
  if (choice[0] !== 5) throw new Error('not a SOCKS5 proxy')
  const method = choice[1]

  if (method === 2) {
    const user = Buffer.from(upstream.username)
    const pass = Buffer.from(upstream.password)
    socket.write(Buffer.concat([Buffer.from([1, user.length]), user, Buffer.from([pass.length]), pass]))
    const auth = await read(2)
    if (auth[1] !== 0) throw new Error('SOCKS5 auth rejected')
  } else if (method !== 0) {
    throw new Error('SOCKS5 method rejected')
  }

  const targetHost = Buffer.from(host)
  const request = Buffer.concat([
    Buffer.from([5, 1, 0, 3, targetHost.length]),
    targetHost,
    Buffer.from([(port >> 8) & 0xff, port & 0xff])
  ])
  socket.write(request)

  const head = await read(4)
  if (head[0] !== 5 || head[1] !== 0) throw new Error(`SOCKS5 connect failed (${head[1]})`)

  if (head[3] === 1) await read(4)
  else if (head[3] === 3) {
    const length = await read(1)
    await read(length[0])
  } else if (head[3] === 4) await read(16)
  await read(2)

  return socket
}

async function httpConnect(upstream, host, port) {
  const socket = await openSocket(upstream.host, upstream.port)
  socket.on('error', () => {})

  socket.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${basicAuth(upstream)}\r\n`)

  let head = Buffer.alloc(0)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('proxy CONNECT timed out')), 15000)
    function onData(chunk) {
      head = Buffer.concat([head, chunk])
      const index = head.indexOf('\r\n\r\n')
      if (index === -1) return
      clearTimeout(timer)
      socket.removeListener('data', onData)
      socket.removeListener('error', reject)
      const statusLine = head.subarray(0, head.indexOf('\r\n')).toString('latin1')
      if (!/ 200 /.test(statusLine)) {
        socket.destroy()
        reject(new Error(`proxy CONNECT failed: ${statusLine}`))
        return
      }
      const rest = head.subarray(index + 4)
      if (rest.length) socket.unshift(rest)
      resolve()
    }
    socket.on('data', onData)
    socket.once('error', reject)
  })

  return socket
}

async function tunnel(upstream, host, port) {
  if (upstream.protocol === 'socks5' || upstream.protocol === 'socks5h') {
    return socksConnect(upstream, host, port)
  }
  return httpConnect(upstream, host, port)
}

function pipeBoth(client, upstreamSocket, prefix = Buffer.alloc(0)) {
  if (prefix.length) client.write(prefix)
  client.pipe(upstreamSocket)
  upstreamSocket.pipe(client)
  const destroy = () => {
    client.destroy()
    upstreamSocket.destroy()
  }
  client.on('error', destroy)
  upstreamSocket.on('error', destroy)
  client.on('close', () => upstreamSocket.destroy())
  upstreamSocket.on('close', () => client.destroy())
}

function forwardHttp(upstream, req, res) {
  if (upstream.protocol === 'socks5' || upstream.protocol === 'socks5h') {
    let target
    try {
      target = new URL(req.url)
    } catch {
      res.writeHead(400)
      res.end('bad proxy request')
      return
    }
    const port = Number(target.port || 80)
    tunnel(upstream, target.hostname, port)
      .then(socket => {
        const headers = Object.entries(req.headers)
          .filter(([name]) => name.toLowerCase() !== 'proxy-authorization')
          .map(([name, value]) => `${name}: ${value}`)
        socket.write(`${req.method} ${target.pathname}${target.search} HTTP/1.1\r\n${headers.join('\r\n')}\r\n\r\n`)
        req.pipe(socket)
        socket.pipe(res)
        socket.on('error', () => res.end())
      })
      .catch(error => {
        res.writeHead(502)
        res.end(error.message)
      })
    return
  }

  let target
  try {
    target = new URL(req.url)
  } catch {
    res.writeHead(400)
    res.end('bad proxy request')
    return
  }

  const headers = { ...req.headers, host: target.host }
  if (upstream.username || upstream.password) {
    headers['proxy-authorization'] = `Basic ${Buffer.from(`${upstream.username}:${upstream.password}`).toString('base64')}`
  }

  const proxied = http.request({
    host: upstream.host,
    port: upstream.port,
    method: req.method,
    path: req.url,
    headers
  }, response => {
    res.writeHead(response.statusCode || 502, response.headers)
    response.pipe(res)
  })

  proxied.on('error', error => {
    res.writeHead(502)
    res.end(error.message)
  })

  req.pipe(proxied)
}

function startRelay(upstream) {
  return new Promise((resolve, reject) => {
    const server = http.createServer()

    server.on('connect', async (req, clientSocket, head) => {
      try {
        const [host, port] = splitHostPort(req.url)
        if (!host || !port) throw new Error('bad CONNECT target')
        const upstreamSocket = await tunnel(upstream, host, port)
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        pipeBoth(clientSocket, upstreamSocket, head)
      } catch (error) {
        if (clientSocket.writable) clientSocket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      }
    })

    server.on('request', (req, res) => forwardHttp(upstream, req, res))
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        close: () => new Promise(done => server.close(done))
      })
    })
  })
}

module.exports = { parseProxyUrl, startRelay }
