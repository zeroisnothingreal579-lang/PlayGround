import { createRequire } from 'node:module'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const runtime = process.env.PLAYWRIGHT_RUNTIME || join(process.env.HOME, '.local/share/omgithub-playwright')
const require = createRequire(join(runtime, 'package.json'))
const { chromium } = require('playwright')

const url = process.env.CAPTURE_URL
const output = process.env.CAPTURE_DIR
if (!url || !output) throw new Error('Set CAPTURE_URL and CAPTURE_DIR.')
mkdirSync(output, { recursive: true })

const config = JSON.parse(readFileSync(join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json'), 'utf8'))
if (process.platform === 'linux') process.env.DISPLAY ||= ':' + readFileSync(join(runtime, 'display'), 'utf8').trim()

const transient = error => {
  error.exitCode = 75
  return error
}

const views = [
  ['desktop', 1440, 900],
  ['mobile', 390, 844]
]

let browser
let failed = 0
try {
  browser = await chromium.launch({ ...config.browser.launchOptions, timeout: 30000 }).catch(error => {
    throw transient(error)
  })

  for (const [name, width, height] of views) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 }).catch(error => {
      throw transient(error)
    })
    const page = await context.newPage().catch(error => {
      throw transient(error)
    })
    page.setDefaultTimeout(30000)
    page.on('pageerror', error => console.error(`[capture] ${name} page error: ${error.message}`))

    const response = await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(error => {
      throw transient(error)
    })
    if (!response?.ok()) {
      const status = response?.status()
      const temporary = !response || [408, 429, 500, 502, 503, 504].includes(status)
      const error = new Error(`HTTP ${status ?? 'unknown'} loading ${url}`)
      if (temporary) throw transient(error)
      throw error
    }

    await page.waitForSelector('.window-card', { state: 'visible', timeout: 30000 })
    await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 15000 }).catch(() => {})
    await page.waitForFunction(() => document.querySelectorAll('.window-card').length >= 3, null, { timeout: 20000 })
    await page.waitForTimeout(1800)

    await page.screenshot({
      path: join(output, `final-${name}.png`),
      fullPage: false,
      timeout: 30000
    }).catch(error => {
      if (error.name === 'TimeoutError' || !browser?.isConnected()) throw transient(error)
      throw error
    })

    console.log(`[capture] ${name} ${width}x${height} -> ${join(output, `final-${name}.png`)}`)
    await context.close().catch(() => {})
  }
} catch (error) {
  failed = error.exitCode || 1
  console.error(`[capture] ${error.stack || error.message}`)
} finally {
  await browser?.close().catch(error => {
    console.error(`[capture] browser close failed: ${error.message}`)
    failed ||= 75
  })
}

process.exitCode = failed
