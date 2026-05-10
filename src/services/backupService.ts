import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import prisma from '../db'
import type { Backup } from '@prisma/client'

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../../backups')

export interface BackupData {
  version: string
  createdAt: string
  collections: Array<{
    id: string
    name: string
    emoji: string | null
    parentId: string | null
    createdAt: string
    updatedAt: string
    archivedAt: string | null
    svgs: Array<{
      id: string
      name: string
      svg: string
      type: string
      contentHash: string
      createdAt: string
      updatedAt: string
    }>
  }>
  settings: {
    id: string
    cardSize: number
    showSizes: boolean
    showNames: boolean
    optimizationPreset: string
    backupEnabled: boolean
    backupSchedule: string
    backupRetentionDays: number
    googleDriveEnabled: boolean
    localBackupEnabled: boolean
  } | null
}

/**
 * Ensure backup directory exists
 */
function ensureBackupDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  }
}

/**
 * Create a backup of all data
 * @param returnData - If true, returns the backup data instead of writing to file
 * @returns The created backup record or backup data
 */
export async function createBackup(returnData?: boolean): Promise<{ backup?: Backup; data?: BackupData; filePath?: string; skipped?: boolean }> {
  const collections = await prisma.collection.findMany({
    include: {
      svgs: true,
    },
  })

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
  })

  const backupData: BackupData = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      emoji: c.emoji,
      parentId: c.parentId,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      archivedAt: c.archivedAt?.toISOString() || null,
      svgs: c.svgs.map((s) => ({
        id: s.id,
        name: s.name,
        svg: s.svg,
        type: s.type,
        contentHash: s.contentHash,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
    })),
    settings: settings
      ? {
          id: settings.id,
          cardSize: settings.cardSize,
          showSizes: settings.showSizes,
          showNames: settings.showNames,
          optimizationPreset: settings.optimizationPreset,
          backupEnabled: settings.backupEnabled,
          backupSchedule: settings.backupSchedule,
          backupRetentionDays: settings.backupRetentionDays,
          googleDriveEnabled: settings.googleDriveEnabled,
          localBackupEnabled: settings.localBackupEnabled,
        }
      : null,
  }

  if (returnData) {
    return { data: backupData }
  }

  // Hash the data content (excluding the timestamp which always differs)
  const hashable = JSON.stringify({ collections: backupData.collections, settings: backupData.settings })
  const contentHash = crypto.createHash('sha256').update(hashable).digest('hex')

  // Skip if content hasn't changed since the last backup
  const lastBackup = await prisma.backup.findFirst({
    where: { type: 'local', status: 'completed' },
    orderBy: { createdAt: 'desc' },
  })
  if (lastBackup?.contentHash === contentHash) {
    console.log('[Backup] No changes since last backup, skipping.')
    return { skipped: true }
  }

  ensureBackupDir()

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `backup-${timestamp}.json`
  const filePath = path.join(BACKUP_DIR, filename)

  const content = JSON.stringify(backupData, null, 2)
  fs.writeFileSync(filePath, content, 'utf-8')

  const size = Buffer.byteLength(content, 'utf-8')

  const backup = await prisma.backup.create({
    data: {
      filename,
      size,
      type: 'local',
      status: 'completed',
      contentHash,
    },
  })

  return { backup, filePath }
}

/**
 * Restore data from a backup
 * @param filename - Optional filename to restore from (if not provided, uses data)
 * @param data - Optional backup data to restore directly
 */
export async function restoreBackup(filename?: string, data?: BackupData): Promise<void> {
  let backupData: BackupData

  if (data) {
    backupData = data
  } else if (filename) {
    const filePath = path.join(BACKUP_DIR, filename)
    if (!fs.existsSync(filePath)) {
      throw new Error(`Backup file not found: ${filename}`)
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    backupData = JSON.parse(content) as BackupData
  } else {
    throw new Error('Either filename or data must be provided')
  }

  // Validate backup version
  if (!backupData.version || !backupData.collections) {
    throw new Error('Invalid backup format')
  }

  // Use a transaction to restore all data
  await prisma.$transaction(async (tx) => {
    // Delete all existing data
    await tx.svg.deleteMany()
    await tx.collection.deleteMany()

    // Restore collections (without parent relationships first)
    for (const collection of backupData.collections) {
      await tx.collection.create({
        data: {
          id: collection.id,
          name: collection.name,
          emoji: collection.emoji,
          parentId: null, // Set later to handle ordering
          createdAt: new Date(collection.createdAt),
          updatedAt: new Date(collection.updatedAt),
          archivedAt: collection.archivedAt ? new Date(collection.archivedAt) : null,
        },
      })
    }

    // Update parent relationships
    for (const collection of backupData.collections) {
      if (collection.parentId) {
        await tx.collection.update({
          where: { id: collection.id },
          data: { parentId: collection.parentId },
        })
      }
    }

    // Restore SVGs
    for (const collection of backupData.collections) {
      for (const svg of collection.svgs) {
        await tx.svg.create({
          data: {
            id: svg.id,
            name: svg.name,
            svg: svg.svg,
            type: svg.type,
            contentHash: svg.contentHash,
            collectionId: collection.id,
            createdAt: new Date(svg.createdAt),
            updatedAt: new Date(svg.updatedAt),
          },
        })
      }
    }

    // Restore settings if provided
    if (backupData.settings) {
      await tx.settings.upsert({
        where: { id: 'singleton' },
        update: {
          cardSize: backupData.settings.cardSize,
          showSizes: backupData.settings.showSizes,
          showNames: backupData.settings.showNames,
          optimizationPreset: backupData.settings.optimizationPreset,
        },
        create: {
          id: 'singleton',
          cardSize: backupData.settings.cardSize,
          showSizes: backupData.settings.showSizes,
          showNames: backupData.settings.showNames,
          optimizationPreset: backupData.settings.optimizationPreset,
        },
      })
    }
  })
}

/**
 * Delete a backup file and its database record
 */
export async function deleteBackup(backup: { id: string; filename: string; type: string }): Promise<void> {
  // Delete local file if it exists
  if (backup.type === 'local') {
    const filePath = path.join(BACKUP_DIR, backup.filename)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  }

  // Delete database record
  await prisma.backup.delete({
    where: { id: backup.id },
  })
}

/**
 * Get backup file path
 */
export function getBackupFilePath(filename: string): string {
  return path.join(BACKUP_DIR, filename)
}

/**
 * Check if backup file exists
 */
export function backupFileExists(filename: string): boolean {
  return fs.existsSync(path.join(BACKUP_DIR, filename))
}

/**
 * Clean up old backups based on retention policy
 */
export async function cleanupOldBackups(retentionDays: number): Promise<number> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

  const oldBackups = await prisma.backup.findMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
      type: 'local',
    },
  })

  let deletedCount = 0

  for (const backup of oldBackups) {
    try {
      await deleteBackup(backup)
      deletedCount++
    } catch (error) {
      console.error(`[Backup Cleanup] Failed to delete backup ${backup.filename}:`, error)
    }
  }

  return deletedCount
}

/**
 * Get all backups
 */
export async function getAllBackups() {
  return prisma.backup.findMany({
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Get backup by ID
 */
export async function getBackupById(id: string) {
  return prisma.backup.findUnique({
    where: { id },
  })
}

export { BACKUP_DIR }
