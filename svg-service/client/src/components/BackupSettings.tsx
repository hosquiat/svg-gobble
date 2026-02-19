import { useState, useEffect, useCallback } from 'react'
import clsx from 'clsx'
import type { Settings, Backup, GoogleDriveStatus } from '../types'
import { backupApi, googleDriveApi } from '../api/client'

interface BackupSettingsProps {
  settings: Settings
  onUpdateSettings: (data: Partial<Omit<Settings, 'id'>>) => Promise<void>
}

const SCHEDULE_PRESETS = [
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at 2 AM', value: '0 2 * * *' },
  { label: 'Weekly (Sunday 2 AM)', value: '0 2 * * 0' },
  { label: 'Custom', value: 'custom' },
]

export function BackupSettings({ settings, onUpdateSettings }: BackupSettingsProps) {
  const [backups, setBackups] = useState<Backup[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [driveStatus, setDriveStatus] = useState<GoogleDriveStatus | null>(null)
  const [customSchedule, setCustomSchedule] = useState(settings.backupSchedule)
  const [selectedPreset, setSelectedPreset] = useState(() => {
    const preset = SCHEDULE_PRESETS.find(p => p.value === settings.backupSchedule)
    return preset ? preset.value : 'custom'
  })

  // Google Drive config form state
  const [showConfigForm, setShowConfigForm] = useState(false)
  const [configClientId, setConfigClientId] = useState('')
  const [configClientSecret, setConfigClientSecret] = useState('')
  const [configRedirectUri, setConfigRedirectUri] = useState('')

  // Load backups and drive status
  const loadData = useCallback(async () => {
    try {
      const [backupList, status] = await Promise.all([
        backupApi.list(),
        googleDriveApi.getStatus(),
      ])
      setBackups(backupList)
      setDriveStatus(status)

      // Set default redirect URI based on current location
      if (!configRedirectUri) {
        const defaultUri = status.redirectUri || `${window.location.origin}/api/google-drive/oauth-callback`
        setConfigRedirectUri(defaultUri)
      }
    } catch (error) {
      console.error('Failed to load backup data:', error)
    } finally {
      setLoading(false)
    }
  }, [configRedirectUri])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Listen for OAuth popup messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'oauth-success') {
        loadData()
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [loadData])

  const handleCreateBackup = async () => {
    setActionLoading('create')
    try {
      await backupApi.create()
      await loadData()
    } catch (error) {
      console.error('Failed to create backup:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const handleRestoreBackup = async (id: string) => {
    if (!confirm('Are you sure you want to restore this backup? This will replace all current data.')) {
      return
    }
    setActionLoading(`restore-${id}`)
    try {
      await backupApi.restore(id)
      window.location.reload()
    } catch (error) {
      console.error('Failed to restore backup:', error)
      alert('Failed to restore backup')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeleteBackup = async (id: string) => {
    if (!confirm('Are you sure you want to delete this backup?')) {
      return
    }
    setActionLoading(`delete-${id}`)
    try {
      await backupApi.delete(id)
      await loadData()
    } catch (error) {
      console.error('Failed to delete backup:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const handleExport = () => {
    window.open(backupApi.getExportUrl(), '_blank')
  }

  const handleImport = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      if (!confirm('Are you sure you want to import this backup? This will replace all current data.')) {
        return
      }

      setActionLoading('import')
      try {
        const content = await file.text()
        const data = JSON.parse(content)
        await backupApi.import(data)
        window.location.reload()
      } catch (error) {
        console.error('Failed to import:', error)
        alert('Failed to import backup. Please check the file format.')
      } finally {
        setActionLoading(null)
      }
    }
    input.click()
  }

  const handleSaveConfig = async () => {
    if (!configClientId || !configClientSecret) {
      alert('Please enter both Client ID and Client Secret')
      return
    }

    setActionLoading('save-config')
    try {
      await googleDriveApi.saveConfig({
        clientId: configClientId,
        clientSecret: configClientSecret,
        redirectUri: configRedirectUri || `${window.location.origin}/api/google-drive/oauth-callback`,
      })
      setShowConfigForm(false)
      setConfigClientId('')
      setConfigClientSecret('')
      await loadData()
    } catch (error) {
      console.error('Failed to save config:', error)
      alert('Failed to save configuration')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeleteConfig = async () => {
    if (!confirm('Are you sure you want to remove the Google Drive configuration? This will also disconnect your account.')) {
      return
    }
    setActionLoading('delete-config')
    try {
      await googleDriveApi.deleteConfig()
      await loadData()
    } catch (error) {
      console.error('Failed to delete config:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const handleConnectDrive = async () => {
    try {
      const url = await googleDriveApi.getAuthUrl()
      window.open(url, 'google-oauth', 'width=500,height=600')
    } catch (error) {
      console.error('Failed to get auth URL:', error)
      alert('Failed to start authorization. Please check your configuration.')
    }
  }

  const handleDisconnectDrive = async () => {
    if (!confirm('Are you sure you want to disconnect Google Drive?')) {
      return
    }
    setActionLoading('disconnect')
    try {
      await googleDriveApi.disconnect()
      await loadData()
    } catch (error) {
      console.error('Failed to disconnect:', error)
    } finally {
      setActionLoading(null)
    }
  }

  const handleScheduleChange = (preset: string) => {
    setSelectedPreset(preset)
    if (preset !== 'custom') {
      setCustomSchedule(preset)
      onUpdateSettings({ backupSchedule: preset })
    }
  }

  const handleCustomScheduleBlur = () => {
    if (selectedPreset === 'custom' && customSchedule) {
      onUpdateSettings({ backupSchedule: customSchedule })
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString()
  }

  return (
    <div className="space-y-6">
      {/* Google Drive Connection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Google Drive Integration
        </label>
        <div className="p-4 border border-gray-200 rounded-lg space-y-4">
          {/* Connected State */}
          {driveStatus?.connected && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Connected as <span className="font-medium">{driveStatus.email}</span>
                </p>
                {driveStatus.configSource === 'database' && (
                  <p className="text-xs text-gray-500 mt-1">
                    Using saved credentials
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {driveStatus.configSource === 'database' && (
                  <button
                    onClick={handleDeleteConfig}
                    disabled={actionLoading === 'delete-config'}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Remove Config
                  </button>
                )}
                <button
                  onClick={handleDisconnectDrive}
                  disabled={actionLoading === 'disconnect'}
                  className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  {actionLoading === 'disconnect' ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </div>
            </div>
          )}

          {/* Not Connected - Configured via env */}
          {!driveStatus?.connected && driveStatus?.configSource === 'env' && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Configured via environment variables
              </p>
              <button
                onClick={handleConnectDrive}
                className="px-3 py-1.5 text-sm bg-blue-500 text-white hover:bg-blue-600 rounded-lg transition-colors"
              >
                Connect Google Drive
              </button>
            </div>
          )}

          {/* Not Connected - Configured via database */}
          {!driveStatus?.connected && driveStatus?.configSource === 'database' && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Credentials saved, not connected
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteConfig}
                  disabled={actionLoading === 'delete-config'}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Remove Config
                </button>
                <button
                  onClick={handleConnectDrive}
                  className="px-3 py-1.5 text-sm bg-blue-500 text-white hover:bg-blue-600 rounded-lg transition-colors"
                >
                  Connect Google Drive
                </button>
              </div>
            </div>
          )}

          {/* Not Configured - Show setup button or form */}
          {!driveStatus?.configured && !showConfigForm && (
            <div>
              <p className="text-sm text-gray-500 mb-3">
                Google Drive is not configured. You can set it up to automatically backup your data to the cloud.
              </p>
              <button
                onClick={() => setShowConfigForm(true)}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Configure Google Drive
              </button>
            </div>
          )}

          {/* Configuration Form */}
          {showConfigForm && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800 font-medium mb-2">
                  Setup Instructions:
                </p>
                <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
                  <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="underline">Google Cloud Console</a></li>
                  <li>Create a new project or select an existing one</li>
                  <li>Enable the "Google Drive API" in APIs & Services &gt; Library</li>
                  <li>Go to APIs & Services &gt; Credentials</li>
                  <li>Click "Create Credentials" &gt; "OAuth client ID"</li>
                  <li>Select "Web application" as application type</li>
                  <li>Add the Redirect URI shown below to "Authorized redirect URIs"</li>
                  <li>Copy the Client ID and Client Secret here</li>
                </ol>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Client ID
                </label>
                <input
                  type="text"
                  value={configClientId}
                  onChange={(e) => setConfigClientId(e.target.value)}
                  placeholder="xxxx.apps.googleusercontent.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Client Secret
                </label>
                <input
                  type="password"
                  value={configClientSecret}
                  onChange={(e) => setConfigClientSecret(e.target.value)}
                  placeholder="GOCSPX-xxxx"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Redirect URI
                  <span className="ml-1 font-normal text-gray-400">(add this to Google Console)</span>
                </label>
                <input
                  type="text"
                  value={configRedirectUri}
                  onChange={(e) => setConfigRedirectUri(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Copy this URL and add it as an authorized redirect URI in Google Cloud Console
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowConfigForm(false)
                    setConfigClientId('')
                    setConfigClientSecret('')
                  }}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveConfig}
                  disabled={actionLoading === 'save-config' || !configClientId || !configClientSecret}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {actionLoading === 'save-config' ? 'Saving...' : 'Save & Connect'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Backup Toggle */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.backupEnabled}
            onChange={(e) => onUpdateSettings({ backupEnabled: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-500"
          />
          <span className="text-sm font-medium text-gray-700">
            Enable automatic backups
          </span>
        </label>
      </div>

      {/* Schedule */}
      {settings.backupEnabled && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Backup Schedule
          </label>
          <div className="space-y-2">
            <select
              value={selectedPreset}
              onChange={(e) => handleScheduleChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              {SCHEDULE_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
            {selectedPreset === 'custom' && (
              <input
                type="text"
                value={customSchedule}
                onChange={(e) => setCustomSchedule(e.target.value)}
                onBlur={handleCustomScheduleBlur}
                placeholder="Cron expression (e.g., 0 2 * * *)"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 font-mono text-sm"
              />
            )}
          </div>
        </div>
      )}

      {/* Backup Destination */}
      {settings.backupEnabled && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Backup Destination
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.localBackupEnabled}
                onChange={(e) => onUpdateSettings({ localBackupEnabled: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-500"
              />
              <span className="text-sm text-gray-700">Local storage</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.googleDriveEnabled}
                onChange={(e) => onUpdateSettings({ googleDriveEnabled: e.target.checked })}
                disabled={!driveStatus?.connected}
                className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-500 disabled:opacity-50"
              />
              <span className={clsx(
                'text-sm',
                driveStatus?.connected
                  ? 'text-gray-700'
                  : 'text-gray-400'
              )}>
                Google Drive
                {!driveStatus?.connected && ' (connect first)'}
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Retention */}
      {settings.backupEnabled && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Keep backups for: {settings.backupRetentionDays} days
          </label>
          <input
            type="range"
            min={7}
            max={90}
            step={1}
            value={settings.backupRetentionDays}
            onChange={(e) => onUpdateSettings({ backupRetentionDays: Number(e.target.value) })}
            className="w-full h-2 bg-gray-200 rounded-lg cursor-pointer accent-red-500"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>7 days</span>
            <span>90 days</span>
          </div>
        </div>
      )}

      {/* Manual Actions */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Manual Actions
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleCreateBackup}
            disabled={actionLoading === 'create'}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            {actionLoading === 'create' ? 'Creating...' : 'Create Backup Now'}
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Export Data
          </button>
          <button
            onClick={handleImport}
            disabled={actionLoading === 'import'}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            {actionLoading === 'import' ? 'Importing...' : 'Import Data'}
          </button>
        </div>
      </div>

      {/* Backup List */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Backups ({backups.length})
        </label>
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : backups.length === 0 ? (
          <p className="text-sm text-gray-500">No backups yet</p>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Filename
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Size
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Created
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {backups.map((backup) => (
                  <tr key={backup.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-900 font-mono">
                      {backup.filename}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {backup.type === 'google_drive' ? 'Google Drive' : 'Local'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {formatSize(backup.size)}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {formatDate(backup.createdAt)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        {backup.type === 'local' && (
                          <a
                            href={backupApi.getDownloadUrl(backup.id)}
                            className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                          >
                            Download
                          </a>
                        )}
                        <button
                          onClick={() => handleRestoreBackup(backup.id)}
                          disabled={actionLoading === `restore-${backup.id}` || backup.type === 'google_drive'}
                          className="px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                        >
                          {actionLoading === `restore-${backup.id}` ? '...' : 'Restore'}
                        </button>
                        <button
                          onClick={() => handleDeleteBackup(backup.id)}
                          disabled={actionLoading === `delete-${backup.id}`}
                          className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                        >
                          {actionLoading === `delete-${backup.id}` ? '...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
