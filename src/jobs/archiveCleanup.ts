import cron from 'node-cron'
import prisma from '../db'

const DEFAULT_ARCHIVE_RETENTION_DAYS = 90

/**
 * Get archive retention days from settings
 */
async function getArchiveRetentionDays(): Promise<number> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
  })
  return settings?.archiveRetentionDays ?? DEFAULT_ARCHIVE_RETENTION_DAYS
}

/**
 * Delete archived collections that have exceeded the retention period
 */
async function cleanupArchivedCollections(): Promise<void> {
  const retentionDays = await getArchiveRetentionDays()
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

  try {
    const result = await prisma.collection.deleteMany({
      where: {
        archivedAt: {
          lt: cutoffDate,
          not: null,
        },
      },
    })

    if (result.count > 0) {
      console.log(`[Archive Cleanup] Deleted ${result.count} archived collection(s) (retention: ${retentionDays} days)`)
    }
  } catch (error) {
    console.error('[Archive Cleanup] Error cleaning up archived collections:', error)
  }
}

/**
 * Start the archive cleanup job
 * Runs daily at midnight
 */
export function startArchiveCleanupJob(): void {
  // Run daily at midnight
  cron.schedule('0 0 * * *', () => {
    console.log('[Archive Cleanup] Running scheduled cleanup...')
    cleanupArchivedCollections()
  })

  console.log('[Archive Cleanup] Job scheduled to run daily at midnight')

  // Also run once on startup (after a short delay to ensure DB is ready)
  setTimeout(() => {
    cleanupArchivedCollections()
  }, 5000)
}

export { cleanupArchivedCollections, getArchiveRetentionDays, DEFAULT_ARCHIVE_RETENTION_DAYS }
