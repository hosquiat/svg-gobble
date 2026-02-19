import { Router, Request, Response } from 'express'
import prisma from '../db'
import { updateBackupSchedule } from '../jobs/backupJob'

const router = Router()

/**
 * Validate cron expression (basic validation)
 */
function isValidCron(expression: string): boolean {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) return false

  // Basic validation - just check that it has 5 parts
  // More comprehensive validation could be added
  return parts.every(part => /^[\d*,/-]+$/.test(part))
}

/**
 * GET /api/settings - Get settings
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    let settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
    })

    // Create default settings if none exist
    if (!settings) {
      settings = await prisma.settings.create({
        data: { id: 'singleton' },
      })
    }

    res.json({ success: true, settings })
  } catch (error) {
    console.error('Error fetching settings:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch settings' })
  }
})

/**
 * PUT /api/settings - Update settings
 */
router.put('/', async (req: Request, res: Response) => {
  try {
    const {
      cardSize,
      showSizes,
      showNames,
      optimizationPreset,
      archiveRetentionDays,
      backupEnabled,
      backupSchedule,
      backupRetentionDays,
      googleDriveEnabled,
      localBackupEnabled,
    } = req.body

    // Validate optimizationPreset
    if (optimizationPreset && !['minimal', 'default', 'aggressive'].includes(optimizationPreset)) {
      return res.status(400).json({ success: false, error: 'Invalid optimization preset' })
    }

    // Validate cron schedule if provided
    if (backupSchedule && !isValidCron(backupSchedule)) {
      return res.status(400).json({ success: false, error: 'Invalid backup schedule format' })
    }

    // Validate backup retention days
    if (backupRetentionDays !== undefined && (backupRetentionDays < 1 || backupRetentionDays > 365)) {
      return res.status(400).json({ success: false, error: 'Backup retention days must be between 1 and 365' })
    }

    // Validate archive retention days
    if (archiveRetentionDays !== undefined && (archiveRetentionDays < 7 || archiveRetentionDays > 365)) {
      return res.status(400).json({ success: false, error: 'Archive retention days must be between 7 and 365' })
    }

    // Get existing settings
    let existing = await prisma.settings.findUnique({
      where: { id: 'singleton' },
    })

    if (!existing) {
      existing = await prisma.settings.create({
        data: { id: 'singleton' },
      })
    }

    const scheduleChanged = backupSchedule !== undefined && backupSchedule !== existing.backupSchedule
    const enabledChanged = backupEnabled !== undefined && backupEnabled !== existing.backupEnabled

    const settings = await prisma.settings.update({
      where: { id: 'singleton' },
      data: {
        cardSize: cardSize ?? existing.cardSize,
        showSizes: showSizes ?? existing.showSizes,
        showNames: showNames ?? existing.showNames,
        optimizationPreset: optimizationPreset ?? existing.optimizationPreset,
        archiveRetentionDays: archiveRetentionDays ?? existing.archiveRetentionDays,
        backupEnabled: backupEnabled ?? existing.backupEnabled,
        backupSchedule: backupSchedule ?? existing.backupSchedule,
        backupRetentionDays: backupRetentionDays ?? existing.backupRetentionDays,
        googleDriveEnabled: googleDriveEnabled ?? existing.googleDriveEnabled,
        localBackupEnabled: localBackupEnabled ?? existing.localBackupEnabled,
      },
    })

    // Update backup schedule if it changed
    if (scheduleChanged || enabledChanged) {
      updateBackupSchedule()
    }

    res.json({ success: true, settings })
  } catch (error) {
    console.error('Error updating settings:', error)
    res.status(500).json({ success: false, error: 'Failed to update settings' })
  }
})

export default router
