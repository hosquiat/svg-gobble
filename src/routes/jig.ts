import { Router, Request, Response } from 'express'
import { parseLightBurnFile } from '../services/lightburnParser'
import { generateLightBurnFile } from '../services/lightburnGenerator'
import prisma from '../db'

const router = Router()

// ---------------------------------------------------------------------------
// POST /api/jig-templates/parse
// Parse a .lbrn2 file and return the shape tree for the visual template editor.
// Body: { content: string }  (raw .lbrn2 XML)
// ---------------------------------------------------------------------------
router.post('/parse', (req: Request, res: Response) => {
  try {
    const { content } = req.body as { content?: string }

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required field: content (the .lbrn2 XML string)' })
    }

    const result = parseLightBurnFile(content)
    return res.json({ success: true, ...result })
  } catch (error) {
    console.error('Error parsing LightBurn file:', error)
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse LightBurn file',
    })
  }
})

// ---------------------------------------------------------------------------
// POST /api/jig-templates
// Save a new jig template with its slot definitions.
// Body: { name: string, originalFile: string, slots: SlotDef[] }
// ---------------------------------------------------------------------------
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, originalFile, slots } = req.body as {
      name?: string
      originalFile?: string
      slots?: Array<{ slotIndex: number; cx: number; cy: number; width: number; height: number; label?: string }>
    }

    if (!name || !originalFile || !Array.isArray(slots)) {
      return res.status(400).json({ success: false, error: 'Missing required fields: name, originalFile, slots' })
    }

    const template = await prisma.jigTemplate.create({
      data: {
        name,
        originalFile,
        slotCount: slots.length,
        slots: {
          create: slots.map(s => ({
            slotIndex: s.slotIndex,
            cx: s.cx,
            cy: s.cy,
            width: s.width,
            height: s.height,
            label: s.label ?? null,
          })),
        },
      },
      include: { slots: { orderBy: { slotIndex: 'asc' } } },
    })

    return res.status(201).json({ success: true, template })
  } catch (error) {
    console.error('Error creating jig template:', error)
    return res.status(500).json({ success: false, error: 'Failed to create jig template' })
  }
})

// ---------------------------------------------------------------------------
// GET /api/jig-templates
// List all saved jig templates (without the full originalFile content).
// ---------------------------------------------------------------------------
router.get('/', async (_req: Request, res: Response) => {
  try {
    const templates = await prisma.jigTemplate.findMany({
      select: {
        id: true,
        name: true,
        slotCount: true,
        createdAt: true,
        updatedAt: true,
        slots: { orderBy: { slotIndex: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return res.json({ success: true, templates })
  } catch (error) {
    console.error('Error fetching jig templates:', error)
    return res.status(500).json({ success: false, error: 'Failed to fetch jig templates' })
  }
})

// ---------------------------------------------------------------------------
// GET /api/jig-templates/:id
// Get a single template including its originalFile (for generation).
// ---------------------------------------------------------------------------
router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params
    const template = await prisma.jigTemplate.findUnique({
      where: { id },
      include: { slots: { orderBy: { slotIndex: 'asc' } } },
    })
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' })
    }
    return res.json({ success: true, template })
  } catch (error) {
    console.error('Error fetching jig template:', error)
    return res.status(500).json({ success: false, error: 'Failed to fetch jig template' })
  }
})

// ---------------------------------------------------------------------------
// PUT /api/jig-templates/:id
// Rename a template.
// Body: { name: string }
// ---------------------------------------------------------------------------
router.put('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params
    const { name } = req.body as { name?: string }

    if (!name) {
      return res.status(400).json({ success: false, error: 'Missing required field: name' })
    }

    const template = await prisma.jigTemplate.update({
      where: { id },
      data: { name },
      include: { slots: { orderBy: { slotIndex: 'asc' } } },
    })
    return res.json({ success: true, template })
  } catch (error) {
    console.error('Error updating jig template:', error)
    return res.status(500).json({ success: false, error: 'Failed to update jig template' })
  }
})

// ---------------------------------------------------------------------------
// DELETE /api/jig-templates/:id
// ---------------------------------------------------------------------------
router.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params
    await prisma.jigTemplate.delete({ where: { id } })
    return res.json({ success: true, message: 'Template deleted' })
  } catch (error) {
    console.error('Error deleting jig template:', error)
    return res.status(500).json({ success: false, error: 'Failed to delete jig template' })
  }
})

// ---------------------------------------------------------------------------
// POST /api/jig/generate  (also reachable as /api/jig-templates/generate)
// Generate a .lbrn2 file from a template + slot assignments.
// Body: {
//   templateId: string,
//   assignments: Array<{ slotIndex: number, svgId: string }>,
//   mode: 'full' | 'designs-only'
// }
// Response: .lbrn2 file download
// ---------------------------------------------------------------------------
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { templateId, assignments, mode } = req.body as {
      templateId?: string
      assignments?: Array<{ slotIndex: number; svgId: string }>
      mode?: 'full' | 'designs-only'
    }

    if (!templateId || !Array.isArray(assignments)) {
      return res.status(400).json({ success: false, error: 'Missing required fields: templateId, assignments' })
    }

    const outputMode = mode === 'designs-only' ? 'designs-only' : 'full'

    // Fetch the template (with originalFile and slots)
    const template = await prisma.jigTemplate.findUnique({
      where: { id: templateId },
      include: { slots: { orderBy: { slotIndex: 'asc' } } },
    })
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' })
    }

    // Fetch unique SVG IDs
    const svgIds = [...new Set(assignments.map(a => a.svgId))]
    const svgs = await prisma.svg.findMany({
      where: { id: { in: svgIds } },
      select: { id: true, svg: true },
    })
    const svgMap = new Map(svgs.map(s => [s.id, s.svg]))

    // Build slot assignments with SVG content
    const slotAssignments = assignments
      .map(a => {
        const svgContent = svgMap.get(a.svgId)
        if (!svgContent) return null
        return { slotIndex: a.slotIndex, svgContent }
      })
      .filter((a): a is { slotIndex: number; svgContent: string } => a !== null)

    // Detect mirror settings from original file
    const mirrorX = template.originalFile.includes('MirrorX="True"')
    const mirrorY = template.originalFile.includes('MirrorY="True"')

    // Generate the file
    const lbrnXml = generateLightBurnFile(
      template.originalFile,
      template.slots,
      slotAssignments,
      { mode: outputMode, mirrorX, mirrorY },
    )

    const filename = `${template.name.replace(/[^a-z0-9_\-]/gi, '_')}-jig.lbrn2`
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(lbrnXml)
  } catch (error) {
    console.error('Error generating LightBurn file:', error)
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate LightBurn file',
    })
  }
})

export default router
