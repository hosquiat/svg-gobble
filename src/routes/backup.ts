import { Router, Request, Response } from 'express'
import fs from 'fs'
import {
  createBackup,
  restoreBackup,
  deleteBackup,
  getAllBackups,
  getBackupById,
  getBackupFilePath,
  backupFileExists,
  BackupData,
} from '../services/backupService'
import {
  getValidAccessToken,
  uploadToGoogleDrive,
  deleteFromGoogleDrive,
} from '../services/googleDriveService'
import prisma from '../db'

const router = Router()

/**
 * GET /api/backup - List all backups
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const backups = await getAllBackups()
    res.json({ success: true, backups })
  } catch (error) {
    console.error('Error listing backups:', error)
    res.status(500).json({ success: false, error: 'Failed to list backups' })
  }
})

/**
 * POST /api/backup - Create a new backup
 */
router.post('/', async (_req: Request, res: Response) => {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
    })

    const { backup, filePath } = await createBackup()

    // Upload to Google Drive if enabled
    if (settings?.googleDriveEnabled && backup && filePath) {
      const accessToken = await getValidAccessToken()
      if (accessToken) {
        try {
          const { fileId, size } = await uploadToGoogleDrive(accessToken, filePath, backup.filename)

          // Create a separate record for the Drive backup
          await prisma.backup.create({
            data: {
              filename: backup.filename,
              size,
              type: 'google_drive',
              status: 'completed',
              driveFileId: fileId,
            },
          })
        } catch (driveError) {
          console.error('Failed to upload to Google Drive:', driveError)
          // Don't fail the whole backup, just log the error
        }
      }
    }

    res.json({ success: true, backup })
  } catch (error) {
    console.error('Error creating backup:', error)
    res.status(500).json({ success: false, error: 'Failed to create backup' })
  }
})

/**
 * POST /api/backup/:id/restore - Restore from a backup
 */
router.post('/:id/restore', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params
    const backup = await getBackupById(id)

    if (!backup) {
      return res.status(404).json({ success: false, error: 'Backup not found' })
    }

    if (backup.type === 'local') {
      if (!backupFileExists(backup.filename)) {
        return res.status(404).json({ success: false, error: 'Backup file not found' })
      }
      await restoreBackup(backup.filename)
    } else if (backup.type === 'google_drive') {
      // For Google Drive backups, we'd need to download first
      // This is handled separately
      return res.status(400).json({
        success: false,
        error: 'Google Drive restore not implemented yet',
      })
    }

    res.json({ success: true, message: 'Backup restored successfully' })
  } catch (error) {
    console.error('Error restoring backup:', error)
    res.status(500).json({ success: false, error: 'Failed to restore backup' })
  }
})

/**
 * DELETE /api/backup/:id - Delete a backup
 */
router.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params
    const backup = await getBackupById(id)

    if (!backup) {
      return res.status(404).json({ success: false, error: 'Backup not found' })
    }

    // Delete from Google Drive if applicable
    if (backup.type === 'google_drive' && backup.driveFileId) {
      const accessToken = await getValidAccessToken()
      if (accessToken) {
        try {
          await deleteFromGoogleDrive(accessToken, backup.driveFileId)
        } catch (driveError) {
          console.error('Failed to delete from Google Drive:', driveError)
        }
      }
    }

    await deleteBackup(backup)

    res.json({ success: true, message: 'Backup deleted successfully' })
  } catch (error) {
    console.error('Error deleting backup:', error)
    res.status(500).json({ success: false, error: 'Failed to delete backup' })
  }
})

/**
 * GET /api/backup/:id/download - Download a backup file
 */
router.get('/:id/download', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params
    const backup = await getBackupById(id)

    if (!backup) {
      return res.status(404).json({ success: false, error: 'Backup not found' })
    }

    if (backup.type !== 'local') {
      return res.status(400).json({
        success: false,
        error: 'Only local backups can be downloaded directly',
      })
    }

    const filePath = getBackupFilePath(backup.filename)

    if (!backupFileExists(backup.filename)) {
      return res.status(404).json({ success: false, error: 'Backup file not found' })
    }

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`)
    res.sendFile(filePath)
  } catch (error) {
    console.error('Error downloading backup:', error)
    res.status(500).json({ success: false, error: 'Failed to download backup' })
  }
})

/**
 * GET /api/backup/export - Export all data as JSON download
 */
router.get('/export', async (_req: Request, res: Response) => {
  try {
    const { data } = await createBackup(true)

    if (!data) {
      return res.status(500).json({ success: false, error: 'Failed to create export' })
    }

    const filename = `svg-gobble-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    const content = JSON.stringify(data, null, 2)

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(content)
  } catch (error) {
    console.error('Error exporting data:', error)
    res.status(500).json({ success: false, error: 'Failed to export data' })
  }
})

/**
 * POST /api/backup/import - Import JSON backup data
 */
router.post('/import', async (req: Request, res: Response) => {
  try {
    const data = req.body as BackupData

    if (!data || !data.version || !data.collections) {
      return res.status(400).json({ success: false, error: 'Invalid backup data format' })
    }

    await restoreBackup(undefined, data)

    res.json({ success: true, message: 'Data imported successfully' })
  } catch (error) {
    console.error('Error importing data:', error)
    res.status(500).json({ success: false, error: 'Failed to import data' })
  }
})

export default router
