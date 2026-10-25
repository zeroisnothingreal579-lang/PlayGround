import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'
import { config } from './config.js'
import type { Analysis, Run, VerifiedMetric } from './types.js'

interface StoreShape {
  analyses: Analysis[]
  runs: Run[]
  verifiedMetrics: VerifiedMetric[]
}

const EMPTY: StoreShape = { analyses: [], runs: [], verifiedMetrics: [] }

export class Store {
  private pool: pg.Pool | null = null
  private memory: StoreShape = structuredClone(EMPTY)
  private filePath: string
  private writeChain: Promise<void> = Promise.resolve()
  private writeQueued = false
  mode: 'postgresql' | 'file'

  constructor() {
    this.filePath = join(config.dataDir, 'store.json')
    this.mode = config.databaseUrl ? 'postgresql' : 'file'
  }

  async init(): Promise<void> {
    await mkdir(config.dataDir, { recursive: true })
    await mkdir(join(config.dataDir, 'screenshots'), { recursive: true })
    if (config.databaseUrl) {
      this.pool = new pg.Pool({
        connectionString: config.databaseUrl,
        max: 8,
        ssl: process.env.PGSSL === 'disable' ? false : undefined,
        connectionTimeoutMillis: 8000,
      })
      await this.pool.query(`
        create table if not exists linkpilot_analyses (
          id text primary key,
          status text not null,
          data jsonb not null,
          created_at timestamptz not null default now()
        );
        create table if not exists linkpilot_runs (
          id text primary key,
          status text not null,
          data jsonb not null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
        create table if not exists linkpilot_verified_metrics (
          id text primary key,
          source text not null,
          data jsonb not null,
          created_at timestamptz not null default now()
        );
        create index if not exists linkpilot_runs_created_idx on linkpilot_runs (created_at desc);
        create index if not exists linkpilot_analyses_created_idx on linkpilot_analyses (created_at desc);
      `)
      console.log('[store] PostgreSQL connected')
      return
    }

    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<StoreShape>
      this.memory = {
        analyses: Array.isArray(parsed.analyses) ? parsed.analyses : [],
        runs: Array.isArray(parsed.runs) ? parsed.runs : [],
        verifiedMetrics: Array.isArray(parsed.verifiedMetrics) ? parsed.verifiedMetrics : [],
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') console.warn('[store] Failed to read local store, starting fresh:', error)
      await this.persist()
    }
    console.log(`[store] File store ready at ${this.filePath}`)
  }

  private persist(): Promise<void> {
    if (this.mode !== 'file') return Promise.resolve()
    if (this.writeQueued) return this.writeChain
    this.writeQueued = true
    this.writeChain = this.writeChain.then(async () => {
      this.writeQueued = false
      const payload = JSON.stringify(this.memory)
      const temp = `${this.filePath}.${process.pid}.tmp`
      await writeFile(temp, payload, 'utf8')
      await rename(temp, this.filePath)
    }).catch((error) => {
      console.error('[store] Persist failed:', error)
    })
    return this.writeChain
  }

  async saveAnalysis(analysis: Analysis): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        `insert into linkpilot_analyses (id, status, data, created_at)
         values ($1,$2,$3,$4)
         on conflict (id) do update set status = excluded.status, data = excluded.data`,
        [analysis.id, analysis.status, analysis, analysis.createdAt],
      )
      return
    }
    const existing = this.memory.analyses.findIndex((item) => item.id === analysis.id)
    if (existing >= 0) this.memory.analyses[existing] = analysis
    else this.memory.analyses.unshift(analysis)
    this.memory.analyses = this.memory.analyses.slice(0, 150)
    await this.persist()
  }

  async getAnalysis(id: string): Promise<Analysis | null> {
    if (this.pool) {
      const result = await this.pool.query('select data from linkpilot_analyses where id = $1', [id])
      return (result.rows[0]?.data as Analysis) || null
    }
    return this.memory.analyses.find((item) => item.id === id) || null
  }

  async listAnalyses(limit = 50): Promise<Analysis[]> {
    if (this.pool) {
      const result = await this.pool.query(
        'select data from linkpilot_analyses order by created_at desc limit $1',
        [Math.min(200, limit)],
      )
      return result.rows.map((row) => row.data as Analysis)
    }
    return this.memory.analyses.slice(0, limit)
  }

  async saveRun(run: Run): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        `insert into linkpilot_runs (id, status, data, created_at, updated_at)
         values ($1,$2,$3,$4,now())
         on conflict (id) do update set status = excluded.status, data = excluded.data, updated_at = now()`,
        [run.id, run.status, run, run.createdAt],
      )
      return
    }
    const existing = this.memory.runs.findIndex((item) => item.id === run.id)
    if (existing >= 0) this.memory.runs[existing] = run
    else this.memory.runs.unshift(run)
    this.memory.runs = this.memory.runs.slice(0, 80)
    await this.persist()
  }

  async getRun(id: string): Promise<Run | null> {
    if (this.pool) {
      const result = await this.pool.query('select data from linkpilot_runs where id = $1', [id])
      return (result.rows[0]?.data as Run) || null
    }
    return this.memory.runs.find((item) => item.id === id) || null
  }

  async listRuns(limit = 50): Promise<Run[]> {
    if (this.pool) {
      const result = await this.pool.query(
        'select data from linkpilot_runs order by created_at desc limit $1',
        [Math.min(100, limit)],
      )
      return result.rows.map((row) => row.data as Run)
    }
    return this.memory.runs.slice(0, limit)
  }

  async addVerifiedMetric(metric: VerifiedMetric): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        'insert into linkpilot_verified_metrics (id, source, data, created_at) values ($1,$2,$3,$4)',
        [metric.id, metric.source, metric, metric.createdAt],
      )
      return
    }
    this.memory.verifiedMetrics.unshift(metric)
    this.memory.verifiedMetrics = this.memory.verifiedMetrics.slice(0, 240)
    await this.persist()
  }

  async listVerifiedMetrics(limit = 120): Promise<VerifiedMetric[]> {
    if (this.pool) {
      const result = await this.pool.query(
        'select data from linkpilot_verified_metrics order by created_at desc limit $1',
        [Math.min(240, limit)],
      )
      return result.rows.map((row) => row.data as VerifiedMetric)
    }
    return this.memory.verifiedMetrics.slice(0, limit)
  }

  async removeVerifiedMetric(id: string): Promise<void> {
    if (this.pool) {
      await this.pool.query('delete from linkpilot_verified_metrics where id = $1', [id])
      return
    }
    this.memory.verifiedMetrics = this.memory.verifiedMetrics.filter((item) => item.id !== id)
    await this.persist()
  }

  async close(): Promise<void> {
    await this.writeChain.catch(() => undefined)
    await this.pool?.end().catch(() => undefined)
  }
}

export const store = new Store()
