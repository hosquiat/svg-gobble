import fs from 'fs'
import path from 'path'
import prisma from '../db'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'
const GOOGLE_DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'
const GOOGLE_DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
]

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope: string
}

interface UserInfo {
  email: string
  id: string
}

interface DriveFile {
  id: string
  name: string
  size?: string
  createdTime?: string
  modifiedTime?: string
}

interface DriveListResponse {
  files: DriveFile[]
  nextPageToken?: string
}

interface GoogleConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/**
 * Get Google OAuth config from env vars or database
 */
export async function getGoogleConfig(): Promise<GoogleConfig | null> {
  // First check environment variables
  const envClientId = process.env.GOOGLE_CLIENT_ID
  const envClientSecret = process.env.GOOGLE_CLIENT_SECRET
  const envRedirectUri = process.env.GOOGLE_REDIRECT_URI

  if (envClientId && envClientSecret) {
    return {
      clientId: envClientId,
      clientSecret: envClientSecret,
      redirectUri: envRedirectUri || 'http://localhost:3000/api/google-drive/oauth-callback',
    }
  }

  // Fall back to database config
  const dbConfig = await prisma.googleDriveConfig.findUnique({
    where: { id: 'singleton' },
  })

  if (dbConfig) {
    return {
      clientId: dbConfig.clientId,
      clientSecret: dbConfig.clientSecret,
      redirectUri: dbConfig.redirectUri,
    }
  }

  return null
}

/**
 * Save Google OAuth config to database
 */
export async function saveGoogleConfig(config: GoogleConfig): Promise<void> {
  await prisma.googleDriveConfig.upsert({
    where: { id: 'singleton' },
    update: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    },
    create: {
      id: 'singleton',
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    },
  })
}

/**
 * Get current Google config status (without exposing secrets)
 */
export async function getGoogleConfigStatus(): Promise<{
  configured: boolean
  source: 'env' | 'database' | 'none'
  redirectUri?: string
}> {
  const envClientId = process.env.GOOGLE_CLIENT_ID
  const envClientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (envClientId && envClientSecret) {
    return {
      configured: true,
      source: 'env',
      redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/google-drive/oauth-callback',
    }
  }

  const dbConfig = await prisma.googleDriveConfig.findUnique({
    where: { id: 'singleton' },
  })

  if (dbConfig) {
    return {
      configured: true,
      source: 'database',
      redirectUri: dbConfig.redirectUri,
    }
  }

  return { configured: false, source: 'none' }
}

/**
 * Delete Google config from database
 */
export async function deleteGoogleConfig(): Promise<void> {
  await prisma.googleDriveConfig.deleteMany()
}

/**
 * Check if Google OAuth is configured (sync check for env only)
 */
export function isGoogleOAuthConfiguredSync(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

/**
 * Check if Google OAuth is configured (async, checks both env and db)
 */
export async function isGoogleOAuthConfigured(): Promise<boolean> {
  const config = await getGoogleConfig()
  return config !== null
}

/**
 * Generate OAuth 2.0 authorization URL
 */
export async function getAuthUrl(): Promise<string> {
  const config = await getGoogleConfig()
  if (!config) {
    throw new Error('Google OAuth not configured')
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  })

  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string
  refreshToken: string
  expiresAt: Date
}> {
  const config = await getGoogleConfig()
  if (!config) {
    throw new Error('Google OAuth not configured')
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to exchange code: ${error}`)
  }

  const data = (await response.json()) as TokenResponse

  if (!data.refresh_token) {
    throw new Error('No refresh token received. Please revoke access and try again.')
  }

  const expiresAt = new Date(Date.now() + data.expires_in * 1000)

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string
  expiresAt: Date
}> {
  const config = await getGoogleConfig()
  if (!config) {
    throw new Error('Google OAuth not configured')
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to refresh token: ${error}`)
  }

  const data = (await response.json()) as TokenResponse
  const expiresAt = new Date(Date.now() + data.expires_in * 1000)

  return {
    accessToken: data.access_token,
    expiresAt,
  }
}

/**
 * Revoke tokens (disconnect Google Drive)
 */
export async function revokeTokens(accessToken: string): Promise<void> {
  const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  })

  if (!response.ok) {
    console.warn('Failed to revoke token, but continuing with disconnect')
  }

  await prisma.googleDriveAuth.deleteMany()
}

export async function clearStoredAuth(): Promise<void> {
  await prisma.googleDriveAuth.deleteMany()
}

/**
 * Get user info (email)
 */
export async function getUserInfo(accessToken: string): Promise<UserInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error('Failed to get user info')
  }

  return (await response.json()) as UserInfo
}

/**
 * Get valid access token, refreshing if necessary
 */
export async function getValidAccessToken(): Promise<string | null> {
  const auth = await prisma.googleDriveAuth.findUnique({
    where: { id: 'singleton' },
  })

  if (!auth) {
    return null
  }

  // Check if token is expired (with 5 minute buffer)
  const bufferMs = 5 * 60 * 1000
  if (auth.tokenExpiry.getTime() - bufferMs < Date.now()) {
    try {
      const { accessToken, expiresAt } = await refreshAccessToken(auth.refreshToken)
      await prisma.googleDriveAuth.update({
        where: { id: 'singleton' },
        data: {
          accessToken,
          tokenExpiry: expiresAt,
        },
      })
      return accessToken
    } catch (error) {
      console.error('Failed to refresh access token:', error)
      return null
    }
  }

  return auth.accessToken
}

/**
 * Get or create a Google Drive folder by name within an optional parent folder
 */
async function getOrCreateDriveFolder(
  accessToken: string,
  name: string,
  parentId?: string
): Promise<string> {
  let query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  if (parentId) {
    query += ` and '${parentId}' in parents`
  }

  const params = new URLSearchParams({
    q: query,
    fields: 'files(id, name)',
  })

  const searchResponse = await fetch(`${GOOGLE_DRIVE_FILES_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!searchResponse.ok) {
    const error = await searchResponse.text()
    throw new Error(`Failed to search for Drive folder: ${error}`)
  }

  const data = (await searchResponse.json()) as DriveListResponse
  if (data.files.length > 0) {
    return data.files[0].id
  }

  // Folder not found — create it
  const folderMetadata: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  }
  if (parentId) {
    folderMetadata.parents = [parentId]
  }

  const createResponse = await fetch(GOOGLE_DRIVE_FILES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(folderMetadata),
  })

  if (!createResponse.ok) {
    const error = await createResponse.text()
    throw new Error(`Failed to create Drive folder "${name}": ${error}`)
  }

  const folder = (await createResponse.json()) as DriveFile
  return folder.id
}

/**
 * Get or create the "App Backups/svg-gobble" folder chain and return the
 * innermost folder ID.
 */
async function getBackupFolderId(accessToken: string): Promise<string> {
  const appBackupsFolderId = await getOrCreateDriveFolder(accessToken, 'App Backups')
  return getOrCreateDriveFolder(accessToken, 'svg-gobble', appBackupsFolderId)
}

/**
 * Upload file to Google Drive inside "App Backups/svg-gobble"
 */
export async function uploadToGoogleDrive(
  accessToken: string,
  filePath: string,
  filename: string
): Promise<{ fileId: string; size: number }> {
  const fileContent = fs.readFileSync(filePath, 'utf-8')
  const size = Buffer.byteLength(fileContent, 'utf-8')

  const parentFolderId = await getBackupFolderId(accessToken)

  // Create file metadata with parent folder
  const metadata = {
    name: filename,
    mimeType: 'application/json',
    parents: [parentFolderId],
  }

  // Create multipart body
  const boundary = '-------314159265358979323846'
  const delimiter = `\r\n--${boundary}\r\n`
  const closeDelimiter = `\r\n--${boundary}--`

  const multipartBody =
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    fileContent +
    closeDelimiter

  const response = await fetch(`${GOOGLE_DRIVE_UPLOAD_URL}?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to upload to Google Drive: ${error}`)
  }

  const data = (await response.json()) as DriveFile
  return { fileId: data.id, size }
}

/**
 * Delete file from Google Drive
 */
export async function deleteFromGoogleDrive(accessToken: string, fileId: string): Promise<void> {
  const response = await fetch(`${GOOGLE_DRIVE_FILES_URL}/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok && response.status !== 404) {
    const error = await response.text()
    throw new Error(`Failed to delete from Google Drive: ${error}`)
  }
}

/**
 * List backups stored in Google Drive inside "App Backups/svg-gobble"
 */
export async function listDriveBackups(accessToken: string): Promise<DriveFile[]> {
  const folderId = await getBackupFolderId(accessToken)

  const params = new URLSearchParams({
    q: `'${folderId}' in parents and mimeType = 'application/json' and trashed=false`,
    fields: 'files(id, name, size, createdTime, modifiedTime)',
    orderBy: 'createdTime desc',
  })

  const response = await fetch(`${GOOGLE_DRIVE_FILES_URL}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to list Drive files: ${error}`)
  }

  const data = (await response.json()) as DriveListResponse
  return data.files
}

/**
 * Download backup from Google Drive
 */
export async function downloadFromGoogleDrive(accessToken: string, fileId: string): Promise<string> {
  const response = await fetch(`${GOOGLE_DRIVE_FILES_URL}/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error('Failed to download from Google Drive')
  }

  return response.text()
}

/**
 * Save Google Drive auth to database
 */
export async function saveGoogleDriveAuth(
  accessToken: string,
  refreshToken: string,
  tokenExpiry: Date,
  email: string
): Promise<void> {
  await prisma.googleDriveAuth.upsert({
    where: { id: 'singleton' },
    update: {
      accessToken,
      refreshToken,
      tokenExpiry,
      email,
    },
    create: {
      id: 'singleton',
      accessToken,
      refreshToken,
      tokenExpiry,
      email,
    },
  })
}

/**
 * Get current Google Drive connection status
 */
export async function getConnectionStatus(): Promise<{
  connected: boolean
  email?: string
  expiresAt?: string
  configured: boolean
  configSource?: 'env' | 'database' | 'none'
  redirectUri?: string
}> {
  const configStatus = await getGoogleConfigStatus()

  const auth = await prisma.googleDriveAuth.findUnique({
    where: { id: 'singleton' },
  })

  if (!auth) {
    return {
      connected: false,
      configured: configStatus.configured,
      configSource: configStatus.source,
      redirectUri: configStatus.redirectUri,
    }
  }

  return {
    connected: true,
    email: auth.email || undefined,
    expiresAt: auth.tokenExpiry.toISOString(),
    configured: configStatus.configured,
    configSource: configStatus.source,
    redirectUri: configStatus.redirectUri,
  }
}
