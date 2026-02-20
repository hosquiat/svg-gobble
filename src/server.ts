import express, { Request, Response, NextFunction } from 'express'
import path from 'path'
import { extractSvgs, ExtractedSvg } from './extractor'
import { fetchHtml, resolveExternalSvg } from './fetcher'
import prisma from './db'
import collectionsRouter from './routes/collections'
import svgsRouter from './routes/svgs'
import settingsRouter from './routes/settings'
import backupRouter from './routes/backup'
import googleDriveRouter from './routes/googleDrive'
import jigRouter from './routes/jig'
import { startArchiveCleanupJob } from './jobs/archiveCleanup'
import { startBackupJob } from './jobs/backupJob'

const app = express()
const PORT = process.env.PORT || 3000
const DEFAULT_TIMEOUT = 30000

app.use(express.json({ limit: '10mb' }))

// Mount API routes
app.use('/api/collections', collectionsRouter)
app.use('/api/svgs', svgsRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/backup', backupRouter)
app.use('/api/google-drive', googleDriveRouter)
app.use('/api/jig-templates', jigRouter)

// Serve static files from client build
const clientPath = path.join(__dirname, '../client/dist')
app.use(express.static(clientPath))

interface ScrapeRequest {
  url: string
  fetchExternal?: boolean
  timeout?: number
}

interface ParseRequest {
  html: string
  baseUrl?: string
  fetchExternal?: boolean
  timeout?: number
}

interface ScrapeResponse {
  success: boolean
  url?: string
  svgs?: ExtractedSvg[]
  count?: number
  error?: string
}

/**
 * Resolve external SVG references to actual SVG content.
 */
async function resolveExternalSvgs(
  svgs: ExtractedSvg[],
  timeout: number
): Promise<ExtractedSvg[]> {
  const resolved: ExtractedSvg[] = []

  for (const svg of svgs) {
    if (svg.type === 'external') {
      // Extract src from the img tag
      const srcMatch = svg.svg.match(/src="([^"]+)"/)
      if (srcMatch?.[1]) {
        const result = await resolveExternalSvg(srcMatch[1], timeout)
        if (result.svg) {
          resolved.push({
            ...svg,
            svg: result.svg,
          })
        } else {
          // Keep the img tag if we couldn't fetch the SVG
          resolved.push(svg)
        }
      } else {
        resolved.push(svg)
      }
    } else {
      resolved.push(svg)
    }
  }

  return resolved
}

/**
 * POST /scrape - Scrape SVGs from a URL
 */
app.post('/scrape', async (req: Request, res: Response) => {
  const { url, fetchExternal = true, timeout = DEFAULT_TIMEOUT } = req.body as ScrapeRequest

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: url',
    } as ScrapeResponse)
  }

  // Validate URL
  try {
    new URL(url)
  } catch {
    return res.status(400).json({
      success: false,
      error: 'Invalid URL format',
    } as ScrapeResponse)
  }

  // Fetch HTML
  const fetchResult = await fetchHtml(url, timeout)
  if (!fetchResult.success || !fetchResult.html) {
    return res.status(502).json({
      success: false,
      url,
      error: fetchResult.error || 'Failed to fetch URL',
    } as ScrapeResponse)
  }

  // Extract SVGs
  let svgs = extractSvgs(fetchResult.html, url)

  // Optionally fetch external SVG content
  if (fetchExternal) {
    svgs = await resolveExternalSvgs(svgs, timeout)
  }

  return res.json({
    success: true,
    url,
    svgs,
    count: svgs.length,
  } as ScrapeResponse)
})

/**
 * POST /parse - Parse SVGs from provided HTML
 */
app.post('/parse', async (req: Request, res: Response) => {
  const {
    html,
    baseUrl = 'http://localhost',
    fetchExternal = false,
    timeout = DEFAULT_TIMEOUT,
  } = req.body as ParseRequest

  if (!html) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: html',
    } as ScrapeResponse)
  }

  // Extract SVGs
  let svgs = extractSvgs(html, baseUrl)

  // Optionally fetch external SVG content
  if (fetchExternal) {
    svgs = await resolveExternalSvgs(svgs, timeout)
  }

  return res.json({
    success: true,
    svgs,
    count: svgs.length,
  } as ScrapeResponse)
})

/**
 * GET /health - Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  })
})

/**
 * Error handling middleware
 */
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err)
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  })
})

/**
 * Serve index.html for client-side routing
 */
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(clientPath, 'index.html'))
})

// Seed the database with default collection if needed
async function seedDatabase() {
  const existingDefault = await prisma.collection.findFirst({
    where: { isDefault: true },
  })

  if (!existingDefault) {
    console.log('Creating default collection...')
    const defaultCollection = await prisma.collection.create({
      data: {
        name: 'Default',
        emoji: '⚡',
        isDefault: true,
      },
    })

    await prisma.settings.upsert({
      where: { id: 'singleton' },
      update: { defaultCollectionId: defaultCollection.id },
      create: {
        id: 'singleton',
        defaultCollectionId: defaultCollection.id,
      },
    })
    console.log('Default collection created')
  }
}

// Initialize database and start server
async function start() {
  try {
    // Connect to database
    await prisma.$connect()
    console.log('Connected to database')

    // Seed database with defaults
    await seedDatabase()

    // Start archive cleanup job
    startArchiveCleanupJob()

    // Start backup job
    startBackupJob()

    app.listen(PORT, () => {
      console.log(`SVG Service running on port ${PORT}`)
      console.log(`Health check: http://localhost:${PORT}/health`)
      console.log(`Scrape endpoint: POST http://localhost:${PORT}/scrape`)
      console.log(`Parse endpoint: POST http://localhost:${PORT}/parse`)
      console.log(`API endpoints: /api/collections, /api/svgs, /api/settings`)
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...')
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\nShutting down...')
  await prisma.$disconnect()
  process.exit(0)
})

start()

export { app }
