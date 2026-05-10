import { useState, useEffect, useCallback } from 'react'
import type { Settings } from '../types'
import { settingsApi } from '../api/client'

const DEFAULT_SETTINGS: Settings = {
  id: 'singleton',
  cardSize: 192,
  showSizes: true,
  showNames: true,
  optimizationPreset: 'default',
  archiveRetentionDays: 90,
  backupEnabled: false,
  backupSchedule: '0 2 * * *',
  backupRetentionDays: 30,
  googleDriveEnabled: false,
  localBackupEnabled: true,
}

interface UseSettingsReturn {
  settings: Settings
  loading: boolean
  error: string | null
  updateSettings: (data: Partial<Omit<Settings, 'id'>>) => Promise<void>
  refetch: () => Promise<void>
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await settingsApi.get()
      setSettings(data)
    } catch (err) {
      // If API fails, use default settings
      console.warn('Failed to fetch settings, using defaults:', err)
      setSettings(DEFAULT_SETTINGS)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const updateSettings = useCallback(async (data: Partial<Omit<Settings, 'id'>>) => {
    try {
      const updated = await settingsApi.update(data)
      setSettings(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings')
      throw err
    }
  }, [])

  return {
    settings,
    loading,
    error,
    updateSettings,
    refetch,
  }
}
