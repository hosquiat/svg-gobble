import { useState, useEffect, useCallback } from 'react'
import clsx from 'clsx'
import { databaseApi, type DbStatus } from '../api/client'

function fmt(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

type Step = 'idle' | 'testing' | 'tested' | 'migrating' | 'migrated' | 'switching' | 'switched' | 'restarting'

interface MigrationCounts { collections: number; svgs: number; backups: number }

export function DatabaseSettings() {
  // Status
  const [status, setStatus] = useState<DbStatus | null>(null)
  const [savedConfig, setSavedConfig] = useState<{ type: string; url: string } | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)

  // MySQL URL input
  const [mysqlUrl, setMysqlUrl] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Step state
  const [step, setStep] = useState<Step>('idle')
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; error?: string } | null>(null)
  const [migrationResult, setMigrationResult] = useState<{ counts?: MigrationCounts; error?: string } | null>(null)
  const [switchDone, setSwitchDone] = useState(false)
  const [restarted, setRestarted] = useState(false)

  const currentType = status?.type ?? 'sqlite'
  const targetType  = currentType === 'sqlite' ? 'mysql' : 'sqlite'

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true)
    try {
      const data = await databaseApi.getStatus()
      setStatus(data.current)
      setSavedConfig(data.savedConfig)
    } catch { /* ignore */ }
    setLoadingStatus(false)
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  // ── Step 1: test connection ────────────────────────────────────────────────
  const handleTest = async () => {
    if (!mysqlUrl.trim()) return
    setStep('testing')
    setTestResult(null)
    const result = await databaseApi.testConnection(mysqlUrl.trim())
    setTestResult(result)
    setStep(result.success ? 'tested' : 'idle')
  }

  // ── Step 2: migrate data ───────────────────────────────────────────────────
  const handleMigrate = async () => {
    setStep('migrating')
    setMigrationResult(null)
    const result = await databaseApi.migrate(currentType, targetType, mysqlUrl.trim())
    setMigrationResult(result)
    setStep(result.success ? 'migrated' : 'tested') // revert to tested on error
  }

  // ── Step 3: save new config ────────────────────────────────────────────────
  const handleSwitch = async () => {
    setStep('switching')
    const url = targetType === 'mysql' ? mysqlUrl.trim() : 'file:./data/svg-gobble.db'
    const result = await databaseApi.switchDatabase(targetType, url)
    if (result.success) {
      setSwitchDone(true)
      setStep('switched')
      await loadStatus()
    } else {
      setStep('migrated')
    }
  }

  // ── Step 4: restart ────────────────────────────────────────────────────────
  const handleRestart = async () => {
    setStep('restarting')
    await databaseApi.restart()
    // Poll until server comes back
    const poll = setInterval(async () => {
      try {
        const res = await fetch('/health')
        if (res.ok) {
          clearInterval(poll)
          setRestarted(true)
          await loadStatus()
          // Reset wizard
          setStep('idle')
          setTestResult(null)
          setMigrationResult(null)
          setSwitchDone(false)
          setRestarted(false)
          setMysqlUrl('')
        }
      } catch { /* server still restarting */ }
    }, 1500)
  }

  // ── Derived step states for the wizard ────────────────────────────────────
  const isTesting   = step === 'testing'
  const isTested    = ['tested', 'migrating', 'migrated', 'switching', 'switched', 'restarting'].includes(step)
  const isMigrating = step === 'migrating'
  const isMigrated  = ['migrated', 'switching', 'switched', 'restarting'].includes(step)
  const isSwitching = step === 'switching'
  const isRestarting = step === 'restarting'

  const migrateDirection = `${currentType.toUpperCase()} → ${targetType.toUpperCase()}`

  return (
    <div className="space-y-6">

      {/* ── Current connection ── */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Current Connection</h3>
        {loadingStatus ? (
          <div className="h-24 bg-gray-50 rounded-lg animate-pulse" />
        ) : status ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={clsx(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                  currentType === 'mysql'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-green-100 text-green-700'
                )}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {currentType === 'mysql' ? 'MySQL / MariaDB' : 'SQLite'}
                </span>
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Connected
                </span>
              </div>
              <button
                onClick={loadStatus}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Refresh
              </button>
            </div>

            <p className="text-xs font-mono text-gray-500 break-all">{status.url}</p>

            <div className="grid grid-cols-4 gap-3 pt-1">
              {[
                { label: 'Collections', value: status.metrics.collections },
                { label: 'SVGs',        value: status.metrics.svgs },
                { label: 'Backups',     value: status.metrics.backups },
                { label: 'Size',        value: fmt(status.metrics.sizeBytes) },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-lg font-semibold text-gray-900">{value}</p>
                  <p className="text-xs text-gray-400">{label}</p>
                </div>
              ))}
            </div>

            {savedConfig && savedConfig.type !== currentType && (
              <div className="mt-2 flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-amber-700">
                  Pending switch to <strong>{savedConfig.type.toUpperCase()}</strong>. Restart the app to apply.
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-red-500">Failed to load database status.</p>
        )}
      </div>

      {/* ── MySQL URL input ── */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {currentType === 'sqlite' ? 'MySQL / MariaDB URL' : 'MySQL / MariaDB URL (current)'}
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={mysqlUrl}
            onChange={e => { setMysqlUrl(e.target.value); setStep('idle'); setTestResult(null) }}
            placeholder="mysql://user:password@host:3306/dbname"
            className="w-full px-3 py-2 pr-20 border border-gray-200 rounded-lg bg-white text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <button
            type="button"
            onClick={() => setShowPassword(p => !p)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          Format: <span className="font-mono">mysql://user:pass@host:3306/database</span>
        </p>
      </div>

      {/* ── Migration wizard ── */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Migration Wizard
          <span className="ml-2 text-xs font-normal text-gray-400">{migrateDirection}</span>
        </h3>

        <ol className="space-y-3">

          {/* Step 1 — Test connection */}
          <WizardStep
            number={1}
            title="Test MySQL connection"
            done={isTested}
            active={!isTested}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={handleTest}
                disabled={!mysqlUrl.trim() || isTesting}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-40 rounded-lg transition-colors"
              >
                {isTesting ? 'Testing…' : 'Test Connection'}
              </button>
              {testResult && (
                <span className={clsx('text-sm flex items-center gap-1.5', testResult.success ? 'text-green-600' : 'text-red-500')}>
                  {testResult.success ? (
                    <><CheckIcon /> Connected — {testResult.latencyMs}ms latency</>
                  ) : (
                    <><XIcon /> {testResult.error}</>
                  )}
                </span>
              )}
            </div>
          </WizardStep>

          {/* Step 2 — Migrate data */}
          <WizardStep
            number={2}
            title={`Migrate data (${migrateDirection})`}
            done={isMigrated}
            active={isTested && !isMigrated}
            disabled={!isTested}
          >
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                Copies all collections, SVGs, settings and backup records to the target database.
                Your source data is not modified.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleMigrate}
                  disabled={!isTested || isMigrating}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-40 rounded-lg transition-colors"
                >
                  {isMigrating ? (
                    <span className="flex items-center gap-2"><Spinner /> Migrating…</span>
                  ) : 'Migrate Now'}
                </button>
                {migrationResult && (
                  <span className={clsx('text-sm flex items-center gap-1.5', migrationResult.error ? 'text-red-500' : 'text-green-600')}>
                    {migrationResult.error ? (
                      <><XIcon /> {migrationResult.error}</>
                    ) : (
                      <><CheckIcon />
                        {migrationResult.counts?.collections} collections,{' '}
                        {migrationResult.counts?.svgs} SVGs,{' '}
                        {migrationResult.counts?.backups} backup records copied
                      </>
                    )}
                  </span>
                )}
              </div>
            </div>
          </WizardStep>

          {/* Step 3 — Save config */}
          <WizardStep
            number={3}
            title={`Save config — switch to ${targetType.toUpperCase()}`}
            done={switchDone}
            active={isMigrated && !switchDone}
            disabled={!isMigrated}
          >
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                Writes the new database config to disk. The app will use it after the next restart.
              </p>
              <button
                onClick={handleSwitch}
                disabled={!isMigrated || isSwitching || switchDone}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-40 rounded-lg transition-colors"
              >
                {isSwitching ? <span className="flex items-center gap-2"><Spinner /> Saving…</span>
                  : switchDone ? <span className="flex items-center gap-2"><CheckIcon className="text-white" /> Saved</span>
                  : `Switch to ${targetType.toUpperCase()}`}
              </button>
            </div>
          </WizardStep>

          {/* Step 4 — Restart */}
          <WizardStep
            number={4}
            title="Restart to apply"
            done={restarted}
            active={switchDone && !restarted}
            disabled={!switchDone}
          >
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                The app will shut down, restart automatically (Docker), and come back up on the new database.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleRestart}
                  disabled={!switchDone || isRestarting}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-gray-800 hover:bg-gray-900 disabled:opacity-40 rounded-lg transition-colors"
                >
                  {isRestarting
                    ? <span className="flex items-center gap-2"><Spinner /> Restarting…</span>
                    : 'Restart App'}
                </button>
                {isRestarting && (
                  <span className="text-xs text-gray-500">Waiting for server to come back…</span>
                )}
              </div>

              {/* Manual fallback */}
              <details className="mt-1">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                  Not running in Docker? See manual instructions
                </summary>
                <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-1">
                  <p className="text-xs text-gray-600 font-medium">Set these env vars and restart:</p>
                  <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap break-all">
{`DATABASE_TYPE=${targetType}
DATABASE_URL=${targetType === 'mysql' ? mysqlUrl : 'file:./data/svg-gobble.db'}`}
                  </pre>
                </div>
              </details>
            </div>
          </WizardStep>

        </ol>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WizardStep({
  number, title, done, active, disabled = false, children,
}: {
  number: number
  title: string
  done: boolean
  active: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <li className={clsx(
      'flex gap-4 p-4 rounded-lg border transition-colors',
      done     ? 'border-green-200 bg-green-50'
      : active  ? 'border-gray-200 bg-white shadow-sm'
      : disabled ? 'border-gray-100 bg-gray-50 opacity-50'
      :            'border-gray-200 bg-white'
    )}>
      {/* Number / check */}
      <div className={clsx(
        'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5',
        done     ? 'bg-green-500 text-white'
        : active  ? 'bg-red-500 text-white'
        :           'bg-gray-200 text-gray-500'
      )}>
        {done ? <CheckIcon className="w-3.5 h-3.5" /> : number}
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        <p className={clsx('text-sm font-medium', done ? 'text-green-700' : 'text-gray-900')}>
          {title}
        </p>
        {(active || done) && !disabled && (
          <div>{children}</div>
        )}
      </div>
    </li>
  )
}

function CheckIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
