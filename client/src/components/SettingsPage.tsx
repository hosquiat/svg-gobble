import { useState } from 'react'
import clsx from 'clsx'
import type { Settings, Collection } from '../types'
import { BackupSettings } from './BackupSettings'

interface SettingsPageProps {
  settings: Settings
  collections: Collection[]
  onUpdateSettings: (data: Partial<Omit<Settings, 'id'>>) => Promise<void>
  onClose: () => void
}

type TabId = 'general' | 'backup'

const CARD_SIZE_OPTIONS = [
  { value: 100, label: 'XS (100px)' },
  { value: 140, label: 'S (140px)' },
  { value: 192, label: 'M (192px)' },
  { value: 260, label: 'L (260px)' },
  { value: 340, label: 'XL (340px)' },
  { value: 400, label: 'XXL (400px)' },
]

export function SettingsPage({
  settings,
  collections,
  onUpdateSettings,
  onClose,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [localSettings, setLocalSettings] = useState(settings)
  const [saving, setSaving] = useState(false)

  // Find default collection name
  const defaultCollection = collections.find(c => c.isDefault)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onUpdateSettings({
        optimizationPreset: localSettings.optimizationPreset,
        cardSize: localSettings.cardSize,
        showSizes: localSettings.showSizes,
        showNames: localSettings.showNames,
        archiveRetentionDays: localSettings.archiveRetentionDays,
      })
      onClose()
    } catch (error) {
      console.error('Failed to save settings:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleBackupSettingsUpdate = async (data: Partial<Omit<Settings, 'id'>>) => {
    await onUpdateSettings(data)
    setLocalSettings(prev => ({ ...prev, ...data }))
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'backup', label: 'Backup' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl max-h-[90vh] bg-white rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 px-6 border-b border-gray-200">
          <nav className="flex gap-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'py-3 text-sm font-medium border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-red-500 text-red-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* Default Collection (read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Default Collection
                </label>
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                  <span className="text-yellow-500">&#9733;</span>
                  <span className="text-gray-900">{defaultCollection?.name || 'None'}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  The default collection cannot be changed. New SVGs will be added here when no collection is selected.
                </p>
              </div>

              {/* Optimization Preset */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SVG Optimization Preset
                </label>
                <div className="flex gap-2">
                  {(['minimal', 'default', 'aggressive'] as const).map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setLocalSettings({ ...localSettings, optimizationPreset: preset })}
                      className={clsx(
                        'flex-1 px-4 py-2 text-sm rounded-lg border transition-colors',
                        localSettings.optimizationPreset === preset
                          ? 'border-red-500 bg-red-50 text-red-600'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      )}
                    >
                      {preset.charAt(0).toUpperCase() + preset.slice(1)}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {localSettings.optimizationPreset === 'minimal' && 'Safe optimizations only'}
                  {localSettings.optimizationPreset === 'default' && 'Balanced optimization'}
                  {localSettings.optimizationPreset === 'aggressive' && 'Maximum compression'}
                </p>
              </div>

              {/* View Settings */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  View Settings
                </label>
                <div className="space-y-2">
                  <label htmlFor="settings-show-sizes" className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      id="settings-show-sizes"
                      name="settings-show-sizes"
                      checked={localSettings.showSizes}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, showSizes: e.target.checked })
                      }
                      className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-500"
                    />
                    <span className="text-sm text-gray-700">Show file sizes</span>
                  </label>
                  <label htmlFor="settings-show-names" className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      id="settings-show-names"
                      name="settings-show-names"
                      checked={localSettings.showNames}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, showNames: e.target.checked })
                      }
                      className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-500"
                    />
                    <span className="text-sm text-gray-700">Show SVG names</span>
                  </label>
                </div>
              </div>

              {/* Card Size Dropdown */}
              <div>
                <label htmlFor="settings-card-size" className="block text-sm font-medium text-gray-700 mb-2">
                  Default Card Size
                </label>
                <select
                  id="settings-card-size"
                  name="settings-card-size"
                  value={localSettings.cardSize}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, cardSize: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  {CARD_SIZE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Archive Retention */}
              <div>
                <label htmlFor="settings-archive-retention" className="block text-sm font-medium text-gray-700 mb-2">
                  Archive Retention: {localSettings.archiveRetentionDays} days
                </label>
                <input
                  type="range"
                  id="settings-archive-retention"
                  name="settings-archive-retention"
                  min={7}
                  max={365}
                  step={1}
                  value={localSettings.archiveRetentionDays}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, archiveRetentionDays: Number(e.target.value) })
                  }
                  className="w-full h-2 bg-gray-200 rounded-lg cursor-pointer accent-red-500"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>7 days</span>
                  <span>1 year</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Archived collections will be automatically deleted after this period
                </p>
              </div>
            </div>
          )}

          {activeTab === 'backup' && (
            <BackupSettings
              settings={localSettings}
              onUpdateSettings={handleBackupSettingsUpdate}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          {activeTab === 'general' && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
