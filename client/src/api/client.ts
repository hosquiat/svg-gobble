import type { Collection, ExtractedSvg, Settings, DuplicateCheckResult, Backup, GoogleDriveStatus, GoogleDriveConfig } from '../types'

const API_BASE = '/api'

interface ApiResponse<T> {
  success: boolean
  error?: string
  collection?: T
  collections?: T[]
  svg?: T
  svgs?: T[]
  settings?: T
  duplicates?: DuplicateCheckResult[]
  message?: string
  backup?: T
  backups?: T[]
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  })
  return response.json()
}

// Collections API
export const collectionsApi = {
  async getAll(): Promise<Collection[]> {
    const res = await fetchApi<Collection>('/collections')
    return res.collections || []
  },

  async create(data: { name: string; emoji?: string; parentId?: string }): Promise<Collection> {
    const res = await fetchApi<Collection>('/collections', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    if (!res.success || !res.collection) {
      throw new Error(res.error || 'Failed to create collection')
    }
    return res.collection
  },

  async update(
    id: string,
    data: { name?: string; emoji?: string; parentId?: string | null }
  ): Promise<Collection> {
    const res = await fetchApi<Collection>(`/collections/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    if (!res.success || !res.collection) {
      throw new Error(res.error || 'Failed to update collection')
    }
    return res.collection
  },

  async delete(id: string): Promise<void> {
    const res = await fetchApi<Collection>(`/collections/${id}`, {
      method: 'DELETE',
    })
    if (!res.success) {
      throw new Error(res.error || 'Failed to delete collection')
    }
  },

  async archive(id: string): Promise<Collection> {
    const res = await fetchApi<Collection>(`/collections/${id}/archive`, {
      method: 'POST',
    })
    if (!res.success || !res.collection) {
      throw new Error(res.error || 'Failed to archive collection')
    }
    return res.collection
  },

  async restore(id: string): Promise<Collection> {
    const res = await fetchApi<Collection>(`/collections/${id}/restore`, {
      method: 'POST',
    })
    if (!res.success || !res.collection) {
      throw new Error(res.error || 'Failed to restore collection')
    }
    return res.collection
  },

  async addSvgs(
    id: string,
    svgs: Array<{ name: string; svg: string; type: string }>
  ): Promise<ExtractedSvg[]> {
    const res = await fetchApi<ExtractedSvg>(`/collections/${id}/svgs`, {
      method: 'POST',
      body: JSON.stringify({ svgs }),
    })
    if (!res.success || !res.svgs) {
      throw new Error(res.error || 'Failed to add SVGs')
    }
    return res.svgs
  },
}

// SVGs API
export const svgsApi = {
  async update(
    id: string,
    data: { name?: string; svg?: string; collectionId?: string; rotation?: number }
  ): Promise<ExtractedSvg> {
    const res = await fetchApi<ExtractedSvg>(`/svgs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    if (!res.success || !res.svg) {
      throw new Error(res.error || 'Failed to update SVG')
    }
    return res.svg
  },

  async delete(id: string): Promise<void> {
    const res = await fetchApi<ExtractedSvg>(`/svgs/${id}`, {
      method: 'DELETE',
    })
    if (!res.success) {
      throw new Error(res.error || 'Failed to delete SVG')
    }
  },

  async duplicate(id: string, collectionId?: string): Promise<ExtractedSvg> {
    const res = await fetchApi<ExtractedSvg>(`/svgs/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ collectionId }),
    })
    if (!res.success || !res.svg) {
      throw new Error(res.error || 'Failed to duplicate SVG')
    }
    return res.svg
  },

  async archive(id: string): Promise<ExtractedSvg> {
    const res = await fetchApi<ExtractedSvg>(`/svgs/${id}/archive`, {
      method: 'POST',
    })
    if (!res.success || !res.svg) {
      throw new Error(res.error || 'Failed to archive SVG')
    }
    return res.svg
  },

  async restore(id: string): Promise<ExtractedSvg> {
    const res = await fetchApi<ExtractedSvg>(`/svgs/${id}/restore`, {
      method: 'POST',
    })
    if (!res.success || !res.svg) {
      throw new Error(res.error || 'Failed to restore SVG')
    }
    return res.svg
  },

  async checkDuplicates(
    svgs: string[],
    collectionId?: string
  ): Promise<DuplicateCheckResult[]> {
    const res = await fetchApi<never>('/svgs/check-duplicates', {
      method: 'POST',
      body: JSON.stringify({ svgs, collectionId }),
    })
    if (!res.success || !res.duplicates) {
      throw new Error(res.error || 'Failed to check duplicates')
    }
    return res.duplicates
  },
}

// Settings API
export const settingsApi = {
  async get(): Promise<Settings> {
    const res = await fetchApi<Settings>('/settings')
    if (!res.success || !res.settings) {
      throw new Error(res.error || 'Failed to fetch settings')
    }
    return res.settings
  },

  async update(data: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
    const res = await fetchApi<Settings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    if (!res.success || !res.settings) {
      throw new Error(res.error || 'Failed to update settings')
    }
    return res.settings
  },
}

// Backup API
export const backupApi = {
  async list(): Promise<Backup[]> {
    const res = await fetchApi<Backup>('/backup')
    return res.backups || []
  },

  async create(): Promise<Backup> {
    const res = await fetchApi<Backup>('/backup', {
      method: 'POST',
    })
    if (!res.success || !res.backup) {
      throw new Error(res.error || 'Failed to create backup')
    }
    return res.backup
  },

  async restore(id: string): Promise<void> {
    const res = await fetchApi<never>(`/backup/${id}/restore`, {
      method: 'POST',
    })
    if (!res.success) {
      throw new Error(res.error || 'Failed to restore backup')
    }
  },

  async delete(id: string): Promise<void> {
    const res = await fetchApi<never>(`/backup/${id}`, {
      method: 'DELETE',
    })
    if (!res.success) {
      throw new Error(res.error || 'Failed to delete backup')
    }
  },

  getDownloadUrl(id: string): string {
    return `${API_BASE}/backup/${id}/download`
  },

  getExportUrl(): string {
    return `${API_BASE}/backup/export`
  },

  async import(data: unknown): Promise<void> {
    const res = await fetchApi<never>('/backup/import', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    if (!res.success) {
      throw new Error(res.error || 'Failed to import data')
    }
  },
}

// Database API
export interface DbStatus {
  type: string
  url: string
  connected: boolean
  metrics: {
    collections: number
    svgs: number
    backups: number
    sizeBytes: number | null
  }
}

export const databaseApi = {
  async getStatus(): Promise<{ current: DbStatus; savedConfig: { type: string; url: string } | null }> {
    const res = await fetchApi<never>('/database/status')
    return res as unknown as { current: DbStatus; savedConfig: { type: string; url: string } | null }
  },

  async testConnection(url: string): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
    const res = await fetch('/api/database/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    return res.json()
  },

  async migrate(from: string, to: string, mysqlUrl: string): Promise<{ success: boolean; counts?: { collections: number; svgs: number; backups: number }; error?: string }> {
    const res = await fetch('/api/database/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, mysqlUrl }),
    })
    return res.json()
  },

  async switchDatabase(type: string, url: string): Promise<{ success: boolean; error?: string }> {
    const res = await fetchApi<never>('/database/switch', {
      method: 'POST',
      body: JSON.stringify({ type, url }),
    })
    return res as unknown as { success: boolean; error?: string }
  },

  async restart(): Promise<void> {
    await fetch('/api/database/restart', { method: 'POST' }).catch(() => {/* server going down */})
  },
}

// Version API
export const versionApi = {
  async get(): Promise<string> {
    try {
      const res = await fetch('/api/version')
      const data = await res.json()
      return data.version || '0.0.0'
    } catch {
      return '0.0.0'
    }
  },
}

// Google Drive API
export const googleDriveApi = {
  async getStatus(): Promise<GoogleDriveStatus> {
    const res = await fetch(`${API_BASE}/google-drive/status`)
    const data = await res.json()
    return {
      connected: data.connected || false,
      email: data.email,
      expiresAt: data.expiresAt,
      configured: data.configured || false,
      configSource: data.configSource,
      redirectUri: data.redirectUri,
    }
  },

  async getAuthUrl(): Promise<string> {
    const res = await fetch(`${API_BASE}/google-drive/auth-url`)
    const data = await res.json()
    if (!data.success || !data.url) {
      throw new Error(data.error || 'Failed to get auth URL')
    }
    return data.url
  },

  async disconnect(): Promise<void> {
    const res = await fetchApi<never>('/google-drive/disconnect', {
      method: 'POST',
    })
    if (!res.success) {
      throw new Error(res.error || 'Failed to disconnect')
    }
  },

  async saveConfig(config: GoogleDriveConfig): Promise<void> {
    const res = await fetchApi<never>('/google-drive/config', {
      method: 'POST',
      body: JSON.stringify(config),
    })
    if (!res.success) {
      throw new Error(res.error || 'Failed to save configuration')
    }
  },

  async deleteConfig(): Promise<void> {
    const res = await fetchApi<never>('/google-drive/config', {
      method: 'DELETE',
    })
    if (!res.success) {
      throw new Error(res.error || 'Failed to delete configuration')
    }
  },
}
