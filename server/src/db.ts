import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'

const require = createRequire(import.meta.url)

type Row = Record<string, unknown>

function toPgSql(sql: string) {
  let index = 0
  let quoted = false
  let out = ''
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i]
    if (char === "'" && sql[i - 1] !== '\\') quoted = !quoted
    if (char === '?' && !quoted) {
      index += 1
      out += `$${index}`
    } else {
      out += char
    }
  }
  return out
}

class Database {
  readonly engine: 'postgres' | 'sqlite'
  private pool: import('pg').Pool | null = null
  private sqlite: any = null

  constructor() {
    if (config.databaseUrl) {
      const pg = require('pg')
      this.pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 })
      this.engine = 'postgres'
    } else {
      fs.mkdirSync(path.dirname(config.sqlitePath), { recursive: true })
      const { DatabaseSync } = require('node:sqlite')
      this.sqlite = new DatabaseSync(config.sqlitePath)
      this.sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
      this.engine = 'sqlite'
    }
  }

  async query<T extends object = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    const values = params.map((value) => (value === undefined ? null : value))
    if (this.pool) {
      const result = await this.pool.query(toPgSql(sql), values)
      return result.rows as T[]
    }
    const statement = this.sqlite.prepare(sql)
    return statement.all(...values) as T[]
  }

  async get<T extends object = Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params)
    return rows[0]
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    const values = params.map((value) => (value === undefined ? null : value))
    if (this.pool) {
      await this.pool.query(toPgSql(sql), values)
      return
    }
    this.sqlite.prepare(sql).run(...values)
  }

  async exec(sql: string): Promise<void> {
    if (this.pool) {
      await this.pool.query(sql)
      return
    }
    this.sqlite.exec(sql)
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.pool) {
      const client = await this.pool.connect()
      try {
        await client.query('BEGIN')
        const result = await fn()
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    }
    this.sqlite.exec('BEGIN')
    try {
      const result = await fn()
      this.sqlite.exec('COMMIT')
      return result
    } catch (error) {
      this.sqlite.exec('ROLLBACK')
      throw error
    }
  }

  async health() {
    const row = await this.get<{ ok: number }>('SELECT 1 AS ok')
    return row?.ok === 1
  }

  async close() {
    await this.pool?.end()
    this.sqlite?.close?.()
  }
}

export const db = new Database()
