import cron, { ScheduledTask } from 'node-cron'
import prisma from '../db'
import { createBackup, cleanupOldBackups, BACKUP_DIR } from '../services/backupService'
import {
  getValidAccessToken,
  uploadToGoogleDrive,
} from '../services/googleDriveService'

let scheduledTask: ScheduledTask | null = null

/**
 * Run a backup based on current settings
 */
export async function runBackup(): Promise<void> {
  console.log('[Backup Job] Starting scheduled backup...')

  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
    })

    if (!settings?.backupEnabled) {
      console.log('[Backup Job] Backups are disabled, skipping')
      return
    }

    // Create local backup if enabled
    if (settings.localBackupEnabled) {
      console.log('[Backup Job] Creating local backup...')
      const { backup, filePath } = await createBackup()
      if (backup) {
        console.log(`[Backup Job] Local backup created: ${backup.filename}`)
      }

      // Upload to Google Drive if enabled
      if (settings.googleDriveEnabled && backup && filePath) {
        console.log('[Backup Job] Uploading to Google Drive...')
        const accessToken = await getValidAccessToken()
        if (accessToken) {
          try {
            const { fileId, size } = await uploadToGoogleDrive(accessToken, filePath, backup.filename)
            await prisma.backup.create({
              data: {
                filename: backup.filename,
                size,
                type: 'google_drive',
                status: 'completed',
                driveFileId: fileId,
              },
            })
            console.log(`[Backup Job] Uploaded to Google Drive: ${fileId}`)
          } catch (error) {
            console.error('[Backup Job] Failed to upload to Google Drive:', error)
          }
        } else {
          console.warn('[Backup Job] Google Drive enabled but no valid access token')
        }
      }
    }

    // Cleanup old backups
    console.log(`[Backup Job] Cleaning up backups older than ${settings.backupRetentionDays} days...`)
    const deletedCount = await cleanupOldBackups(settings.backupRetentionDays)
    if (deletedCount > 0) {
      console.log(`[Backup Job] Deleted ${deletedCount} old backup(s)`)
    }

    console.log('[Backup Job] Backup completed successfully')
  } catch (error) {
    console.error('[Backup Job] Error during backup:', error)
  }
}

/**
 * Update the backup schedule based on current settings
 */
export async function updateBackupSchedule(): Promise<void> {
  // Stop existing task if any
  if (scheduledTask) {
    scheduledTask.stop()
    scheduledTask = null
  }

  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
    })

    if (!settings?.backupEnabled) {
      console.log('[Backup Job] Backups disabled, no job scheduled')
      return
    }

    const schedule = settings.backupSchedule || '0 2 * * *'

    if (!cron.validate(schedule)) {
      console.error(`[Backup Job] Invalid cron schedule: ${schedule}`)
      return
    }

    scheduledTask = cron.schedule(schedule, () => {
      runBackup()
    })

    console.log(`[Backup Job] Scheduled with cron: ${schedule}`)
  } catch (error) {
    console.error('[Backup Job] Error updating schedule:', error)
  }
}

/**
 * Start the backup job
 */
export async function startBackupJob(): Promise<void> {
  console.log('[Backup Job] Initializing...')

  // Set up the schedule based on current settings
  await updateBackupSchedule()

  // Run initial cleanup on startup (after a delay)
  setTimeout(async () => {
    try {
      const settings = await prisma.settings.findUnique({
        where: { id: 'singleton' },
      })
      if (settings?.backupEnabled) {
        const deletedCount = await cleanupOldBackups(settings.backupRetentionDays)
        if (deletedCount > 0) {
          console.log(`[Backup Job] Startup cleanup: deleted ${deletedCount} old backup(s)`)
        }
      }
    } catch (error) {
      console.error('[Backup Job] Error during startup cleanup:', error)
    }
  }, 10000)
}

export { scheduledTask }
