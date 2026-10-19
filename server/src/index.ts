import express from 'express'
import cookieParser from 'cookie-parser'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { config, DATA_PATHS } from './config.js'
import { db } from './db.js'
import { migrate } from './migrate.js'
import { seed } from './seed.js'
import { loadUser } from './auth.js'
import { errorHandler, notFound } from './http.js'
import { rateLimit } from './rate-limit.js'
import { authRouter } from './routes/auth.js'
import { devicesRouter } from './routes/devices.js'
import { filesRouter } from './routes/files.js'
import { adminRouter } from './routes/admin.js'
import { systemRouter } from './routes/system.js'
import { attachStreamServer } from './stream.js'
import { syncDevices } from './device/manager.js'
import { startAdbServer } from './device/adb.js'

fs.mkdirSync(DATA_PATHS.storage, { recursive: true })
fs.mkdirSync(DATA_PATHS.logs, { recursive: true })
fs.mkdirSync(DATA_PATHS.run, { recursive: true })

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1)

const frameAncestors = config.allowIframe ? '*' : "'self'"

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (!config.allowIframe) res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors ${frameAncestors}`,
  )
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  next()
})

app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
app.use(loadUser)

const allowedOrigins = new Set<string>()
function originAllowed(origin: string | undefined, host: string | undefined) {
  if (!origin) return true
  if (!config.isProduction) return true
  try {
    if (allowedOrigins.size === 0) {
      allowedOrigins.add(new URL(config.publicUrl).origin)
      allowedOrigins.add(`https://${host}`)
      allowedOrigins.add(`http://${host}`)
    }
    return allowedOrigins.has(origin)
  } catch {
    return false
  }
}

app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (!originAllowed(req.headers.origin, req.headers.host)) {
      res.status(403).json({ error: 'Request origin is not allowed.', code: 'csrf_origin' })
      return
    }
  }
  next()
})

app.use('/api', rateLimit({ key: 'api', limit: 900, windowMs: 60 * 1000 }))

app.get('/api/v1/openapi.json', (_req, res) => {
  const file = path.join(config.rootDir, 'docs', 'openapi.json')
  if (!fs.existsSync(file)) {
    res.status(404).json({ error: 'OpenAPI document is not bundled in this build.' })
    return
  }
  res.sendFile(file)
})

app.use('/api/v1/auth', authRouter)
app.use('/api/v1', systemRouter)
app.use('/api/v1/devices', devicesRouter)
app.use('/api/v1', filesRouter)
app.use('/api/v1/admin', adminRouter)

app.use('/api', notFound)

const clientDir = path.join(config.rootDir, 'dist', 'client')
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      else res.setHeader('Cache-Control', 'no-cache')
    },
  }))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(clientDir, 'index.html'))
  })
} else {
  app.get('/', (_req, res) => {
    res.type('text').send('CloudDroid API is running. Build the web client with `npm run build`.')
  })
}

app.use(errorHandler)

const server = http.createServer(app)
attachStreamServer(server)

async function main() {
  await migrate()
  await seed()
  if (config.androidHome) {
    await startAdbServer().catch(() => undefined)
    await syncDevices(true).catch((error) => console.error('[runtime] initial sync failed', error))
  }
  if (config.jwtSecretIsDefault) console.warn('[security] JWT_SECRET is using the development default. Set a strong secret before production.')
  server.listen(config.port, '0.0.0.0', () => {
    console.log(`[clouddroid] listening on :${config.port} · db=${db.engine} · provider=${config.provider}`)
  })
}

async function shutdown(signal: string) {
  console.log(`[clouddroid] ${signal} received, shutting down`)
  server.close()
  await db.close().catch(() => undefined)
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

main().catch((error) => {
  console.error('[clouddroid] failed to start', error)
  process.exit(1)
})
