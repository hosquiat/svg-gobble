export interface ExtractedSvg {
  id: string
  name: string
  svg: string
  type: 'inline' | 'external' | 'uploaded'
  contentHash?: string
  collectionId?: string
  rotation?: number
  createdAt?: string
  updatedAt?: string
  archivedAt?: string | null
}

export interface ScrapeResponse {
  success: boolean
  url?: string
  svgs?: ExtractedSvg[]
  count?: number
  error?: string
}

export interface Collection {
  id: string
  name: string
  emoji?: string
  isDefault: boolean
  parentId?: string | null
  children?: Collection[]
  createdAt: string
  updatedAt: string
  archivedAt?: string | null
  svgs: ExtractedSvg[]
}

export interface Settings {
  id: string
  defaultCollectionId: string | null
  cardSize: number
  showSizes: boolean
  showNames: boolean
  optimizationPreset: 'minimal' | 'default' | 'aggressive'
  archiveRetentionDays: number
  backupEnabled: boolean
  backupSchedule: string
  backupRetentionDays: number
  googleDriveEnabled: boolean
  localBackupEnabled: boolean
}

export interface AppState {
  collections: Collection[]
  activeCollectionId: string | null
}

export interface DuplicateCheckResult {
  index: number
  isDuplicate: boolean
  existingSvg: {
    id: string
    name: string
    collectionId: string
    collectionName: string
  } | null
}

export interface ApiResponse<T> {
  success: boolean
  error?: string
  collection?: T
  collections?: T[]
  svg?: T
  svgs?: T[]
  settings?: T
  duplicates?: DuplicateCheckResult[]
  message?: string
  backups?: T[]
  backup?: T
}

export interface Backup {
  id: string
  filename: string
  size: number
  type: 'local' | 'google_drive'
  status: 'pending' | 'completed' | 'failed'
  error?: string
  driveFileId?: string
  createdAt: string
}

export interface GoogleDriveStatus {
  connected: boolean
  email?: string
  expiresAt?: string
  configured: boolean
  configSource?: 'env' | 'database' | 'none'
  redirectUri?: string
}

export interface GoogleDriveConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}
