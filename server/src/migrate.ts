import fs from 'node:fs'
import path from 'node:path'
import { db } from './db.js'
import { config } from './config.js'
import { nowIso } from './util.js'

export async function migrate() {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`)
  const dir = path.join(config.rootDir, 'db', 'migrations')
  if (!fs.existsSync(dir)) return
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()
  for (const file of files) {
    const applied = await db.get('SELECT id FROM schema_migrations WHERE id = ?', [file])
    if (applied) continue
    const sql = fs.readFileSync(path.join(dir, file), 'utf8')
    await db.exec(sql)
    await db.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [file, nowIso()])
    console.log(`[db] applied migration ${file}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => {
      console.log(`[db] migrations complete (${db.engine})`)
      return db.close()
    })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
