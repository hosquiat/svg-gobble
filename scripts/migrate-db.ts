/**
 * migrate-db.ts
 *
 * Migrates all data from SQLite → MySQL (or MySQL → SQLite).
 *
 * Usage:
 *   npx ts-node scripts/migrate-db.ts --from sqlite --to mysql
 *   npx ts-node scripts/migrate-db.ts --from mysql  --to sqlite
 *
 * Environment variables required:
 *   SQLITE_URL   - SQLite DATABASE_URL  (e.g. file:./prisma/data/svg-gobble.db)
 *   MYSQL_URL    - MySQL  DATABASE_URL  (e.g. mysql://user:pass@host:3306/db)
 *
 * Or set via .env before running.
 */

import { PrismaClient as SQLiteClient } from '@prisma/client'

// We require the MySQL client dynamically so it's only instantiated when needed.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient: MySQLClient } = require('.prisma/client-mysql')

// ── Parse args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const fromIdx = args.indexOf('--from')
const toIdx   = args.indexOf('--to')

const fromDb = fromIdx !== -1 ? args[fromIdx + 1] : 'sqlite'
const toDb   = toIdx   !== -1 ? args[toIdx   + 1] : 'mysql'

if (!['sqlite', 'mysql'].includes(fromDb) || !['sqlite', 'mysql'].includes(toDb)) {
  console.error('Usage: ts-node migrate-db.ts --from sqlite --to mysql')
  process.exit(1)
}

if (fromDb === toDb) {
  console.error('Source and destination are the same. Nothing to do.')
  process.exit(0)
}

// ── Bootstrap clients ─────────────────────────────────────────────────────────

const sqliteUrl = process.env.SQLITE_URL || process.env.DATABASE_URL || 'file:./prisma/data/svg-gobble.db'
const mysqlUrl  = process.env.MYSQL_URL  || process.env.DATABASE_URL || ''

if (!mysqlUrl && toDb === 'mysql') {
  console.error('MYSQL_URL env var is required when migrating to MySQL.')
  process.exit(1)
}

const sqlite = new SQLiteClient({ datasources: { db: { url: sqliteUrl } } })
const mysql  = new MySQLClient({ datasources: { db: { url: mysqlUrl } } }) as SQLiteClient

const src = fromDb === 'sqlite' ? sqlite : mysql
const dst = fromDb === 'sqlite' ? mysql  : sqlite

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg: string) { console.log(`  ${msg}`) }

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\nMigrating ${fromDb.toUpperCase()} → ${toDb.toUpperCase()}\n`)

  // Settings
  log('Reading settings...')
  const settings = await src.settings.findFirst()
  if (settings) {
    await dst.settings.upsert({
      where:  { id: settings.id },
      update: settings,
      create: settings,
    })
    log('Settings migrated.')
  }

  // Google Drive config
  log('Reading Google Drive config...')
  const driveConfig = await src.googleDriveConfig.findFirst()
  if (driveConfig) {
    await dst.googleDriveConfig.upsert({
      where:  { id: driveConfig.id },
      update: driveConfig,
      create: driveConfig,
    })
    log('Google Drive config migrated.')
  }

  // Google Drive auth
  const driveAuth = await src.googleDriveAuth.findFirst()
  if (driveAuth) {
    await dst.googleDriveAuth.upsert({
      where:  { id: driveAuth.id },
      update: driveAuth,
      create: driveAuth,
    })
    log('Google Drive auth migrated.')
  }

  // Collections (parent-first to satisfy FK constraints)
  log('Reading collections...')
  const collections = await src.collection.findMany({
    orderBy: [{ parentId: 'asc' }, { createdAt: 'asc' }],
  })

  // Insert root collections first, then children
  const roots    = collections.filter(c => c.parentId === null)
  const children = collections.filter(c => c.parentId !== null)

  log(`Migrating ${collections.length} collections (${roots.length} root, ${children.length} sub)...`)

  for (const c of [...roots, ...children]) {
    const { svgs: _svgs, children: _children, parent: _parent, ...data } = c as typeof c & { svgs?: unknown; children?: unknown; parent?: unknown }
    await dst.collection.upsert({
      where:  { id: data.id },
      update: data,
      create: data,
    })
  }
  log('Collections migrated.')

  // SVGs
  log('Reading SVGs...')
  const svgs = await src.svg.findMany()
  log(`Migrating ${svgs.length} SVGs...`)

  const BATCH = 100
  for (let i = 0; i < svgs.length; i += BATCH) {
    const batch = svgs.slice(i, i + BATCH)
    for (const svg of batch) {
      await dst.svg.upsert({
        where:  { id: svg.id },
        update: svg,
        create: svg,
      })
    }
    log(`  ${Math.min(i + BATCH, svgs.length)} / ${svgs.length}`)
  }
  log('SVGs migrated.')

  // Backup metadata
  log('Reading backup records...')
  const backups = await src.backup.findMany()
  for (const b of backups) {
    await dst.backup.upsert({
      where:  { id: b.id },
      update: b,
      create: b,
    })
  }
  log(`${backups.length} backup records migrated.`)

  console.log('\nMigration complete.\n')
}

run()
  .catch(err => { console.error('Migration failed:', err); process.exit(1) })
  .finally(async () => { await sqlite.$disconnect(); await mysql.$disconnect() })
