import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from './config.mjs'
import { nowIso } from './util.mjs'

const initialState = () => ({
  version: 1,
  createdAt: nowIso(),
  updatedAt: nowIso(),
  inspections: [],
  jobs: [],
  sessions: [],
  adEvents: [],
  events: [],
  servers: [],
  integrations: {
    verifiedEvents: [],
    lastSyncAt: null,
    syncError: null,
  },
  settings: {
    aiModel: config.ai.model,
    aiEndpointConfigured: Boolean(config.ai.endpoint),
    aiApiKeyConfigured: Boolean(config.ai.apiKey),
    analyticsProvider: config.analytics.provider,
    analyticsConfigured: Boolean(config.analytics.endpoint && config.analytics.apiKey),
    webhookConfigured: Boolean(config.analytics.webhookSecret),
    automationMode: 'auto',
    sessionDurationMs: config.sessionTimeoutMs,
    maxConcurrentBrowsers: config.maxConcurrentBrowsers,
    retentionDays: 30,
    safeMode: true,
    policy: {
      clickAds: false,
      clickRewardedControls: false,
      bypassCountdowns: false,
      rotateIpsForTraffic: false,
      generateArtificialTraffic: false,
      analyzeOnly: true,
    },
  },
})

export class Store {
  constructor() {
    this.state = initialState()
    this.mode = 'file'
    this.pool = null
    this.file = join(config.dataDir, 'linkpilot-state.json')
    this.saveTimer = null
    this.saving = null
    this.ready = false
  }

  async init() {
    await mkdir(config.dataDir, { recursive: true })
    if (config.databaseUrl) {
      try {
        const { default: pg } = await import('pg')
        this.pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 })
        await this.pool.query(`
          CREATE TABLE IF NOT EXISTS linkpilot_state (
            id text PRIMARY KEY,
            state jsonb NOT NULL,
            updated_at timestamptz NOT NULL DEFAULT now()
          )
        `)
        const result = await this.pool.query('SELECT state FROM linkpilot_state WHERE id = $1', ['workspace-main'])
        if (result.rows[0]?.state) {
          this.state = { ...initialState(), ...result.rows[0].state }
        } else {
          await this.pool.query(
            'INSERT INTO linkpilot_state (id, state, updated_at) VALUES ($1, $2::jsonb, now())',
            ['workspace-main', JSON.stringify(this.state)],
          )
        }
        this.mode = 'postgres'
      } catch (error) {
        console.error('[store] PostgreSQL unavailable, using the file store:', error.message)
        this.pool = null
        this.mode = 'file'
      }
    }
    if (this.mode === 'file') {
      try {
        const raw = await readFile(this.file, 'utf8')
        this.state = { ...initialState(), ...JSON.parse(raw) }
      } catch (error) {
        if (error.code !== 'ENOENT') console.error('[store] Could not read local state:', error.message)
        await this.flush()
      }
    }
    this.prune(Number(this.state.settings?.retentionDays) || 30)
    this.ready = true
    return this
  }

  prune(retentionDays) {
    const cutoff = Date.now() - Math.max(1, retentionDays) * 86_400_000
    const recent = (value) => {
      const time = new Date(value || 0).getTime()
      return Number.isFinite(time) && time >= cutoff
    }
    this.state.inspections = this.state.inspections.filter((item) => recent(item.createdAt || item.inspectedAt))
    this.state.sessions = this.state.sessions.filter((item) => recent(item.createdAt))
    this.state.jobs = this.state.jobs.filter((item) => recent(item.createdAt))
    this.state.adEvents = this.state.adEvents.filter((item) => recent(item.detectedAt))
    this.state.events = this.state.events.filter((item) => recent(item.at))
  }

  get() {
    return this.state
  }

  mutate(fn) {
    const result = fn(this.state)
    this.state.updatedAt = nowIso()
    this.scheduleSave()
    return result
  }

  scheduleSave() {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.flush().catch((error) => console.error('[store] save failed:', error.message))
    }, 250)
    this.saveTimer.unref?.()
  }

  async flush() {
    if (this.saving) return this.saving
    this.saving = (async () => {
      const payload = JSON.stringify(this.state)
      if (this.mode === 'postgres' && this.pool) {
        await this.pool.query(
          `INSERT INTO linkpilot_state (id, state, updated_at) VALUES ($1, $2::jsonb, now())
           ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
          ['workspace-main', payload],
        )
      } else {
        const temp = `${this.file}.tmp`
        await writeFile(temp, payload)
        await rename(temp, this.file)
      }
    })()
    try {
      await this.saving
    } finally {
      this.saving = null
    }
  }

  async close() {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    await this.flush().catch(() => {})
    await this.pool?.end().catch(() => {})
  }
}

export const store = new Store()
