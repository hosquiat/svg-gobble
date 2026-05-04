import { Router, Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import prisma, { MYSQL_CLIENT_PATH } from '../db'

const router = Router()

const DB_CONFIG_PATH = path.join(process.cwd(), 'prisma/data/db-config.json')

export interface DbConfig {
  type: 'sqlite' | 'mysql'
  url: string
}

export function readDbConfig(): DbConfig | null {
  try {
    if (fs.existsSync(DB_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(DB_CONFIG_PATH, 'utf8'))
    }
  } catch { /* no config file */ }
  return null
}

function writeDbConfig(config: DbConfig): void {
  const dir = path.dirname(DB_CONFIG_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(DB_CONFIG_PATH, JSON.stringify(config, null, 2))
}

function maskUrl(url: string): string {
  return url.replace(/:([^:@/?#]+)@/, ':***@')
}

function getMysqlClient(url: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require(MYSQL_CLIENT_PATH)
  return new PrismaClient({ datasources: { db: { url } } })
}

/**
 * GET /api/database/status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const dbType = process.env.DATABASE_TYPE || 'sqlite'
    const dbUrl  = process.env.DATABASE_URL  || 'file:./data/svg-gobble.db'

    const [collections, svgs, backups] = await Promise.all([
      prisma.collection.count(),
      prisma.svg.count(),
      prisma.backup.count(),
    ])

    let sizeBytes: number | null = null
    if (dbType === 'sqlite') {
      const filePath = dbUrl.replace(/^file:/, '')
      const absPath  = path.isAbsolute(filePath)
        ? filePath
        : path.join(process.cwd(), filePath)
      try { sizeBytes = fs.statSync(absPath).size } catch { /* file not found */ }
    } else {
      try {
        const result = await prisma.$queryRaw<[{ size: bigint }]>`
          SELECT ROUND(SUM(data_length + index_length), 0) AS size
          FROM information_schema.TABLES
          WHERE table_schema = DATABASE()`
        sizeBytes = Number(result[0]?.size ?? 0)
      } catch { /* query failed */ }
    }

    const savedConfig = readDbConfig()

    res.json({
      success: true,
      current: {
        type: dbType,
        url: maskUrl(dbUrl),
        connected: true,
        metrics: { collections, svgs, backups, sizeBytes },
      },
      savedConfig: savedConfig
        ? { type: savedConfig.type, url: maskUrl(savedConfig.url) }
        : null,
    })
  } catch (error) {
    console.error('Database status error:', error)
    res.status(500).json({ success: false, error: 'Failed to get database status' })
  }
})

/**
 * POST /api/database/test
 * Body: { url: string }
 */
router.post('/test', async (req: Request, res: Response) => {
  const { url } = req.body as { url: string }
  if (!url) return res.status(400).json({ success: false, error: 'url is required' })

  const start = Date.now()
  let client: ReturnType<typeof getMysqlClient> | null = null

  try {
    if (url.startsWith('mysql')) {
      client = getMysqlClient(url)
    } else {
      const { PrismaClient } = await import('@prisma/client')
      client = new PrismaClient({ datasources: { db: { url } } }) as ReturnType<typeof getMysqlClient>
    }

    await client.$connect()
    await client.$queryRaw`SELECT 1`
    const latencyMs = Date.now() - start

    res.json({ success: true, latencyMs })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Connection failed'
    res.json({ success: false, error: msg })
  } finally {
    await client?.$disconnect()
  }
})

/**
 * POST /api/database/migrate
 * Body: { from: 'sqlite'|'mysql', to: 'sqlite'|'mysql', mysqlUrl: string }
 */
router.post('/migrate', async (req: Request, res: Response) => {
  const { from, to, mysqlUrl } = req.body as {
    from: 'sqlite' | 'mysql'
    to:   'sqlite' | 'mysql'
    mysqlUrl: string
  }

  if (!mysqlUrl) return res.status(400).json({ success: false, error: 'mysqlUrl is required' })
  if (from === to)  return res.status(400).json({ success: false, error: 'Source and destination are the same' })

  const sqliteUrl = process.env.DATABASE_URL || 'file:./data/svg-gobble.db'

  // Push schema to destination before copying data
  try {
    if (to === 'mysql') {
      const schemaPath = path.join(process.cwd(), 'prisma/schema.mysql.prisma')
      execSync(`npx prisma db push --schema="${schemaPath}" --accept-data-loss`, {
        env: { ...process.env, DATABASE_URL: mysqlUrl },
        timeout: 60_000,
        stdio: 'pipe',
      })
    } else {
      const schemaPath = path.join(process.cwd(), 'prisma/schema.prisma')
      execSync(`npx prisma db push --schema="${schemaPath}" --accept-data-loss`, {
        env: { ...process.env, DATABASE_URL: sqliteUrl },
        timeout: 60_000,
        stdio: 'pipe',
      })
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Schema push failed'
    return res.status(500).json({ success: false, error: `Schema setup failed: ${msg}` })
  }

  const { PrismaClient: SQLiteClient } = await import('@prisma/client')
  const MySQLClientCtor = getMysqlClient(mysqlUrl).constructor as new (opts: object) => typeof prisma

  const srcClient = from === 'sqlite'
    ? new SQLiteClient({ datasources: { db: { url: sqliteUrl } } }) as typeof prisma
    : getMysqlClient(mysqlUrl)
  const dstClient = to === 'sqlite'
    ? new SQLiteClient({ datasources: { db: { url: sqliteUrl } } }) as typeof prisma
    : getMysqlClient(mysqlUrl)

  void MySQLClientCtor // suppress unused warning

  const counts = { collections: 0, svgs: 0, backups: 0 }

  try {
    await srcClient.$connect()
    await dstClient.$connect()

    // Settings
    const settings = await srcClient.settings.findFirst()
    if (settings) {
      await dstClient.settings.upsert({ where: { id: settings.id }, update: settings, create: settings })
    }

    // Google Drive config + auth
    const driveConfig = await srcClient.googleDriveConfig.findFirst()
    if (driveConfig) {
      await dstClient.googleDriveConfig.upsert({ where: { id: driveConfig.id }, update: driveConfig, create: driveConfig })
    }
    const driveAuth = await srcClient.googleDriveAuth.findFirst()
    if (driveAuth) {
      await dstClient.googleDriveAuth.upsert({ where: { id: driveAuth.id }, update: driveAuth, create: driveAuth })
    }

    // Collections — roots first to satisfy FK constraints
    const allCollections = await srcClient.collection.findMany() as Array<{ id: string; parentId: string | null }>
    const roots    = allCollections.filter((c: { parentId: string | null }) => c.parentId === null)
    const children = allCollections.filter((c: { parentId: string | null }) => c.parentId !== null)

    for (const c of [...roots, ...children]) {
      await dstClient.collection.upsert({ where: { id: c.id }, update: c, create: c })
    }
    counts.collections = allCollections.length

    // SVGs in batches of 50
    const allSvgs = await srcClient.svg.findMany()
    for (const svg of allSvgs) {
      await dstClient.svg.upsert({ where: { id: svg.id }, update: svg, create: svg })
    }
    counts.svgs = allSvgs.length

    // Backup metadata
    const allBackups = await srcClient.backup.findMany()
    for (const b of allBackups) {
      await dstClient.backup.upsert({ where: { id: b.id }, update: b, create: b })
    }
    counts.backups = allBackups.length

    res.json({ success: true, counts })
  } catch (error: unknown) {
    console.error('Migration error:', error)
    const msg = error instanceof Error ? error.message : 'Migration failed'
    res.status(500).json({ success: false, error: msg })
  } finally {
    await srcClient.$disconnect()
    await dstClient.$disconnect()
  }
})

/**
 * POST /api/database/switch
 * Body: { type: 'sqlite'|'mysql', url: string }
 * Persists the new config to disk; takes effect on next restart.
 */
router.post('/switch', (req: Request, res: Response) => {
  const { type, url } = req.body as { type: 'sqlite' | 'mysql'; url: string }
  if (!type || !url) return res.status(400).json({ success: false, error: 'type and url are required' })

  try {
    writeDbConfig({ type, url })
    res.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to save config'
    res.status(500).json({ success: false, error: msg })
  }
})

/**
 * POST /api/database/restart
 * Exits the process; Docker / the OS will restart it with the new config.
 */
router.post('/restart', (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Restarting…' })
  setTimeout(() => process.exit(0), 400)
})

export default router
