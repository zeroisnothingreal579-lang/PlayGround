#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
cd "$PROJECT_DIR"

: "${CAPTURE_URL:?Set CAPTURE_URL to the preview URL.}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to the screenshot output directory.}"
case "$CAPTURE_DIR" in
  "$PROJECT_DIR"|"$PROJECT_DIR"/*)
    echo 'CAPTURE_DIR must be outside the project directory.' >&2
    exit 1
    ;;
esac

timed() {
  local label="$1"
  shift
  printf '[timing] %s\n' "$label" >&2
  /usr/bin/time -p "$@"
}

timed "create capture directory" mkdir -p "$CAPTURE_DIR"
timed "remove stale screenshots" rm -f "$CAPTURE_DIR/final-desktop.png" "$CAPTURE_DIR/final-mobile.png"

status=0
set +e
timed "capture preview views" node - "$CAPTURE_URL" "$CAPTURE_DIR" <<'NODE'
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const [url, output] = process.argv.slice(2)
const started = Date.now()
const mark = (label) => console.log(`[timing] ${label}: ${Date.now() - started} ms`)
const fail = (message, exitCode) => {
  const error = new Error(message)
  error.exitCode = exitCode
  throw error
}
const transient = (message, cause) => {
  const error = new Error(message, { cause })
  error.exitCode = 75
  throw error
}

let browser

;(async () => {
  mark('capture start')
  browser = await chromium.launch({ headless: true, timeout: 30000 }).catch((error) =>
    transient(`Browser launch failed: ${error.message}`, error))
  mark('browser launched')

  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height } }).catch((error) =>
      transient(`Could not create ${name} browser context: ${error.message}`, error))
    const page = await context.newPage().catch((error) =>
      transient(`Could not open ${name} page: ${error.message}`, error))
    page.setDefaultTimeout(30000)
    page.on('pageerror', (error) => console.error(`[pageerror] ${error.message}`))

    let response
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    } catch (error) {
      await context.close().catch(() => {})
      transient(`Navigation to ${url} failed for ${name}: ${error.message}`, error)
    }
    mark(`${name} navigation (HTTP ${response ? response.status() : 'none'})`)
    if (!response) {
      await context.close().catch(() => {})
      transient(`No HTTP response from ${url} for ${name}`)
    }
    const status = response.status()
    if (status >= 400) {
      await context.close().catch(() => {})
      const retryable = [408, 425, 429].includes(status) || status >= 500
      fail(`HTTP ${status} loading ${url} for ${name}`, retryable ? 75 : 1)
    }

    try {
      await page.locator('body').waitFor({ state: 'visible', timeout: 30000 })
      if (process.env.CAPTURE_READY_SELECTOR) {
        await page.locator(process.env.CAPTURE_READY_SELECTOR).first().waitFor({ state: 'visible', timeout: 30000 })
      }
      await page.evaluate(() => document.fonts.ready.then(() => true))
    } catch (error) {
      await context.close().catch(() => {})
      fail(`Preview did not finish rendering for ${name}: ${error.message}`, 1)
    }

    const text = await page.evaluate(() => document.body?.innerText?.replace(/\s+/g, ' ').trim() || '')
    if (text.length < 20) {
      await context.close().catch(() => {})
      fail(`Preview rendered no visible content for ${name}.`, 1)
    }
    await page.waitForTimeout(900)

    const file = path.join(output, `final-${name}.png`)
    try {
      await page.screenshot({ path: file, fullPage: true, timeout: 30000 })
    } catch (error) {
      await context.close().catch(() => {})
      transient(`Screenshot failed for ${name}: ${error.message}`, error)
    }
    const stats = fs.statSync(file)
    if (stats.size < 24 || fs.readFileSync(file).subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      await context.close().catch(() => {})
      fail(`Screenshot is not a valid PNG for ${name}.`, 1)
    }
    mark(`${name} screenshot (${stats.size} bytes)`)
    await context.close().catch((error) => transient(`Could not close ${name} context: ${error.message}`, error))
  }
})().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = error.exitCode || 1
}).finally(async () => {
  if (browser) {
    try {
      await browser.close()
      mark('browser closed')
    } catch (error) {
      console.error(`Browser close failed: ${error.message}`)
      if (!process.exitCode) process.exitCode = 75
    }
  }
})
NODE
status=$?
set -e
exit "$status"
