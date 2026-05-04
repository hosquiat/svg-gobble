import path from 'path'
import { PrismaClient } from '@prisma/client'

type DbClient = PrismaClient

export const MYSQL_CLIENT_PATH = path.join(process.cwd(), 'node_modules/.prisma/client-mysql')

function detectDbType(): 'mysql' | 'sqlite' {
  const explicit = process.env.DATABASE_TYPE
  if (explicit === 'mysql') return 'mysql'
  if (explicit === 'sqlite') return 'sqlite'
  // Fall back to URL inspection so DATABASE_URL alone is enough
  const url = process.env.DATABASE_URL ?? ''
  if (url.startsWith('mysql://') || url.startsWith('mysql2://')) return 'mysql'
  return 'sqlite'
}

function createClient(): DbClient {
  if (detectDbType() === 'mysql') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient: MySQLClient } = require(MYSQL_CLIENT_PATH)
    return new MySQLClient() as unknown as DbClient
  }
  return new PrismaClient()
}

const globalForPrisma = globalThis as unknown as {
  prisma: DbClient | undefined
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
